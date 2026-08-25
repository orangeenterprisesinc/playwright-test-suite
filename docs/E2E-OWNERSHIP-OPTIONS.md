# E2E test ownership — Option A vs Option B

- **Status:** proposal, for team review (Ramnish / Shakvat / dev team)
- **Date:** 2026-08-24
- **Author:** Gukan (QA)

## Background

Web-pet developers are expected to provide Playwright coverage for every new
feature, alongside their unit tests. The question is **where those tests live
and how developers contribute them**.

History that shapes the decision:

- Web-pet previously had its own Playwright scripts inside the app repo. They
  broke and were not maintained. Instead of repairing them in place, QA migrated
  them into `playwright-test-suite`, where they were aligned into the current
  ~406-test webpet suite.
- `playwright-test-suite` is not a webpet-only repo. The same framework also
  runs the PET-Tiger workflow-catalog (User Journey) automation — one set of
  fixtures, page-object registries, runner CSV/JSON sync, env handling,
  Slack reporting, and CI wiring serving both domains.
- E2E tests execute against the **deployed dev-staging environment**
  (app.ptdev.xyz), not against a locally built app. Web-pet's CI already has an
  advisory e2e job that calls this suite; it cannot gate app PRs, because the
  environment it tests lags behind the PR's code.

## Option A — developers contribute specs to `playwright-test-suite`

The suite stays here. Developers author the spec for their feature **in this
repo**, assisted by a Claude Code skill, and QA reviews the PR.

```text
Developer works on web-pet
        → creates/updates WEBPET-123, implements the feature
Developer opens playwright-test-suite in Claude Code
        → /dev-feature-test WEBPET-123
Skill reads the Jira ticket, derives expected behavior
        → generates the spec with the repo's page objects and conventions
        → runs it against dev staging + typecheck/lint/runner-check
Developer reviews the spec and the green run
        → skill opens PR to main (branch test/WEBPET-123-…)
QA (Gukan) reviews, re-runs, merges
        → feature ticket closes
```

**One-time setup per developer (~30 min, self-service):** repo access, clone,
`npm ci`, `npx playwright install`, 1Password CLI integration switched on (the
framework fetches credentials from the vault itself — no `.env` to create),
Jira MCP auth. Nothing is handed over by QA. The skill's preflight names any
missing step.

**Per-feature developer effort:** run one command, review the generated spec,
confirm the green run, approve. Roughly 15–30 minutes, mostly reading.

**QA effort:** review + merge each PR; framework stays under single ownership.

**Pros**

- Framework, conventions, and validation gates stay in one place under QA
  ownership; dev PRs carry specs only, enforced by review + branch protection.
- Developers genuinely own their feature's test — what Ramnish and Shakvat
  asked for — while the skill removes the authoring cost that usually makes
  devs skip e2e tests.
- Zero migration work; the process can start this week.
- The journey (PET-Tiger) automation and the webpet suite keep sharing one
  framework.

**Cons**

- Two repos per feature: the dev raises an app PR in web-pet *and* a spec PR
  here. No atomic app+test change.
- Per-developer onboarding friction (the ~30-minute setup) is real and is
  where adoption can stall if not scripted and documented.
- Version skew is possible: a feature can merge in web-pet before its spec
  merges here. Mitigated by the companion-PR rule and QA review, not
  eliminated.

## Option B — migrate the suite back into the web-pet repo

Move the Playwright framework and the webpet tests into
`orangeenterprisesinc/web-pet`, so developers write tests in the repo they
already work in.

### Is it actually easier for the developer?

Partly — and less than it first appears.

- **What the dev gains:** no second clone or repo access; the test can ride in
  the same PR as the feature; one familiar repo.
- **What the dev does NOT gain:** the test-writing work itself is identical —
  same Playwright, same page objects, same conventions, same local run against
  dev staging. Browsers, dev-staging credentials, and env setup are still
  required either way. And the headline benefit of in-repo e2e — gating the
  app PR on the tests — is **not achievable here**, because the suite tests
  the deployed dev-staging environment, not the PR's build. Web-pet's existing
  advisory e2e job already demonstrates this limit.

