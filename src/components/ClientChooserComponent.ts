import { Locator, Page } from '@playwright/test';
import { BaseComponent } from './BaseComponent';

/** The "choose a client" step a multi-client user sees after a correct login. */
export class ClientChooserComponent extends BaseComponent {
    constructor(page: Page) {
        super(page, page.getByTestId('client-chooser'));
    }

    choice(clientId: number): Locator {
        return this.getByTestId(`client-choice-${String(clientId)}`);
    }

    /** Pick one client; a missing or disabled (expired) choice fails in seconds naming the id. */
    async choose(clientId: number, timeout = 15_000): Promise<void> {
        const choice = this.choice(clientId);
        try {
            await choice.waitFor({ state: 'visible', timeout });
        } catch {
            throw new Error(`environment-gate: client chooser has no choice for client ${String(clientId)} (E2E_CLIENT_ID).`);
        }
        if (await choice.isDisabled()) {
            throw new Error(`environment-gate: client ${String(clientId)} (E2E_CLIENT_ID) is disabled in the chooser (expired).`);
        }
        this.logger.info(`Choosing client ${String(clientId)}`);
        await choice.click();
    }
}
