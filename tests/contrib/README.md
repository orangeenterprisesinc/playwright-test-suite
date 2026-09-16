# `tests/contrib/` — the developer-contribution lane

Specs written by web-pet developers for the feature or bug they just shipped.
Separate from the two QA-owned suites on purpose:

| Lane | Who writes it | Where | Runs |
|---|---|---|---|
| `tests/web/` | QA | user-journey automation from the workflow catalog | 4 PM cron, `--project=chromium` |
| `tests/webpet/` | QA | the migrated web-pet regression suite | 4 PM cron, `--project=webpet` |
| `tests/contrib/` | **developers** | one spec per ticket | its own nightly lane, `--project=contrib` |

A contributed spec does **not** join the regression run by merging. It runs in
this lane until QA promotes it — see *Promotion* in
[`docs/DEV-E2E-CONTRIBUTION.md`](../../docs/DEV-E2E-CONTRIBUTION.md).

## The contract

Generated for you by `/dev-feature-test <TICKET-KEY>`; `npm run contrib:runner:check`
enforces every line of it.

1. **Filename** — `<TICKET-KEY>-<slug>.spec.ts`, e.g. `WEBPET-2310-badge-reissue.spec.ts`.
2. **Import** — `@fixtures/contrib.fixture`, always.
3. **Describe tags** — exactly `['@Contrib', '@<TICKET-KEY>']`.
4. **Test tags** — exactly one surface (`@wp-ui` | `@wp-api`) and one tier
   (`@wp-smoke` | `@wp-regression` | `@wp-negative`).
5. **`testCaseId`** — `<TICKET-KEY>-<nn>`, on every test.
6. **Runner row** — `npm run contrib:runner:sync`, then fill the `owner` column
   with your GitHub handle. It is who QA asks when the spec goes red.

Journey tags (`@Smoke`, `@Regression`, `@JourneyB`, …) are rejected here: they
belong to the catalog vocabulary that `scripts/runner/check.js` owns.

### Why the import line is a correctness rule, not a style rule

`webpet.fixture` resolves a `testCaseId` against `src/data/webpet/`. A contrib
id is not in that file, so its gate takes the "claimed id with no row" branch
and **skips the test green** — the contribution silently never runs, and
nothing fails to tell you. `contrib:runner:check` rejects any other import for
that reason alone.

## Commands

```bash
npm run test:contrib -- tests/contrib/WEBPET-123-thing.spec.ts   # run against dev staging
npm run test:contrib:headed -- <spec>                            # watch it
npm run contrib:runner:sync                                      # rebuild rows from the specs
npm run contrib:runner:check                                     # what CI runs
npm run contrib:boundary                                         # is my diff spec-only?
```

`WEBPET-0000-lane-example.spec.ts` is the lane's worked example — not a real
ticket. Copy its shape.
