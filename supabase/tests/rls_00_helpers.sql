-- =====================================================================
-- Shared helpers for the permission tests (run first).
-- Run against a scratch database that has every migration applied:
--   scripts/test-db.sh   (see supabase/tests/README.md)
-- Each check raises an exception on failure; the script stops at the first failure.
-- =====================================================================
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

create or replace function tests.login(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', false);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'aal', p_aal)::text, false);
  perform set_config('role', case when p_uid is null then 'anon' else 'authenticated' end, false);
end $$;
create or replace function tests.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', false);
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
end $$;
create or replace function tests.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL: %', p_name; end if;
  raise notice 'ok - %', p_name;
end $$;
create or replace function tests.throws(p_sql text, p_name text, p_like text default null) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_like is not null and sqlerrm not ilike '%' || p_like || '%' then
      raise exception 'FAIL: % (wrong error: %)', p_name, sqlerrm;
    end if;
    raise notice 'ok - % (%)', p_name, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % (no error raised)', p_name;
end $$;
create or replace function tests.count(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin execute 'select count(*) from (' || p_sql || ') q' into n; return n; end $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;


-- Server routes call privileged functions with the service role (no user session).
create or replace function tests.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', false);
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
  perform set_config('role', 'service_role', false);
end $$;
grant execute on function tests.as_service() to anon, authenticated, service_role;
