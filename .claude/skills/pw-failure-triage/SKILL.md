---
name: pw-failure-triage
description: Use when a Playwright test in this repository failed, flaked, or silently skipped and the cause is not yet known. Reads the run artifacts under artifacts/ (results, traces, videos, HTML report, framework logs), classifies the failure as gate-skip / environment / selector drift / timing / missing registration / real bug, and proposes the specific fix. Pairs with `npm run test:last-failed`.
---

## Playwright Failure Triage

This skill is the **canonical failure taxonomy** for the repository — the Healer
agent's contract (`.claude/PLAYWRIGHT_AGENT_WORKFLOW.md` §4) classifies against
it rather than keeping a competing list.

### Read evidence before proposing anything

The rule for this skill: **no fix without an artifact or a reproduction backing it.**
A guessed selector change that happens to go green is how a real bug becomes a
permanently broken test.

### Where the artifacts actually are

This repo does **not** use Playwright's default `test-results/`. Everything lands
under `artifacts/` ([playwright.config.ts](playwright.config.ts) `outputDir`):

| Path | Contents |
|---|---|
| `artifacts/results/<sanitised-title>-<project>/` | per-test `trace.zip`, `video.webm`, screenshots, `error-context.md` |
| `artifacts/results/results.json` | machine-readable run summary — status, error message, retries |
| `artifacts/html/index.html` | HTML report (`npm run test:report`) |
| `artifacts/allure/results` / `artifacts/allure/report` | Allure raw + generated report |
| `artifacts/logs/app-YYYY-MM-DD.log` | framework logger, JSON-lines — gate decisions, page-object navigation, cleanup |

**Capture policy differs per project, and this catches people out:**

- default projects (`chromium`, `api`): `screenshot: 'on'`, `video: 'on'`,
  `trace: 'retain-on-failure'` — a first failure always has a trace
- `webpet` in parity mode (the default): `trace: 'on-first-retry'`, video and
  screenshot **off**, `retries: 0` — so a first web-pet failure has **no trace at
  all**. To get one: re-run that test with `--retries=1`, or `WEBPET_PARITY=0` to
  use the framework defaults.

```
npx playwright show-trace artifacts/results/<dir>/trace.zip
npm run test:report
```

### Step 1 — is it actually a failure?

Check for a skip first. Three gate layers ([src/fixtures/gate/executionGate.ts](src/fixtures/gate/executionGate.ts))
skip tests with a distinctive reason string, and a run full of skips reports green:

| Reason contains | Meaning | Fix |
|---|---|---|
| `is disabled in runnerList (execute=no)` | `src/data/runnerList.json` override | remove the entry, or leave it — it may be deliberate |
| `has no runner row — add one` | spec claims a `testCaseId` nothing declares | add the CSV row and sync, or drop the annotation |
| `is disabled in its runner row (enabled=false)` | `enabled=0` in the CSV | flip to 1 if this test is meant to run |
| `is out of scope for TEST_SCOPE=` | the row's segments/modules exclude this run | fix the row's segments/modules, or the scope being run |

If the test skipped, stop — there is no failure to triage, and "fixing" the app or
the selector is wasted work.

### Step 2 — classify

Work down this list; the first match is usually right.

**a) Environment / auth** — the whole file or project failed, not one test.
Signals: `auth-setup` failed, `.auth/user.json` missing, every request 401/403,
`ECONNREFUSED`, a 403 on a mutating web-pet call (missing `X-CSRF-Token`), the SPA
never loading. Fix the environment, not the test. Check `TEST_ENV` and the matching
`.env.<env>` file first — see [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md).

**b) Missing registration / fixture wiring** — `pages.x is undefined`, a TS error
on `pages.x`, or a fixture destructured that the imported module does not define.
Almost always a page object added to `src/pages/**` but never registered in
`pages.fixture.ts` / `webpetPages.fixture.ts`, or a spec importing `base.fixture`
when it belongs on `webpet.fixture`. See the **pw-page-object** skill.

**c) Selector drift** — the locator resolved 0 elements, or strict mode found N.
Signals: `strict mode violation: locator(…) resolved to N elements`,
`waiting for locator(…)` with the element visibly present in the trace's DOM
snapshot, `Timeout … exceeded` on a `.click()` of something the screenshot shows.
Open the trace, use the DOM snapshot at the failing step, and read
`error-context.md` (an ARIA snapshot of the page at failure) before choosing a new
locator. Fix it in the **page object**, per the **pw-locator-hardening** skill —
never by adding `.first()` to make the strict error go away.

**d) Timing** — passes headed, passes on retry, fails under load; the trace shows
the element arriving just after the assertion window. Fix with a web-first
assertion or a deterministic wait on the state the test actually depends on
(response, URL, enabled button). **Never** with `waitForTimeout`, and never by
raising the global timeout to hide one slow step. Note the parity trap: the
`webpet` project's test timeout is 30s, so any helper budgeting two 15s windows is
guaranteed to time out there.

**e) Real bug** — a value, count, state or status code is wrong and the trace
confirms the app produced it. Signals: assertion mismatch on data (`expected "X"
received "Y"`), an unexpected HTTP status from the API, a validation message that
should not appear. Report it; do not adjust the assertion to match the app.
Known live example of this class: per-form Save-disabled bugs on dev staging.

**f) Test-data collision** — passes alone, fails in a suite or on the second run.
Signals: duplicate-name/uniqueness rejections, a leftover record from a failed run,
two workers touching the same entity. Fix by generating unique values
(`src/data/generated`) and cleaning up (`cleanup.track(...)` or the
`data-factory` delete helper), not by reordering tests.

### Step 3 — reproduce narrowly

```
npm run test:last-failed                  # journey suites
npm run test:webpet:last-failed           # web-pet suite
npm test -- --grep "@A1"                  # by tag
npm test -- tests/web/system/login-module.spec.ts --project=chromium --headed
npm run test:debug                        # inspector
```

Run the single failing test at least twice. Same failure twice → (a)–(c) or (e);
intermittent → (d) or (f).

### Step 4 — report

Give the user, in this order:

1. **Classification** — one of the six above
2. **Evidence** — the artifact path, the error line, the trace step
3. **Root cause** — one sentence
4. **Proposed fix** — the file and change; page objects for selectors, config/env
   for environment, an app bug report for a real bug
5. **Verification** — the exact command that proves it

### Never do these to make a run green

- add `waitForTimeout` or bump timeouts to cover a race
- append `.first()` / `.nth(0)` to silence a strict-mode violation
- set `enabled=0` on the row, or add a `runnerList` override, for a test that fails
- weaken an assertion (`toBeVisible` → `toBeAttached`, exact value → regex) to match
  broken behaviour
- delete or `test.skip` the test

Each of these converts a signal into silence, and this suite already has a
documented history of exactly that (`base.fixture`'s gate once fired for one spec
file per worker and every other file ran ungoverned — the run was green and wrong).
