-- Bots were filing fake "emergency" reports straight to the database.
-- Signed-out reports now go only through /api/reports, which checks the
-- CAPTCHA and writes with the server key. Signed-in users can still insert
-- directly (their own reporter_id only).
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
