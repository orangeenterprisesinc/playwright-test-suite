/**
 * @fileoverview Network mocking, interception, and recording helpers for Playwright.
 *
 * Wraps Playwright's route/intercept APIs into simple, reusable functions for
 * mocking responses, blocking resources, capturing traffic, simulating latency,
 * and recording/replaying HAR files.
 *
 * @module utils/networkHelper
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { mockRoute, blockResources, captureRequests } from '@utils/networkHelper';
 *
 * await mockRoute(page, '\/api/users', { body: [{ id: 1 }] });
 * await blockResources(page, ['image', 'font']);
 * const reqs = await captureRequests(page, () => page.click('#submit'));
 * ```
 */
import { Page, Request, Response } from '@playwright/test';
import { Logger } from './logger';
import type { MockRoute } from '../types';

const logger = new Logger('NetworkHelper');

/**
 * Mocks a single route, fulfilling matching requests with the supplied response.
 *
 * @param {Page} page - Playwright page
 * @param {string | RegExp} urlPattern - URL pattern to intercept
 * @param {object} response - Response options
 * @param {number} [response.status=200] - HTTP status code
 * @param {unknown} [response.body] - Response body (auto-serialised to JSON unless string)
 * @param {Record<string, string>} [response.headers] - Custom response headers
 * @param {string} [response.contentType='application/json'] - Content-Type header
 */
export async function mockRoute(
    page: Page,
    urlPattern: string | RegExp,
    response: {
        status?: number;
        body?: unknown;
        headers?: Record<string, string>;
        contentType?: string;
    },
): Promise<void> {
    await page.route(urlPattern, async (route) => {
        logger.debug(`Mocking route: ${route.request().url()}`);

        await route.fulfill({
            status: response.status || 200,
            contentType: response.contentType || 'application/json',
            headers: response.headers,
            body: typeof response.body === 'string' ? response.body : JSON.stringify(response.body),
        });
    });
}


/**
 * Registers multiple route mocks from an array of {@link MockRoute} definitions.
 *
 * @param {Page} page - Playwright page
 * @param {MockRoute[]} routes - Array of route mocking definitions
 */
export async function mockRoutes(page: Page, routes: MockRoute[]): Promise<void> {
    for (const route of routes) {
        await mockRoute(page, route.url, {
            status: route.status,
            body: route.body,
            headers: route.headers,
        });
    }
}


/**
 * Blocks requests for the specified resource types (images, stylesheets, etc.).
 *
 * @param {Page} page - Playwright page
 * @param {Array<'image'|'stylesheet'|'font'|'script'|'media'>} resourceTypes - Types to block
 */
export async function blockResources(
    page: Page,
    resourceTypes: Array<'image' | 'stylesheet' | 'font' | 'script' | 'media'>,
): Promise<void> {
    await page.route('**/*', async (route) => {
        const request = route.request();
        if (resourceTypes.includes(request.resourceType() as any)) {
            logger.debug(`Blocking resource: ${request.url()}`);
            await route.abort();
        } else {
            await route.continue();
        }
    });
}


/**
 * Intercepts matching requests and modifies headers or body before continuing.
 *
 * @param {Page} page - Playwright page
 * @param {string | RegExp} urlPattern - URL pattern to intercept
 * @param {(request: Request) => object} modifier - Function returning header/body overrides
 */
export async function interceptRequest(
    page: Page,
    urlPattern: string | RegExp,
    modifier: (request: Request) => { headers?: Record<string, string>; postData?: string },
): Promise<void> {
    await page.route(urlPattern, async (route) => {
        const request = route.request();
        const modifications = modifier(request);

        await route.continue({
            headers: modifications.headers,
            postData: modifications.postData,
        });
    });
}


/**
 * Waits for a request matching the URL pattern.
 *
 * @param {Page} page - Playwright page
 * @param {string | RegExp} urlPattern - URL pattern
 * @param {object} [options] - Timeout options
 * @returns {Promise<Request>} The matched request
 */
export async function waitForRequest(
    page: Page,
    urlPattern: string | RegExp,
    options?: { timeout?: number },
): Promise<Request> {
    return await page.waitForRequest(urlPattern, options);
}


