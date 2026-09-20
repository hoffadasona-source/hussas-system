import { createClient } from '@supabase/supabase-js';
import { usernameToEmail as toEmail } from '../../supabase/functions/_shared/username.js';

export { displayUsername, normalizeUsername, usernameError } from '../../supabase/functions/_shared/username.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true },
});

const EMAIL_DOMAIN = import.meta.env.VITE_USERNAME_EMAIL_DOMAIN || 'users.hussas.local';

// الدخول باسم المستخدم (عربي أو لاتيني): يُحوَّل إلى بريد داخلي ثابت، أو يُقبل البريد كما هو.
// المنطق مشترك حرفياً مع دالة manage-users حتى يتطابق البريد المولَّد عند الإنشاء والدخول.
export const usernameToEmail = (value) => toEmail(value, EMAIL_DOMAIN);

/** يستدعي إجراء RPC ويرمي الخطأ إن وجد */
export async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
}

/** يستدعي Edge Function ويعيد رسالة الخطأ القادمة منها إن وجدت */
export async function invokeFunction(name, payload) {
  const { data, error } = await supabase.functions.invoke(name, { body: payload });
  if (error) {
    let message = error.message;
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      /* الرد ليس JSON */
    }
    throw new Error(message);
  }
  return data;
}

/** إدارة الحسابات (Edge Function: manage-users) */
export const manageUsers = (payload) => invokeFunction('manage-users', payload);

/** إرسال الرسائل المستحقة أو فحص القنوات (Edge Function: send-messages) */
export const sendMessages = (action = 'run') => invokeFunction('send-messages', { action });
