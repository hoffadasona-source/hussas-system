// إنشاء أول حساب «مدير النظام».
// الاستخدام: npm run create-admin -- <username> <password> "<الاسم الكامل>"
// يتطلب في .env.local: VITE_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY (لا تضعه في الواجهة أبداً)
import { createClient } from '@supabase/supabase-js';

const [username, password, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(' ').trim();
const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const domain = process.env.VITE_USERNAME_EMAIL_DOMAIN || 'users.hussas.local';

if (!username || !password || !fullName) {
  console.error('الاستخدام: npm run create-admin -- <username> <password> "<الاسم الكامل>"');
  process.exit(1);
}
if (!url || !serviceKey) {
  console.error('أضف VITE_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY إلى ملف .env.local');
  process.exit(1);
}
if (password.length < 8) {
  console.error('كلمة المرور 8 أحرف على الأقل');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const email = `${username.toLowerCase()}@${domain}`;

const { data, error } = await supabase.auth.admin.createUser({
  email, password, email_confirm: true, user_metadata: { username, full_name: fullName },
});
if (error) {
  console.error('تعذّر إنشاء المستخدم:', error.message);
  process.exit(1);
}

const { error: profileError } = await supabase.from('profiles').insert({
  id: data.user.id, username: username.toLowerCase(), full_name: fullName, role: 'super_admin',
});
if (profileError) {
  await supabase.auth.admin.deleteUser(data.user.id);
  console.error('تعذّر إنشاء الملف الشخصي:', profileError.message);
  process.exit(1);
}

console.log(`✓ أُنشئ مدير النظام «${fullName}» — اسم الدخول: ${username}`);
