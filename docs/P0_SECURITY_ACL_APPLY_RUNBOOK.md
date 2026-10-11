# P0 security ACL closure — proposed runbook, NOT EXECUTED

## Scope and provenance

Repository: `csmorato1974/westone-bizflow-hub`.
Base: `work/p0-reconcile-canonical` at `374693aaee30ca269f7d21553ee4b29c5e874801`.
Candidate: `work/p0-zonas-geo-acl-closure` (record its approved exact SHA before application).
Parent: `work/p0-security-closure` at `cbe08c21c91594ca8e04eb8b8aabdc826d667d89`.
Target for a separately authorized future application: Supabase STAGING `wlxpmcorodrncfmdcnlc`.
This document grants no authorization to apply SQL, merge, deploy or modify production.
No remote SQL was executed while preparing this change.

## Prior evidence and limits

The read-only final preflight on 2026-10-09 found all three helpers below as
`SECURITY INVOKER`, returning `trigger`, with no arguments and null function ACLs.
`PUBLIC`, `anon` and `authenticated` had effective EXECUTE. PUBLIC's grant also
permits service_role execution; a separate direct service_role grant was not present.
No direct frontend, Edge Function or other SQL-function calls were found in the
candidate source. These trigger references were found:

| Function | Trigger | Relation / event |
|---|---|---|
| clientes_bi_ciudad_requerida() | clientes_bi_ciudad_requerida | clientes / BEFORE INSERT |
| ecr_bloquear_cambios_sensibles() | trg_ecr_bloquear_cambios_sensibles | email_change_requests / BEFORE UPDATE |
| validar_username() | trg_validar_username | profiles / BEFORE INSERT OR UPDATE OF username |

The preflight found effective TRUNCATE for anon and authenticated on all nine
tables named in migration 07. No table ACL contained a PUBLIC grant. Other ACLs
included authenticated commercial CRUD and service_role privileges; 07 does not
change those privileges except authenticated TRUNCATE.

Actual function/table owners were NOT captured by that preflight and are NOT
reverified here. ACL grantor `postgres` is not proof of object ownership. Owners,
role inheritance and current effective grants remain required pre-application
checks. GitHub CREATE statements do not encode an explicit owner.

## Preconditions — STOP until all are evidenced

1. Obtain separate authorization for the exact candidate SHA and STAGING target.
2. Recheck protected branch SHAs and the candidate diff; all historical migration
   bytes must be unchanged. Capture SHA-256 of the eight files used below.
3. Verify the live backend identity, current migration/schema state and secure
   connection. Use an existing approved secret mechanism; never put credentials
   in this document, shell arguments, logs or repository.
4. Capture current definitions, owners, trigger definitions, policies and ACLs of
   every affected object, plus a recoverable STAGING backup. Capture the current
   absence/presence and contents of zonas_geo, zona and WhatsApp columns.
5. Recheck the previous zero data-conflict counts. Verify all three helpers and
   nine tables exist with expected signatures. No missing-object skipping.
6. Query pg_proc/pg_class owners, aclexplode (including defaults for null ACLs),
   pg_auth_members and effective has_function_privilege / has_table_privilege.
   Check PUBLIC separately as ACL grantee 0. STOP if role membership or ownership
   preserves any unwanted EXECUTE/TRUNCATE after the proposed revocations.
7. Confirm the execution role owns the affected objects or has the necessary
   owner/DDL/GRANT authority, including auth.users trigger management. Do not
   assume the API service_role has these rights.
8. Confirm no direct helper-call dependency was added since this source audit.
9. Reconcile the remote migration ledger's remapped historical versions in an
   approved application manifest. Do not replay historical migrations or repair
   the ledger automatically. Stop any concurrent migrator during application.

## Exact proposed application unit

Use an approved direct PostgreSQL connection in a single psql session. The script
below is a proposal only. Run from repository root at the approved candidate SHA;
`\ir` resolves paths relative to the containing script. If saving this wrapper,
save it at repository root outside version control; do not copy it into migrations.
No `supabase db push`, glob or automatic pending-history runner.

```sql
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
\ir supabase/migrations/20260924163500_clientes_whatsapp_confirmacion.sql
\ir supabase/migrations/20260925145000_catalogo_rls_personal_y_cliente.sql
\ir supabase/migrations/20260925150000_dashboard_mapa_geo_zonas.sql
\ir supabase/migrations/20261008131000_catalog_rls_helper_grants.sql
\ir supabase/migrations/20261008144931_portal_account_hardening.sql
\ir supabase/migrations/20261008144958_auth_user_trigger_integrity.sql
\ir supabase/migrations/20261009123807_p0_security_acl_cleanup.sql
-- Capture zonas_geo metadata/data fingerprint here, BEFORE 08 (see below).
\ir supabase/migrations/20261011030447_p0_zonas_geo_acl_cleanup.sql
-- Run and assert the metadata/ACL checks below in this same session BEFORE COMMIT.
-- Any failed assertion or timeout: STOP, ROLLBACK, do not continue.
COMMIT;
```

