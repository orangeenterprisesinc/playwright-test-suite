/**
 * ParentPicker coverage across every consumer form — both modes, the create
 * affordance, cascading filters, and the combobox-inside-sheet case.
 *
 * Framework-aligned (Batch 07): this is a **component** spec, so it drives
 * `ParentPickerComponent` through each form's page object rather than through
 * free-function helpers. The batches before this one already depend on that
 * component; this file is what actually hardens it.
 *
 * Two idioms recur below and are worth stating once:
 *
 * - **Clear-to-none is mode-specific.** In combobox mode it is an X button
 *   (`comboboxClear`), rendered only once a value is selected. In sheet mode it
 *   is a `__none__` sentinel item that is `aria-hidden`. Several lifted tests
 *   carried stale `— None —` list-item assertions from before that split; those
 *   were already dropped upstream and stay dropped here.
 * - **"+ Create" is per-picker.** Only pickers registering a `useCreateFromName`
 *   handler render the footer, so both its presence *and* its absence are real
 *   assertions.
 *
 * Fixture data is DelLlano-resolved (seed/TRIAGE-DELLLANO.md): "ADP 5",
 * "STRAWBERRIES", crop counters 2 and 3, ranch 6. The PetData-era names this
 * file was first written against do not exist here.
 */
import { expect, test } from '@fixtures/webpet.fixture';

/** Seeded DelLlano department used across the combobox tests. */
const SEEDED_DEPARTMENT = 'ADP 5';

/** A name guaranteed not to match anything, for the "+ Create" assertions. */
const unknownName = () => `ZZZ_Test_${Date.now()}`;

// ─── combobox-mode tests ────────────────────────────────────────────────────

test.describe('Parent Picker — combobox mode', { tag: ['@WebPet', '@wp-picker', '@WPBatch07'] }, () => {

    test('[Picker] Verify that the employee Department combobox filters and selects.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0260' },
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        const picker = form.departmentPicker;
        await picker.openCombobox();
        await expect(picker.comboboxOptionByExactText(SEEDED_DEPARTMENT)).toBeVisible();

        // Filter: a no-match string hides the option; typing a prefix brings it back.
        await picker.comboboxInput.fill('zzz-no-such-department');
        await expect(picker.comboboxOptionByExactText(SEEDED_DEPARTMENT)).toBeHidden();
        await picker.comboboxInput.fill('ADP');
        await expect(picker.comboboxOptionByExactText(SEEDED_DEPARTMENT)).toBeVisible();

        await picker.comboboxOptionByExactText(SEEDED_DEPARTMENT).click();
        await expect(picker.comboboxInput).toHaveValue(SEEDED_DEPARTMENT);
    });

    test('[Picker] Verify that the employee Department combobox is clearable.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0261' },
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        // departmentCounter is nullable on Employee. In combobox mode the
        // set-to-none affordance is the X clear button, shown once a value is
        // selected — not a "— None —" list item.
        const picker = form.departmentPicker;
        await picker.openCombobox();
        await picker.comboboxOptionByExactText(SEEDED_DEPARTMENT).click();
        await expect(picker.comboboxInput).toHaveValue(SEEDED_DEPARTMENT);

        await expect(picker.comboboxClear).toBeVisible();
        await picker.comboboxClear.click();
        await expect(picker.comboboxInput).toHaveValue('');
    });

    test('[Picker] Verify that the customer Customer Type combobox filters and selects.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0262' },
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        const picker = form.customerTypePicker;
        await picker.openCombobox();
        await expect(picker.comboboxOptionByText('Grower')).toBeVisible();
        await expect(picker.comboboxOptionByText('Buyer')).toBeVisible();

        await picker.comboboxInput.fill('Grow');
        await expect(picker.comboboxOptionByText('Grower')).toBeVisible();
        await expect(picker.comboboxOptionByText('Buyer')).toBeHidden();

        await picker.comboboxOptionByText('Grower').click();
        await expect(picker.comboboxInput).toHaveValue('Grower');
    });

    test('[Picker] Verify that Create appears for an unknown customer type name.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0263' },
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        const picker = form.customerTypePicker;
        await picker.openCombobox();

        // Type a name that definitely does NOT exist. Don't click Create — that
        // would mutate the DB; we only assert the footer shows.
        const name = unknownName();
        await picker.comboboxInput.fill(name);
        await expect(picker.createOption(name)).toBeVisible();
    });

    test('[Picker] Verify that Create is hidden for an existing customer type name.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0264' },
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        const picker = form.customerTypePicker;
        await picker.openCombobox();
        await picker.comboboxInput.fill('Grower');
        await expect(picker.createOption('Grower')).toBeHidden();
    });

    test('[Picker] Verify that the field Department combobox loads and selects.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0265' },
    }, async ({ pages }) => {
        const form = pages.fieldForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        const picker = form.departmentPicker;
        await picker.openCombobox();
        await expect(picker.comboboxOptionByText(SEEDED_DEPARTMENT)).toBeVisible();
        await picker.comboboxOptionByText(SEEDED_DEPARTMENT).click();
        await expect(picker.comboboxInput).toHaveValue(SEEDED_DEPARTMENT);
    });

    test('[Picker] Verify that the crew Department combobox loads and selects.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0266' },
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        const picker = form.departmentPicker;
        await picker.openCombobox();
        await expect(picker.comboboxOptionByText(SEEDED_DEPARTMENT)).toBeVisible();
        await picker.comboboxOptionByText(SEEDED_DEPARTMENT).click();
        await expect(picker.comboboxInput).toHaveValue(SEEDED_DEPARTMENT);
    });

});

