# Pomodoro

A Pomodoro timer for focused work and regular breaks, with optional ambient sound and desktop notifications.

[Live demo](https://pomodoro.dleontev.com/)

## Features

- Customizable focus, short-break, and long-break sessions (25/5/15 minutes by default), with start, pause, resume, reset, and visual progress.
- Optional **Auto-switch sessions** selects the next mode; **Auto-start next session** can also start its countdown. Both default to off, with manual controls in every mode.
- Focus completions are counted; every fourth in a cycle offers a long break. Completing a long break resets the cycle while preserving the total.
- Rain, ocean, white noise, pink noise, and brown noise, with separate focus/break selections, volume, and mute.
- Five brief synthesized session alerts, plus Off, with preview before saving and independent notification volume and mute.
- Responsive layout, keyboard-accessible controls, visible focus indicators, and screen reader status announcements.

## Architecture and design

**Node.js 24 LTS and Express 5** serve a vanilla HTML/CSS/JavaScript frontend. Express is the only direct dependency; no frontend build, database, accounts, or external asset CDN are needed.

- **Timing:** [The timer engine](public/timer.js) calculates remaining time from an absolute deadline, avoiding drift from delayed interval callbacks. It catches up when a tab resumes. Device clock changes affect timing.
- **Persistence:** [The browser controller](public/app.js) restores per-tab timer state and session counts from `sessionStorage`; preferences use `localStorage`. Invalid timer state is rejected, and storage failures are handled. Tabs run independently.
- **Audio:** [Ambient audio](public/audio.js) synthesizes loops locally, with fades and stops scheduled on the audio clock. [Session alerts](public/notifications.js) use short oscillator envelopes with their own volume and lifecycle. Neither requires downloaded recordings.

[The server](server.js) serves `public/` and `/health`, applies a Content Security Policy, MIME-sniffing protection, and framing restrictions, accepts the platform-provided `PORT`, and handles shutdown signals.

Audio requires user interaction; notifications require browser support, permission, and HTTPS or localhost. Browsers can suspend audio and delay notifications while a tab or device sleeps. Closing the page stops notification delivery; there is no background push service.

## Run locally

Requires Node.js **24 LTS** and npm.

```sh
git clone https://github.com/dleontev/pomodoro.git
cd pomodoro
npm ci --ignore-scripts
npm start
```

Open **http://localhost:3000**. `npm run dev` enables server watching. No application credentials or environment file are required.

Open **Session lengths** to save whole minutes: focus 1–120, breaks 1–60. Saved lengths apply immediately to a ready timer and to future sessions. A running or paused session keeps its original length and deadline, including after reload; **Reset** adopts the saved length. **Restore defaults** returns preferences to 25/5/15 without interrupting an active session. Preferences stay in this browser; storage failures fall back to settings for the current visit.

**Session automation:** Auto-switch selects a short break after focus (a long break after four completions); either break returns to focus. With Auto-start off, the selected session waits for **Start**. With both on, its full countdown starts at completion detection. Turning Auto-switch off also turns Auto-start off. Changes affect future completions without restarting the current timer. Manual mode selection and Reset always leave a ready timer; Pause freezes the current countdown. A Pause received exactly at expiry records completion without switching or starting another timer. Completing a long break resets cycle progress while preserving the total.

The current session and cycle survive reloads. If completion is detected more than five seconds late, or an expired session is restored on reload, the app records it once, selects the next mode when enabled, and waits for **Start** without replaying sound or desktop alerts. It never catches up through unseen cycles. A running timer that has not expired continues after reload; a paused timer stays paused.

**Session notification sound:** Choose Soft Chime, Bell, Digital Tone, Wooden Chime, Ascending Melody, or Off (the default). **Preview sound** auditions a choice without changing the saved alert or timer; **Use sound** saves it. The same alert applies to focus and break completions, with volume and mute independent of ambient audio and desktop notifications. Start/Resume or Preview enables browser audio; a restricted or suspended audio context drops alerts instead of queuing them. Visual completion feedback remains available.

## Automated validation

| Command | Checks |
| --- | --- |
| `npm run check` | JavaScript syntax for the server, browser modules, and startup check. |
| `npm test` | Node's built-in test runner: manual/assisted/automatic sessions, custom lengths, cycle counts, preference storage, pause/reload/suspension recovery, duplicate-alert prevention, sound synthesis and asynchronous audio lifecycle, HTTP responses, security headers, and POSIX shutdown. The signal test is skipped on Windows. |
| `npm run smoke` | Runs the actual `npm start` command in production mode on a temporary port, checks `/` and `/health`, then stops the test process tree. |

Controller tests exercise the real application module with DOM, storage, notification, and Web Audio test doubles. Audio tests verify scheduling and lifecycle rather than perceived sound quality. Automated browser end-to-end tests and accessibility audits are not included.

## CI and Azure deployment

GitHub Actions workflows target Node.js 24:

| Workflow | Behavior |
| --- | --- |
| [CI](.github/workflows/ci.yml) | On pushes and pull requests to `main` or `dev`, or manual dispatch: locked dependency installation, syntax checks, tests, and production startup validation on Ubuntu. Actions are pinned to commit hashes; repository access is read-only. |
| [Azure deployment](.github/workflows/main_testwebapp-aztestprep.yml) | On pushes to `main` or manual dispatch: installs locked dependencies and runs syntax, test, and production startup checks before uploading source and deploying it to the production App Service. |

Deployment uses **OpenID Connect (OIDC)** through `azure/login`, exchanging a GitHub identity token for a temporary Azure access token via federated trust. Identifiers are referenced through GitHub secrets; no client secret or publish profile is used.

**Deployment is gated by validation in its own artifact job.** It does not wait for the separate CI workflow. Installed `node_modules` are excluded from the artifact; runtime dependency installation depends on App Service build configuration, which is managed outside these workflows.

Possible follow-ups: narrow production deployment packaging to an explicit source allowlist and add automated browser tests.

The `dev` branch runs CI only; its Azure deployment connection will be configured separately by the repository owner. See [development deployment setup](docs/development-deployment.md) for the existing slot, connection requirements, and promotion/rollback process. The production workflow is unchanged; its manual dispatch currently has no explicit branch guard.

## Acknowledgment

OpenAI Codex assisted with implementation and documentation.
