#!/usr/bin/env bash
# Builds a scratch Postgres database from every migration (with minimal Supabase auth/storage stubs)
# and runs the SQL permission tests in supabase/tests. Requires a local Postgres superuser (psql).
#   PGDB=tt_test scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${PGDB:-tt_test}"
PSQL="${PSQL:-psql}"
TMP="$(mktemp -d)"; chmod 755 "$TMP"
$PSQL -q -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
$PSQL -q -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; end if; end \$\$" >/dev/null
cat supabase/tests/stubs.sql supabase/migrations/*.sql > "$TMP/all.sql"
$PSQL -q -v ON_ERROR_STOP=1 -d "$DB" -f "$TMP/all.sql" 2>&1 | grep -v -i 'NOTICE\|wal_level\|HINT' || true
status=0
for t in supabase/tests/*_test.sql supabase/tests/rls_*.sql; do
  [ -f "$t" ] || continue
  echo "== $t"
  if ! $PSQL -q -At -v ON_ERROR_STOP=1 -d "$DB" -f "$t" 2>&1 | sed -n 's/.*NOTICE:  \(ok - .*\)/\1/p; /FAIL\|ERROR/p; /PASSED/p'; then status=1; fi
  $PSQL -q -At -v ON_ERROR_STOP=1 -d "$DB" -c "select 1" >/dev/null
done
rm -rf "$TMP"
exit $status
