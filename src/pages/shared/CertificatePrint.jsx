import { useEffect } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import CertificateView from '../../components/CertificateView';
import { Icon } from '../../components/icons';
import { Empty, Loading } from '../../components/ui';
import { useSettings } from '../../hooks/data';
import { supabase } from '../../lib/supabase';

export default function CertificatePrint() {
  const { certNo } = useParams();
  const { data: settings } = useSettings();
  const { data: cert, isLoading } = useQuery({
    queryKey: ['certificate', certNo],
    queryFn: async () => {
      const { data, error } = await supabase.from('certificates').select('*').eq('cert_no', certNo).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (cert) document.title = `شهادة ${cert.cert_no} — ${cert.student_name}`;
  }, [cert]);

  if (isLoading || !settings) return <Loading />;
  if (!cert) return <div className="print-page"><div className="card"><Empty title="الشهادة غير موجودة" /></div></div>;

  return (
    <div className="print-page">
      <div className="row no-print" style={{ justifyContent: 'center', marginBottom: 16 }}>
        <button className="btn teal" onClick={() => window.print()}><Icon.print /> طباعة / حفظ PDF</button>
        <span className="small muted">اختر «حفظ بتنسيق PDF» والاتجاه الأفقي من نافذة الطباعة.</span>
      </div>
      <CertificateView cert={cert} settings={settings} />
    </div>
  );
}
