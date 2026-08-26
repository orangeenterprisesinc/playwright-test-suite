# Specs — workflow plans

One markdown plan per catalog workflow, written **before** the spec. The plan is
where the catalog's steps and the tester's recording get reconciled into something
writable: which steps are automatable, which screens are involved, what data has a
uniqueness rule, what has to be cleaned up.

```
test-plans/
├── _template.md                    # copy this for a new workflow
├── journey-a/
│   └── a01-user-setup.md           # worked example — the one automated workflow
├── journey-b/ …
```

## The pipeline

One workflow id (`A1`, `D4`) joins five artifacts, so there is no lookup table:

| Artifact | Path |
|---|---|
| Catalog (source of truth) | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → `src/data/catalog/workflow-catalog.json` |
| Recording | `docs/media/journey-a/a01-user-setup.mp4` |
| Plan | `test-plans/journey-a/a01-user-setup.md` |
| Spec | `tests/web/journey-a-setup/a01-user-setup.spec.ts` |
| Runner rows | `src/data/runner/journey-a.csv` → `A1-001`… |

## Adding a workflow

1. **Watch the recording** and read the catalog entry
   (`node -e "…workflow-catalog.json…"`, or `npm run coverage:catalog -- --todo`
   for what is outstanding).
2. **Copy `_template.md`** to `journey-<x>/<wf>-<slug>.md` and fill it in. Getting
   the "Automatable?" column and the uniqueness rules right here is what stops the
   spec being rewritten twice.
3. **Add runner rows** to `src/data/runner/journey-<x>.csv` — one per test case,
   `enabled=0` — then `npm run runner:sync`.
4. **Write the spec** at `tests/web/journey-<x>-<area>/<wf>-<slug>.spec.ts`.
   One folder for every category. Category comes from the workflow's `surface`:
   `ui` → `ui`, `calc` → `workflow` (tag it `@Workflow`), `device` → `api` (or
   `workflow` when it also verifies in the UI).
5. **Set `status=automated`** and `enabled=1` on the rows, re-sync, and
   `npm run runner:check`.

`npm run runner:check` fails the build if a row and its spec disagree, so steps 3
and 5 cannot be silently skipped.

## Recordings

`docs/media/` is gitignored — recordings live only on the tester's machine and
are referenced from plans for the human reviewer, not read by tooling. Name new
recordings `docs/media/journey-<x>/<wf>-<slug>.mp4` to match the plan path
(existing files predate this convention and are flat with spaces in the names).
