# Specs — Test Plans

This directory holds test plans. A plan is the reviewed, human-readable description of a
journey that a generated spec gets written from — regardless of where the journey came from:
a screen recording, a Chrome DevTools recording, Playwright codegen, or a Jira ticket.

## What a requirement has to say

Every numbered line states **what happens** and **what the system does about it**. Both
halves, every time. A real example from this repo's first annotator-derived plan:

> ~~Initials and Email Address filled~~

Nobody can write a test from that. It names neither the action nor the expected result, so
whoever picks it up has to invent the missing half — and an invented expectation becomes a
wrong assertion. The same step with both halves present:

> **R7.** Entering a value in the Initials field shows the typed value and marks the field
> with a change indicator.

One line, one test case, nothing left to interpretation. That is the whole rule: if you
cannot tell from the sentence what the test should assert, the sentence is not finished.

Lines that describe context rather than behaviour — how the app is configured, what the data
looks like, why a step exists — are notes, not requirements. Keep them, but don't number
them.

## Number every requirement

`R1`, `R2`, … in order. The number goes into the generated spec's `testCaseId` annotation (or
a comment where a runner row already owns that field), so a test can always be traced back to
the line it came from, and a line can always be checked for a test.

**One requirement → one test.** Every requirement has a test; every test traces to a
requirement. That mapping is the review checklist — a requirement with no test is missing
coverage, and a test with no requirement is untraceable.

## How a requirement becomes a test

| Part of the plan | Becomes |
|---|---|
| Preconditions | Fixtures, storage state, or a setup step |
| The action | The test body |
| The expected result | The `expect(...)` assertions |
| A negative case's wrong input | That test's setup |

## Negative and edge cases are the ones that get skipped

Each workflow should yield **4–5 failure and edge cases**, stated as explicitly as the happy
path: what the user does wrong, and exactly what the system does about it — the message text,
whether the control disables, whether the URL changes, whether the record is created.

This matters more than it looks, because **a happy-path recording contains no information
about failure behaviour**. A recording of a successful user creation cannot tell you what
appears when Name is left empty. Those requirements come from driving the live application,
not from the source artifact — which is why the next section exists.

## Never write an outcome you did not observe

If the source did not demonstrate what happens, the behaviour is **unknown**. Put it under
**Not established** with a note on why it matters, and let the planner agent discover it
against the running application. A fabricated expected outcome becomes a wrong assertion,
which is worse than a missing test — a missing test is visible, a wrong one is not.

Mark inferences as inferences. *"The cursor sits beside the footer Cancel and the next frame
is the list, but the click itself falls between samples — Cancel is the inference, the header
X is the alternative"* is useful. Silently promoting that to *"the user selects Cancel"* is
not.

## Required structure

```markdown
# <Journey name>

**Module:** <area> (`/route`)
**Source:** <where the journey came from — file, ticket, or annotations directory>

## Preconditions
<the state the test starts from; note that browser projects load .auth/user.json>

## Requirements

### Happy path
R1. <action> <expected result>.
R2. ...

### Constraints
R6. <invariant that holds regardless of any particular action>.

### Negative and edge cases
R8. <what goes wrong> <what the system does about it>.
R9. ...

## Test data
<generated vs fixed values, and why>

## Cleanup
<how created records are removed>

## Not established
<anything the source could not confirm — never guess it into a requirement>
```

Do not overwrite an existing plan for the same journey. Write alongside it and diff — where
two plans disagree, record the disagreement rather than silently resolving it one way.

## Reference

| File | What it is |
|---|---|
| `journey-a1-user-setup.annotator-run1.md` | Journey A1, derived only from the current annotator output. The authoritative plan, and the only clean-room derivation. |
| `journey-a1-user-setup.md` | Earlier plan, read directly from the recording without the annotator. Richest in detail, but not reproducible. |
| `journey-a1-user-setup.annotated.md` | Earlier plan from a previous annotator build; states outright that it was not a clean-room derivation. |
