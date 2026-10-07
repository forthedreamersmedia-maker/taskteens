-- Run ONCE in the Supabase SQL editor (not a migration: it contains your site URL and secret).
-- Sends queued notification emails every minute by calling the app's dispatcher.
-- 1) Database → Extensions: enable pg_cron and pg_net.
-- 2) Replace YOUR_CRON_SECRET with the same value as the CRON_SECRET env var in Vercel.
select cron.schedule(
  'taskteens-dispatch-notifications',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://www.taskteens.com/api/notifications/dispatch',
       headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
       body := '{}'::jsonb) $$
);
-- To stop:  select cron.unschedule('taskteens-dispatch-notifications');
