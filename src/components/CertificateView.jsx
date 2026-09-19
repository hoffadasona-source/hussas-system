import { QRCodeSVG } from 'qrcode.react';
import logoStacked from '../assets/logo-stacked.png';
import { appUrl, fmtDate, fmtScore } from '../lib/format';

export const verifyUrl = (certNo) => appUrl(`certificate-verification?no=${encodeURIComponent(certNo)}`);

export default function CertificateView({ cert, settings }) {
  const org = settings?.org_name || 'برنامج حُفّاظ السُّنة';
  return (
    <div className="cert">
      {cert.status === 'revoked' && <div className="revoked"><span>ملغاة</span></div>}
      <div className="cert-in">
        <img className="logo" src={logoStacked} alt="" />
        <div className="ttl">{settings?.cert_title || 'شهادة اجتياز امتحان البرنامج'}</div>
        <p style={{ color: '#5C6663', margin: '10px 0 0' }}>تشهد إدارة {org} بأن</p>
        <div className="nm">{cert.student_name}</div>
        <p style={{ color: '#5C6663', margin: 0 }}>
          قد اجتاز امتحان البرنامج في {(cert.matn_names || []).join(' و')} بدرجة <b>{fmtScore(cert.score)}</b> من 100
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
