/**
 * Catalog workflow A4 — Crew setup: department, supervisor, badge color, defaults, and the auto-break, exercise,
 * notification and day-start overrides that shape capture and pay.
 * Data: src/data/journey-a/a04-crew-setup.json · Plan: test-plans/journey-a/a04-crew-setup.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { CrewSetupCaseSchema } from '@data/schemas/journeyAScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { mintCrewSetup, readCrew } from '@utils/journeys/journeyAFlow';

// "From Paid-Break and Meal" (global) vs "From Paid Break and Meal" (crew option): compare on a common spelling.
const normalise = (label: string) => label.toLowerCase().replace(/-/g, ' ');

test.describe('A4 · Crew setup', { tag: ['@JourneyA', '@A4'] }, () => {

    test('[Crew Setup] End-to-end: create a crew with defaults, set break, exercise, notification and day-start overrides, and verify they persist and differ from the global preferences.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A4' },
        ],
    }, async ({ pages, sessionApi }, testInfo) => {
        const loaded = await loadScenario(CrewSetupCaseSchema, testInfo);
        const run = mintCrewSetup(loaded, sessionApi, testInfo);
        const { scenario, crew } = run;
        const { globals, expected } = scenario;

        // The global preferences the crew values must override: read on screen, never written.
        await pages.preferences.gotoPreferences();
        const globalValues = {
            paidBreakLength: await pages.preferences.displayedValue(globals.paidBreakLength),
            notificationThreshold: await pages.preferences.displayedValue(globals.notificationThreshold),
            autoReturnFromBreak: await pages.preferences.displayedValue(globals.autoReturnFromBreak),
        };
        for (const [field, value] of Object.entries(globalValues)) {
            expect(value, `Preferences should show a value for the global behind '${field}'`).not.toBe('');
        }

        // Catalog step 1: create the crew with department, supervisor, badge color and time card defaults.
        const outcome = await pages.crew.createCrew(crew);
        expect(outcome, `New Crew form rejected '${crew.name}' (barcode ${crew.code})`).toBe('created');
        const crewId = pages.crew.savedIdFromUrl();
        await expect(pages.crew.successToast(expected.createdToast)).toBeVisible();
        await expect(pages.crew.heading(expected.editHeadingPrefix + crew.name)).toBeVisible();
        await expect(pages.crew.exportIdentifierInput).toHaveValue(crew.name);

        // Catalog step 2: auto-break type, auto-return from break and break lengths.
        await pages.crew.fillAutoBreak(scenario.autoBreak);
        await pages.crew.saveEdit();

        // Catalog steps 3-4: exercise rule, break and meal notification and the user to notify.
        await pages.crew.fillExerciseAndNotification(scenario.exerciseAndNotification);
        await pages.crew.saveEdit();

        // Catalog step 5: day start for a shift that spans midnight.
        await pages.crew.fillDayStart(scenario.dayStart);
        await pages.crew.saveEdit();

        // Reload from the server and read every field back off the form.
        await pages.crew.gotoEditById(crewId, crew.name);
        const form = await pages.crew.readCrewForm();
        expect(form, 'the reloaded Edit Crew form should show every saved value').toEqual({
            name: crew.name,
            exportIdentifier: crew.name,
            code: crew.code,
            badgeColor: scenario.crew.badgeColor,
            supervisor: scenario.crew.supervisor,
            department: scenario.crew.department,
            defaultRanch: scenario.crew.defaultRanch,
            defaultField: scenario.crew.defaultField,
            defaultJob: scenario.crew.defaultJob,
            autoPaidBreakType: scenario.autoBreak.autoPaidBreakType,
            autoReturnFromBreak: scenario.autoBreak.autoReturnFromBreak,
            breakLengths: scenario.autoBreak.breakLengths,
            exerciseJob: scenario.exerciseAndNotification.exerciseJob,
            exerciseJobLengthMinutes: String(scenario.exerciseAndNotification.exerciseJobLengthMinutes),
            breakAndMealNotification: scenario.exerciseAndNotification.breakAndMealNotification,
            notifyUser: scenario.exerciseAndNotification.notifyUser,
            dayStartFrom: scenario.dayStart.from,
            dayStartTo: scenario.dayStart.to,
            dayStartFixedTime: scenario.dayStart.fixedTime,
        });

        // The crew's values must differ from the globals; a drifted environment fails here by field id.
        expect(
            normalise(form.autoReturnFromBreak),
            `crew Auto Return from Break should differ from global '${globals.autoReturnFromBreak}' ("${globalValues.autoReturnFromBreak}")`,
        ).not.toBe(normalise(globalValues.autoReturnFromBreak));
        for (const length of form.breakLengths.split(',').map(Number)) {
            expect(
                length,
                `crew break length should differ from global '${globals.paidBreakLength}' (${globalValues.paidBreakLength})`,
            ).not.toBe(Number(globalValues.paidBreakLength));
        }
        expect(
            Number(form.breakAndMealNotification),
            `crew Break & Meal Notification should differ from global '${globals.notificationThreshold}' (${globalValues.notificationThreshold})`,
        ).not.toBe(Number(globalValues.notificationThreshold));

        // Read-only read-back: the wire holds what the screen showed.
        const stored = await readCrew(sessionApi, crewId);
        expect(stored, 'GET /crews/{id} should hold what the Edit Crew form showed').toMatchObject({
            name: crew.name,
            code: crew.code,
            exportIdentifier: crew.name,
            badgeColor: scenario.crew.badgeColor,
            autoPaidBreakType: expected.wire.autoPaidBreakType,
            autoReturnFromBreak: expected.wire.autoReturnFromBreak,
            breakLengthMinutesCommaSeparated: scenario.autoBreak.breakLengths,
            exerciseJobLengthMinutes: scenario.exerciseAndNotification.exerciseJobLengthMinutes,
            breakAndMealNotification: scenario.exerciseAndNotification.breakAndMealNotification,
            dayStartFrom: scenario.dayStart.from,
            dayStartTo: scenario.dayStart.to,
            dayStartFixedTime: scenario.dayStart.fixedTime,
        });
        const unset = expected.wire.nonNullKeys.filter((key) => stored[key] == null);
        expect(unset, 'GET /crews/{id} should return the picked lookups, not null').toEqual([]);
    });

});
