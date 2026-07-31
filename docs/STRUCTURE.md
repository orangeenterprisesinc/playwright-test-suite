# Folder structure

The map of this repo, and why it is shaped this way. If you are adding a file and
are unsure where it goes, this document should answer it in one read.

## The two rules

**1. The repo root holds only what a tool discovers there by convention.**
`playwright.config.ts`, `tsconfig.json`, `package.json`, `.gitignore`,
`.gitattributes`, `.nvmrc`, `.mcp.json`, `README.md`. Everything else is grouped
into a folder named after its concern. Those files are *not* at the root as a
style choice — moving them breaks discovery:

| File | Why it cannot move |
|---|---|
| `playwright.config.ts` | `npx playwright test` and the VS Code Playwright extension look for it at the project root. Moving it means every invocation needs `-c`. |
| `tsconfig.json` | Path aliases + `include` are resolved relative to it; the IDE and `tsc` expect it at the root. |
| `.mcp.json` | Claude Code reads MCP servers from the project root only. |
| `.gitattributes` / `.gitignore` | Git reads these from the root (and per-directory), not from a config folder. |
| `.env` / `.env.<name>` | The Node/dotenv convention is `.env` in the working directory. Editors' dotenv plugins, `docker run --env-file`, and most CI actions assume it, and every Node developer looks for it there first. |

Lint configs *did* move (`config/lint/`) because ESLint and Prettier both accept
`--config`. The cost is that editors must be told where to look — that is what
`.vscode/settings.json` is for. Without it, an editor lints with tool defaults
while `npm run lint` uses the real config, which is worse than either.

**2. Every subsystem reads as mechanism / storage / consumers.**
Not "one folder per file type". The question a folder answers is *what does this
do*, not *what kind of file is this*:

| Subsystem | Mechanism (how) | Storage (what) | Consumers (who) |
|---|---|---|---|
| Reporting | `src/reporting/generate/` | `artifacts/` | `src/reporting/deliver/` + `recipients/` |
| Test data | `src/data/readers/` | `src/data/{runner,static,catalog}/` | fixtures + specs |
| Runner Manager | `src/fixtures/gate/` | `src/data/runner/` | every spec, via the auto gate |

## The tree

