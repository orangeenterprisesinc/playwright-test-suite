# Specs — workflow plans

One markdown plan per catalog workflow, written **before** the spec. The plan is
where the catalog's steps and the tester's recording get reconciled into something
writable: which steps are automatable, which screens are involved, what data has a
uniqueness rule, what has to be cleaned up.

```
specs/
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
| Recording | `Testing video/journey-a/a01-user-setup.mp4` |
| Plan | `specs/journey-a/a01-user-setup.md` |
| Spec | `tests/ui/journey-a-setup/a01-user-setup.spec.ts` |
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
4. **Write the spec** at `tests/<category>/journey-<x>-<area>/<wf>-<slug>.spec.ts`.
   Category comes from the workflow's `surface`: `ui` → `tests/ui/`, `device` →
   `tests/api/`, `calc` → `tests/workflow/`.
5. **Set `status=automated`** and `enabled=1` on the rows, re-sync, and
   `npm run runner:check`.

`npm run runner:check` fails the build if a row and its spec disagree, so steps 3
and 5 cannot be silently skipped.
