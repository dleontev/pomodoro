# Pomodoro

A responsive, accessible timer with 25-minute focus sessions, 5-minute short breaks, 15-minute long breaks, pause/resume/reset, a progress ring, and optional desktop notifications. Built with Node.js 24 LTS, Express, and vanilla HTML/CSS/JavaScript. Express is the only direct dependency. No build step, database, external CDN, or credentials.

AI-assisted implementation with OpenAI Codex, dated **2026-10-18**. Application source files contain the same attribution.

## Run locally

Install [Node.js 24 LTS](https://nodejs.org/en/download), then in this project:

```sh
npm ci
npm start
```

Open **http://localhost:3000**. Stop with **Ctrl+C**. `npm run dev` restarts the server when server files change. If no lockfile has been generated yet, use `npm install` once instead of `npm ci`.

If a project-local portable Node runtime was approved during setup, this PowerShell session can use it without changing system settings:

```powershell
$env:Path = "$PWD\.tools\node;$env:Path"
npm.cmd start
```

To use another port in PowerShell:

```powershell
$env:PORT = '8080'
npm start
```

Run `npm run check` for syntax validation and `npm test` for timer and HTTP integration tests. Tests use Node's built-in test runner; there are no development dependencies.

## Use the timer

- Select Focus, Short break, or Long break, then Start. Pause preserves the remaining time; Reset restores the selected duration. Selecting another mode resets the current session.
- Completed focus sessions are counted for this browser tab. After every fourth focus session, the next-session button offers a long break. Sessions never start automatically.
- The countdown uses an absolute finish timestamp rather than counting ticks. Inactive tabs catch up when the browser runs again. State survives reloads in the same tab with session storage; storage failures do not prevent normal use. Each tab runs independently. Changing the device clock affects the deadline.
- Enable **A gentle heads-up** to request browser notification permission. Notifications are off by default and require a supported browser on HTTPS or localhost. The operating system/browser may suppress or delay them while a tab or device is suspended. Completion is shown as soon as the page resumes. Closing the page stops notification delivery; there is no background service or push subscription.
- Controls support keyboard navigation, visible focus outlines, reduced motion, and screen reader announcements for state changes without announcing every second.

## Ambient sounds

Choose **Rain**, **Ocean**, **White noise**, **Pink noise**, or **Brown noise** under **Set the mood**. Focus and breaks have separate selections; both default to Off. Short and long breaks share the break sound. Adjust Volume or Mute at any time. Preferences are saved on this device when browser storage is available.

Sounds start with the timer, fade out on pause/reset/completion, and switch to the selected break or focus sound when you start the next session. After reloading a running timer, select **Enable sound** to allow playback again. Browsers may suspend audio when a device sleeps or a tab is discarded. Playback uses [native Web Audio loops](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/loop), with the stop time scheduled on the audio clock so a throttled timer callback does not extend the sound. All five soundscapes are synthesized locally in the browser; there are no recordings, streaming requests, new dependencies, or audio files to deploy.

## Existing Azure App Service

Target only the existing **`testwebapp-aztestprep`**. No Azure resources or deployment automation are created by this project. Its operating system and current configuration have not been inspected or changed.

Review these settings when deployment is explicitly approved:

| Setting | Value |
| --- | --- |
| Runtime stack | Node.js 24 LTS. Linux: `NODE\|24-lts`. Windows: `WEBSITE_NODE_DEFAULT_VERSION=~24`. |
| Startup command (Linux) | `npm start` (runs `node server.js`). |
| Application setting | `NODE_ENV=production`. |
| Source/ZIP deployment with remote dependency installation | `SCM_DO_BUILD_DURING_DEPLOYMENT=true`. Include `package.json` and `package-lock.json` at the deployment root. |
| Port | Leave platform-provided `PORT` intact. The server uses `process.env.PORT || 3000`, including Windows named pipes. |
| HTTPS | Enable HTTPS Only for browser notifications on the deployed site. |
| Health check path (optional) | `/health`. |

Deploy application source at the root, including `server.js`, `package.json`, `package-lock.json`, and `public/`. Exclude `.tools/`, `.npm-cache/`, local `node_modules/`, test output, and any `.env` files. There is no frontend compilation or build command. On Windows, Git/ZIP deployment with build automation generates IIS `web.config` from the start script/server entry point; other deployment methods require that file to be supplied separately.

These settings follow [Microsoft's Node.js App Service configuration guide](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs). No credentials, publish profiles, or secrets belong in this repository. Deployment and Azure configuration changes require separate explicit approval.

## Files

- `server.js`: Express static server, security headers, `/health`, and shutdown handling.
- `public/`: interface, styles, icon, browser controller, deadline-based timer, and ambient audio synthesis (`audio.js`).
- `test/`: timing and HTTP integration regression checks.
- `package.json` / `package-lock.json`: runtime requirements, scripts, and reproducible dependency versions.
- `.gitignore`: local dependencies, tools, caches, editor state, and secrets excluded from Git.
