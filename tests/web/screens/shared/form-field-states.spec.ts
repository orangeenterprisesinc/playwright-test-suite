// spec: test-plans/screens/shared.md
// seed: tests/seed.spec.ts

/**
 * Exercises the shared dirty + error border contract (PET-16): every field
 * primitive inside a FormProvider auto-renders `data-dirty="true"` +
 * yellow-green `border-warning/40` when dirty, and `aria-invalid="true"` +
 * `border-destructive` + ring when invalid. Driven by `useFieldFormState(name)`
 * consumed by Input, Textarea, Label, Select (via root-name propagated through
 * context), Combobox, Switch, Checkbox, RadioGroup, ColorPickerInput, and
 * ParentPicker.
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/screens/shared.md` |
 * | Runner rows | `src/data/runner/screens.csv` → `SCR-139`…`SCR-144` |
 *
 * Relocated from `tests/webpet/form-field-states.spec.ts` (WP-0207…WP-0212).
 * Every assertion below is the one that spec carried, in the same order and the
 * same describe; what changed is the fixture (`base.fixture`), the id and tag
 * vocabulary, and `beforeAll`/`afterAll` moving from webpet's `request` fixture
 * to `sessionApi`.
 *
 * Stable fixtures used:
 *   - a factory-created Crew (see beforeAll) — edit-page dirty checks
 *   - /setup/crews/new     — new-page error checks (name required, no locked fields)
 *
 * base-ui splits Switch and Checkbox so `id="<field>"` lands on a hidden input
 * while the visible control carries the state attributes; the page-object
 * helpers used below (`switchFor`, `checkboxFor`, `colorPickerTrigger`) encode
 * the `aria-labelledby` link that is the stable way in.
 */
import { expect, test } from '@fixtures/base.fixture';
import { ensureCrew, deleteCrew, type EnsuredCrew } from '@data/generated/data-factory';

// This file owns its own Crew (created via the API) for the edit-page dirty
// checks, instead of the shared hardcoded "Crew 01" / id=1 row — so it can run
// in parallel with other crew-touching files without colliding. See
// data-factory.ts.
let crew: EnsuredCrew;

test.beforeAll(async ({ sessionApi }) => {
    crew = await ensureCrew(sessionApi);
});

test.afterAll(async ({ sessionApi }) => {
    if (crew) await deleteCrew(sessionApi, crew.id);
});

const DIRTY = 'true';

