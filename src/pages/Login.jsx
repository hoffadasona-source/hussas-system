import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import logoStacked from '../assets/logo-stacked.png';
import { Field, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useUi } from '../context/UiContext';
import { errorMessage } from '../lib/helpers';
import { isConfigured } from '../lib/supabase';

export default function Login({ kind }) {
  const isAdmin = kind === 'admin';
  const { signIn, ready, profile } = useAuth();
  const { toast } = useUi();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!ready) return <Loading />;
  if (profile) return <Navigate to={profile.role === 'examiner' ? '/examiner' : '/admin'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError('أدخل اسم المستخدم وكلمة المرور');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const p = await signIn(form.username, form.password);
      const home = p.role === 'examiner' ? '/examiner' : '/admin';
      const from = location.state?.from;
      navigate(from && from.startsWith(home) ? from : home, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-art">
        <div className="in">
          <img src={logoStacked} alt="" />
          <h2 style={{ color: '#fff', fontSize: 19 }}>{isAdmin ? 'لوحة إدارة المنظومة' : 'لوحة المحفّظ'}</h2>
          <p style={{ color: '#B7C8D6', fontSize: 14 }}>
            {isAdmin ? 'مراجعة الطلبات، اعتماد النتائج، وإصدار الشهادات.' : 'استلام الطلبة، تحديد المواعيد، وإجراء الامتحانات.'}
          </p>
        </div>
      </div>
      <div className="login-form">
        <form className="box" onSubmit={submit} noValidate>
          <h1 className="kufi" style={{ fontSize: 21 }}>تسجيل الدخول</h1>
          <p className="muted small" style={{ margin: '6px 0 22px' }}>الدخول للمخوَّلين فقط. تُسجَّل عمليات الدخول في سجل العمليات.</p>
          {!isConfigured && <div className="alert warn mb">لم تُضبط بيانات الاتصال بـ Supabase بعد.</div>}
          {error && <div className="alert err mb" role="alert">{error}</div>}
          <Field label="اسم المستخدم">
            <input className="inp ltr" autoComplete="username" autoFocus value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </Field>
          <Field label="كلمة المرور">
            <input className="inp ltr" type="password" autoComplete="current-password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <div className="spread" style={{ marginBottom: 16 }}>
            <span />
            <button type="button" className="link small" onClick={() => toast('تواصل مع مدير النظام لإعادة تعيين كلمة المرور', 'info')}>
              نسيت كلمة المرور؟
            </button>
          </div>
          <button className="btn teal block" disabled={busy}>
            {busy && <span className="spinner" />} دخول
          </button>
          <p className="tiny muted mt">
            {isAdmin ? <Link to="/examiner/login" className="link">دخول المحفّظين</Link> : <Link to="/admin/login" className="link">دخول الإدارة</Link>}
            {' · '}
            <Link to="/" className="link">الموقع العام</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
