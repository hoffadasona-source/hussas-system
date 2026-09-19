import { Link } from 'react-router';
import logoStacked from '../../assets/logo-stacked.png';
import { Icon } from '../../components/icons';
import { useLookups } from '../../hooks/data';

const GOALS = [
  ['ربط الناشئة بالعلم', 'ربط الناشئة والشباب بطلب العلم الشرعي المؤصَّل على أيدي مشايخ ومحكّمين معتمدين.'],
  ['من حفظ المتون حاز الفنون', 'تيسير حفظ المتون في العقيدة والفقه والحديث وأصول الفقه والتجويد والنحو.'],
  ['تعليم بلا حدود', 'استثمار التقنية لتمكين الطلاب داخل ليبيا وخارجها من الحفظ والمتابعة والتسميع عن بُعد.'],
];
const METHOD = [
  ['التلقين', 'يأخذ الطالب المتن عن المحفّظ مضبوطاً.'],
  ['العرض', 'تسميع المحفوظ على المحفّظ في الحلقة.'],
  ['التصحيح', 'تصويب اللحن والضبط ومخارج الحروف.'],
  ['المراجعة', 'مراجعة مستمرة تثبّت المحفوظ قبل الامتحان.'],
];

export default function About() {
  const { data: lookups } = useLookups();
  const matns = (lookups?.matns || []).filter((m) => m.active);

  return (
    <>
      <section className="hero">
        <div className="hero-in">
          <div>
            <span className="badge-line"><Icon.award /> تحت إشراف الهيئة العامة للأوقاف والشؤون الإسلامية — ليبيا</span>
            <h1 style={{ marginTop: 14 }}>ما هو برنامج حُفّاظ السُّنة؟</h1>
            <p className="lead">
              مشروع علمي تعليمي، وأول مشروع رسمي معتمد في ليبيا متخصص في تحفيظ وضبط المتون الشرعية والسنة النبوية، بالاعتماد على
              التقنيات الحديثة والتعليم عن بُعد إلى جانب الحلقات الميدانية في المساجد والفروع.
            </p>
            <span className="badge-line">انطلق رسمياً في 18 ربيع الآخر 1442 هـ · ديسمبر 2020</span>
          </div>
          <div className="hero-mark"><img src={logoStacked} alt="" /></div>
        </div>
      </section>

      <div className="wrap">
        <section className="sec">
          <div className="sec-h"><h2>النشأة والأهداف</h2></div>
          <div className="acts-grid">
            {GOALS.map(([t, d]) => (
              <div className="act-card" key={t}><div className="ic"><Icon.check /></div><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </section>

        <section className="sec tight">
          <div className="sec-h">
            <h2>آلية الدراسة والمنهج</h2>
            <p>تدرّج في مستويات تبدأ من المختصرات وتنتهي بالمطولات، وترتكز الحلقة على أربع خطوات.</p>
          </div>
          <div className="steps-line">
            {METHOD.map(([t, d], i) => (
              <div className="step-item" key={t}><div className="n">الخطوة {['١', '٢', '٣', '٤'][i]}</div><h4>{t}</h4><p>{d}</p></div>
            ))}
          </div>
          <div className="grid split-r mt">
            <div className="card">
              <div className="card-h"><h3>أبرز المقررات</h3></div>
              <div className="card-b">
                <div className="row">{matns.map((m) => <span key={m.id} className="badge teal">{m.name}</span>)}</div>
                <p className="hint mt-s">وتُضاف إليها متون أخرى بحسب المستوى.</p>
              </div>
            </div>
            <div className="card">
              <div className="card-h"><h3>الفئات المستهدفة</h3></div>
              <div className="card-b">
                <p className="muted" style={{ marginTop: 0 }}>البرنامج متاح لكافة الأعمار، ويضم:</p>
                <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-m)', padding: 13, marginBottom: 10 }}>
                  <b>قسم الرجال</b><div className="small muted">حلقات ميدانية وحلقات افتراضية.</div>
                </div>
                <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-m)', padding: 13 }}>
                  <b>قسم حافظات السنة</b><div className="small muted">قسم خاص بالنساء والفتيات.</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="sec tight">
          <div className="sec-h"><h2>المنظومة والوسائل التقنية</h2></div>
          <div className="acts-grid">
            <div className="act-card"><div className="ic"><Icon.file /></div><h3>تطبيق حُفّاظ السُّنة</h3>
              <p>متون بصيغة PDF مضبوطة بالشكل ومحققة، مع استماع بصوت قرّاء معتمدين وخاصية التكرار والترديد دون إنترنت.</p></div>
            <div className="act-card"><div className="ic"><Icon.users /></div><h3>الحلقات الافتراضية</h3>
              <p>متابعة أسبوعية عبر الغرف الصوتية ومجموعات المتابعة، وتسميع مباشر على المشايخ والمحفّظين.</p></div>
            <div className="act-card"><div className="ic"><Icon.award /></div><h3>التقييم والاختبارات</h3>
              <p>اختبارات مرحلية ونصفية ونهائية تقيس دقة الحفظ والضبط الإعرابي وحسن الأداء ومخارج الحروف، لمنح الإجازات والشهادات المعتمدة.</p></div>
          </div>
          <div className="card mt">
            <div className="card-b spread">
              <div>
                <h3 className="kufi" style={{ fontSize: 16 }}>جاهز للامتحان؟</h3>
                <p className="muted small" style={{ margin: '4px 0 0' }}>سجّل متونك واختر مستواك، وسيصلك موعد الجلسة على واتساب.</p>
              </div>
              <Link className="btn teal" to="/register">تسجيل طالب جديد</Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
