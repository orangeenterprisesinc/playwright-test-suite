/**
 * @fileoverview Barrel for the test-data utilities.
 *
 * Import generic random generators and domain factories from one place:
 * `import { uid, randomInitials, makeUser } from '../../src/utils/testData';`
 *
 * @module utils/testData
 * @since 1.0.0
 */
export * from './random';
export * from './userFactory';