test.describe('Field state — dirty + error borders', { tag: ['@Screens', '@Shared'] }, () => {

    test('[Form State] Verify that an Input goes clean to dirty on edit and invalid on clear.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-139' },
            { type: 'requirement', description: 'SCR-R160|SCR-R161' },
        ],
    }, async ({ pages }) => {
        const form = pages.crewForm;
        // Dirty path — use an editable Input on the edit page (shortName is not locked)
        await form.gotoEdit(crew.id);
        await expect(form.shortNameInput).toBeVisible();
        await expect(form.shortNameInput).not.toHaveAttribute('data-dirty', DIRTY);

        await form.shortNameInput.fill('mutated');
        await form.shortNameInput.blur();
        await expect(form.shortNameInput).toHaveAttribute('data-dirty', DIRTY);

        // Error path — name is required; clear it and trigger validation on the
        // new-crew page where it isn't locked.
        await form.gotoNew();
        await expect(form.nameInput).toBeVisible();
        await expect(form.nameInput).not.toHaveAttribute('aria-invalid', 'true');

        await form.nameInput.fill('temp');
        await form.nameInput.fill('');
        await form.nameInput.blur();
        // onBlur validation (mode: 'onBlur') runs the zod resolver on blur and marks
        // the empty required field aria-invalid immediately — no submit needed. (The
        // old approach clicked Save to "submit", but FormFooter correctly disables Save
        // while invalid, so that click hung on a permanently-disabled button.)
        await expect(form.nameInput).toHaveAttribute('aria-invalid', 'true');
    });

    test('[Form State] Verify that a Switch goes clean to dirty after a toggle.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-140' },
            { type: 'requirement', description: 'SCR-R160' },
        ],
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoEdit(crew.id);
        // base-ui splits the switch: id="<field>" is on a hidden <input>; the visible
        // switch (which carries data-dirty) links to it via aria-labelledby.
        //
        // Was workCrewInGrouping — that field became a 3-state Select (None/First/Last)
        // in web-pet, so it has no switch to toggle. timeEmployeesIncluded is still a
        // real boolean Switch on this same view, which is what this test is about.
        const toggle = form.switchFor('timeEmployeesIncluded');
        await expect(toggle).toBeVisible();
        await expect(toggle).not.toHaveAttribute('data-dirty', DIRTY);

        await toggle.click();
        await expect(toggle).toHaveAttribute('data-dirty', DIRTY);
    });

    test('[Form State] Verify that a Checkbox goes clean to dirty after a toggle.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-141' },
            { type: 'requirement', description: 'SCR-R160' },
        ],
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoEdit(crew.id);
        // base-ui splits the checkbox: id="includeInTransfer" is on a hidden <input>;
        // the visible checkbox (which carries data-dirty) links via aria-labelledby.
        const checkbox = form.checkboxFor('includeInTransfer');
        await expect(checkbox).toBeVisible();
        await expect(checkbox).not.toHaveAttribute('data-dirty', DIRTY);

        await checkbox.click();
        await expect(checkbox).toHaveAttribute('data-dirty', DIRTY);
    });

    test('[Form State] Verify that a combobox-mode ParentPicker reflects dirty on its input.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-142' },
            { type: 'requirement', description: 'SCR-R160' },
        ],
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoEdit(crew.id);
        const picker = form.departmentPicker;
        await expect(picker.comboboxInput).toBeVisible();
        await expect(picker.comboboxInput).not.toHaveAttribute('data-dirty', DIRTY);

        // Pick any option different from the current value. Opens popup, clicks
        // the first item — guaranteed to mark the RHF field dirty even if it
        // happens to match.
        await picker.comboboxInput.click();
        await expect(picker.comboboxPopup).toBeVisible();
        await picker.comboboxItemAt(0).click();
        // Selection closes the popup and updates the input; if the picked value
        // matched the starting value we toggle once more to guarantee dirty.
        if ((await picker.comboboxInput.getAttribute('data-dirty')) !== DIRTY) {
            await picker.comboboxInput.click();
            await picker.comboboxItemAt(1).click();
        }
        await expect(picker.comboboxInput).toHaveAttribute('data-dirty', DIRTY);
    });

    test('[Form State] Verify that a sheet-mode ParentPicker reflects dirty on its trigger.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-143' },
            { type: 'requirement', description: 'SCR-R160' },
        ],
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoEdit(crew.id);
        const trigger = form.defaultRanchTrigger;
        await expect(trigger).toBeVisible();
        await expect(trigger).not.toHaveAttribute('data-dirty', DIRTY);

        await trigger.click();
        // Pick an option that is NOT the currently-selected one — Default Ranch defaults
        // to "— None —" (data-value="__none__", aria-selected, aria-hidden as the first
        // item), and re-selecting the current value doesn't dirty the field (nor is the
        // aria-hidden current option reliably clickable). Filter to a real, unselected option.
        await form.defaultRanchPicker.sheetOptionUnselected.click();
        await expect(trigger).toHaveAttribute('data-dirty', DIRTY);
    });

    test('[Form State] Verify that a ColorPickerInput goes clean to dirty after a colour pick.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-144' },
            { type: 'requirement', description: 'SCR-R160' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.crewForm;
        await form.gotoEdit(crew.id);
        // ColorPickerInput's PopoverTrigger is a <button> with border-input on it.
        // Scoped by the nearby Label text "Badge Color".
        const trigger = form.colorPickerTrigger('Badge Color');
        await expect(trigger).toBeVisible();
        await expect(trigger).not.toHaveAttribute('data-dirty', DIRTY);

        await trigger.click();
        // Preset grid has 20 swatches; click one to set a new color.
        await form.colorSwatches.first().click();
        // Close the popover so the trigger is the stable subject for assertions.
        await page.keyboard.press('Escape');
        await expect(trigger).toHaveAttribute('data-dirty', DIRTY);
    });

});
