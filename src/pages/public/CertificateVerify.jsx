import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Icon } from '../../components/icons';
import { Badge, Empty, Kv, Modal, Skeleton } from '../../components/ui';
import { useUi } from '../../context/UiContext';
import { rpc } from '../../lib/supabase';
import { errorMessage } from '../../lib/helpers';
import { fmtDate, fmtScore } from '../../lib/format';

/** مسح QR بالكاميرا عبر BarcodeDetector (Chrome/Edge/Android). */
function QrScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const [error, setError] = useState('');

  useEffect(() => {
    let stream;
    let raf;
    let stopped = false;
    (async () => {
      if (!('BarcodeDetector' in window)) {
        setError('المتصفح لا يدعم مسح الرمز. استخدم كاميرا الهاتف لفتح الرابط المطبوع في رمز QR مباشرة.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) {
              onResultRef.current(codes[0].rawValue);
              return;
            }
          } catch {
            /* إطار غير جاهز */
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setError('تعذّر الوصول إلى الكاميرا. تحقق من أذونات المتصفح.');
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <Modal title="مسح رمز QR" onClose={onClose} footer={<button className="btn ghost" onClick={onClose}>إغلاق</button>}>
      {error ? <div className="alert warn">{error}</div> : (
        <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 10, background: '#000' }} />
      )}
    </Modal>
  );
}

export default function CertificateVerify() {
  const [params, setParams] = useSearchParams();
  const [no, setNo] = useState(params.get('no') || '');
  const [state, setState] = useState({ loading: false, data: undefined, error: '' });
  const [scanning, setScanning] = useState(false);
  const { toast } = useUi();

  const verify = async (value) => {
    const v = value.trim().toUpperCase();
    if (!v) return;
    setParams({ no: v }, { replace: true });
    setState({ loading: true, data: undefined, error: '' });
    try {
      setState({ loading: false, data: await rpc('verify_certificate', { p_cert_no: v }), error: '' });
    } catch (err) {
      setState({ loading: false, data: undefined, error: errorMessage(err) });
    }
  };

  useEffect(() => {
    if (params.get('no')) verify(params.get('no'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScan = (raw) => {
    setScanning(false);
    let value = raw;
    try {
      value = new URL(raw).searchParams.get('no') || raw;
    } catch {
      /* الرمز ليس رابطاً */
    }
    setNo(value);
    verify(value);
    toast('قُرئ الرمز', 'info');
  };

  const c = state.data;
  return (
    <div className="wrap" style={{ maxWidth: 860 }}>
      <section className="sec">
        <div className="sec-h"><h2>التحقق من الشهادة</h2><p>أدخل رقم الشهادة المدوّن أسفلها، أو امسح رمز QR.</p></div>
        <div className="card">
          <form className="card-b row" onSubmit={(e) => { e.preventDefault(); verify(no); }}>
            <input className="inp ltr" style={{ flex: 1, minWidth: 220 }} placeholder="CERT-2026-00001" value={no}
              onChange={(e) => setNo(e.target.value)} />
            <button className="btn teal" disabled={state.loading}>تحقق</button>
            <button type="button" className="btn ghost" onClick={() => setScanning(true)}><Icon.qr /> مسح QR</button>
          </form>
          {state.error && <div className="card-b" style={{ paddingTop: 0 }}><div className="alert err">{state.error}</div></div>}
        </div>

        <div className="mt">
          {state.loading && <div className="card"><Skeleton /></div>}
          {c === null && (
            <div className="card">
              <Empty title="لم يتم العثور على شهادة مطابقة" text="تحقق من الرقم كما هو مدوّن على الشهادة. إن استمرت المشكلة تواصل مع الإدارة." />
            </div>
          )}
          {c && (
            <div className="card">
              <div className="card-h">
                <h3>{c.status === 'valid' ? 'الشهادة صحيحة ومعتمدة' : 'الشهادة ملغاة'}</h3>
                {c.status === 'valid' ? <Badge kind="ok">تحقق ناجح</Badge> : <Badge kind="err">غير سارية</Badge>}
              </div>
              <div className="card-b">
                <Kv items={[
                  ['رقم الشهادة', <span className="num ltr">{c.cert_no}</span>],
                  ['اسم الطالب', c.student_name],
                  ['الجهة', c.org_name],
                  ['المستوى', c.level || '—'],
                  ['الدرجة', `${fmtScore(c.score)} من 100`],
                  c.grade && ['التقدير', c.grade],
                  ['تاريخ الإصدار', fmtDate(c.issued_at)],
                  ['الحالة', c.status === 'valid' ? <Badge kind="ok">سارية</Badge> : <Badge kind="err">ملغاة منذ {fmtDate(c.revoked_at)}</Badge>],
                ]} />
              </div>
            </div>
          )}
        </div>
      </section>
      {scanning && <QrScanner onResult={onScan} onClose={() => setScanning(false)} />}
    </div>
  );
}
