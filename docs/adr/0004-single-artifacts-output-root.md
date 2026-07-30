# 0004 — All run output lives under a single `artifacts/` root

- **Status:** accepted
- **Date:** 2026-07-31

## Context

Run output used to land in five sibling directories at the repo root:
`test-results/`, `playwright-report/`, `allure-results/`, `allure-report/`, and
`logs/`. Those are the tools' default names, so each was individually
recognizable — but the repo root read as half source, half output, `.gitignore`
needed five entries, CI needed a path per artifact, and "where did the report go"
had five answers.

## Decision

One output root:

```
artifacts/
├── results/            Playwright outputDir + results.json
├── html/               Playwright HTML report
├── allure/results/     raw Allure results (wiped per run)
├── allure/report/      generated report; report/history/ carries the trends
└── logs/               app-<date>.log
```

`.gitignore` is one line (`/artifacts/`). The **remote** S3 key in `e2e.yml`
deliberately stays `test-results` — that layout is a published contract that
appears in Slack messages and bookmarks; only the local source path changed.

## Consequences

- Losing the default names costs some instant recognizability for anyone who knows
  Playwright and Allure by their conventions. `docs/STRUCTURE.md` and this record
  are the compensation.
- Every path is a config value, not code: the four reporter entries and `outputDir`
  in `playwright.config.ts`, `LOG_DIR` in the logger, the two lifecycle hooks, and
  the report scripts' defaults.
- This surfaced a latent bug worth remembering. The Allure reporter had been
  configured with `outputFolder: 'allure-results'`, but allure-playwright v3 reads
  **`resultsDir`** — `outputFolder` was silently ignored and the default happened
  to be `allure-results`, so the setting had never actually done anything. Because
  Playwright types reporter options as `any`, nothing warned. Moving the directory
  is what exposed it: results kept appearing at the old root path.

## Revisit when

Nothing foreseeable. If a tool is added whose output directory cannot be
configured, it gets an entry in `.gitignore` and a line in `docs/STRUCTURE.md`
explaining why it sits outside the tree.
