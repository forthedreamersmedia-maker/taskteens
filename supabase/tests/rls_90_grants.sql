-- Phase 9: regression guard for function grants. Any SECURITY DEFINER function a signed-out visitor
-- can call must be on this short list; anything new fails the test until it is reviewed.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
select tests.logout();
do $$
declare v text[];
begin
  select array_agg(p.proname::text order by p.proname) into v
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not in (
      'is_admin','is_parent_of','is_active_user','employer_listable',      -- used by RLS policies anon evaluates
      'employer_trust_indicators','employer_rating_summaries',             -- public listing pages (booleans/aggregates only)
      'current_user_role',                                                 -- insert policies; returns null for anon
      'parent_invitation_preview'                                          -- invitation landing page (teen first name only)
    );
  if v is not null then raise exception 'FAIL: anon can execute unreviewed SECURITY DEFINER functions: %', v; end if;
  raise notice 'ok - only reviewed SECURITY DEFINER functions are callable signed-out';
end $$;
do $$
declare v text[];
begin
  select array_agg(p.proname::text order by p.proname) into v
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and not exists (
    select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  if v is not null then raise exception 'FAIL: SECURITY DEFINER functions without a pinned search_path: %', v; end if;
  raise notice 'ok - every SECURITY DEFINER function pins search_path';
end $$;
do $$
declare v text[];
begin
  select array_agg(c.relname::text) into v from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v is not null then raise exception 'FAIL: tables without row-level security: %', v; end if;
  raise notice 'ok - every public table has row-level security on';
end $$;
\echo 'GRANT TESTS PASSED'
