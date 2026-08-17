/**
 * @fileoverview Teardown-race guard for `page.route` / `context.route` handlers.
 *
 * `webpet.fixture` swallowed the "…has been closed" error that Playwright throws
 * when a context tears down while a `route.continue()`, `route.fetch()` or
 * `route.fallback()` is still in flight. `base.fixture` deliberately does not —
 * a global swallow hides real failures.
 *
 * So specs relocated out of `tests/webpet/` must handle it themselves. One site
 * can carry an inline `try/catch` (see the batch-8 A7-044 relocation); the export
 * and reconcile specs register more than twenty handlers between them, and
 * copying the same six lines that many times is how a subtly different copy gets
 * introduced.
 *
 * Wrapping at the **registration** boundary rather than around each network call
 * is deliberate: it also covers `route.fetch()` and the
 * `fulfill({ response })`-after-fetch shape, which a `continue()`-only wrapper
 * would miss, and it treats `route.fallback()` as the real round trip it is when
 * no other handler matches.
 *
 * This stays opt-in per registration. It is not re-added to `base.fixture`,
 * because the framework's decision to surface these errors globally is correct —
 * only a handler that genuinely races teardown should be exempt.
 */

/** True for the context-closed error Playwright raises during teardown. */
export function isTeardownRace(error: unknown): boolean {
    return /has been closed/i.test(String(error));
}

/**
 * Wrap a route handler so a teardown race is swallowed and everything else
 * rethrown.
 *
 * ```typescript
 * await page.route('**\/api\/foo', guardTeardownRace(async (route) => {
 *     await route.continue();
 * }));
 * ```
 */
export function guardTeardownRace<A extends unknown[]>(
    handler: (...args: A) => Promise<void>,
): (...args: A) => Promise<void> {
    return async (...args: A) => {
        try {
            await handler(...args);
        } catch (error) {
            if (!isTeardownRace(error)) throw error;
        }
    };
}
