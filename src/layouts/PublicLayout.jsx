import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router';
import logoMark from '../assets/logo-mark.png';
import logoStacked from '../assets/logo-stacked.png';
import { Icon } from '../components/icons';
import { useSettings } from '../hooks/data';
import { isConfigured } from '../lib/supabase';

export const PUBLIC_LINKS = [
  ['/', 'الرئيسية'],
  ['/about', 'عن البرنامج'],
  ['/register', 'تسجيل طالب'],
  ['/application-status', 'متابعة الطلب'],
  ['/result', 'الاستعلام عن النتيجة'],
  ['/certificate-verification', 'التحقق من الشهادة'],
];

export default function PublicLayout() {
  const { data: settings } = useSettings();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const org = settings?.org_name || 'برنامج حُفّاظ السُّنة';
  const logoScale = Number(settings?.logo_scale) || 1;
  const brandLogo = settings?.logo_url || logoMark;

  return (
    <>
      <header className="pub-top" data-open={open}>
        <div className="pub-in">
          <Link to="/"><img className="lg" src={brandLogo} alt={`شعار ${org}`} style={{ height: `calc(46px * ${logoScale})` }} /></Link>
          <div>
            <div className="kufi" style={{ fontSize: 15.5 }}>{org}</div>
            <div className="tiny muted pub-brand-sub">منظومة التسجيل والامتحانات والشهادات</div>
          </div>
          <button className="icon-btn pub-burger" onClick={() => setOpen((o) => !o)} aria-label="القائمة">
            <Icon.menu />
          </button>
          <nav className="pub-links">
            {PUBLIC_LINKS.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>
            ))}
            <NavLink to="/admin/login" className="staff">دخول الإدارة</NavLink>
          </nav>
        </div>
      </header>

      {!isConfigured && (
        <div className="wrap mt">
          <div className="alert warn">
            لم تُضبط بيانات الاتصال بـ Supabase بعد. انسخ <b className="ltr">.env.example</b> إلى <b className="ltr">.env.local</b> واملأ القيم، ثم أعد تشغيل الخادم.
          </div>
        </div>
      )}

      <Outlet />

      <footer className="foot">
        <div className="foot-in">
          <div>
            <img src={settings?.logo_url || logoStacked} style={{ width: 150 * logoScale, maxWidth: '100%', filter: settings?.logo_url ? 'none' : 'brightness(0) invert(1)', opacity: 0.92 }} alt="" />
            <p className="small" style={{ marginTop: 12, maxWidth: '40ch' }}>
              منظومة رسمية لتسجيل طلبة البرنامج وإجراء امتحاناتهم واعتماد نتائجهم وإصدار شهاداتهم.
            </p>
          </div>
          <div>
            <h4>روابط</h4>
            {PUBLIC_LINKS.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}
            <Link to="/examiner/login">دخول المحفّظين</Link>
          </div>
          <div>
            <h4>التواصل</h4>
            {settings?.org_phone && <a className="ltr" href={`tel:${settings.org_phone.replace(/\s/g, '')}`}>{settings.org_phone}</a>}
            {settings?.org_email && <a className="ltr" href={`mailto:${settings.org_email}`}>{settings.org_email}</a>}
            {settings?.org_address && <span className="l">{settings.org_address}</span>}
          </div>
        </div>
        <div className="foot-bar">جميع الحقوق محفوظة — {org} · {new Date().getFullYear()} م</div>
      </footer>
    </>
  );
}
