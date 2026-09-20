// إدارة حسابات الدخول (إنشاء، إعادة تعيين كلمة المرور، إيقاف/تفعيل، تعديل الدور).
// تعمل بمفتاح الخدمة على الخادم فقط؛ لا يصل هذا المفتاح إلى المتصفح أبداً.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { displayUsername, usernameError, usernameToEmail } from '../_shared/username.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EMAIL_DOMAIN = Deno.env.get('USERNAME_EMAIL_DOMAIN') ?? 'users.hussas.local';

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => json({ error: message }, status);

type Role = 'super_admin' | 'admin' | 'examiner';
const ROLES: Role[] = ['super_admin', 'admin', 'examiner'];

function tempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Method not allowed', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return fail('غير مصرح', 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return fail('غير مصرح', 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: caller } = await admin.from('profiles').select('id, full_name, role, status').eq('id', user.id).single();
  if (!caller || caller.status !== 'active' || !['super_admin', 'admin'].includes(caller.role)) {
    return fail('غير مصرح بهذه العملية', 403);
  }
  const isSuper = caller.role === 'super_admin';
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const audit = (action: string, entityId: string, details?: Record<string, unknown>) =>
    admin.from('audit_log').insert({
      actor_id: caller.id, actor_name: caller.full_name, action, entity: 'user', entity_id: entityId, details, ip,
    });

  // الإداري يدير حسابات المحفّظين فقط؛ مدير النظام يدير الجميع
  async function assertCanManage(targetId: string) {
    const { data: target } = await admin.from('profiles').select('id, username, role').eq('id', targetId).single();
    if (!target) throw new Error('الحساب غير موجود');
    if (!isSuper && target.role !== 'examiner') throw new Error('إدارة هذا الحساب من صلاحية مدير النظام');
    if (target.id === caller.id && !isSuper) throw new Error('غير مصرح');
    return target;
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail('طلب غير صالح');
  }

  try {
    switch (body.action) {
      case 'create_user': {
        // اسم المستخدم يُقبل بالعربية كما يكتبه الإداري، ويُولَّد له بريد داخلي صالح لـ Auth
        const username = displayUsername(body.username);
        const fullName = String(body.full_name ?? '').trim();
        const role = body.role as Role;
        const nameError = usernameError(username);
        if (nameError) return fail(nameError);
        if (!fullName) return fail('الاسم مطلوب');
        if (!ROLES.includes(role)) return fail('الدور غير صحيح');
        if (role !== 'examiner' && !isSuper) return fail('إنشاء حسابات الإدارة من صلاحية مدير النظام', 403);

        const password = body.password ? String(body.password) : tempPassword();
        if (password.length < 8) return fail('كلمة المرور 8 أحرف على الأقل');

        const { data: created, error } = await admin.auth.admin.createUser({
          email: await usernameToEmail(username, EMAIL_DOMAIN),
          password,
          email_confirm: true,
          user_metadata: { username, full_name: fullName },
        });
        if (error) {
          return fail(error.message.includes('already') ? 'اسم المستخدم مستخدم مسبقاً' : error.message);
        }
        const uid = created.user.id;

        const { error: profileError } = await admin.from('profiles').insert({
          id: uid, username, full_name: fullName, role,
          can_final_approve: role === 'admin' && !!body.can_final_approve,
          can_issue_certificates: role === 'admin' && !!body.can_issue_certificates,
          must_change_password: false, // كلمة المرور التي يضعها الإداري نهائية، ولصاحب الحساب تغييرها متى شاء
        });
        if (profileError) {
          await admin.auth.admin.deleteUser(uid);
          return fail(profileError.message);
        }

        if (role === 'examiner') {
          const e = body.examiner ?? {};
          const record = {
            user_id: uid,
            full_name: fullName,
            employee_no: e.employee_no || null,
            phone: e.phone || null,
            office_id: e.office_id || null,
            specialization: e.specialization || null,
            status: 'active',
          };
          const { error: exmError } = e.id
            ? await admin.from('examiners').update(record).eq('id', e.id)
            : await admin.from('examiners').insert(record);
          if (exmError) {
            await admin.auth.admin.deleteUser(uid);
            return fail(exmError.message.includes('employee_no') ? 'الرقم الوظيفي مستخدم مسبقاً' : exmError.message);
          }
        }

        await audit('user.create', username, { role });
        return json({ id: uid, username, password: body.password ? undefined : password });
      }

      case 'reset_password': {
        const target = await assertCanManage(String(body.user_id));
        const password = body.password ? String(body.password) : tempPassword();
        if (password.length < 8) return fail('كلمة المرور 8 أحرف على الأقل');
        const { error } = await admin.auth.admin.updateUserById(target.id, { password });
        if (error) return fail(error.message);
        await audit('user.reset_password', target.username);
        return json({ password: body.password ? undefined : password });
      }

      case 'set_status': {
        const target = await assertCanManage(String(body.user_id));
        const status = body.status === 'inactive' ? 'inactive' : 'active';
        if (target.id === caller.id) return fail('لا يمكنك إيقاف حسابك');
        const { error } = await admin.auth.admin.updateUserById(target.id, {
          ban_duration: status === 'inactive' ? '876000h' : 'none',
        });
        if (error) return fail(error.message);
        await admin.from('profiles').update({ status }).eq('id', target.id);
        await admin.from('examiners').update({ status }).eq('user_id', target.id);
        await audit(status === 'inactive' ? 'user.deactivate' : 'user.activate', target.username);
        return json({ ok: true });
      }

      case 'update_user': {
        if (!isSuper) return fail('تعديل الأدوار من صلاحية مدير النظام', 403);
        const target = await assertCanManage(String(body.user_id));
        const role = body.role as Role;
        if (!ROLES.includes(role)) return fail('الدور غير صحيح');
        if (target.id === caller.id && role !== 'super_admin') return fail('لا يمكنك تخفيض صلاحياتك');
        const fullName = String(body.full_name ?? '').trim();
        const { error } = await admin.from('profiles').update({
          full_name: fullName || undefined,
          role,
          can_final_approve: role === 'admin' && !!body.can_final_approve,
          can_issue_certificates: role === 'admin' && !!body.can_issue_certificates,
        }).eq('id', target.id);
        if (error) return fail(error.message);
        if (fullName) await admin.from('examiners').update({ full_name: fullName }).eq('user_id', target.id);
        await audit('user.update', target.username, { role });
        return json({ ok: true });
      }

      default:
        return fail('إجراء غير معروف');
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'خطأ غير متوقع');
  }
});
