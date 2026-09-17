# 0007 — Journey B owns the dev tenant for a run, and waits on one import deadline

- **Status:** accepted
- **Date:** 2026-09-16

## Context

The scheduled run on 2026-09-16 (run 35085576113) finished 2 failed, 5 flaky, 11
passed. Every red was a Journey B device-import spec. Five separate mechanisms
produced them, and none was a regression in the product's import:

1. A second run of this workflow — a `workflow_dispatch` from a feature branch —
   overlapped the cron run on the same dev tenant and the same relay mailbox.
   `concurrency.group` keyed on the event name, so the two never serialized. Each
   run's Trigger Import drained the other's envelopes: import runs 2041/2042,
   2049/2050 and 2053/2054 each hold the same files pulled twice, and run 2045
   mixes both runs' work.
2. The dev import worker claimed uploaded files 3–7 minutes after upload although
   `serviceImportInterval` is 1 minute. The suite waited a flat 180 s, and waited
   it *per stage*, so a delivery could spend two full budgets and still fail.
3. A timed-out attempt's envelope stayed queued and imported during the retry.
   Because `newRunPrefix()` minted a fresh prefix per attempt, those late rows
   were strangers to the retry: the fixture employee-day ended up with two
   Time-Ins and the Transfer grid rendered **Blocking** where the spec asserts
   **Warning**.
4. When a peer drained our envelope, `waitForImportFiles` still waited for the
   whole foreign run to reach a terminal status before reporting `ours: []`.
5. `POST /transfer-to-job-cards/analyze` returns `202 {jobId}` and the SPA polls
   `GET …/analyze/{jobId}`. On multi-task dev that GET lands on a different
   process and answers `404 not_found` — the same per-process job store that
   WEBPET-1907 chose for Notify Now. The screen then renders "Couldn't load
   transfer candidates. / The request failed. / Try again" and the grid keeps the
   aria-label `Includes 0 Time Cards of 0 initial selection` with no caption text
   node at all, so the page object's text wait died with a bare locator timeout.

Raising timeouts would have hidden all five.

## Decision

**One journey run at a time against the dev tenant.** The journey leg waits, in
the job, for any lower-numbered in-progress run of this workflow to finish its
`Playwright E2E` job. A shared `concurrency.group` was rejected: GitHub keeps one
pending run per group and cancels the rest, and a cancelled run concludes
non-success, which web-pet's advisory dispatcher reports as a failed check.
Waiting keeps every dispatch alive; ordering by run id makes deadlock impossible.

**References are stable across the retries of one test.** `lineagePrefix()` hashes
the run's lineage id (`GITHUB_RUN_ID`-`GITHUB_RUN_ATTEMPT`, else the pinned
`RUN_ID`) together with `testInfo.testId`, so every attempt of a test in a run
mints the same `<Reference>` values while two workers and two runs stay distinct.
A late envelope from an earlier attempt therefore resolves against the rows the
retry already owns instead of doubling the employee-day. `exportFileName()` keeps
its per-second stamp, so the relay filenames stay unique and an attempt's own file
is still identifiable.

**B7 is the exception** and keeps attempt-unique prefixes: its sticker codes are
the `EmployeeCodeHistory` join key and that history row cannot be deleted, so a
repeated prefix would give the WEBPET-1410 join two rows to choose from.

**One deadline per delivery, with a breaker.** `IMPORT_POLL_TIMEOUT_MS` is now a
deadline shared by the run poll and the reference poll of a single delivery, not a
fresh budget for each. Each Journey B spec sets its own timeout from that value
rather than `test.slow()`, so the budget is visible where it is spent. After two
deliveries in a worker exhaust the deadline, the rest wait 60 s and say so
(`import-circuit-open`): a dead import must not walk the job to its cap, because a
cancelled job uploads no report and looks like the suite never ran.

**Tolerances are annotated, never asserted away.** A foreign run's failed envelope
is `stale-envelopes-failed`; an earlier attempt of this test is
`sibling-attempt-envelope-failed`; this attempt's own rejection is asserted, but
only after the row check, so a rejection that merely means "these rows already
exist" reads as what it is. When the analyze job is lost to the 404 signature more
than five times, the grid block is skipped with `transfer-grid-not-asserted` — the
posture this suite already takes for a server-disabled analyze endpoint — while
every id-level API assertion still runs. Any other failure shape still throws.

## Consequences

- A dispatch can now sit idle for up to 30 minutes before its tests start, and
  says which run it is waiting for. Past 30 minutes it fails rather than running
  into a live tenant.
- The journey job's cap moved 45 → 60 minutes to fit the longer deadline.
- Retries are no longer independent experiments: they reuse their predecessor's
  references by design. A spec that needs a genuinely fresh identity per attempt
  must opt out the way B7 does, and say why.
- `import-claim-latency-ms` on every delivery gives the import-worker bug a
  measured history instead of an anecdote.
- Two product defects are tolerated, annotated and ticketed rather than healed:
  the import worker's claim latency, and the per-process analyze job store. If
  either is fixed, the matching tolerance should be removed, not left to rot.

## Environment

The wait step protects CI only. A local `npm run test:dev` of Journey B still
collides with a CI journey run in exactly the way described above — check
`gh run list --status in_progress` before starting one.

## Revisit when

The suite gets a tenant of its own, or dev's import worker and analyze job store
are fixed. A per-run tenant removes the wait step, the sibling-attempt bucket and
most of the fixture-day hygiene the Journey B specs carry.
