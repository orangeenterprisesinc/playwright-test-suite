/**
 * @fileoverview Barrel export for all enumeration types and their helper functions.
 *
 * Re-exports {@link CategoryType} for test categorization and {@link ConfigProperties}
 * for type-safe environment variable access.
 *
 * @module enums
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { CategoryType, ConfigProperties, getConfigValue } from '../enums';
 * ```
 */
export {CategoryType, getAllCategories} from './categoryType';
export {ConfigProperties, getConfigValue, getConfigBoolean} from './configProperties';