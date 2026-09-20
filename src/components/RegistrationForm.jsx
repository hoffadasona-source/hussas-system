import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Field, Kv, Loading, Select, ErrorBox, StatusBadge } from './ui';
import { useLookups } from '../hooks/data';
import { useUi } from '../context/UiContext';
import { rpc } from '../lib/supabase';
import { APP_STATUS, GENDERS, SECTIONS } from '../lib/constants';
import { errorMessage, isLibyanPhone } from '../lib/helpers';
import { fmtDate, todayISO } from '../lib/format';

const STEPS = ['البيانات الشخصية', 'بيانات الاتصال', 'بيانات الحلقة', 'المراجعة والإرسال'];

const EMPTY = {
  first_name: '', father_name: '', grandfather_name: '', family_name: '', birth_date: '', national_id: '',
  gender: 'male', residence: '', phone: '', whatsapp: '', email: '', section: 'men', circle_name: '',
  center_name: '', office_id: '', teacher_name: '', level_id: '', memorized_amount: '',
  verses_range: '', student_notes: '',
};

function validate(step, f) {
  const e = {};
  const req = (k) => !String(f[k] ?? '').trim() && (e[k] = 'هذا الحقل مطلوب.');
  if (step === 0) {
    ['first_name', 'father_name', 'family_name', 'birth_date', 'residence'].forEach(req);
    if (!/^\d{12}$/.test(f.national_id)) e.national_id = 'الرقم الوطني 12 رقماً.';
    if (f.birth_date && f.birth_date > todayISO()) e.birth_date = 'تاريخ غير صحيح.';
  }
  if (step === 1) {
    if (!isLibyanPhone(f.phone)) e.phone = 'رقم غير صحيح. مثال: 0912345678';
    if (!isLibyanPhone(f.whatsapp)) e.whatsapp = 'رقم غير صحيح. مثال: 0912345678';
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) e.email = 'بريد غير صحيح.';
  }
  if (step === 2) {
    ['circle_name', 'center_name', 'office_id', 'level_id', 'memorized_amount'].forEach(req);
  }
  return e;
}

