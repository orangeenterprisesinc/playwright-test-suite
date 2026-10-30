/**
 * Offline proof of the run-tagged readable names (`A4 NEW CREW 1029-153245-W1`): their
 * format, the sweep's decoding of them, and the fixture guard they must slip past.
 *
 * Runs only in the opt-in `tools-unit` project: `npm run test:unit`.
 */
import { expect, test } from '@playwright/test';
import { isProtectedName, isSweepable } from '@data/static/shared/cleanupTargets';
import { makeEmployeeName } from '@data/generated';
import { WORKER_INDEX, decodeNameAge, readableName, sixCharRunToken, uniqueName } from '@utils/cleanup/runToken';

const MINTED = Date.UTC(2026, 9, 29, 15, 32, 45); // 2026-10-29 15:32:45 UTC
const W = `W${WORKER_INDEX}`;

test.describe('Run-tagged readable names', () => {
    test('mint the owner, NEW, noun, UTC stamp with seconds and worker', () => {
        expect(readableName('A4', 'CREW', ' ', MINTED)).toBe(`A4 NEW CREW 1029-153245-${W}`);
        expect(readableName('B15', 'RANCH', ' ', MINTED)).toBe(`B15 NEW RANCH 1029-153245-${W}`);
    });

    test('append -2 only when the same name is minted again', () => {
        const at = Date.UTC(2026, 9, 29, 16, 0, 0);
        const first = readableName('A5', 'EMPLOYEE', ' ', at);
        const second = readableName('A5', 'EMPLOYEE', ' ', at);
        expect(first).toBe(`A5 NEW EMPLOYEE 1029-160000-${W}`);
        expect(second).toBe(`${first}-2`);
        expect(readableName('A5', 'EMPLOYEE', ' ', at + 1000)).toBe(`A5 NEW EMPLOYEE 1029-160001-${W}`);
    });

    test('device names use hyphens, never spaces', () => {
        const name = readableName('B15', 'DEVICE', '-', MINTED);
        expect(name).toBe(`B15-NEW-DEVICE-1029-153245-${W}`);
        expect(name).not.toContain(' ');
        expect(name.length).toBeLessThanOrEqual(30);
    });

    test('employee Last Name is the short form and fits 20 characters', () => {
        const { name, lastName } = makeEmployeeName('A5');
        expect(name).toMatch(/^A5 NEW EMPLOYEE \d{4}-\d{6}-W\d+(-\d+)?$/);
        expect(lastName).toMatch(/^A5 \d{4}-\d{6}-W\d+(-\d+)?$/);
        expect(lastName.length).toBeLessThanOrEqual(20);
    });

    test('decode the mint time exactly', () => {
        const name = `A4 NEW CREW 1029-153245-W1`;
        expect(decodeNameAge(name, 'NEW CREW', 'readable', MINTED + 90_000)).toEqual({ decodable: true, style: 'readable', ageMs: 90_000 });
        expect(decodeNameAge(`B15-NEW-DEVICE-1029-153245-W2-3`, 'NEW DEVICE', 'readable', MINTED).ageMs).toBe(0);
    });

    test('a December stamp read in January is last year, not the future', () => {
        const now = Date.UTC(2027, 0, 1, 0, 0, 0);
        const age = decodeNameAge('A4 NEW CREW 1231-235900-W1', 'NEW CREW', 'readable', now);
        expect(age).toEqual({ decodable: true, style: 'readable', ageMs: 60_000 });
    });

    test('an undecodable name is reported as such', () => {
        expect(decodeNameAge('A4 NEW CREW', 'NEW CREW', 'readable', MINTED).decodable).toBe(false);
        expect(decodeNameAge('A4 NEW CREW 1329-153245-W1', 'NEW CREW', 'readable', MINTED).decodable).toBe(false);
        expect(decodeNameAge('E2ECrew_ABCDE1_1', 'NEW CREW', 'readable', MINTED).decodable).toBe(false);
    });

    test('factory, six and uid decoding is unchanged', () => {
        const now = 1_800_000_000_000;
        const stamp = (now - 9000).toString(36).slice(-5).toUpperCase();
        expect(decodeNameAge(`E2ECrew_${stamp}1_3`, 'E2ECrew_', 'factory', now)).toMatchObject({ decodable: true, ageMs: 9000, runId: stamp });
        expect(decodeNameAge(`ZZTEST_SD_${sixCharRunToken(now - 7000)}`, 'ZZTEST_SD_', 'six', now).ageMs).toBe(7000);
        expect(decodeNameAge(`QA User ${(now - 5000).toString(36)}ab`, 'QA User ', 'uid', now).ageMs).toBe(5000);
        expect(uniqueName('E2ECrew')).toMatch(/^E2ECrew_[0-9A-Z]{5}\d+_\d+$/);
    });

    test('a readable name is sweepable for its own entity and not protected', () => {
        const name = 'B15 NEW CREW 1029-153245-W1';
        expect(isSweepable('crew', name)).toBe(true);
        expect(isSweepable('ranch', name)).toBe(false);
        expect(isProtectedName(name)).toBe(false);
        expect(isSweepable('scanDevice', 'B15-NEW-DEVICE-1029-153245-W1')).toBe(true);
        expect(isSweepable('user', 'A1 USER 1029-153245-W1')).toBe(true);
    });

    test('a user name drops NEW to fit 25 characters and still decodes', () => {
        const name = readableName('A1', 'USER', ' ', MINTED, false);
        expect(name).toBe(`A1 USER 1029-153245-${W}`);
        expect(name.length).toBeLessThanOrEqual(25);
        expect(isProtectedName(name)).toBe(false);
        expect(decodeNameAge(name, 'USER', 'readable', MINTED + 1000).ageMs).toBe(1000);
    });

    test('fixture names stay protected and a stamp-less name is not matched', () => {
        expect(isProtectedName('B1 CREW')).toBe(true);
        expect(isProtectedName('B15 CREW')).toBe(true);
        expect(isSweepable('crew', 'A4 NEW CREW')).toBe(false);
        expect(isSweepable('crew', 'A4 NEW CREW 1029-1532-W1')).toBe(false);
    });
});
