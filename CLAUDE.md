# playwright-test-suite

Two automation domains, one orchestration layer: the **Web-PET** E2E suite
(`tests/webpet/`) and **User Journey** automation from the PET-Tiger workflow
catalog (`tests/web/`, `test-plans/`).

All Playwright-related tasks follow the multi-agent orchestration workflow
(routing → Planner → Generator → execution → Healer → PR → CI):

@.claude/PLAYWRIGHT_AGENT_WORKFLOW.md

Domain knowledge lives in `.claude/profiles/WEBPET.md` and
`.claude/profiles/JOURNEY.md` — the workflow loads the right one per task; do
not load both by default.
