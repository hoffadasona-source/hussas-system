import { Link } from 'react-router';
import { Empty } from '../../components/ui';

export default function NotFound() {
  return (
    <div className="wrap">
      <section className="sec">
        <div className="card">
          <Empty title="الصفحة غير موجودة" text="تحقق من الرابط، أو عد إلى الصفحة الرئيسية."
            action={<Link className="btn teal" to="/">الصفحة الرئيسية</Link>} />
        </div>
      </section>
    </div>
  );
}
