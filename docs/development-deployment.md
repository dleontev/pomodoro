# Release guide

AI-assisted implementation and documentation with OpenAI Codex, 2026-10-20.

## Source and environment roles

```text
Development branch → PR and CI → main → staging → owner approval → swap → production
```

`main` is the approved source history. Production runs a recorded commit from that history and can lag behind while approval is pending. `/release.json`, the workflow summary, and the retained `deployment-result` artifact identify the application commit; rollback runs also record the workflow commit separately.

The existing Azure slot **`testwebapp-aztestprep/dev`** acts as staging. Its name does not imply a connection to GitHub branch `dev`. The two previous Deployment Center-generated workflows are replaced by [release.yml](../.github/workflows/release.yml); development branches run CI and use PRs for promotion. Do not reconnect Deployment Center to generate competing deployment workflows.

No additional App Service, plan, or slot is needed. Staging and production share `ASP-resgroup1-86bc` in `res-group1`, West US 3, running Linux and Node.js 24 LTS.

## Release behavior

1. A push to `main` starts the release workflow. Manual dispatch is also restricted to `main` by a job guard and environment policies.
2. The prepare job uses `npm ci --ignore-scripts`, syntax checks, tests, and `npm run smoke`. It packages only `server.js`, `package.json`, `package-lock.json`, and `public/`, then generates a commit marker and checksums. Symlinks, unexpected package files, and inconsistent checksums are rejected. The immutable run artifact is retained for **90 days**.
3. The staging job authenticates with its OIDC identity, verifies the existing slot and shared plan, rejects an auto-swap target, and deploys exclusively to `dev`. App Service installs dependencies in staging using its build configuration. `/health` and the served frontend bytes must match the package before promotion becomes available.
4. The **production GitHub environment** pauses promotion for the owner's approval. Inspect the staging app and the prepared commit in the run summary before approving. The workflow holds a concurrency lock throughout the approval wait, so a later workflow run cannot overwrite staging. Out-of-band Azure changes remain possible; staging is checked again after approval.
5. A separate promoter identity swaps `dev` into production. The deployed package is not rebuilt for promotion. Health, the version marker, and all packaged frontend files are checked on both production hostnames. A failed check makes the run fail; the workflow does not automatically swap back.

Staging: https://testwebapp-aztestprep-dev-acase5evh6g9eaa0.westus3-01.azurewebsites.net

Production: https://pomodoro.dleontev.com

Post-deployment verification establishes HTTP health and expected frontend content. It does not replace browser testing of timer transitions, custom durations, audio, notifications, keyboard controls, and reload recovery.

## GitHub controls

- Protect `main`: require a pull request, the GitHub Actions **validate** check, an up-to-date branch, and resolved conversations. Block force pushes and deletion, including administrator bypass of branch protection.
- This is a solo-maintainer repository: PRs remain required, but another person's approval is not required. The owner reviews the diff and explicitly approves the production deployment. This is a release decision, not an independent code review.
- Environments **staging** and **production** accept only branch `main`, with no tag deployment policy. Production requires reviewer `dleontev`; self-review is allowed so the sole maintainer can release. Administrative bypass of the environment gate is disabled.
- Each environment defines non-secret variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID`. Keep access tokens, client secrets, and publish profiles out of source and variables. The workflow needs no long-lived Azure credential.
- The release workflow has read-only repository access. OIDC token permission exists only in staging and promotion jobs; the artifact-preparation job has read access to Actions artifacts for rollback.

GitHub's environment deployment entry associates a rollback run with the current workflow commit. The run summary, `deployment.json`, and the application's version marker record the restored application commit explicitly.

## Azure identity and slot configuration

Use separate identities for staging publication and production promotion. With issuer `https://token.actions.githubusercontent.com` and audience `api://AzureADTokenExchange`, this repository's environment subjects are:

```text
repo:dleontev@9162240/pomodoro@1425202140:environment:staging
repo:dleontev@9162240/pomodoro@1425202140:environment:production
```

The environment subjects do not include a branch; the main-only environment policies provide that restriction. Verify actual claims when establishing trust. Assign the [staging publisher role](../deployment/staging-publisher-role.json) only on the dev slot, plus built-in Reader on the parent app. Assign the [production promoter role](../deployment/production-promoter-role.json) on the parent app. These definitions permit publication or swaps separately and do not grant site configuration writes. Remove superseded Website Contributor assignments after confirming the replacement permissions, and review effective inherited roles before treating the scopes as enforced boundaries. Azure's deployment action reads the dev publishing profile at runtime. Staging's configuration-list and publishing-profile permissions can read dev settings and deployment credentials; the timer requires no application secrets.

On the existing dev slot, retain Node.js **24 LTS**, use `npm start` or the established platform startup discovery, and preserve platform `PORT`. Source-only deployment requires `SCM_DO_BUILD_DURING_DEPLOYMENT=true`; use `NODE_ENV=production`. Preserve HTTPS/TLS and disabled basic publishing authentication. Keep production traffic at 100%, dev at 0%, and automatic swapping disabled.

SCM access is verified separately from ARM metadata access. The staging role includes both `Microsoft.Web/sites/publish/action`, named in Microsoft's [Kudu access guidance](https://learn.microsoft.com/en-us/azure/app-service/resources-kudu#rbac-permissions-required-to-access-kudu), and the slot-specific publishing operation. Keep this role assigned only to `slots/dev`; assigning it on the parent app would also allow production publication. A role assignment or successful Azure sign-in alone does not establish that SCM deployment works: the staging deployment and content verification must pass before production approval is offered.

Main-site access restrictions and SCM network reachability are separate. Any staging allowlist must allow the release runner's verification path; the supplied tester-only CIDR does not cover GitHub-hosted runners. The current workflow does not add temporary firewall exceptions. Network isolation changes need a reviewed runner/network design.

## Rollback

For a quick rollback immediately after promotion, the previous production app remains in `dev`. An approved swap of the same slots can restore it **until the next staging deployment overwrites it**. Verify the intended versions first and recheck health afterward.

For a retained-artifact rollback:

1. Find a previous **successful Release Pomodoro run** with the desired application commit and an unexpired `pomodoro-release` artifact.
2. In **Actions → Release Pomodoro → Run workflow**, select **main** and enter that run's numeric ID in `rollback_run_id`.
3. The workflow validates the source run, package checksums, and commit membership in `main` history, then redeploys the retained source artifact to staging. Its source is reused; App Service performs dependency installation in staging again.
4. Inspect staging and approve the production environment. The normal swap and post-release checks follow.

Expired or deleted artifacts cannot be restored by run ID. Use a reviewed revert PR to build a new release from Git history instead. Never reset shared history or manually copy unreviewed files into production.

Microsoft documents [staging-first deployment](https://learn.microsoft.com/en-us/azure/app-service/deploy-best-practices) and [slot swap behavior](https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots). GitHub documents [environment approvals and concurrency](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments).
