import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import logoStacked from '../assets/logo-stacked.png';
import { fmtDate, fmtScore } from '../lib/format';
import { CERT_FIELDS, certFieldValue, loadTemplateImage, mergeLayout, verifyUrl } from '../lib/certificate';

export { verifyUrl };

const PT = 96 / 72; // نقطة طباعية = 1.333 بكسل على الشاشة

/** يحمّل قالب الشهادة (PDF أو صورة) ويحوّله إلى صورة جاهزة للعرض والطباعة */
export function useCertificateTemplate(url) {
  const [state, setState] = useState({ loading: !!url, image: null, error: '' });
  useEffect(() => {
    let alive = true;
    if (!url) {
      setState({ loading: false, image: null, error: '' });
      return undefined;
    }
    setState({ loading: true, image: null, error: '' });
    loadTemplateImage(url)
      .then((image) => alive && setState({ loading: false, image, error: '' }))
      .catch((err) => alive && setState({ loading: false, image: null, error: err.message || 'تعذّر قراءة ملف القالب' }));
    return () => { alive = false; };
  }, [url]);
  return state;
}

/** يصغّر القالب ليملأ عرض الحاوية على الشاشة، ويطبعه بمقاسه الحقيقي */
function Scaler({ page, children }) {
  const wrap = useRef(null);
  const [scale, setScale] = useState(1);
  const width = page.w * PT;
  const height = page.h * PT;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const fit = () => setScale(Math.min(1, el.clientWidth / width));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div className="cert-scale" ref={wrap} style={{ height: height * scale }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top right' }}>{children}</div>
    </div>
  );
}

/** الشهادة مطبوعة فوق القالب المرفوع بإحداثيات الإعدادات */
export function CertificateTemplateView({ cert, settings, image, layout, onFieldPointerDown, selected }) {
  const fields = layout.fields;
  const showQr = settings?.cert_show_qr !== false && fields.qr?.show !== false;

  return (
    <Scaler page={layout.page}>
      <div className="cert-tpl" style={{ width: layout.page.w * PT, height: layout.page.h * PT, backgroundImage: `url(${image.src})` }}>
        {cert.status === 'revoked' && <div className="revoked"><span>ملغاة</span></div>}
        {CERT_FIELDS.filter((f) => f.key !== 'qr').map((f) => {
          const conf = fields[f.key];
          const value = certFieldValue(f.key, cert, settings);
          if (!conf?.show || !value) return null;
          return (
            <div key={f.key}
              className={`cert-fld ${selected === f.key ? 'sel' : ''} ${onFieldPointerDown ? 'drag' : ''}`}
              onPointerDown={onFieldPointerDown ? (e) => onFieldPointerDown(e, f.key) : undefined}
              style={{
                left: `${conf.x}%`, top: `${conf.y}%`, fontSize: `${conf.size * PT}px`,
                color: conf.color, fontWeight: conf.weight,
              }}>
              {value}
            </div>
          );
        })}
        {showQr && (
          <div className={`cert-fld ${selected === 'qr' ? 'sel' : ''} ${onFieldPointerDown ? 'drag' : ''}`}
            onPointerDown={onFieldPointerDown ? (e) => onFieldPointerDown(e, 'qr') : undefined}
            style={{ left: `${fields.qr.x}%`, top: `${fields.qr.y}%`, background: '#fff', padding: 4, borderRadius: 4, lineHeight: 0 }}>
            <QRCodeSVG value={verifyUrl(cert.cert_no)} size={fields.qr.size * PT} fgColor={fields.qr.color || '#16324F'} level="M" />
          </div>
        )}
      </div>
    </Scaler>
  );
}

/** التصميم المدمج (عند عدم رفع قالب) */
function ClassicCertificate({ cert, settings }) {
  const org = settings?.org_name || 'برنامج حُفّاظ السُّنة';
  return (
    <div className="cert">
      {cert.status === 'revoked' && <div className="revoked"><span>ملغاة</span></div>}
      <div className="cert-in">
        <img className="logo" src={settings?.logo_url || logoStacked} alt="" />
        <div className="ttl">{settings?.cert_title || 'شهادة اجتياز امتحان البرنامج'}</div>
        <p style={{ color: '#5C6663', margin: '10px 0 0' }}>تشهد إدارة {org} بأن</p>
        <div className="nm">{cert.student_name}</div>
        <p style={{ color: '#5C6663', margin: 0 }}>
          قد اجتاز امتحان البرنامج{cert.level_name ? ` في ${cert.level_name}` : ''} بدرجة <b>{fmtScore(cert.score)}</b> من 100
          {cert.grade ? <> بتقدير <b>{cert.grade}</b></> : null}
        </p>
        <div className="cert-foot">
          <div style={{ textAlign: 'start' }}>
            <div className="tiny" style={{ color: '#5C6663' }}>رقم الشهادة</div>
            <div className="num" style={{ fontWeight: 600, direction: 'ltr' }}>{cert.cert_no}</div>
            <div className="tiny" style={{ color: '#5C6663', marginTop: 8 }}>تاريخ الإصدار</div>
            <div className="num">{fmtDate(cert.issued_at)}</div>
          </div>
          {settings?.cert_show_qr !== false && (
            <div className="qr-box" title="امسح للتحقق من الشهادة">
              <QRCodeSVG value={verifyUrl(cert.cert_no)} size={92} fgColor="#16324F" level="M" />
            </div>
          )}
          <div className="sig">
            {settings?.cert_signer_name && <div style={{ fontWeight: 600 }}>{settings.cert_signer_name}</div>}
            <div className="small" style={{ color: '#5C6663' }}>{settings?.cert_signer_title || 'توقيع المدير'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CertificateView({ cert, settings }) {
  const { image, loading, error } = useCertificateTemplate(settings?.cert_bg_pdf_url);

  if (settings?.cert_bg_pdf_url) {
    if (loading) return <div className="card-b"><div className="skel" style={{ height: 320 }} /></div>;
    if (image) {
      return <CertificateTemplateView cert={cert} settings={settings} image={image} layout={mergeLayout(settings.cert_layout_config)} />;
    }
    return (
      <>
        {error && <div className="alert err mb no-print">{error} — طُبعت الشهادة بالتصميم المدمج.</div>}
        <ClassicCertificate cert={cert} settings={settings} />
      </>
    );
  }
  return <ClassicCertificate cert={cert} settings={settings} />;
}