```
playwright-test-suite/
├── playwright.config.ts  tsconfig.json  package.json  .mcp.json
├── .gitattributes  .gitignore  .nvmrc  README.md
│
├── .env.local  .env.dev  .env.qa    committed per-environment config; sensitive
│                                    values stored as ENC(...) ciphertext
├── .env.example                     the documented template
├── .env                             personal overrides + SECRET_KEY (gitignored)
│
├── config/               ALL configuration
│   ├── lint/             .eslintrc.json + .prettierrc.json
│   ├── notifications/    recipients.csv — per-branch/trigger email routing
│   └── scopes/           per-customer segments + modules (TEST_SCOPE)
│
├── docker/               ALL Docker
│   ├── Dockerfile  Dockerfile.dockerignore
│   ├── e2e/              containerized app stack (compose.yml, restore.sh, .env)
│   └── db-backup/        local SQL backups — gitignored, never committed
│
├── .vscode/              editor: lint config paths, debug configs, recommendations
├── .github/workflows/    4 pipelines: journey + webpet, each dev + local
│
├── artifacts/            ALL run output — one .gitignore line
│   ├── results/          results.json, traces, videos, screenshots
│   ├── html/             Playwright HTML report
│   ├── allure/results/   raw Allure results (wiped per run)
│   ├── allure/report/     generated report; report/history/ carries the trends
│   └── logs/             app-<date>.log
│
├── test-plans/           markdown plan per workflow, written before the spec
├── docs/                 STRUCTURE.md (this file), ENVIRONMENTS.md,
│                         FRAMEWORK-GUIDE.md, LINTING.md, AI-INTEGRATION.md,
│                         adr/, catalog/, media/
│
├── src/
│   ├── config/           envLoader, configProperties, dataSource, scope, webpetEnv/Paths
│   ├── core/  context/  types/  auth/
│   ├── pages/            page objects  (+ pages/webpet/)
│   ├── components/       components    (+ components/webpet/)
│   ├── fixtures/         base/api/pages fixtures (+ webpet*.fixture.ts)
│   │   ├── gate/         run-or-skip decision: executionGate, methodInterceptor, webpetGate
│   │   └── lifecycle/    global-setup, global-teardown, testLifecycleManager
│   ├── data/             ONE data home — four kinds plus the mechanism
│   │   ├── runner/       runner rows, one file per journey (+ runnerList.json override)
│   │   ├── static/       typed value bags: journey-a/, system/, shared/
│   │   ├── generated/    run-unique factories: userFactory.ts, random.ts
│   │   ├── catalog/      workflow-catalog.json (generated from the .docx)
│   │   ├── readers/      Csv/Json/MultiFile/TypeCoercion + DataProvider
│   │   └── webpet/       the migrated suite's own rows + id maps
│   ├── reporting/
│   │   ├── summary/      runSummary.ts — ONE model, every channel renders it
│   │   ├── generate/     allure/{report,labels}.ts
│   │   ├── deliver/      slackReporter + slack/{gate,blocks,slackApi}.ts (primary),
│   │   │                 emailReporter (deprecated), dashboard
│   │   └── recipients/   recipients.ts → config/notifications/recipients.csv
│   └── utils/            genuinely cross-cutting only: logger.ts + db/
│
├── scripts/              grouped by what they serve
│   ├── run-playwright.js shim-free launcher (paths containing & or spaces)
│   ├── runner/           sync, check, coverage + lib/runner-data.js
│   ├── report/           allure-generate, allure-open, ensure-java
│   ├── catalog/          import-catalog
│   └── webpet/           runner-sync, ids-check, baseline, baseline-diff, audit-relocation
│
└── tests/
    ├── auth.setup.ts
    ├── web/              browser-driven: UI-only and UI+API hybrids (@Workflow)
    ├── api/              API-only, browserless `api` project
    └── webpet/           the migrated suite — runs separately, see below
```

## Where each kind of test data lives

Four different things get called "test data". They are deliberately separate:

| Kind | Where | Authored how | Example |
|---|---|---|---|
| **Runner rows** — which tests exist and whether they run | `src/data/runner/journey-*.csv` (+ generated `.json` mirror) | CSV by hand, Excel-friendly | `A1-001, enabled=1` |
| **Static value bags** — fixed inputs and expected copy | `src/data/static/<journey>/*.ts` | typed TS, so a shared constant is compile-checked | the 17 role names, expected error messages |
| **Randomized** — must be unique per run | `src/data/generated/` | `makeUser()`, `uid()` | a test user's name/initials/email |
| **Reference** — the source-of-truth catalog | `src/data/catalog/workflow-catalog.json` | generated from the `.docx` | the 69 workflows |

Credentials and URLs are **not** test data — they are environment inputs and live
in `env/`, read only through `getConfigValue()`.

The mechanism that reads all of it is `src/data/readers/`. There is **no
conversion step**: JSON runs from JSON and CSV runs from CSV, selected by
`TEST_DATA_SOURCE`. `npm run runner:sync` regenerates the JSON mirror at author
time; `npm run runner:check` proves the two agree.

## Secrets

Environment inputs are the one group of config files that stays at the repo root,
because `.env` in the working directory is what dotenv, editors, `docker run
--env-file` and most CI actions look for.

The `.env.<name>` files are kept **terse on purpose** — settings, not prose. An env
file whose 8 values are buried in 37 lines of commentary is not documentation, it
is a file nobody reads. Every "why" lives in
[ENVIRONMENTS.md](ENVIRONMENTS.md) instead: precedence, the SPA-vs-API host trap,
the `DB_TRUSTED` transport split, and the web-pet parity rules.

Any value in `.env` or `.env.<name>` may be stored encrypted:

```properties
PASSWORD=ENC(v1:8Kf7…:9pQ2…:Zm9vYmFy:dGFnZ2Vk)
```