/**
 * Waits for a response matching the URL pattern.
 *
 * @param {Page} page - Playwright page
 * @param {string | RegExp} urlPattern - URL pattern
 * @param {object} [options] - Timeout options
 * @returns {Promise<Response>} The matched response
 */
export async function waitForResponse(
    page: Page,
    urlPattern: string | RegExp,
    options?: { timeout?: number },
): Promise<Response> {
    return await page.waitForResponse(urlPattern, options);
}


/**
 * Waits until the page reaches the `networkidle` load state.
 *
 * @param {Page} page - Playwright page
 * @param {number} [timeout] - Maximum wait time in milliseconds
 */
export async function waitForNetworkIdle(page: Page, timeout?: number): Promise<void> {
    await page.waitForLoadState('networkidle', { timeout });
}


/**
 * Captures all outgoing requests emitted while `action` executes.
 *
 * @param {Page} page - Playwright page
 * @param {() => Promise<void>} action - Action to perform during capture
 * @returns {Promise<Request[]>} Captured requests
 */
export async function captureRequests(page: Page, action: () => Promise<void>): Promise<Request[]> {
    const requests: Request[] = [];

    const handler = (request: Request) => {
        requests.push(request);
    };

    page.on('request', handler);
    await action();
    page.off('request', handler);

    return requests;
}


/**
 * Captures all incoming responses received while `action` executes.
 *
 * @param {Page} page - Playwright page
 * @param {() => Promise<void>} action - Action to perform during capture
 * @returns {Promise<Response[]>} Captured responses
 */
export async function captureResponses(
    page: Page,
    action: () => Promise<void>,
): Promise<Response[]> {
    const responses: Response[] = [];

    const handler = (response: Response) => {
        responses.push(response);
    };

    page.on('response', handler);
    await action();
    page.off('response', handler);

    return responses;
}

/**
 * Adds artificial latency to every network request.
 *
 * @param {Page} page - Playwright page
 * @param {number} [latencyMs=1000] - Delay in milliseconds
 */
export async function simulateSlowNetwork(page: Page, latencyMs: number = 1000): Promise<void> {
    await page.route('**/*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, latencyMs));
        await route.continue();
    });
}

/** Sets the browser context to offline mode. */
export async function goOffline(page: Page): Promise<void> {
    await page.context().setOffline(true);
    logger.info('Network set to offline');
}


/** Restores the browser context to online mode. */
export async function goOnline(page: Page): Promise<void> {
    await page.context().setOffline(false);
    logger.info('Network set to online');
}

/**
 * Mocks a route to return an error response (e.g. HTTP 500).
 *
 * @param {Page} page - Playwright page
 * @param {string | RegExp} urlPattern - URL pattern
 * @param {number} [statusCode=500] - HTTP status code
 * @param {string} [errorMessage='Internal Server Error'] - Error message in the body
 */
export async function mockApiError(
    page: Page,
    urlPattern: string | RegExp,
    statusCode: number = 500,
    errorMessage: string = 'Internal Server Error',
): Promise<void> {
    await mockRoute(page, urlPattern, {
        status: statusCode,
        body: { error: errorMessage, status: statusCode },
    });
}


/**
 * Records network traffic to a HAR file while executing the given action.
 *
 * @param {Page} page - Playwright page
 * @param {string} harPath - File path for the recorded HAR
 * @param {() => Promise<void>} action - Action to perform during recording
 */
export async function recordHar(
    page: Page,
    harPath: string,
    action: () => Promise<void>,
): Promise<void> {
    // Start HAR recording
    await page.routeFromHAR(harPath, { update: true });

    // Perform action
    await action();

    logger.info(`HAR recorded to: ${harPath}`);
}


/**
 * Replays previously recorded network traffic from a HAR file.
 *
 * @param {Page} page - Playwright page
 * @param {string} harPath - Path to the HAR file
 */
export async function replayFromHar(page: Page, harPath: string): Promise<void> {
    await page.routeFromHAR(harPath, { update: false });
    logger.info(`Replaying from HAR: ${harPath}`);
}


export default {
    mockRoute,
    mockRoutes,
    blockResources,
    interceptRequest,
    waitForRequest,
    waitForResponse,
    waitForNetworkIdle,
    captureRequests,
    captureResponses,
    simulateSlowNetwork,
    goOffline,
    goOnline,
    mockApiError,
    recordHar,
    replayFromHar,
};
