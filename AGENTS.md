# WESTONE — Agent Operating Rules

For any task involving functional changes, release, deploy, pre-deploy, staging, production promotion, artifacts, or rollback:

1. Read and follow `docs/PRE-DEPLOY-0.md` before proposing operational steps.
2. For every functional change, require an explicit PASS in Lovable STAGING before opening, completing, or recommending merge of a PR.
3. If a defect is found in Raiola STAGING, route the fix back through Lovable STAGING before GitHub merge/release steps.
4. Treat Raiola `staging.westone.vinculovirtual.com` as the official preproduction/UAT environment.
5. Do not create or propose additional domains, subdomains, deployment layers, or environments without explicit approval.
6. Do not describe `_releases/<SHA>` as a test environment. It is storage/rollback only.
7. Before each operational instruction, identify the current PRE-DEPLOY 0 step and give only the next concrete action and expected evidence.
8. Do not repeat uploads, copies, backups, or validations unless they produce new evidence or mitigate a stated risk.
9. Production `westone.vinculovirtual.com` requires explicit approval after STAGING has received GO.
10. If any instruction conflicts with `docs/PRE-DEPLOY-0.md`, stop and resolve the conflict before acting.
