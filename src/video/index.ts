/**
 * @fileoverview Barrel for the video annotation utilities.
 *
 * @module video
 * @since 1.0.0
 */
export { annotateVideo, resolvePython, summarize, videoSlug } from './videoProcessor';
export type {
    AnnotateOptions,
    AnnotationSettings,
    CursorHit,
    Keyframe,
    KeyframePhase,
    VideoAnnotation,
} from './types';
