# P0 security ACL closure — proposed runbook, NOT EXECUTED

## Scope and provenance

Repository: `csmorato1974/westone-bizflow-hub`.
Base: `work/p0-reconcile-canonical` at `374693aaee30ca269f7d21553ee4b29c5e874801`.
Candidate: `work/p0-security-closure` (record its approved exact SHA before application).
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
   bytes must be unchanged. Capture SHA-256 of the seven files used below.
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
-- Run and assert the metadata/ACL checks below in this same session BEFORE COMMIT.
-- Any failed assertion or timeout: STOP, ROLLBACK, do not continue.
COMMIT;
```

All seven files were inspected for transaction compatibility. They contain
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

After COMMIT, repeat effective ACL and data-invariant SELECT checks through a fresh
session. Separately authorized STAGING UAT must confirm the three existing triggers
still enforce city, email-change and username rules; portal/account transition and
Auth provisioning also require controlled functional tests. Those tests write data
and are not part of this preparation or a read-only preflight. Do not call portal
catalog or order-creation RPCs during a read-only audit: they can write.

## Non-destructive rollback proposal

Before COMMIT: any error aborts the unit; ROLLBACK (or session close) restores the
entire pre-application state. Do not continue after a psql error.

After COMMIT: use a separately approved forward corrective migration, conceptually
07 → 06 → 05 → 04 → 03 → 02 → 01. Restore captured definitions and grants only
after security review. Preserve commercial data and new columns/tables.

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