`getConfigValue()` decrypts transparently, so **no test or page object changes** —
that is the whole reason the accessor exists. Plaintext still works, so encryption
is opt-in per key.

```bash
npm run secret:keygen                    # once — generate SECRET_KEY for .env
npm run secret:encrypt -- "myPassword"   # prints ENC(v1:...)
npm run secret:decrypt -- "ENC(v1:...)"  # verify a token
```

AES-256-GCM with a scrypt-derived key, via Node's built-in `node:crypto` — no new
dependency. See [ADR 0006](adr/0006-encrypted-env-values.md) for why this rather
than the `crypto-js` approach the sibling frameworks use.

**What this does and does not do.** It protects secrets *at rest*: a screen-share, a
pasted log, a stray `cat .env`, or an accidental commit shows ciphertext instead of
a working password. It is **not a vault** — anyone holding both the file and
`SECRET_KEY` can read every value. Therefore:

- `SECRET_KEY` lives only in the gitignored `.env` and in CI secrets. In a tracked
  file it reduces the whole scheme to obfuscation.
- The committed `.env.dev` / `.env.qa` stay **credential-free**. Real secrets come
  from CI secrets, which can be rotated; ciphertext in git history cannot be
  un-published.
- Reading a credential straight from `process.env` **bypasses decryption**. Use
  `getConfigValue()`, or `decryptIfNeeded()` where a module deliberately keeps its
  own resolution chain (`src/config/webpetEnv.ts`).
- A missing or wrong key throws at config-read time rather than passing ciphertext
  through — an opaque 401 from the app is much harder to diagnose.

## Where reports live

Split three ways, because they are three different decisions:

- **Generation** — `src/reporting/generate/allure/`. How a report gets built.
- **Storage** — `artifacts/`. Where output lands. Also the S3 sync in `e2e.yml`
  (whose *remote* key is deliberately still `test-results` — that layout is a
  published contract that appears in Slack messages and bookmarks).
- **Recipients** — `src/reporting/recipients/recipients.ts` resolves *who* gets
  the mail from `config/notifications/recipients.csv`. Editing the routing table
  is a config change, not a code change, which is exactly why it is a CSV.

All four channels render one shared `RunSummary` (`src/reporting/summary/`), so
adding a channel never means recomputing counts.

## The migrated web-pet suite stays separate

`tests/webpet/` is the PET Tiger app repo's own suite, converted onto this
framework. It **runs separately by design** — its Playwright projects only
materialize under `WEBPET=1` / `--project=webpet`, so a bare `npx playwright test`
never collects its ~406 tests.

Its code is **mirrored under each parent** rather than pulled into one
`src/webpet/` slice: `src/pages/webpet/`, `src/components/webpet/`,
`src/data/webpet/`, `src/fixtures/webpet*.fixture.ts`, `src/config/webpetEnv.ts`.
That keeps the two suites structurally parallel — a webpet page object sits where
a journey page object sits — and it is why `src/data/` was regrouped internally
rather than renamed: `src/data/webpet/` never had to move, so the migrated suite's
row files, id maps and acceptance baseline were untouched by the reorganization.

## Known debt this structure makes visible

- The Allure attachment filter exists twice — `src/reporting/generate/allure/report.ts`
  and `scripts/report/allure-generate.js` — as does the Java bootstrap
  (`report.ts` ⇄ `scripts/report/ensure-java.js`). Both pairs carry "keep in sync"
  comments. Root cause: the scripts are plain JS so they run without a TS loader.
  Running them through `tsx` would collapse each pair to one implementation.
- `src/reporting/deliver/dashboard.ts` (ELK) is wired but `SEND_RESULT_ELK` is set
  in no workflow, so it has never actually run.
- `e2e-local.yml` and `webpet-e2e-local.yml` generate an Allure report but never
  restore `allure/report/history`, so their trend graphs reset every run. The two
  dev workflows do restore it.
- `src/data/webpet/baselines/` is referenced by both webpet workflows and by
  `playwright.config.ts` but does not exist — the per-test baseline manifest was
  never captured. Both uses fail soft with a warning.
