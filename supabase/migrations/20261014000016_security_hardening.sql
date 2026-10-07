-- =====================================================================
-- TaskTeens launch safety — Phase 9: security hardening from the Supabase security advisor.
-- =====================================================================

-- Pin search_path on the remaining functions (prevents search_path hijacking).
alter function public.prevent_mutation() set search_path = public;
alter function public.guard_consent_update() set search_path = public;
alter function public.job_material_snapshot(public.jobs) set search_path = public;
alter function public.is_safety_kind(text) set search_path = public;
alter function public.shift_window_open(public.job_shifts) set search_path = public;
alter function public.guard_evidence_update() set search_path = public;
do $$ begin
  if to_regprocedure('public.force_childcare_prohibited()') is not null then
    execute 'alter function public.force_childcare_prohibited() set search_path = public';
  end if;
end $$;

-- Signed-out visitors don't need these. (is_admin, is_parent_of, is_active_user, employer_listable,
-- employer_trust_indicators and employer_rating_summaries stay callable: public listing pages and
-- row-level policies evaluated for signed-out visitors use them, and they reveal nothing for anon.)
revoke execute on function public.parent_decide_application(uuid, boolean, text) from public, anon;
grant execute on function public.parent_decide_application(uuid, boolean, text) to authenticated;
revoke execute on function public.employer_ready_to_post(uuid) from public, anon;
grant execute on function public.employer_ready_to_post(uuid) to authenticated;
revoke execute on function public.teen_parent_status(uuid) from public, anon;
grant execute on function public.teen_parent_status(uuid) to authenticated;
revoke execute on function public.is_admin_pending_mfa() from public, anon;
grant execute on function public.is_admin_pending_mfa() to authenticated;
revoke execute on function public.my_restriction() from public, anon;
grant execute on function public.my_restriction() to authenticated;
