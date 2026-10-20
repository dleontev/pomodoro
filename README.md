# Pomodoro

A Pomodoro timer for focused work and regular breaks, with optional ambient sound and desktop notifications.

[Live demo](https://pomodoro.dleontev.com/)

## Features

- Customizable focus, short-break, and long-break sessions (25/5/15 minutes by default), with start, pause, resume, reset, and visual progress.
- Optional **Auto-switch sessions** selects the next focus or break mode at completion. Every countdown still starts manually.
- Focus completions are counted; every fourth in a cycle offers a long break. Completing a long break resets the cycle while preserving the total.
- Rain, ocean, white noise, pink noise, and brown noise, with separate focus/break selections, volume, and mute.
- Responsive layout, keyboard-accessible controls, visible focus indicators, and screen reader status announcements.

## Architecture and design

**Node.js 24 LTS and Express 5** serve a vanilla HTML/CSS/JavaScript frontend. Express is the only direct dependency; no frontend build, database, accounts, or external asset CDN are needed.

- **Timing:** [The timer engine](public/timer.js) calculates remaining time from an absolute deadline, avoiding drift from delayed interval callbacks. It catches up when a tab resumes. Device clock changes affect timing.
- **Persistence:** [The browser controller](public/app.js) restores per-tab timer state and session counts from `sessionStorage`; preferences use `localStorage`. Invalid timer state is rejected, and storage failures are handled. Tabs run independently.
- **Audio:** [The audio module](public/audio.js) synthesizes Web Audio loops locally, with fades and stops scheduled on the audio clock. Playback does not depend on JavaScript timer ticks or downloaded recordings.

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

**Auto-switch sessions** defaults to off and is saved in this browser. When on, focus completion selects a short break (a long break after four focus completions); either break returns to focus. The selected session waits for **Start**, so returning from sleep cannot launch a chain of sessions or start audio. Toggle changes affect the next completion, without revisiting an already completed session. Manual mode changes and resets cancel the current countdown without adding a completion. Cycle progress and the selected session survive reloads; completing a long break starts a new four-focus cycle.

## Automated validation

| Command | Checks |
| --- | --- |
| `npm run check` | JavaScript syntax for the server, browser modules, and startup check. |
| `npm test` | Node's built-in test runner: custom lengths, input validation and storage failures, opt-in session transitions and cycle counts, pause/reload/duplicate-completion cases, noise generation and asynchronous audio lifecycle, HTTP responses, security headers, and POSIX shutdown. The signal test is skipped on Windows. |
| `npm run smoke` | Runs the actual `npm start` command in production mode on a temporary port, checks `/` and `/health`, then stops the test process tree. |

Audio lifecycle tests use Web Audio test doubles. Automated browser end-to-end tests and accessibility audits are not included.

## CI and Azure deployment

Two GitHub Actions workflows target Node.js 24:

| Workflow | Behavior |
| --- | --- |
| [CI](.github/workflows/ci.yml) | On pushes and pull requests to `main`, or manual dispatch: locked dependency installation, syntax checks, tests, and production startup validation on Ubuntu. Actions are pinned to commit hashes; repository access is read-only. |
| [Azure deployment](.github/workflows/main_testwebapp-aztestprep.yml) | On pushes to `main` or manual dispatch: installs locked dependencies and runs syntax, test, and production startup checks before uploading source and deploying it to the production App Service. |

Deployment uses **OpenID Connect (OIDC)** through `azure/login`, exchanging a GitHub identity token for a temporary Azure access token via federated trust. Identifiers are referenced through GitHub secrets; no client secret or publish profile is used.

**Deployment is gated by validation in its own artifact job.** It does not wait for the separate CI workflow. Installed `node_modules` are excluded from the artifact; runtime dependency installation depends on App Service build configuration, which is managed outside these workflows.

Possible follow-ups: narrow deployment packaging to an explicit source allowlist and add automated browser tests.

## Acknowledgment

OpenAI Codex assisted with implementation and documentation.