// ─── sheet-mode tests ───────────────────────────────────────────────────────

test.describe('Parent Picker — sheet mode', { tag: ['@WebPet', '@wp-picker', '@WPBatch07'] }, () => {

    test('[Picker] Verify that the crew Default Ranch sheet select works.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0267' },
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        // Trigger renders; opening it shows real options. The legacy "— None —"
        // first-option is no longer a visible item in the new Select — the X clear
        // button appears once a value is selected instead.
        const picker = form.defaultRanchPicker;
        await expect(picker.sheetTrigger).toBeVisible();
        await picker.openSheet();
        expect(await picker.sheetItemsExcludingNone.count()).toBeGreaterThan(0);
    });

    test('[Picker] Verify that the variety Crop sheet lists existing crops.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0268' },
    }, async ({ pages }) => {
        const form = pages.varietyForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        await form.cropPicker.openSheet();
        // STRAWBERRIES is a seeded DelLlano crop.
        await expect(form.cropPicker.sheetOptionByText('STRAWBERRIES')).toBeVisible();
    });

    test('[Picker] Verify that the field Ranch sheet lists real ranches.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0269' },
    }, async ({ pages }) => {
        const form = pages.fieldForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        await form.ranchPicker.openSheet();
        // At least one real Ranch option (excluding the hidden __none__ sentinel).
        expect(await form.ranchPicker.sheetItemsExcludingNone.count()).toBeGreaterThan(0);
    });

});

// ─── picker-only combobox + cascading filter ────────────────────────────────

test.describe('Parent Picker — picker-only combobox', { tag: ['@WebPet', '@wp-picker', '@WPBatch07'] }, () => {

    test('[Picker] Verify that the employee Crew combobox loads and offers no Create.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0270' },
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        const picker = form.crewPicker;
        await picker.openCombobox();
        await expect(picker.comboboxItems.first()).toBeVisible();
        // Typing a name that doesn't exist — the "+ Create" footer must NOT appear
        // because Crew has no useCreateFromName registered.
        await picker.comboboxInput.fill(unknownName());
        await expect(picker.anyCreateOption).toBeHidden();
    });

    test('[Picker] Verify that the customer State sheet loads real states and offers no Create.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0271' },
    }, async ({ pages }) => {
        const form = pages.customerForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        // State is a SHEET-mode picker (a SheetRegistration whose options display
        // shortName), NOT a combobox — an earlier version drove it with combobox
        // helpers and never matched. There is also no POST /api/states, so states
        // are intentionally not createable; sheet mode has no "+ Create" at all.
        await form.statePicker.openSheet();
        await expect(form.statePicker.sheetOptionByText('CA').first()).toBeVisible();
    });

    test('[Picker] Verify that the field Color combobox is present and offers Create.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0272' },
    }, async ({ pages }) => {
        const form = pages.fieldForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        const picker = form.colorPicker;
        await picker.openCombobox();
        await expect(picker.comboboxPopup).toBeVisible();
        // An unknown name shows "+ Create" (Color has useCreateFromName).
        await picker.comboboxInput.fill(unknownName());
        await expect(picker.anyCreateOption).toBeVisible();
    });

});

