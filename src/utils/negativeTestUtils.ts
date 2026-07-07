import { getRandomNumber } from './randomUtils';
import { getConfigValue, ConfigProperties } from '../enums/configProperties';

/**
 * @fileoverview Utilities for generating invalid / boundary-case data
 * used in negative test scenarios.
 *
 * Each function produces a plausible-looking but purposely invalid value for
 * a specific domain entity, making it easy to write negative API tests.
 *
 * @module utils/negativeTestUtils
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { getInvalidEmail, getInvalidPatientId } from '@utils/negativeTestUtils';
 *
 * const res = await api.createPatient({ id: getInvalidPatientId(), email: getInvalidEmail() });
 * expect(res.status).toBe(400);
 * ```
 */

/**
 * Generates a random 8-digit string that does not correspond to any real entity ID.
 * @returns {string} Random numeric string
 */
export function getInvalidId(): string {
    return getRandomNumber(8);
}

/** Generates an invalid local ID with a timestamp suffix. */
export function getInvalidLocalId(): string {
    return `INVALID_LOCAL_ID_${Date.now()}`;
}

/** Returns a random 8-digit invalid organisation ID. */
export function getInvalidOrganizationId(): string {
    return getRandomNumber(8);
}

/** Returns an invalid API token string. */
export function getInvalidToken(): string {
    return getConfigValue(ConfigProperties.API_KEY, 'INVALID_TOKEN_' + Date.now());
}

/** Returns an invalid REST path suffix. */
export function getInvalidPathSuffix(): string {
    return '/invalid/endpoint';
}

/** Returns a random 8-digit invalid person ID. */
export function getInvalidPersonId(): string {
    return getRandomNumber(8);
}

/** Returns a random 8-digit invalid patient ID. */
export function getInvalidPatientId(): string {
    return getRandomNumber(8);
}

/** Returns a random 8-digit invalid provider ID. */
export function getInvalidProviderId(): string {
    return getRandomNumber(8);
}

/** Returns a random 8-digit invalid practice ID. */
export function getInvalidPracticeId(): string {
    return getRandomNumber(8);
}

/** Returns a random 8-digit invalid department ID. */
export function getInvalidDepartmentId(): string {
    return getRandomNumber(8);
}

/** Returns a random 8-digit invalid appointment ID. */
export function getInvalidAppointmentId(): string {
    return getRandomNumber(8);
}

/** Returns a random 8-digit invalid location ID. */
export function getInvalidLocationId(): string {
    return getRandomNumber(8);
}

/** Returns a random 8-digit invalid staff ID. */
export function getInvalidStaffId(): string {
    return getRandomNumber(8);
}

/** Returns a random 8-digit invalid pharmacy ID. */
export function getInvalidPharmacyId(): string {
    return getRandomNumber(8);
}

/** Returns a random 8-digit invalid payer ID. */
export function getInvalidPayerId(): string {
    return getRandomNumber(8);
}

/** Returns an email address with a non-existent domain. */
export function getInvalidEmail(): string {
    return `invalid_email_${Date.now()}@nonexistent.com`;
}

/** Returns an overly long (15-digit) invalid phone number. */
export function getInvalidPhoneNumber(): string {
    return getRandomNumber(15);
}

/** Returns a search query string that should not match any real entity. */
export function getInvalidSearchQuery(): string {
    return `INVALID_SEARCH_QUERY_${Date.now()}`;
}
