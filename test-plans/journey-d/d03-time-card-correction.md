# D3 · Add missing time-in and correct time card

Fix the flagged exceptions on the time-card tab — most commonly a missing
time-in — and correct the card.

| | |
|---|---|
| Workflow | `D3` — Add missing time-in and correct time card |
| Journey | D — Processing |
| Module | Windows |
| Coverage depth | `none` — see below |
| Rows | `src/data/runner/journey-d.csv`, `D3-001`, `D3-002` |

This is the first plan under `test-plans/journey-d/`, and
`tests/web/journey-d-processing/` is the first spec directory for Journey D.

## Coverage depth is `none`, and stays that way

`D3-001` is the unautomated end-to-end row. `D3-002` was relocated from
`tests/webpet/equiv/crew-04-timecard-multi-entry-workflow.spec.ts` and is
**`enabled=0`** — so D3 has no executing coverage at all. Depth `none` is
accurate and must not be promoted on the strength of a disabled row.

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `D3-R1` | When three sequential Time-In submissions are made for one employee and date, PET Tiger shall persist each with the correct date, time, job, ranch, field, employee and crew. | `D3-002` *(unproven)* |
| `D3-R2` | When a Time-Out submission follows, PET Tiger shall persist it with null job, ranch and field, and the correct employee and crew. | `D3-002` *(unproven)* |

Both are unproven. `D3-R3` onward is reserved for the exception-correction
behaviour `D3-001` describes, which is the workflow's actual subject.

## `D3-002` is double-guarded, and that is deliberate

The row is `enabled=0` **and** the test body opens with
`test.skip(true, '<reason>')`. Two guards for one test is unusual; the reason is
that an accidental run is destructive rather than merely noisy.

* **The capability does not exist.** The web app has no multi-entry time-card
  surface; the spec was written against the legacy PET Pocket wire format.
* **There is no cleanup path.** The test writes TimeCard rows dated `2099-01-15`
  against seeded counters (1257/4/9/85). The original spec's header prescribed
  SQL cleanup — impossible now, because DB access was removed from this repo in
  2026-08-04. Anything it writes stays written.

The declaration was converted from `test.skip('title', …)` to a plain
`test('title', …)` with the guard inside the body. That is not cosmetic: the
runner's checker parses specs with regular expressions, and a `test.skip(` form
hides the title from it, exempting the test from every tag and requirement rule.
Making it a normal `test()` puts it back under the checker while keeping it from
executing.

**Re-enabling requires two things**, not one: the app gaining a multi-entry
capability, *and* an API deletion route for TimeCard so the run can clean up
after itself.

## Screens and page objects

| Screen | Route | Page object |
|---|---|---|
| Time card entry form | office time-card entry | `src/pages/processing/TimeCardFormPage.ts` |

The page object moved to `src/pages/processing/` in this batch — it is not a
setup screen, and this batch relocated its last web-pet consumer. Its locators
are preserved so re-enabling stays a small change, but note they have **never
executed**: treat them as unverified, exactly as
[`A5-018`](../journey-a/a05-employee-setup.md) documents for its component.

## Preconditions

- [ ] A multi-entry time-card capability in the web app.
- [ ] `DELETE` (or equivalent) for TimeCard rows, so a run can clean up.
- [ ] Seeded counters 1257/4/9/85, or a factory replacing them.

## Open questions for the tester

- [ ] Is multi-entry time-card correction in scope for the web app at all, or does
      it stay a PET Pocket capability? If the latter, `D3-002` should be retired
      rather than carried.
- [ ] `D3-001` — the exception-correction flow — is the workflow's real subject and
      is entirely unautomated.
