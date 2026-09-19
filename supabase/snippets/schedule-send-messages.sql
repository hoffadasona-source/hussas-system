-- =====================================================================
--  جدولة إرسال الرسائل كل دقيقة (شغّله مرة واحدة من SQL Editor في Supabase)
--  قبل التشغيل:
--   1. انشر الدالة:  npx supabase functions deploy send-messages --no-verify-jwt
--   2. اضبط السر:    npx supabase secrets set CRON_SECRET=<قيمة عشوائية طويلة>
--   3. استبدل القيمتين أدناه برابط مشروعك ونفس قيمة CRON_SECRET
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- تُحفظ القيم في Vault مشفّرة بدل كتابتها داخل المهمة
select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url');
select vault.create_secret('YOUR-CRON-SECRET', 'send_messages_cron_secret');

select cron.schedule(
  'send-messages',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-messages',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'send_messages_cron_secret')
    ),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- للتحقق:  select * from cron.job_run_details order by start_time desc limit 10;
-- للإيقاف: select cron.unschedule('send-messages');
