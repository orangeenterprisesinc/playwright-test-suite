/**
 * @fileoverview `@HandleError` method decorator — wraps async page/component
 * methods so failures are logged with class/method context before
 * propagating, instead of surfacing as a bare, hard-to-trace error.
 *
 * @module core/errorHandler.decorator
 */
import { Logger } from '../utils/logger';
import { FrameworkError } from './frameworkExceptions';

const logger = new Logger('ErrorHandler');

/**
 * Wraps an async method: on failure, logs `<Class>.<method> — <contextMessage>`
 * with the original error, then rethrows — as-is if it's already a
 * {@link FrameworkError}, otherwise wrapped in one so the context message
 * travels with it.
 *
 * @example
 * ```typescript
 * class AccountPage extends BasePage {
 *   @HandleError('Failed to submit the account form')
 *   async submitForm(): Promise<void> { ... }
 * }
 * ```
 */
export function HandleError(contextMessage: string) {
    return function (target: object, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
        const original = descriptor.value;

        descriptor.value = async function (this: unknown, ...args: unknown[]) {
            try {
                return await original.apply(this, args);
            } catch (error: unknown) {
                const className = (target as { constructor: { name: string } }).constructor.name;
                const msg = error instanceof Error ? error.message : String(error);
                logger.error(`${className}.${propertyKey} — ${contextMessage}: ${msg}`, error);
                if (error instanceof FrameworkError) throw error;
                throw new FrameworkError(`${contextMessage}: ${msg}`);
            }
        };

        return descriptor;
    };
}
