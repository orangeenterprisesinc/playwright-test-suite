/**
 * @fileoverview Network mocking, interception, and recording helpers for Playwright.
 * @module utils/networkHelper
 */
import { Page, Request, Response } from '@playwright/test';
import { Logger } from './logger';
import type { MockRoute } from '../types';

const logger = new Logger('NetworkHelper');

export async function mockRoute(
    page: Page,
    urlPattern: string | RegExp,
    response: { status?: number; body?: unknown; headers?: Record<string, string>; contentType?: string },
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

export async function mockRoutes(page: Page, routes: MockRoute[]): Promise<void> {
    for (const route of routes) {
        await mockRoute(page, route.url, { status: route.status, body: route.body, headers: route.headers });
    }
}

export async function blockResources(
    page: Page,
    resourceTypes: Array<'image' | 'stylesheet' | 'font' | 'script' | 'media'>,
): Promise<void> {
    await page.route('**/*', async (route) => {
        const request = route.request();
        if (resourceTypes.includes(request.resourceType() as 'image' | 'stylesheet' | 'font' | 'script' | 'media')) {
            logger.debug(`Blocking resource: ${request.url()}`);
            await route.abort();
        } else {
            await route.continue();
        }
    });
}

export async function interceptRequest(
    page: Page,
    urlPattern: string | RegExp,
    modifier: (request: Request) => { headers?: Record<string, string>; postData?: string },
): Promise<void> {
    await page.route(urlPattern, async (route) => {
        const modifications = modifier(route.request());
        await route.continue({ headers: modifications.headers, postData: modifications.postData });
    });
}

export async function waitForRequest(page: Page, urlPattern: string | RegExp, options?: { timeout?: number }): Promise<Request> {
    return page.waitForRequest(urlPattern, options);
}

export async function waitForResponse(page: Page, urlPattern: string | RegExp, options?: { timeout?: number }): Promise<Response> {
    return page.waitForResponse(urlPattern, options);
}

export async function waitForNetworkIdle(page: Page, timeout?: number): Promise<void> {
    await page.waitForLoadState('networkidle', { timeout });
}

/** Captures every request emitted while `action` executes. */
export async function captureRequests(page: Page, action: () => Promise<void>): Promise<Request[]> {
    const requests: Request[] = [];
    const handler = (request: Request) => requests.push(request);
    page.on('request', handler);
    await action();
    page.off('request', handler);
    return requests;
}

/** Captures every response received while `action` executes. */
export async function captureResponses(page: Page, action: () => Promise<void>): Promise<Response[]> {
    const responses: Response[] = [];
    const handler = (response: Response) => responses.push(response);
    page.on('response', handler);
    await action();
    page.off('response', handler);
    return responses;
}

export async function simulateSlowNetwork(page: Page, latencyMs: number = 1000): Promise<void> {
    await page.route('**/*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, latencyMs));
        await route.continue();
    });
}

export async function goOffline(page: Page): Promise<void> {
    await page.context().setOffline(true);
    logger.info('Network set to offline');
}

export async function goOnline(page: Page): Promise<void> {
    await page.context().setOffline(false);
    logger.info('Network set to online');
}

export async function mockApiError(
    page: Page,
    urlPattern: string | RegExp,
    statusCode: number = 500,
    errorMessage: string = 'Internal Server Error',
): Promise<void> {
    await mockRoute(page, urlPattern, { status: statusCode, body: { error: errorMessage, status: statusCode } });
}

export async function recordHar(page: Page, harPath: string, action: () => Promise<void>): Promise<void> {
    await page.routeFromHAR(harPath, { update: true });
    await action();
    logger.info(`HAR recorded to: ${harPath}`);
}

export async function replayFromHar(page: Page, harPath: string): Promise<void> {
    await page.routeFromHAR(harPath, { update: false });
    logger.info(`Replaying from HAR: ${harPath}`);
}
