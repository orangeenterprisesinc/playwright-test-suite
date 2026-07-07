/**
 * @fileoverview Method decorator for standardized error handling and logging.
 *
 * Provides the {@link HandleError} decorator that wraps async methods with
 * try/catch, logs errors via the framework logger, and optionally re-throws
 * them as {@link FrameworkException}. Supports both legacy (experimental) and
 * Stage 3 decorator signatures.
 *
 * @module decorators/errorHandler.decorator
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { HandleError } from '../decorators/errorHandler.decorator';
 *
 * class MyPage {
 *   @HandleError('MyPage.login')
 *   async login(username: string, password: string): Promise<void> {
 *     // If this throws, the error is logged and re-thrown as FrameworkException
 *   }
 *
 *   @HandleError('MyPage.search', false) // Swallows errors (does not re-throw)
 *   async search(query: string): Promise<void> { ... }
 * }
 * ```
 */
import { Logger } from '../utils/logger';
import { FrameworkException } from '../exceptions/frameworkExceptions';

const logger = new Logger('ErrorHandlerDecorator');

/**
 * Method decorator that wraps async methods with error handling.
 *
 * When the decorated method throws:
 * 1. The error is logged with context information.
 * 2. If `rethrow` is `true` (default), the error is re-thrown as a {@link FrameworkException}
 *    (unless it already is one).
 * 3. If `rethrow` is `false`, the error is swallowed after logging.
 *
 * Supports both legacy (experimental) decorators and Stage 3 decorators.
 *
 * @param {string} [context] - Human-readable context label for error messages (e.g., `'LoginPage.submit'`)
 * @param {boolean} [rethrow=true] - Whether to re-throw the error after logging
 * @returns {Function} The decorator function
 *
 * @example
 * ```typescript
 * class CheckoutPage {
 *   @HandleError('CheckoutPage.placeOrder')
 *   async placeOrder(): Promise<void> {
 *     // Errors will be logged as: "Error in CheckoutPage.placeOrder: <message>"
 *   }
 * }
 * ```
 */
export function HandleError(context?: string, rethrow: boolean = true) {
    return function (...args: any[]) {
        // Legacy decorator: (target, propertyKey, descriptor)
        if (args.length === 3 && typeof args[2] === 'object' && args[2].value) {
            const [_target, propertyKey, descriptor] = args;
            const originalMethod = descriptor.value;

            descriptor.value = async function (...methodArgs: any[]) {
                try {
                    return await originalMethod.apply(this, methodArgs);
                } catch (error) {
                    const errorMessage = context
                        ? `Error in ${context}: ${(error as Error).message}`
                        : `Error in ${propertyKey}: ${(error as Error).message}`;

                    logger.error(errorMessage, error);

                    if (!rethrow) return;
                    if (error instanceof FrameworkException) throw error;
                    throw new FrameworkException(errorMessage, error as Error);
                }
            };
            return descriptor;
        }

        // Standard decorator (Stage 3): (value, context)
        if (args.length === 2 && typeof args[1] === 'object' && args[1].kind === 'method') {
            const [originalMethod, _context] = args;
            const methodName = String(_context.name);

            return async function (this: any, ...methodArgs: any[]) {
                try {
                    return await originalMethod.apply(this, methodArgs);
                } catch (error) {
                    const errorMessage = context
                        ? `Error in ${context}: ${(error as Error).message}`
                        : `Error in ${methodName}: ${(error as Error).message}`;

                    logger.error(errorMessage, error);

                    if (!rethrow) return;
                    if (error instanceof FrameworkException) throw error;
                    throw new FrameworkException(errorMessage, error as Error);
                }
            };
        }

        throw new Error(
            'Unsupported decorator signature. Ensure experimentalDecorators is enabled in tsconfig.json or use standard decorators.',
        );
    };
}
