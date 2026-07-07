/**
 * @fileoverview Barrel export for the annotation module.
 *
 * Re-exports annotation functions and types for convenient single-import usage.
 *
 * @module annotations
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { annotate, withAnnotation, getAnnotation, getAllAnnotations } from '../annotations';
 * import type { FrameworkAnnotationData } from '../annotations';
 * ```
 */
export {annotate, getAnnotation, withAnnotation, getAllAnnotations} from './frameworkAnnotation';
export type {FrameworkAnnotationData} from './frameworkAnnotation';