So Option B saves the developer one clone and one PR, and nothing else.

### What the migration costs (QA task breakdown)

1. Relocate the framework: fixtures, two page-object registries, components,
   utils, config, path aliases, lint/format configs, `scripts/` (runner sync,
   secret CLI, reporters, run wrapper) into web-pet without colliding with the
   app's own toolchain and package.json.
2. Split or duplicate the framework: the PET-Tiger journey suite
   (`tests/web/`, `tests/api/`, catalog, runner data) does **not** belong in
   web-pet. It needs the same framework, so either it stays behind in a
   stripped copy of this repo (two frameworks to keep in sync — the exact
   drift this repo was created to end) or PET-Tiger automation moves into the
   web-pet repo, which makes no organizational sense.
3. Re-wire CI: recreate the scheduled runs, Slack reporting, self-hosted
   runner wiring, and secrets inside web-pet's dev-owned CI, negotiated with
   the dev team.
4. Re-verify ~406 webpet tests plus the journey suite after the move —
   a full regression pass of everything that is green today.
5. Governance gets harder, not easier: in a dev-owned repo, protecting the
   test framework from casual edits requires path-based CODEOWNERS and review
   rules that devs must maintain; today it is simply a protected branch QA
   owns.

Realistic effort — stated precisely, because "AI makes it fast" covers only
part of it: the hands-on work with AI assistance is **~3–4 days**; the
calendar time is **1–2 weeks**, because three things do not compress:

- **Verification is wall-clock, not intelligence.** Proving the moved suite
  still works means running ~406 webpet tests plus the journeys against dev
  staging. A full run takes hours, a relocation never passes on the first
  try, and dev staging adds its own friction (build lag, 15-minute import
  polls, flaky screens). Realistically 3–5 full fix→re-run cycles; AI makes
  each fix fast, it cannot make the runs fast.
- **Cross-team dependencies run at human speed.** Secrets re-created in
  web-pet's dev-owned CI, the self-hosted runner re-registered, scheduled
  runs and Slack reporting re-wired — each step needs an admin or a dev to
  act and approve PRs into their repo. One slow reply costs a day.
- **The framework split is a design problem, not a code move** (item 2
  above), and that decision plus its review is not a 2-day item at any speed.

The decisive point survives even the optimistic number: whether it costs
2 days or 2 weeks, what it buys is the same — each developer saves one
`git clone` and one PR — and it recreates the exact conditions under which
the original in-repo scripts rotted: tests living where nobody owned them.

## Comparison

| | Option A (specs contributed here) | Option B (migrate into web-pet) |
|---|---|---|
| Dev effort per feature | 1 command + review (~15–30 min) | Same test-writing work, one repo/PR fewer |
| Dev one-time setup | ~30 min (scripted) | Browsers/env/creds still needed |
| App PR gated by e2e | No (env-based testing) | Still no — same env limitation |
| Migration work | None | ~3–4 days effort with AI; 1–2 weeks calendar incl. full re-verification |
| Framework ownership | QA, one protected repo | Shared repo, CODEOWNERS gymnastics |
| PET-Tiger journey suite | Same framework, same repo | Framework split or nonsensical co-location |
| Precedent | Standard "QA owns framework, devs author tests" model | The setup whose scripts already rotted once |

## Recommendation

**Option A.** Developer-authored e2e tests with QA framework ownership and
required review is standard industry practice; the separate repo is justified
because one framework serves two products and the in-app-repo arrangement
already failed once. The skill (`/dev-feature-test`) exists precisely to make
Option A's per-feature cost lower than hand-writing a test would be in either
repo. Option B's only real win — atomic app+test PRs with e2e gating — is
unreachable while tests run against a deployed environment, so its migration
cost buys almost nothing.

If adopted: the follow-up deliverables are the `dev-feature-test` skill, the
developer onboarding doc (`docs/DEV-E2E-CONTRIBUTION.md`), a PR template, dev
repo access, and branch protection on `main`.
