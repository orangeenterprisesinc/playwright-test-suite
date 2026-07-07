/**
 * @fileoverview Lightweight API mock server for intercepting and stubbing
 * network requests during Playwright tests.
 *
 * Registers route handlers via {@link ApiMockServer.registerRoute}, then
 * activates interception on a Playwright {@link Page} with {@link ApiMockServer.activate}.
 *
 * @module utils/apiMockServer
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { ApiMockServer } from '@utils/apiMockServer';
 *
 * const mock = new ApiMockServer();
 * mock.registerRoute({ method: 'GET', path: '/api/users', response: { status: 200, body: [] } });
 * await mock.activate(page);
 * // ... run test ...
 * expect(mock.verifyRequestMade('GET', '/api/users')).toBe(true);
 * await mock.deactivate(page);
 * ```
 */
import {Page, Route} from '@playwright/test';

/**
 * Shape of a mocked HTTP response.
 *
 * @interface MockResponse
 * @property {number} status - HTTP status code
 * @property {*} body - Response body (serialised to JSON)
 * @property {Record<string, string>} [headers] - Additional response headers
 * @property {number} [delay] - Artificial delay before responding (ms)
 */
export interface MockResponse {
    status: number;
    body: any;
    headers?: Record<string, string>;
    delay?: number;
}

/**
 * Definition of a mock route to intercept.
 *
 * @interface MockRoute
 * @property {string} method - HTTP method to match (e.g., 'GET', 'POST')
 * @property {string | RegExp} path - URL path or pattern to match
 * @property {MockResponse | Function} response - Static response or factory function
 */
export interface MockRoute {
    method: string;
    path: string | RegExp;
    response: MockResponse | ((request: any) => MockResponse);
}

/**
 * API mock server that intercepts Playwright network requests and returns
 * configurable stub responses.
 *
 * @class ApiMockServer
 */
export class ApiMockServer {
    /** @private Registered mock routes */
    private mockRoutes: MockRoute[] = [];
    /** @private Log of all intercepted requests */
    private interceptedRequests: any[] = [];
    /** @private Whether route interception is currently active */
    private isActive: boolean = false;

    /**
     * Registers a single mock route.
     * @param {MockRoute} route - The route definition to register
     */
    registerRoute(route: MockRoute): void {
        this.mockRoutes.push(route);
    }

    /**
     * Registers multiple mock routes at once.
     * @param {MockRoute[]} routes - Array of route definitions
     */
    registerRoutes(routes: MockRoute[]): void {
        routes.forEach((route) => this.registerRoute(route));
    }

    /**
     * Activates route interception on the given page.
     * Matched requests are fulfilled with mock responses; unmatched ones pass through.
     *
     * @param {Page} page - The Playwright page to intercept
     * @returns {Promise<void>}
     */
    async activate(page: Page): Promise<void> {
        if (this.isActive) return;

        await page.route('**/*', async (route: Route) => {
            const request = route.request();
            const matchedRoute = this.findMatchingRoute(request.method(), request.url());

            if (matchedRoute) {
                this.interceptedRequests.push({
                    method: request.method(),
                    url: request.url(),
                    timestamp: new Date(),
                });

                const mockResponse =
                    typeof matchedRoute.response === 'function'
                        ? matchedRoute.response(request)
                        : matchedRoute.response;

                // Apply delay if specified
                if (mockResponse.delay) {
                    await new Promise((resolve) => setTimeout(resolve, mockResponse.delay));
                }

                await route.fulfill({
                    status: mockResponse.status,
                    body: JSON.stringify(mockResponse.body),
                    headers: {
                        'Content-Type': 'application/json',
                        ...mockResponse.headers,
                    },
                });
            } else {
                await route.continue();
            }
        });

        this.isActive = true;
    }

    /**
     * Deactivates route interception on the given page.
     * @param {Page} page - The Playwright page
     * @returns {Promise<void>}
     */
    async deactivate(page: Page): Promise<void> {
        if (!this.isActive) return;

        await page.unroute('**/*');
        this.isActive = false;
    }

    /** Returns all intercepted requests. */
    getInterceptedRequests(): any[] {
        return this.interceptedRequests;
    }

    /**
     * Filters intercepted requests by HTTP method.
     * @param {string} method - HTTP method (e.g., 'GET')
     * @returns {any[]} Matching intercepted requests
     */
    getRequestsByMethod(method: string): any[] {
        return this.interceptedRequests.filter((req) => req.method === method.toUpperCase());
    }

    /**
     * Filters intercepted requests by URL path substring.
     * @param {string} path - URL substring to match
     * @returns {any[]} Matching intercepted requests
     */
    getRequestsByPath(path: string): any[] {
        return this.interceptedRequests.filter((req) => req.url.includes(path));
    }

    /** Clears the intercepted requests log. */
    clearInterceptedRequests(): void {
        this.interceptedRequests = [];
    }

    /** Removes all registered mock routes. */
    clearRoutes(): void {
        this.mockRoutes = [];
    }

    /** Returns all registered mock routes. */
    getAllRoutes(): MockRoute[] {
        return this.mockRoutes;
    }

    /** Returns the total number of intercepted requests. */
    getRequestCount(): number {
        return this.interceptedRequests.length;
    }

    /**
     * Returns the count of intercepted requests for a specific HTTP method.
     * @param {string} method - HTTP method
     * @returns {number} Request count
     */
    getRequestCountByMethod(method: string): number {
        return this.getRequestsByMethod(method).length;
    }

    /**
     * Verifies that at least one request was intercepted matching method and path.
     * @param {string} method - HTTP method
     * @param {string} path - URL path substring
     * @returns {boolean} `true` if a matching request was found
     */
    verifyRequestMade(method: string, path: string): boolean {
        return this.interceptedRequests.some(
            (req) => req.method === method.toUpperCase() && req.url.includes(path),
        );
    }

    /**
     * Verifies the exact number of intercepted requests matching method and path.
     * @param {string} method - HTTP method
     * @param {string} path - URL path substring
     * @param {number} expectedCount - Expected request count
     * @returns {boolean} `true` if counts match
     */
    verifyRequestCount(method: string, path: string, expectedCount: number): boolean {
        const count = this.interceptedRequests.filter(
            (req) => req.method === method.toUpperCase() && req.url.includes(path),
        ).length;

        return count === expectedCount;
    }

    /** Resets all routes, intercepted requests, and deactivation state. */
    reset(): void {
        this.mockRoutes = [];
        this.interceptedRequests = [];
        this.isActive = false;
    }


    /**
     * Finds the first registered route matching the given method and URL.
     * @param {string} method - HTTP method
     * @param {string} url - Full request URL
     * @returns {MockRoute | undefined} Matching route or `undefined`
     * @private
     */
    private findMatchingRoute(method: string, url: string): MockRoute | undefined {
        return this.mockRoutes.find((route) => {
            const methodMatches = route.method.toUpperCase() === method.toUpperCase();
            const pathMatches =
                typeof route.path === 'string' ? url.includes(route.path) : route.path.test(url);

            return methodMatches && pathMatches;
        });
    }
}
