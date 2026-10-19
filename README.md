# Pomodoro

Node.js **24 LTS**, Express, and vanilla HTML/CSS/JavaScript. Features 25/5/15-minute timers, pause/resume/reset, progress, optional notifications, and five locally synthesized ambient sounds with separate focus/break choices. No database, authentication, build step, CDN, or secrets. AI-assisted implementation with OpenAI Codex, **2026-10-18**.

## Local setup

Install [Node.js 24 LTS](https://nodejs.org/en/download), then run from the project root:

```sh
npm ci --ignore-scripts
npm start
```

Open **http://localhost:3000**; stop with **Ctrl+C**. `npm run dev` enables server watching. On this Windows checkout, the optional ignored portable runtime can be used in the current PowerShell session:

```powershell
$env:Path = "$PWD\.tools\node;$env:Path"
npm.cmd start
```

`PORT` defaults to 3000; in PowerShell, set another port with `$env:PORT = '8080'` before starting. Timer state survives reloads within a tab. Notifications need permission and HTTPS or localhost. Sound starts only with user interaction; after reloading a running timer, choose **Enable sound**. Browsers may suspend callbacks, audio, and notifications during device sleep; the countdown catches up on return.

## Validation and GitHub Actions

```sh
npm run check
npm test
npm run smoke
```

The smoke check runs the actual `npm start` command with `NODE_ENV=production` and an OS-assigned port, checks `/` and `/health`, and stops only the test process tree. No running development server needs to be stopped.

`.github/workflows/ci.yml` performs a locked install and these checks on pushes and pull requests to `main`, or manually. It uses Node 24 from `.node-version` and needs no custom credentials. It validates only: it does not publish artifacts or deploy. A separate Deployment Center workflow does not automatically wait for this CI job.

## Git repository

This directory is a standalone repository. Existing remote: **https://github.com/dleontev/pomodoro.git**; branch: **main**, tracking **origin/main**. Keep `package-lock.json` committed. `.gitignore` excludes dependencies, portable tools, caches, generated output, environment files, cloud credentials, and private keys. `.gitattributes` normalizes text to LF. Review changes with `git status` and `git diff` before committing; staging, commits, and pushes remain manual until approved.

## Existing Azure App Service

Target only **`testwebapp-aztestprep`**. Azure resources and configuration have not been inspected or changed during this preparation. The existing `.deployment` file is retained as a remote-build hint; it contains no credentials.

After approval:

1. Commit and push the reviewed local changes to the existing GitHub repository.
2. Open this existing app's **Deployment Center**, select **GitHub**, repository **dleontev/pomodoro**, branch **main**, and the **GitHub Actions** build provider. Review the proposed workflow before saving. Deployment Center generates and commits the deployment workflow; saving can also start a deployment. No competing deployment workflow is included here.
3. Configure authentication only with approval. Prefer an existing approved identity with OpenID Connect when available. Do not create new Azure resources or commit credentials/publish profiles.
4. Review the settings below and the generated workflow. Its Node version must be `24.x`; no frontend build command is required. Include `npm run check`, `npm test`, and `npm run smoke` in its build job before deployment if deployments must wait for validation.

| Setting | Required value |
| --- | --- |
| Runtime | Node.js 24 LTS; Linux: `NODE\|24-lts`; Windows: `WEBSITE_NODE_DEFAULT_VERSION=~24` |
| Linux startup command | `npm start` → `node server.js` |
| App environment | `NODE_ENV=production`; retain platform-provided `PORT` |
| Source/ZIP remote build | Verify `SCM_DO_BUILD_DURING_DEPLOYMENT=true` so Azure installs dependencies |
| HTTPS | HTTPS Only, for notifications on the deployed site |
| Optional health check | `/health` |

For source deployment with remote build, the package root must contain `server.js`, `package.json`, `package-lock.json`, `.deployment`, and `public/`. Exclude `.git/`, local tooling/caches, environment files, and credentials from deployment packages; `.gitignore` alone does not filter arbitrary ZIP uploads. Windows Git/ZIP deployment with build automation generates IIS `web.config`; other Windows deployment methods require supplying it separately.

References: [Deployment Center and GitHub Actions](https://learn.microsoft.com/en-us/azure/app-service/deploy-github-actions), [Node.js App Service settings](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs).