All eight files were inspected for transaction compatibility. They contain
ordinary ALTER/CREATE TABLE, CREATE INDEX (not CONCURRENTLY), DML, functions,
triggers, policies, comments and ACL statements. No transaction-control statements,
VACUUM, CREATE DATABASE, ALTER SYSTEM or concurrent index creation were found.
They admit one explicit PostgreSQL transaction by static inspection; this was not
tested against a database. 02 and 04 are in the same transaction, with 03 between
them to retain chronological order. Other sessions cannot observe the provisional
function grants before COMMIT. Keep this operation short; rollback on lock timeout.

Before COMMIT, the operator must execute SELECT-based checks and enforce their
results, not merely print them. The above wrapper is not an unattended executable
gate and must not be run without those checks and the separate authorization.

Record the committed application externally with candidate SHA, exact file hashes,
target ref, executor, UTC time and all results. Do not invent records in
supabase_migrations.schema_migrations or claim the CLI ledger was synchronized.
A later approved ledger reconciliation is required before resuming automatic CLI
migrations.

## Immediate checks — all mandatory

| Step | Expected result / PASS | STOP |
|---|---|---|
| 01 | WhatsApp column types/FK; invalidation trigger; guarded GPS/onboarding/WhatsApp attribution | Definition, column or trigger mismatch |
| 02 | Eight generic view_auth policies absent; 15 Personal/Cliente SELECT policies; admin policies retained; RLS on eight tables | Remaining broad policy or incorrect dependency |
| 03 | zona text; zonas_geo schema, generated columns, checks and unique index; seven city seeds; dashboard exact signature, INVOKER and mapa_geo | Schema/seed conflict or unexpected ACL; do not assume admin writes from an ALL policy alone |
| 04 | Four RLS helpers: EXECUTE for authenticated, not PUBLIC/anon/service_role | Effective permission differs |
| 05 | Active/no-account guards; single NULL-to-non-NULL revocation trigger; portal's three anon RPCs; admin RPCs for authenticated only | Guard/ACL/trigger mismatch |
| 06 | One enabled AFTER INSERT auth.users trigger targeting public.handle_new_user(); empty search_path; profile and cliente-role baseline | Wrong/duplicate trigger or helper RPC grant |
| 07 | Three helpers have no effective direct EXECUTE for PUBLIC/anon/authenticated/service_role; nine tables no effective TRUNCATE for PUBLIC/anon/authenticated; all other ACL entries unchanged | Inheritance, owner privilege or unexpected change survives |
| 08 | zonas_geo: PUBLIC/anon/service_role no privileges; authenticated SELECT only; no grant options; RLS, policies, schema and data unchanged from immediately before 08 | Missing table, effective extra permission, inherited/column grant, or fingerprint mismatch |

After COMMIT, repeat effective ACL and data-invariant SELECT checks through a fresh
session. Separately authorized STAGING UAT must confirm the three existing triggers
still enforce city, email-change and username rules; portal/account transition and
Auth provisioning also require controlled functional tests. Those tests write data
and are not part of this preparation or a read-only preflight. Do not call portal
catalog or order-creation RPCs during a read-only audit: they can write.


## 08 — zonas_geo dependency evidence and exact ACL decision

Source audit at the protected parent SHA found only generated frontend types and
migration 03 references: table definition, seeds, grants, policies and two reads
from SECURITY INVOKER dashboard_comercial. No frontend, Edge Function, operational
script or internal-admin path demonstrated direct INSERT/UPDATE/DELETE by
authenticated or service_role. A policy named zonas_geo_admin_all is not evidence
of a required write path. Keep both existing policies unchanged; SELECT-only table
privileges do not permit authenticated CRUD even for an admin.

Read-only STAGING inspection on 2026-10-11 confirmed zonas_geo is absent, no current
public/private SQL function references it, and postgres/public table defaults grant
Dxtm (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) to anon, authenticated and service_role.
Migration 03 additionally grants service_role ALL. That broad grant alone is not a
proven dependency. Migration 08 resets only this table's ACL, including service_role:

