import { useState } from 'react';
import { Field, Modal } from './ui';
import { useAuth } from '../context/AuthContext';
import { useUi } from '../context/UiContext';
import { rpc, supabase } from '../lib/supabase';
import { errorMessage } from '../lib/helpers';

/** تغيير كلمة المرور اختيارياً من لوحة التحكم. */
export default function ChangePassword({ onClose }) {
  const { reloadProfile } = useAuth();
  const { toast } = useUi();
  const [f, setF] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (f.password.length < 8) return setError('كلمة المرور 8 أحرف على الأقل.');
    if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) return setError('استخدم حروفاً وأرقاماً معاً.');
    if (f.password !== f.confirm) return setError('كلمتا المرور غير متطابقتين.');
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.updateUser({ password: f.password });
    if (err) {
      setBusy(false);
      return setError(/different from the old/i.test(err.message) ? 'اختر كلمة مرور مختلفة عن الحالية.' : errorMessage(err));
    }
    try {
      await rpc('password_changed');
    } catch {
      /* التغيير تم في Auth؛ العلامة تُصحَّح في الدخول التالي */
    }
    await reloadProfile();
    setBusy(false);
    toast('تم تغيير كلمة المرور');
    onClose?.();
  };

  return (
    <Modal
      title="تغيير كلمة المرور"
      onClose={onClose}
      footer={<>
        <button className="btn teal" onClick={save} disabled={busy}>{busy && <span className="spinner" />} حفظ كلمة المرور</button>
        <button className="btn ghost" onClick={onClose}>إلغاء</button>
      </>}
    >
      {error && <div className="alert err mb" role="alert">{error}</div>}
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="كلمة المرور الجديدة" required hint="8 أحرف على الأقل، حروف وأرقام.">
          <input className="inp ltr" type="password" autoComplete="new-password" autoFocus value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <Field label="تأكيد كلمة المرور" required>
          <input className="inp ltr" type="password" autoComplete="new-password" value={f.confirm}
            onChange={(e) => setF({ ...f, confirm: e.target.value })} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
