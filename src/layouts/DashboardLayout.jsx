import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import logoMark from '../assets/logo-mark.png';
import ChangePassword from '../components/ChangePassword';
import { Icon } from '../components/icons';
import { Empty, Loading, Modal } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useCount, useSettings } from '../hooks/data';
import { supabase } from '../lib/supabase';
import { ROLES } from '../lib/constants';
import { fmtRelative, initials } from '../lib/format';

function adminNav(can) {
  return [
    ['عام', [
      ['/admin', 'لوحة المتابعة', Icon.home],
      ['/admin/applications', 'الطلبات', Icon.file, 'newApps'],
      ['/admin/students', 'الطلبة', Icon.users],
      ['/admin/examiners', 'المحفّظون', Icon.users],
      ['/admin/assignments', 'الإحالات', Icon.list],
    ]],
    ['الامتحانات', [
      ['/admin/appointments', 'المواعيد', Icon.cal],
      ['/admin/exams', 'الامتحانات', Icon.list],
      ['/admin/results/pending', 'نتائج بانتظار الاعتماد', Icon.check, 'pendingResults'],
      ['/admin/results', 'النتائج', Icon.chart],
      ['/admin/certificates', 'الشهادات', Icon.award],
    ]],
    ['الإعداد', [
      ['/admin/arbitration', 'أساس التحكيم', Icon.list],
      ['/admin/reports', 'التقارير', Icon.chart],
      ['/admin/messages', 'الرسائل', Icon.whatsapp, 'failedMessages'],
      can('super') && ['/admin/users', 'المستخدمون والصلاحيات', Icon.users],
      ['/admin/settings', 'الإعدادات', Icon.cog],
      ['/admin/audit-log', 'سجل العمليات', Icon.file],
    ].filter(Boolean)],
  ];
}

const EXAMINER_NAV = [
  ['', [
    ['/examiner', 'لوحة المتابعة', Icon.home],
    ['/examiner/students', 'طلابي', Icon.users],
    ['/examiner/appointments', 'المواعيد', Icon.cal],
    ['/examiner/exams', 'الامتحانات', Icon.list, 'openExams'],
    ['/examiner/results', 'نتائجي', Icon.chart],
  ]],
];

function toggleTheme() {
  const h = document.documentElement;
  const next = h.dataset.theme === 'dark' ? 'light' : 'dark';
  if (next === 'dark') h.dataset.theme = 'dark';
  else delete h.dataset.theme;
  try {
    localStorage.setItem('theme', next);
  } catch {
    /* التخزين غير متاح */
  }
}

function Notifications({ userId }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('notifications').select('*')
        .eq('recipient_id', userId).order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });
  const unread = data.filter((n) => !n.read_at);
  const markRead = useMutation({
    mutationFn: async () => {
      if (!unread.length) return;
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unread.map((n) => n.id));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', userId] }),
  });

  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)} title="الإشعارات" aria-label="الإشعارات">
        <Icon.bell />
        {unread.length > 0 && <span className="dot" />}
      </button>
      {open && (
        <Modal title="الإشعارات" onClose={() => { setOpen(false); markRead.mutate(); }}
          footer={<button className="btn ghost" onClick={() => { setOpen(false); markRead.mutate(); }}>إغلاق</button>}>
          {data.length === 0 ? (
            <Empty title="لا توجد إشعارات" text="ستظهر هنا الطلبات الجديدة والنتائج التي تحتاج إجراءً." />
          ) : (
            data.map((n) => (
              <div key={n.id} className={`notif ${n.read_at ? '' : 'unread'}`}>
                <span className={`dotk ${n.kind}`} />
                <div style={{ flex: 1 }}>
                  <div className="t" style={{ fontSize: 14 }}>
                    {n.link ? (
                      <button className="link" style={{ color: 'inherit', textAlign: 'start' }}
                        onClick={() => { setOpen(false); markRead.mutate(); navigate(n.link); }}>{n.title}</button>
                    ) : n.title}
                  </div>
                  {n.body && <div className="small muted">{n.body}</div>}
                  <div className="tiny muted">{fmtRelative(n.created_at)}</div>
                </div>
              </div>
            ))
          )}
        </Modal>
      )}
    </>
  );
}