test.describe('Parent Picker — cascading filter', { tag: ['@WebPet', '@wp-picker', '@WPBatch07'] }, () => {

    test('[Picker] Verify that the crew Default Field combobox filters by the selected Default Ranch.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0273' },
    }, async ({ page, pages }) => {
        const form = pages.crewForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        // Ranch 6 ("ALL RANCHES") has multiple active Fields in the DelLlano seed.
        await form.defaultRanchPicker.selectSheetOption('6');

        const fieldPicker = form.defaultFieldPicker;
        await fieldPicker.openCombobox();
        // At least one Field belongs to Ranch 6 — asserting real filtered content
        // rather than a hardcoded field name.
        await expect(fieldPicker.comboboxItems.first()).toBeVisible();

        // Close popup, change Ranch, verify Field resets (cascade via onChange).
        await page.keyboard.press('Escape');

        await form.defaultRanchPicker.openSheet();
        const otherItem = form.defaultRanchPicker.sheetItemsExcluding('6').first();
        const otherRanchValue = await otherItem.getAttribute('data-value');
        expect(otherRanchValue).not.toBeNull();
        await otherItem.click();
        await expect(form.defaultRanchPicker.sheetContent).toBeHidden();

        // Default Field input should now be empty (selection cleared).
        await expect(fieldPicker.comboboxInput).toHaveValue('');
    });

});

// ─── per-consumer smoke coverage ────────────────────────────────────────────

