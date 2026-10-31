# Docker and cross-browser runs

This guide is for QAs new to the repo. It covers what Docker is, why a Playwright suite uses it, how to run the
suite in Docker, and how the Safari (WebKit) and Edge runs work.

## What Docker is

Docker packages a program together with the operating-system pieces it needs into an **image**. Running an
image starts a **container**: a small, isolated Linux machine that looks exactly the same on every computer.
When the run ends, the container is thrown away.

## Why a Playwright suite uses it

A browser is not just one program. It needs dozens of operating-system libraries and fonts, and each Playwright
version expects one exact browser build. Without Docker, every laptop and every CI runner puts that together on
its own, and they drift apart:

- One machine renders a font differently, so a layout or screenshot changes.
- CI runs Linux in UTC while laptops run Windows in IST, so date-based test data lands on different days.
- The CI machine's operating system changes under you. On 2026-10-30, GitHub moved `ubuntu-latest` to
  Ubuntu 26.04, Playwright 1.58.2 has no Chromium for it, and every CI run failed before a single test ran.

Microsoft publishes an official image for each Playwright version (`mcr.microsoft.com/playwright`) with the
browsers and every library they need already inside. Running the suite in that image gives every machine,
including CI, the same browser, libraries, fonts and timezone. A failure in Docker on your laptop is the same
failure CI sees.

## What runs in Docker here, and what does not

Only the **test runner** runs in the container. The app is not in Docker: tests run against dev staging
(`app.ptdev.xyz`), exactly as they do without Docker.

The repo used to have a `docker/` folder (removed on 2026-08-25, commit `513d432`). It ran the whole app and a
SQL Server database on one machine, so the suite could test a local copy of the app. Once dev staging became the
only target, that setup had no job, and it was removed. The setup described here is different: it does not run
the app, and it needs no database.

## Running the suite in Docker

You need **Docker Desktop** (Windows/macOS) running, and `npm ci` done once (the image version is read from the
installed `@playwright/test`).

> On Windows, Docker Desktop stores its data on C: by default. Move it to D: in
> Settings → Resources → Advanced → Disk image location before pulling images; the Playwright image is about 2 GB.
> Check with your manager whether the company needs a paid Docker Desktop licence; Rancher Desktop is a free
> alternative that works the same way.

| Command | What it does |
|---|---|
| `npm run docker:pull` | Downloads the image ahead of time (optional; the first run does it anyway). |
| `npm run docker:test` | The journey suite, as `npm test` does natively. |
| `npm run docker:test -- --grep=@Smoke` | Any Playwright arguments go after `--`. |
| `npm run docker:test:webpet` | The migrated web-pet suite. |
| `npm run docker:test:cross-browser` | The cross-browser tests on WebKit and Edge (see below). |

Results land where they always do: `artifacts/html` (open with `npm run test:report`), `artifacts/results`,
`artifacts/logs`. The repo folder is shared with the container, so nothing needs copying out.

The first run on a machine installs the container's own `node_modules` (kept in a Docker volume named
`pts-node-modules`, separate from your Windows ones). Later runs reuse it, and it reinstalls only when
`package-lock.json` changes.

### When to stay outside Docker

Headed runs, `--ui` and `--debug` need a screen, which a container does not have. Use the native scripts for
those: `npm run test:headed`, `npm run test:ui`, `npm run test:debug`. The Docker script refuses those flags with
a message saying so.

Do not run a native run and a Docker run at the same time. They share dev staging's data and cannot see each
other's locks.

### In CI

`.github/workflows/e2e.yml` pulls the image in the **Pull the Playwright image** step and runs both suites
through `scripts/run-in-docker.js`. The runner itself installs no browser, so a change to GitHub's runner
operating system can no longer break the run. The pull adds about 30–60 seconds per job.

## Cross-browser: Safari (WebKit) and Edge

The suite runs on Chromium. Two extra Playwright projects can run selected tests on other browsers:

| Project | Browser | Notes |
|---|---|---|
| `webkit` | WebKit, the engine Safari is built on | Not Safari itself. Real Safari only runs on macOS (a macOS CI runner or a cloud service such as BrowserStack), which this repo does not use. |
| `msedge` | Microsoft Edge | The real Edge browser. Installed on Windows already; the Docker run installs it in the container (about 40 seconds). |

Both projects are **off** unless asked for, and they run **only tests tagged `@CrossBrowser`**. A normal
`npm test` and the nightly CI run stay Chromium-only.

Today one test carries the tag, as a placeholder: the login happy path in
`tests/web/system/login-module.spec.ts`.

- Run them: `npm run test:cross-browser` (native) or `npm run docker:test:cross-browser`.
- In CI: run the E2E workflow by hand and set **browsers** to `cross-browser`.
- Add a test: put `'@CrossBrowser'` in its `tag` list. Nothing else changes; `npm run runner:check` accepts the
  tag. Check the test first for anything Chromium-specific, such as `src/fixtures/base.fixture.ts`, which
  launches a Chromium helper browser.

## Troubleshooting

| Message | Fix |
|---|---|
| `Docker is not running` | Start Docker Desktop and wait until it says it is running. |
| `node_modules is missing` | Run `npm ci` once on your machine. |
| `--headed needs a screen` | Use the native script (see above). |
| The run seems stuck on the first start | It is downloading the 2 GB image; `npm run docker:pull` shows progress. |
| `Executable doesn't exist` for webkit or msedge (native run) | `npx playwright install webkit` or `npx playwright install msedge`. |