| Principal | Approved direct/effective table privileges after 08 |
|---|---|
| PUBLIC | None |
| anon | None |
| authenticated | SELECT only, no grant option |
| service_role | None; no demonstrated dependency, including privileged DDL |
| Owner postgres | Ownership retained; unchanged |

No global default privileges, other tables, RLS, policies, functions or data are
changed by 08. Require the expected owner postgres and recheck memberships/column
grants before application. Any newly demonstrated write/service dependency is STOP
and requires a separately reviewed decision, not an automatic grant.

### Pre-COMMIT checks for 08 (proposed only; not executed)

Capture a baseline in the same psql session after 07 and immediately BEFORE 08,
then repeat the identical SELECT immediately AFTER 08. Use `\gset zgb_` for the
baseline and `\gset zga_` for the repeat. This compares the state produced by 03;
it does not incorrectly require the entire 01→08 chain to leave the new table absent.
Do not include relacl in the metadata fingerprint: that is the intended change.
No CREATE TEMP TABLE or other SQL writes are required by these checks.

```sql
SELECT jsonb_build_object(
  'owner', pg_get_userbyid(c.relowner),
  'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity,
  'columns', (SELECT jsonb_agg(jsonb_build_object(
    'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
    'not_null',a.attnotnull,'generated',a.attgenerated,'identity',a.attidentity,
    'expression',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
    FROM pg_attribute a LEFT JOIN pg_attrdef d
      ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
  'constraints', (SELECT jsonb_agg(jsonb_build_object(
    'name',co.conname,'valid',co.convalidated,'definition',pg_get_constraintdef(co.oid))
    ORDER BY co.conname) FROM pg_constraint co WHERE co.conrelid=c.oid),
  'indexes', (SELECT jsonb_agg(jsonb_build_object(
    'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,
    'ready',i.indisready) ORDER BY i.indexrelid)
    FROM pg_index i WHERE i.indrelid=c.oid),
  'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname)
    FROM pg_policies p WHERE p.schemaname='public' AND p.tablename='zonas_geo'),
  'triggers', (SELECT jsonb_agg(jsonb_build_object(
    'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid))
    ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)
)::text AS metadata,
(SELECT count(*) FROM public.zonas_geo) AS row_count,
(SELECT md5(COALESCE(string_agg(md5(to_jsonb(z)::text),'' ORDER BY z.id),''))
 FROM public.zonas_geo z) AS data_fingerprint
FROM pg_class c WHERE c.oid='public.zonas_geo'::regclass;
\gset zgb_
```

After 08 repeat the same SELECT with `\gset zga_` instead of `\gset zgb_`, then:

```sql
SELECT :'zgb_metadata'=:'zga_metadata'
   AND :'zgb_row_count'=:'zga_row_count'
   AND :'zgb_data_fingerprint'=:'zga_data_fingerprint' AS unchanged;
\gset zg_
\if :zg_unchanged
\else
  ROLLBACK;
  \quit 1
\endif
```

This fingerprint is an intra-transaction change check, not a replacement for backup
or a cryptographic release artifact digest. Stop concurrent migrations and writes
as specified in the preconditions.

Inspect the full effective privilege matrix; every `pass` must be true. PUBLIC is
ACL grantee 0, not a role argument to has_table_privilege. The other principals are
checked with has_table_privilege, including inheritance and owner rights.

```sql
WITH privileges(privilege) AS (
  VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
         ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')
), principals(principal) AS (
  VALUES ('PUBLIC'),('anon'),('authenticated'),('service_role')
), matrix AS (
  SELECT r.principal,p.privilege,
    CASE WHEN r.principal='PUBLIC' THEN EXISTS (
      SELECT 1 FROM pg_class c,
        LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
      WHERE c.oid='public.zonas_geo'::regclass
        AND a.grantee=0 AND a.privilege_type=p.privilege)
    ELSE has_table_privilege(r.principal,'public.zonas_geo',p.privilege) END AS actual,
    CASE WHEN r.principal='PUBLIC' THEN EXISTS (
      SELECT 1 FROM pg_class c,
        LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
      WHERE c.oid='public.zonas_geo'::regclass AND a.grantee=0
        AND a.privilege_type=p.privilege AND a.is_grantable)
    ELSE has_table_privilege(r.principal,'public.zonas_geo',
                            p.privilege||' WITH GRANT OPTION') END AS grant_option,
    r.principal='authenticated' AND p.privilege='SELECT' AS expected
  FROM principals r CROSS JOIN privileges p
)
SELECT *,actual=expected AND NOT grant_option AS pass
FROM matrix ORDER BY principal,privilege;
```

Check column-level privileges as well; expected `pass=true`. Table grants can be
supplemented by independent column grants, so relacl alone is insufficient.