export default function RegistrationForm({ mode = 'public', onCreated }) {
  const isAdmin = mode === 'admin';
  const { data: lookups, isLoading, error: lookupsError } = useLookups();
  const { toast } = useUi();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [agree, setAgree] = useState(isAdmin);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [receipt, setReceipt] = useState(null);

  const offices = useMemo(() => (lookups?.offices || []).filter((o) => o.active), [lookups]);
  const levels = useMemo(() => (lookups?.levels || []).filter((o) => o.active), [lookups]);

  if (isLoading) return <Loading />;
  if (lookupsError) return <div className="card-b"><ErrorBox error={errorMessage(lookupsError)} /></div>;

  const cycle = lookups.currentCycle;
  const closed = !isAdmin && (!cycle || !cycle.registration_open);

  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const next = () => {
    const e = validate(step, form);
    setErrors(e);
    if (Object.keys(e).length) return;
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async () => {
    for (let i = 0; i < 3; i++) {
      const e = validate(i, form);
      if (Object.keys(e).length) {
        setErrors(e);
        setStep(i);
        return;
      }
    }
    if (!agree) {
      toast('أكّد إقرارك بصحة البيانات قبل الإرسال', 'err');
      return;
    }
    setBusy(true);
    setSubmitError('');
    try {
      const res = await rpc('submit_application', { p: form });
      setReceipt(res);
      toast(isAdmin ? 'أُضيف الطلب بنجاح' : 'أُرسل الطلب بنجاح');
      onCreated?.(res);
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (closed) {
    return (
      <div className="card-b">
        <div className="alert warn">التسجيل مغلق حالياً{cycle ? ` في ${cycle.name}` : ''}. تابع إعلانات البرنامج لمعرفة موعد فتح التسجيل.</div>
      </div>
    );
  }

  if (receipt) {
    return (
      <div className="card-b">
        <div className="receipt">
          <span className="badge ok">{isAdmin ? 'تمت إضافة الطلب' : 'تم إرسال الطلب'}</span>
          <div className="no ltr">{receipt.reg_no}</div>
          <p className="muted small" style={{ margin: 0 }}>احتفظ برقم الطلب لمتابعة حالته، وبرقم الطالب للاستعلام عن النتيجة.</p>
          <div style={{ maxWidth: 360, margin: '20px auto 0', textAlign: 'start' }}>
            <Kv items={[
              ['رقم الطالب', <span className="num ltr">{receipt.student_no}</span>],
              ['الدورة', receipt.cycle],
              ['تاريخ التسجيل', fmtDate(receipt.created_at)],
              ['الحالة الحالية', <StatusBadge map={APP_STATUS} value={receipt.status} />],
              ['الخطوة التالية', 'مراجعة الإدارة'],
            ]} />
          </div>
          <div className="row no-print" style={{ justifyContent: 'center', marginTop: 20 }}>
            {isAdmin ? (
              <>
                <button className="btn ghost" onClick={() => { setReceipt(null); setForm(EMPTY); setStep(0); }}>إضافة طالب آخر</button>
                <Link className="btn teal" to="/admin/applications">الذهاب إلى الطلبات</Link>
              </>
            ) : (
              <>
                <Link className="btn ghost" to={`/application-status?q=${receipt.reg_no}`}>متابعة الطلب</Link>
                <button className="btn teal" onClick={() => window.print()}>طباعة الإيصال</button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const name = (id, list) => list.find((x) => x.id === id)?.name;
  const fullName = [form.first_name, form.father_name, form.grandfather_name, form.family_name].filter(Boolean).join(' ');

  return (
    <>
      <div className="card-b">
        <div className="stepper">
          {STEPS.map((s, i) => (
            <div key={s} className={`stp ${step === i ? 'on' : step > i ? 'done' : ''}`}>
              <div className="k">الخطوة {i + 1}</div><div className="t">{s}</div>
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="f2">
            <Field label="الاسم الأول" required error={errors.first_name}><input className="inp" value={form.first_name} onChange={set('first_name')} /></Field>
            <Field label="اسم الأب" required error={errors.father_name}><input className="inp" value={form.father_name} onChange={set('father_name')} /></Field>
            <Field label="اسم الجد"><input className="inp" value={form.grandfather_name} onChange={set('grandfather_name')} /></Field>
            <Field label="اللقب" required error={errors.family_name}><input className="inp" value={form.family_name} onChange={set('family_name')} /></Field>
            <Field label="تاريخ الميلاد" required error={errors.birth_date}><input className="inp" type="date" max={todayISO()} value={form.birth_date} onChange={set('birth_date')} /></Field>
            <Field label="الرقم الوطني" required error={errors.national_id} hint="يُستخدم للاستعلام عن النتيجة لاحقاً.">
              <input className="inp ltr" inputMode="numeric" maxLength={12} placeholder="12 رقماً" value={form.national_id}
                onChange={(e) => set('national_id')(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="الجنس" required>
              <Select value={form.gender} onChange={set('gender')} options={Object.entries(GENDERS).map(([value, label]) => ({ value, label }))} />
            </Field>
            <Field label="محل الإقامة" required error={errors.residence}><input className="inp" placeholder="المدينة / المنطقة" value={form.residence} onChange={set('residence')} /></Field>
          </div>
        )}

        {step === 1 && (
          <>
            <div className="f2">
              <Field label="رقم الهاتف" required error={errors.phone} hint="صيغة ليبيا: 091 / 092 / 094 / 095، أو رقم دولي يبدأ بـ +">
                <input className="inp ltr" inputMode="tel" placeholder="09X XXX XXXX" value={form.phone} onChange={set('phone')} />
              </Field>
              <Field label="رقم واتساب" required error={errors.whatsapp}>
                <input className="inp ltr" inputMode="tel" placeholder="09X XXX XXXX" value={form.whatsapp} onChange={set('whatsapp')} />
                {form.phone && !form.whatsapp && (
                  <button type="button" className="link tiny mt-s" onClick={() => set('whatsapp')(form.phone)}>نفس رقم الهاتف</button>
                )}
              </Field>
              <Field label="البريد الإلكتروني" className="full" error={errors.email}>
                <input className="inp ltr" type="email" value={form.email} onChange={set('email')} />
              </Field>
            </div>
            <div className="alert small">تُرسل إشعارات الموعد والنتيجة على رقم واتساب المسجَّل، فتأكد من صحته.</div>
          </>
        )}

        {step === 2 && (
          <div className="f2">
            <Field label="القسم" required>
              <Select value={form.section} onChange={set('section')} options={Object.entries(SECTIONS).map(([value, label]) => ({ value, label }))} />
            </Field>
            <Field label="اسم الحلقة" required error={errors.circle_name}><input className="inp" value={form.circle_name} onChange={set('circle_name')} /></Field>
            <Field label="المركز" required error={errors.center_name}><input className="inp" value={form.center_name} onChange={set('center_name')} /></Field>
            <Field label="المكتب التابع له" required error={errors.office_id}>
              <Select value={form.office_id} onChange={set('office_id')} placeholder="اختر المكتب" options={offices.map((o) => ({ value: o.id, label: o.name }))} />
            </Field>
            <Field label="اسم المحفّظ"><input className="inp" value={form.teacher_name} onChange={set('teacher_name')} /></Field>
            <Field label="المستوى" required error={errors.level_id}>
              <Select value={form.level_id} onChange={set('level_id')} placeholder="اختر المستوى" options={levels.map((o) => ({ value: o.id, label: o.name }))} />
            </Field>
            <Field label="مقدار الحفظ" required error={errors.memorized_amount} hint="ما أتمّه الطالب في هذا المستوى."><input className="inp" placeholder="مثال: المستوى كاملاً" value={form.memorized_amount} onChange={set('memorized_amount')} /></Field>
            <Field label="الأبيات / المواضع"><input className="inp" placeholder="مثال: من البيت 1 إلى 60" value={form.verses_range} onChange={set('verses_range')} /></Field>
            <Field label="ملاحظات الطالب" className="full"><textarea className="inp" placeholder="أي ملاحظة تودّ إضافتها" value={form.student_notes} onChange={set('student_notes')} /></Field>
          </div>
        )}

        {step === 3 && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>راجع البيانات قبل الإرسال. لن يمكن تعديل الطلب بعد إرساله إلا عبر الإدارة.</p>
            <Kv items={[
              ['الاسم الكامل', fullName],
              ['الرقم الوطني', <span className="num">{form.national_id}</span>],
              ['تاريخ الميلاد', form.birth_date],
              ['الجنس / الإقامة', `${GENDERS[form.gender]} — ${form.residence}`],
              ['الهاتف / واتساب', <span className="ltr">{form.phone} · {form.whatsapp}</span>],
              form.email && ['البريد', <span className="ltr">{form.email}</span>],
              ['القسم', SECTIONS[form.section]],
              ['الحلقة والمركز', `${form.circle_name} — ${form.center_name}`],
              ['المكتب', name(form.office_id, offices)],
              ['المستوى ومقدار الحفظ', `${name(form.level_id, levels)} — ${form.memorized_amount}`],
              form.verses_range && ['الأبيات / المواضع', form.verses_range],
              ['الدورة', cycle?.name],
            ]} />
            {!isAdmin && (
              <label className="check mt">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                أقرّ بصحة البيانات المُدخلة والتزامي بشروط الامتحان.
              </label>
            )}
            {submitError && <div className="alert err mt" role="alert">{submitError}</div>}
          </>
        )}
      </div>
      <div className="card-f">
        {step > 0 && <button className="btn ghost" onClick={() => setStep((s) => s - 1)} disabled={busy}>السابق</button>}
        {step < 3 ? (
          <button className="btn teal" onClick={next}>التالي</button>
        ) : (
          <button className="btn teal" onClick={submit} disabled={busy}>
            {busy && <span className="spinner" />} {isAdmin ? 'إضافة الطلب' : 'إرسال الطلب'}
          </button>
        )}
      </div>
    </>
  );
}
