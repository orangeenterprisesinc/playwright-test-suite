/**
 * @fileoverview Lightweight API mock server for stubbing HTTP routes on a
 * `Page` — register stubs up front, then activate them all at once.
 *
 * For one-off route mocks, prefer the free functions in
 * {@link ../utils/networkHelper}; reach for `ApiMockServer` when a test
 * needs to declare a set of stubs together and apply/clear them as a unit.
 *
 * @module utils/apiMockServer
 */
import type { Page } from '@playwright/test';

export interface StubResponse {
    status?: number;
    body?: unknown;
    headers?: Record<string, string>;
}

interface Stub {
    method: string;
    url: string | RegExp;
    response: StubResponse;
}

export class ApiMockServer {
    private readonly stubs: Stub[] = [];

    /** Registers a stub; call {@link applyTo} to activate it on a page. */
    stub(method: string, url: string | RegExp, response: StubResponse): void {
        this.stubs.push({ method: method.toUpperCase(), url, response });
    }

    /** Applies every registered stub as a route handler on `page`. */
    async applyTo(page: Page): Promise<void> {
        for (const { method, url, response } of this.stubs) {
            await page.route(url, async (route) => {
                if (route.request().method() !== method) {
                    await route.fallback();
                    return;
                }
                await route.fulfill({
                    status: response.status ?? 200,
                    headers: response.headers,
                    contentType: response.headers?.['content-type'] ?? 'application/json',
                    body: typeof response.body === 'string' ? response.body : JSON.stringify(response.body ?? {}),
                });
            });
        }
    }

    /** Clears all registered stubs (does not remove routes already applied to a page). */
    clear(): void {
        this.stubs.length = 0;
    }
}