```sql
WITH principals(principal) AS (
  VALUES ('anon'),('authenticated'),('service_role')
), privileges(privilege) AS (
  VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')
)
SELECT bool_and(
  has_column_privilege(r.principal,a.attrelid,a.attnum,p.privilege)
    = (r.principal='authenticated' AND p.privilege='SELECT')
  AND NOT has_column_privilege(r.principal,a.attrelid,a.attnum,
                              p.privilege||' WITH GRANT OPTION')
) AND NOT EXISTS (
  SELECT 1 FROM pg_attribute a,
    LATERAL aclexplode(a.attacl) acl
  WHERE a.attrelid='public.zonas_geo'::regclass
    AND a.attnum>0 AND NOT a.attisdropped AND acl.grantee=0
) AS pass
FROM pg_attribute a CROSS JOIN principals r CROSS JOIN privileges p
WHERE a.attrelid='public.zonas_geo'::regclass
  AND a.attnum>0 AND NOT a.attisdropped;

SELECT relrowsecurity AND pg_get_userbyid(relowner)='postgres' AS pass
FROM pg_class WHERE oid='public.zonas_geo'::regclass;

SELECT policyname,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public' AND tablename='zonas_geo'
ORDER BY policyname;
```

PASS: all effective privilege/column checks true, RLS enabled, owner postgres,
exactly the unchanged zonas_geo_personal_select and zonas_geo_admin_all policies,
and metadata/data fingerprints equal. STOP: missing object/result, NULL/false,
extra inherited access or any schema/policy/data difference. The operator MUST
assert all results before COMMIT; printing a matrix is not an unattended gate.
On any failure execute ROLLBACK and stop. Repeat read-only checks in a fresh session
after a separately authorized successful application; do not call write RPCs.

## Residual security debt — outside this branch's mutation scope

These debts are OPEN and must be audited/resolved before production. Source closure
of zonas_geo is not a claim of Deuda 0, backend remediation or production readiness.

| ID / title | Origin → destination | Source / state / severity / detected | Risk and next action | Closure evidence |
|---|---|---|---|---|
| SECURITY DEBT — GLOBAL DEFAULT PRIVILEGES REVIEW | STAGING pg_default_acl → canonical security policy | work/p0-security-closure @ cbe08c21c91594ca8e04eb8b8aabdc826d667d89; abierta; alta; 2026-10-09, rechecked 2026-10-11 | postgres/public defaults grant Dxtm to application roles on new tables; separately audit defaults and their impact before production | None; no ALTER DEFAULT PRIVILEGES in this task |
| SECURITY DEBT — GLOBAL TABLE ACL REVIEW | STAGING table ACL → canonical cleanup | same parent SHA; abierta; alta; 2026-10-09 | 18 additional existing tables retain anon/authenticated TRUNCATE, including profiles, user_roles, pedidos and pedido_items; separately inventory dependencies and approve a scoped remediation before production | None; these tables are not changed here |

The 18-table count is prior preflight evidence, not a fresh full-table audit in this
narrow task. Both debts remain open; do not infer global safety from migration 08.

## Non-destructive rollback proposal

Before COMMIT: any error aborts the unit; ROLLBACK (or session close) restores the
entire pre-application state. Do not continue after a psql error.

After COMMIT: use a separately approved forward corrective migration, conceptually
08 → 07 → 06 → 05 → 04 → 03 → 02 → 01. Restore captured definitions and grants only
after security review. Preserve commercial data and new columns/tables.

- 08: retain the closed zonas_geo ACL. Restore only a separately reviewed proven dependency; never automatically restore inherited TRUNCATE/REFERENCES/TRIGGER/MAINTAIN or service_role ALL.
- 07: no automatic reverse GRANT. Restore only a proven required privilege; do not
  reopen trigger-helper RPC execution or TRUNCATE for public application roles.
- 06: restore reviewed Auth function/trigger baseline; keep direct RPC access closed.
- 05: restore reviewed portal definitions if necessary; do not reactivate tokens or
  remove account guards as an automatic rollback. Retain a closed portal if required.
- 04: preserve minimum privilege when restoring any helper grants.
- 03: restore previous dashboard/configuration; keep zonas_geo, zona and all new
  data. No DROP TABLE, DROP COLUMN or deletion of geography records.
- 02: restore reviewed policies/functions without blindly reopening generic access.
- 01: restore prior guard/trigger definitions; keep WhatsApp confirmation columns/data.

Status: SOURCE PREPARED ONLY. Prior database findings remain open until a fresh
authorized preflight, application and post-application evidence exist.
