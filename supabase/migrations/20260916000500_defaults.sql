-- =====================================================================
--  البيانات المرجعية الافتراضية (قابلة للتعديل من لوحة الإدارة)
-- =====================================================================

insert into public.settings (id, org_name, org_phone, org_email, org_address, work_hours,
                             cert_signer_title)
values (1, 'برنامج حُفّاظ السُّنة', '021 000 0000', 'info@hussas.ly', 'طرابلس — ليبيا',
        'الأحد – الخميس، ٩ ص – ٣ م', 'مدير البرنامج')
on conflict (id) do nothing;

insert into public.cycles (name, starts_on, is_current, registration_open)
values ('دورة ١٤٤٨ هـ / ٢٠٢٦ م', '2026-08-01', true, true)
on conflict (name) do nothing;

insert into public.offices (name, sort_order) values
  ('مكتب طرابلس المركز', 1), ('مكتب تاجوراء', 2), ('مكتب جنزور', 3)
on conflict (name) do nothing;

insert into public.levels (name, sort_order) values
  ('المستوى الأول', 1), ('المستوى الثاني', 2), ('المستوى الثالث', 3)
on conflict (name) do nothing;

insert into public.matns (name, sort_order) values
  ('لامية ابن تيمية', 1), ('المنظومة الحائية', 2), ('نظم مقدمة ابن أبي زيد القيرواني', 3),
  ('الأربعون النووية', 4), ('الأصول الثلاثة', 5), ('المنظومة البيقونية', 6),
  ('تحفة الأطفال', 7), ('نظم الآجرومية', 8), ('عمدة الأحكام', 9)
on conflict (name) do nothing;

-- معيار الصوت: من 10، الافتراضي 5، ويُخصم درجتان عن كل درجة ناقصة
insert into public.criteria (name, description, max_score, default_score, penalty_factor, step, hint, sort_order)
select 'الصوت', 'جودة الأداء الصوتي: مخارج الحروف وحسن الترتيل.', 10, 5, 2, 1, 'من 5 إلى 9 غالباً', 1
where not exists (select 1 from public.criteria);

insert into public.deduction_types (name, value, description, sort_order)
select v.name, v.value, v.description, v.sort_order
from (values
  ('التلعثم', 1.5, 'تعثّر في النطق دون خطأ في المتن.', 1),
  ('التردد', 3, 'توقّف وتردد في استحضار البيت أو السطر.', 2),
  ('اللحن الخفي', 1.5, 'خطأ لا يُخلّ بالمعنى ولا بالإعراب.', 3),
  ('التنبيه', 6, 'احتياج الطالب إلى تنبيه من المحكّم.', 4),
  ('الفتح', 12, 'تلقين الطالب موضع الوقوف لإكمال الحفظ.', 5),
  ('اللحن', 6, 'خطأ جليّ يُخلّ بالإعراب أو المعنى.', 6),
  ('التحلية', 3, 'زيادة تحسينات غير واردة في المتن.', 7),
  ('التقديم أو التأخير', 3, 'اختلال ترتيب الأبيات أو الكلمات.', 8),
  ('النقص أو الزيادة', 3, 'إسقاط كلمة أو زيادتها على المتن.', 9)
) as v(name, value, description, sort_order)
where not exists (select 1 from public.deduction_types);
