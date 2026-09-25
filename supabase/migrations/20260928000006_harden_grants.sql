-- =====================================================================
-- TaskTeens — tighten function privileges (Supabase security advisor)
-- =====================================================================
-- clear_application_completion calls is_privileged(), which is revoked below.
alter function public.clear_application_completion() security definer;
alter function public.clear_application_completion() set search_path = public;

-- Trigger functions are never called directly; triggers don't need EXECUTE at fire time.
revoke execute on function public.after_application_insert() from public, anon, authenticated;
revoke execute on function public.after_interview_change() from public, anon, authenticated;
revoke execute on function public.after_report_insert() from public, anon, authenticated;
revoke execute on function public.audit_reference_change() from public, anon, authenticated;
revoke execute on function public.before_application_insert() from public, anon, authenticated;
revoke execute on function public.before_interview_insert() from public, anon, authenticated;
revoke execute on function public.guard_application_update() from public, anon, authenticated;
revoke execute on function public.guard_employer_update() from public, anon, authenticated;
revoke execute on function public.guard_interview_update() from public, anon, authenticated;
revoke execute on function public.guard_job_write() from public, anon, authenticated;
revoke execute on function public.guard_user_update() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.notify_application_status_change() from public, anon, authenticated;
revoke execute on function public.on_verification_request() from public, anon, authenticated;
revoke execute on function public.recheck_job_type_change() from public, anon, authenticated;
revoke execute on function public.clear_application_completion() from public, anon, authenticated;

-- Admin RPCs: signed-in only (each also checks is_admin()).
revoke execute on function public.admin_add_note(text, text, text) from public, anon;
revoke execute on function public.admin_moderate_job(uuid, text, text) from public, anon;
revoke execute on function public.admin_review_verification(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_set_user_status(uuid, text, text) from public, anon;
revoke execute on function public.admin_stats() from public, anon;
revoke execute on function public.admin_update_report(uuid, text, text) from public, anon;

-- Only used inside SECURITY DEFINER functions.
revoke execute on function public.is_privileged() from public, anon, authenticated;
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon, authenticated;

alter function public.skills_to_text(text[]) set search_path = public;
alter function public.touch_updated_at() set search_path = public;
