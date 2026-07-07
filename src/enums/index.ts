/**
 * @fileoverview Barrel export for all enumeration types and their helper functions.
 *
 * Re-exports {@link ConfigProperties} for type-safe environment variable access.
 *
 * @module enums
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { ConfigProperties, getConfigValue } from '../enums';
 * ```
 */
export {ConfigProperties, getConfigValue, getConfigBoolean} from './configProperties';
