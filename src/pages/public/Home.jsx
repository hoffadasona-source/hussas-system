import { Link } from 'react-router';
import logoStacked from '../../assets/logo-stacked.png';
import { Icon } from '../../components/icons';
import { Kv } from '../../components/ui';
import { useSettings } from '../../hooks/data';

const STEPS = [
  ['التسجيل', 'تعبئة البيانات وإرسال الطلب.'],
  ['مراجعة الإدارة', 'قبول الطلب وإحالته لمحفّظ.'],
  ['الموعد', 'يحدد المحكّم الموعد ويرسله لك على واتساب.'],
  ['الامتحان', 'جلسة تسميع أونلاين: أسئلة من المتن.'],
  ['الاعتماد', 'اعتماد المحكّم ثم الإدارة.'],
  ['الشهادة', 'إصدار شهادة برقم وQR.'],
];
const AR_NUM = ['١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export default function Home() {
  const { data: s } = useSettings();
  return (
    <>
      <section className="hero">
        <div className="hero-in">
          <div>
            <span className="badge-line"><Icon.check /> امتحان أونلاين عبر غرفة صوتية · شهادات معتمدة قابلة للتحقق</span>
            <h1 style={{ marginTop: 14 }}>سجّل في امتحان المتون العلمية، وتابع طلبك حتى استلام الشهادة</h1>
            <p className="lead">
              تُقدَّم الطلبات إلكترونياً، وتُراجعها الإدارة وتحيلها إلى المحكّمين، ويُجرى الامتحان عن بُعد في موعد يصلك على
              واتساب، ثم تُعتمد النتيجة من الإدارة قبل ظهورها لك.
            </p>
            <div className="row">
              <Link className="btn teal" to="/register">تسجيل طالب جديد</Link>
              <Link className="btn ghost" to="/result">الاستعلام عن النتيجة</Link>
            </div>
          </div>
          <div className="hero-mark"><img src={logoStacked} alt="شعار البرنامج" /></div>
        </div>
      </section>

      <div className="wrap">
        <section className="sec">
          <div className="acts-grid">
            <Link className="act-card" to="/register"><div className="ic"><Icon.file /></div><h3>تسجيل طالب</h3>
              <p>املأ نموذج التسجيل، وستحصل على رقم طلب لمتابعة حالته.</p></Link>
            <Link className="act-card" to="/application-status"><div className="ic"><Icon.list /></div><h3>متابعة الطلب</h3>
              <p>اعرف موقع طلبك: مراجعة، إحالة، موعد امتحان، أو نتيجة.</p></Link>
            <Link className="act-card" to="/result"><div className="ic"><Icon.check /></div><h3>الاستعلام عن النتيجة</h3>
              <p>تظهر الدرجة بعد اعتمادها من الإدارة فقط.</p></Link>
            <Link className="act-card" to="/certificate-verification"><div className="ic"><Icon.award /></div><h3>التحقق من الشهادة</h3>
              <p>أدخل رقم الشهادة أو امسح رمز QR للتأكد من صحتها.</p></Link>
          </div>
        </section>

        <section className="sec tight">
          <div className="sec-h"><h2>مسار الطالب</h2><p>من إرسال الطلب إلى إصدار الشهادة.</p></div>
          <div className="steps-line">
            {STEPS.map(([t, d], i) => (
              <div className="step-item" key={t}><div className="n">الخطوة {AR_NUM[i]}</div><h4>{t}</h4><p>{d}</p></div>
            ))}
          </div>
        </section>

        <section className="sec tight">
          <div className="grid split-r">
            <div className="card">
              <div className="card-h"><h3>شروط وتعليمات الامتحان</h3></div>
              <div className="card-b">
                <ul style={{ margin: 0, paddingInlineStart: 20, color: 'var(--text-2)', lineHeight: 2 }}>
                  <li>يقدَّم طلب واحد لكل طالب في الدورة الواحدة.</li>
                  <li>يُجرى الامتحان أونلاين عبر الغرفة الصوتية المحددة في الإشعار.</li>
                  <li>الدخول إلى الغرفة قبل الموعد بعشر دقائق، مع اتصال إنترنت مستقر وسماعة.</li>
                  <li>الامتحان في المتون المسجَّلة فقط: {s?.exam_questions ?? 3} أسئلة يختارها المحكّم من المتن.</li>
                  <li>التخلّف عن الموعد دون عذر يسجَّل غياباً.</li>
                  <li>لا تُعتمد أي نتيجة قبل مراجعتها من الإدارة.</li>
                </ul>
              </div>
            </div>
            <div className="card">
              <div className="card-h"><h3>التواصل</h3></div>
              <div className="card-b">
                <Kv items={[
                  ['الهاتف', <span className="ltr">{s?.org_phone || '—'}</span>],
                  ['البريد', <span className="ltr">{s?.org_email || '—'}</span>],
                  ['العنوان', s?.org_address],
                  ['أوقات العمل', s?.work_hours],
                ]} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
