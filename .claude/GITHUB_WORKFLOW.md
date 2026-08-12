# GitHub Workflow — git, PR, and CI loop

Part of the orchestration flow in [PLAYWRIGHT_AGENT_WORKFLOW.md](PLAYWRIGHT_AGENT_WORKFLOW.md).

Use the GitHub MCP for GitHub operations when it is connected; in the current setup it
is not, so the `gh` CLI is the mechanism for PR creation/updates, Actions/CI
inspection, and workflow-failure investigation.

## Git workflow (after implementation and validation succeed)

1. Work on a dedicated feature/fix branch off `origin/main`
   (`fix/…`, `test/…`, `docs/…` — match existing branch naming).
2. Review the final diff.
3. Ensure there are no unrelated modifications. Never commit local noise:
   `.vscode/settings.json`, `inviestgate/`, anything under `artifacts/bug-evidence/`
   or other gitignored evidence.
4. Commit with a conventional message matching repo history
   (`fix(webpet): …`, `docs: …`, `test(webpet): …`).
5. Push the branch.
6. Create or update the PR targeting `main`.

Do not merge the Pull Request automatically.

## GitHub CI loop

```text
PR → GitHub CI → GREEN → Human review → Human merge
```

If CI fails:

```text
GitHub CI failure
 ↓
Orchestrator retrieves failure information (gh run view / logs / report artifact)
 ↓
Playwright Healer investigates (contract: PLAYWRIGHT_AGENT_WORKFLOW.md §4 + domain profile)
 ↓
Fix → local validation → commit → push → CI again
```

Continue this loop only while the failure is reasonably actionable. Do not repeatedly
retry without diagnosing. A red caused by the environment (dev session loss, staging
deploy lag) is reported as such, not "fixed" in test code.

## Human approval boundary

The following require human control unless explicitly authorized:

* Merge Pull Request
* Force push
* Delete important branches
* Change repository settings, secrets, or protected-branch rules
* Unrelated architectural changes

```text
Claude:  Analyze → Implement → Test → Heal → Commit → Push → PR → CI
Human:   Review → Merge
```
