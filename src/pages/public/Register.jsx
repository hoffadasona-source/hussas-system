import RegistrationForm from '../../components/RegistrationForm';

export default function Register() {
  return (
    <div className="wrap narrow">
      <section className="sec">
        <div className="sec-h">
          <h2>تسجيل طالب في الامتحان</h2>
          <p>الحقول المؤشّرة بـ <b style={{ color: 'var(--red)' }}>*</b> إلزامية.</p>
        </div>
        <div className="card">
          <RegistrationForm mode="public" />
        </div>
      </section>
    </div>
  );
}
