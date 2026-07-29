# src/pages/webpet — page objects for the migrated web-pet suite

Reserved for the **gradual POM conversion** of `tests/webpet/` (406 lifted
specs, currently page-object-free by design — see
[tests/webpet/README.md](../../../tests/webpet/README.md)).

Ground rules when converting a module:

- Page objects follow this repo's conventions (`<Name>Page.ts` extending
  `BasePage`, locators in the constructor, no selectors in specs) and live here
  — NOT in the framework's shared page folders — so the migrated suite stays
  isolated until a module is fully adopted.
- The converted spec switches from `tests/webpet/fixtures.ts` to
  `src/fixtures/base.fixture.ts` (or a webpet fixture extending it), adopts an
  explicit `testCaseId` annotation, and its row in
  `src/data/webpet/webpetRunnerManager.json` gets `testCaseId` filled in —
  WP-#### ids never renumber.
- Convert only modules that are green/triaged against the 362/18/26 baseline;
  parity first, conventions second.
