# WESTONE — Agent Operating Rules

For any task involving release, deploy, pre-deploy, staging, production promotion, artifacts, or rollback:

1. Read and follow `docs/PRE-DEPLOY-0.md` before proposing operational steps.
2. Treat Raiola `staging.westone.vinculovirtual.com` as the official preproduction/UAT environment.
3. Do not create or propose additional domains, subdomains, deployment layers, or environments without explicit approval.
4. Do not describe `_releases/<SHA>` as a test environment. It is storage/rollback only.
5. Before each operational instruction, identify the current PRE-DEPLOY 0 step and give only the next concrete action and expected evidence.
6. Do not repeat uploads, copies, backups, or validations unless they produce new evidence or mitigate a stated risk.
7. Production `westone.vinculovirtual.com` requires explicit approval after STAGING has received GO.
8. If any instruction conflicts with `docs/PRE-DEPLOY-0.md`, stop and resolve the conflict before acting.