export default function DashboardLayout({ portal }) {
  const { profile, examiner, can, signOut, user } = useAuth();
  const { data: settings } = useSettings();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isAdminPortal = portal === 'admin';
  const [changingPassword, setChangingPassword] = useState(false);

  const newApps = useCount('newApps', 'applications', (q) => q.in('status', ['pending', 'under_review']), { enabled: isAdminPortal });
  const pendingResults = useCount('pendingResults', 'exams', (q) => q.eq('status', 'examiner_approved'), { enabled: isAdminPortal });
  const failedMessages = useCount('failedMessages', 'outbound_messages', (q) => q.eq('status', 'failed'), { enabled: isAdminPortal });
  const openExams = useCount('openExams', 'exams', (q) => q.in('status', ['draft', 'in_progress', 'rejected']), { enabled: !isAdminPortal });
  const counts = { newApps: newApps.data, pendingResults: pendingResults.data, openExams: openExams.data, failedMessages: failedMessages.data };

  useEffect(() => {
    document.documentElement.removeAttribute('data-side');
  }, [pathname]);

  const nav = isAdminPortal ? adminNav(can) : EXAMINER_NAV;
  const roleLabel = isAdminPortal ? ROLES[profile.role] : `محفّظ${examiner?.office_name ? ` — ${examiner.office_name}` : ''}`;

  const logout = async () => {
    await signOut();
    navigate(isAdminPortal ? '/admin/login' : '/examiner/login');
  };

  return (
    <>
      <div className="scrim" onClick={() => document.documentElement.removeAttribute('data-side')} />
      <div className="shell">
        <aside className="side">
          <div className="side-top">
            <img src={settings?.logo_url || logoMark} alt="" style={{ width: `calc(42px * ${Number(settings?.logo_scale) || 1})` }} />
            <div>
              <div className="t1">حُفّاظ السُّنة</div>
              <div className="t2">{isAdminPortal ? 'لوحة الإدارة' : 'لوحة المحفّظ'}</div>
            </div>
          </div>
          <nav className="nav">
            {nav.map(([group, items]) => (
              <div key={group || 'main'}>
                {group && <div className="grp">{group}</div>}
                {items.map(([to, label, I, countKey]) => (
                  <NavLink key={to} to={to} end>
                    <I /><span>{label}</span>
                    {countKey && counts[countKey] > 0 && <span className="c">{counts[countKey]}</span>}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="side-foot">
            <Link to="/">العودة إلى الموقع العام</Link>
            <button onClick={() => setChangingPassword(true)}>تغيير كلمة المرور</button>
            <button onClick={logout}>تسجيل الخروج</button>
          </div>
        </aside>
        <div className="main">
          <header className="top">
            <button className="icon-btn burger" onClick={() => document.documentElement.setAttribute('data-side', 'open')} aria-label="القائمة">
              <Icon.menu />
            </button>
            <h2 className="kufi">{isAdminPortal ? 'لوحة الإدارة' : 'لوحة المحفّظ'}</h2>
            <div className="sp" />
            <Notifications userId={user.id} />
            <button className="icon-btn" onClick={toggleTheme} title="المظهر الليلي" aria-label="تبديل المظهر"><Icon.moon /></button>
            <div className="who">
              <div className="avatar">{initials(profile.full_name)}</div>
              <div className="who-t" style={{ lineHeight: 1.3 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{profile.full_name}</div>
                <div className="tiny muted">{roleLabel}</div>
              </div>
            </div>
          </header>
          <main className="content">
            <Suspense fallback={<Loading />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
      {changingPassword && <ChangePassword onClose={() => setChangingPassword(false)} />}
    </>
  );
}

/** يحمي مسارات اللوحات حسب الدور */
export function RequireRole({ roles, loginPath, children }) {
  const { ready, session, profile } = useAuth();
  const { pathname } = useLocation();
  if (!ready) return <Loading />;
  if (!session || !profile) return <Navigate to={loginPath} replace state={{ from: pathname }} />;
  if (!roles.includes(profile.role)) {
    return <Navigate to={profile.role === 'examiner' ? '/examiner' : '/admin'} replace />;
  }
  // كلمة المرور التي يضعها الإداري نهائية: لا إجبار على تغييرها عند أول دخول
  return children;
}
