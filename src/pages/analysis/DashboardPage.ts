/**
 * @fileoverview The Dashboard shell — `/dashboard` (PET-439).
 *
 * A widget canvas with a palette: boards auto-provision on first visit, widgets
 * are appended from the palette, and the layout round-trips through the
 * server-backed repository.
 *
 * Two things about this screen are worth knowing before changing a locator:
 *
 * - **The palette is always in the DOM.** Closed, the `<aside>` is `w-0` +
 *   `overflow-hidden`, so its children are simply not visible. "Closed" is
 *   therefore asserted as *an item is not visible*, never as the aside being
 *   absent.
 * - **Adding is driven by click, not drag.** The palette's plus button calls the
 *   same `onAdd(def.id)` path the dnd-kit drop invokes, and synthetic DnD
 *   gestures against dnd-kit's PointerSensor are empirically flaky headless. The
 *   click affordance proves the orchestration without driving the DnD library.
 *
 * The board tabs strip (`[data-slot="tabs-list"]`) was removed from the shell —
 * `DashboardTabs` is no longer mounted — so the canvas and its widget cells are
 * the render signals.
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/** LocalStorage key holding the persisted board documents. */
const DASHBOARDS_STORAGE_KEY = 'pt.dashboards.v2';

/**
 * @extends BasePage
 */
export class DashboardPage extends BasePage {
    readonly pageUrl: string = '/dashboard';
    readonly pageTitle: string | RegExp = /.*/;

    /** The widget canvas — the shell's primary render signal. */
    readonly canvas: Locator;
    /** Every widget cell on the active board. */
    readonly widgetCells: Locator;
    /**
     * The time-of-day greeting, e.g. "Good morning, …".
     *
     * Matched by heading level rather than text: the header was redesigned from
     * a date label to a greeting, and the greeting varies by hour and user.
     */
    readonly greeting: Locator;
    /** Opens the palette. Its label flips to Done while open. */
    readonly editWidgetsButton: Locator;
    /** Closes the palette. */
    readonly doneButton: Locator;
    /** The palette aside. Present even when closed — see the class note. */
    readonly palette: Locator;
    /** Palette entries. Not visible while the palette is closed. */
    readonly paletteItems: Locator;

    constructor(page: Page) {
        super(page);

        this.canvas = page.locator('[data-slot="dashboard-canvas"]');
        this.widgetCells = page.locator('[data-slot="widget-cell"]');
        this.greeting = page.getByRole('heading', { level: 2 });
        this.editWidgetsButton = page.getByRole('button', { name: 'Edit Widgets' });
        this.doneButton = page.getByRole('button', { name: 'Done' });
        this.palette = page.getByLabel('Widget palette');
        this.paletteItems = page.locator('[data-slot="palette-item"]');
    }

    /**
     * The first widget's add button.
     *
     * Each palette entry exposes a plus button named `"Add <widget title>"`
     * (`palette.addWidget`, en locale). The aside also holds a single
     * "Close palette" X button, so scoping to the palette and matching `/^Add /`
     * is what separates the two.
     */
    get firstAddWidgetButton(): Locator {
        return this.palette.getByRole('button', { name: /^Add / }).first();
    }

    /**
     * Clear persisted boards before the page loads, so the next navigation hits
     * the auto-create-default-board branch.
     *
     * Per-test isolation: without it these tests are order-dependent. The shared
     * fixture pins `pt.locale` but deliberately does not touch dashboards
     * storage, so each test opts in.
     */
    async clearStoredBoards(): Promise<void> {
        await this.page.context().addInitScript((key: string) => {
            window.localStorage.removeItem(key);
        }, DASHBOARDS_STORAGE_KEY);
    }

    /** Navigate to the dashboard. Plain `goto`, matching the lifted specs. */
    async gotoDashboard(): Promise<void> {
        await this.page.goto(this.pageUrl);
    }
}

export default DashboardPage;
