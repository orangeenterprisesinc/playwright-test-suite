/**
 * @fileoverview Department create/edit form — `/setup/departments/{new,:id}`.
 *
 * Three controls migrated off native `<select>`/`<input>` and are addressed by
 * id rather than role, matching the lifted spec:
 *   `#active`         → ActiveField Switch (`role=switch`, in the page header)
 *   `#firstDayofWeek` → shadcn Select (SelectTrigger, `role=combobox` button)
 *   `#crewRequired`   → shadcn Checkbox (`role=checkbox` button)
 *
 * On the edit form Name, Code and Export Identifier are readonly while those
 * three stay editable — the read-only set is wider here than on Job Group.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetFormPage } from '../WebpetFormPage';

/**
 * @extends WebpetFormPage
 */
export class DepartmentFormPage extends WebpetFormPage {
    /** Readonly once the record exists. */
    readonly codeInput: Locator;
    /** shadcn Select trigger, not a native `<select>`. */
    readonly firstDayOfWeekSelect: Locator;
    /** shadcn Checkbox button, not a native `<input type=checkbox>`. */
    readonly crewRequiredCheckbox: Locator;
    /** Shown when the id in the URL does not resolve. */
    readonly notFoundMessage: Locator;
    /**
     * The crew-required switch's `<label>`.
     *
     * Clicked instead of the switch itself: base-ui puts `id="crewRequired"` on a
     * hidden native input, and the visible button responds to a label click via
     * standard HTML association. This is the reliable way to dirty the form
     * without knowing the generated id of the visible control.
     */
    readonly crewRequiredLabel: Locator;

    constructor(page: Page) {
        super(page, { listUrl: '/setup/departments', entity: 'Department' });

        this.crewRequiredLabel = page.locator('label[for="crewRequired"]');

        this.codeInput = page.locator('input#code');
        this.firstDayOfWeekSelect = page.locator('#firstDayofWeek');
        this.crewRequiredCheckbox = page.locator('#crewRequired');
        this.notFoundMessage = page.locator('text=Department not found.');
    }
}

export default DepartmentFormPage;