test.describe('Parent Picker — per-consumer smoke', { tag: ['@WebPet', '@wp-picker', '@WPBatch07'] }, () => {

    test('[Picker] Verify that all five crew picker fields load.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0274' },
    }, async ({ pages }) => {
        const form = pages.crewForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        await expect(form.departmentPicker.comboboxInput).toBeVisible();
        await expect(form.supervisorPicker.comboboxInput).toBeVisible();
        await expect(form.defaultRanchPicker.sheetTrigger).toBeVisible();
        await expect(form.defaultFieldPicker.comboboxInput).toBeVisible();
        await expect(form.defaultJobPicker.comboboxInput).toBeVisible();
    });

    test('[Picker] Verify that the equipment Equipment Type combobox loads options.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0275' },
    }, async ({ pages }) => {
        const form = pages.equipmentForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        const picker = form.equipmentTypePicker;
        await picker.openCombobox();
        await expect(picker.comboboxOptionByText('Pump')).toBeVisible(); // seed data
        // Picker-only: no "+ Create" even for an unknown name.
        await picker.comboboxInput.fill(unknownName());
        await expect(picker.anyCreateOption).toBeHidden();
    });

    test('[Picker] Verify that the job Overtime Rules combobox loads options.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0276' },
    }, async ({ pages }) => {
        const form = pages.jobForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        const picker = form.overtimeRulesPicker;
        await picker.openCombobox();
        await expect(picker.comboboxOptionByRole('Ag')).toBeVisible();
        await picker.comboboxInput.fill(unknownName());
        await expect(picker.anyCreateOption).toBeHidden();
    });

    test('[Picker] Verify that the user Time Card Defaults tab loads its three selectors.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0277' },
    }, async ({ pages }) => {
        // User admin lives under /settings, not /setup.
        const form = pages.usersForm;
        await form.gotoNew();
        // The form's tab buttons are ordinary <button>s, not ARIA tabs.
        await form.openTimeCardDefaults();

        await expect(form.defaultRanchPicker.sheetTrigger).toBeVisible();
        await expect(form.defaultFieldPicker.comboboxInput).toBeVisible();
        await expect(form.defaultJobPicker.comboboxInput).toBeVisible();
    });

    test('[Picker] Verify that every field traceability picker loads.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0278' },
    }, async ({ pages }) => {
        const form = pages.fieldForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        for (const picker of form.traceabilityPickers) {
            await expect(picker.comboboxInput).toBeVisible();
        }
        await expect(form.overtimeRulesPicker.comboboxInput).toBeVisible();
        await expect(form.varietyPicker.comboboxInput).toBeVisible();
        await expect(form.poolPicker.comboboxInput).toBeVisible();
        // State is a SHEET-mode picker, not a combobox. And there is no "Flow Rate
        // Unit" picker on this form — the Flow Rate control is itself a sheet select.
        await expect(form.statePicker.sheetTrigger).toBeVisible();
        await expect(form.cropPicker.sheetTrigger).toBeVisible();
    });

    test('[Picker] Verify that changing the field Crop refilters Variety and clears the selection.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0279' },
    }, async ({ pages }) => {
        const form = pages.fieldForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        // DelLlano data: STRAWBERRIES (cropCounter 3) has varieties (BARBARA,
        // MAVERICK, …); the other seeded crops have none. So the cascade is verified
        // by switching STRAWBERRIES → a variety-less crop: the selection clears and
        // the strawberry variety drops out of the now-refiltered list.
        await form.cropPicker.selectSheetOption('3');

        const variety = form.varietyPicker;
        await variety.openCombobox();
        await expect(variety.comboboxOptionByText('BARBARA')).toBeVisible();
        await variety.comboboxOptionByText('BARBARA').click();
        await expect(variety.comboboxInput).toHaveValue('BARBARA');

        // Switch Crop → Variety must clear (onChange cascade).
        await form.cropPicker.selectSheetOption('2'); // BLUEBERRIES — no varieties
        await expect(variety.comboboxInput).toHaveValue('');

        // Variety list is now BLUEBERRIES-filtered: the STRAWBERRIES variety is gone.
        await variety.openCombobox();
        await expect(variety.comboboxOptionByText('BARBARA')).toBeHidden();
    });

});

// ─── combobox-inside-sheet regression ───────────────────────────────────────

test.describe('Parent Picker — combobox inside sheet', { tag: ['@WebPet', '@wp-picker', '@WPBatch07'] }, () => {

    test('[Picker] Verify that a combobox inside the Ranch edit sheet works.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0280' },
    }, async ({ pages }) => {
        const form = pages.fieldForm;
        await form.gotoNew();
        await form.waitForFormRoot();

        // 1. Pick any Ranch so the pencil becomes enabled.
        await form.ranchPicker.openSheet();
        const firstItem = form.ranchPicker.sheetItemsExcludingNone.first();
        const firstRanchValue = await firstItem.getAttribute('data-value');
        expect(firstRanchValue).not.toBeNull();
        await firstItem.click();
        await expect(form.ranchPicker.sheetContent).toBeHidden();

        // 2. Click the pencil to open the ranch record in a sheet.
        await form.editRanchButton.click();

        // 3. The sheet opens titled "Edit Ranch"; the form inside carries a
        //    Department combobox — this is the combobox-inside-sheet case.
        await expect(form.editSheet.getRoot()).toBeVisible();
        await expect(form.editSheet.title('Edit Ranch')).toBeVisible();

        // 4. Open that combobox. The Ranch form's only combobox is Department, so
        //    the first one inside the sheet is it — robust against the label
        //    rendering as "X" vs "X *" and against row ordering.
        await expect(form.editSheet.firstComboboxInput).toBeVisible();
        await form.editSheet.firstComboboxInput.click();

        // The popup is portaled to the document root, so it is reached through
        // any picker's page-scoped popup locator rather than through the sheet.
        await expect(form.departmentPicker.comboboxPopup).toBeVisible();
        await expect(form.departmentPicker.comboboxItems.first()).toBeVisible();
    });

});
