/**
 * PET-12987 — Scan Devices & Boards: list Filter (Selected / Exclude / Empty / AND), Multi Update, Undo and Clear All.
 * Only the five run-minted devices are ever ticked or updated; never Select all, never device 43 or a real phone.
 * Data: src/data/client-feedback/pet-12987-scan-devices-filter-multi-update.json · Plan: test-plans/client-feedback/pet-12987-scan-devices-filter-multi-update.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { ScanDeviceSelectionCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { ensureCfFixtures, mintScratchDevices } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('PET-12987 · Scan Devices & Boards: list Filter and Multi Update', { tag: ['@ClientFeedback', '@PET-12987'] }, () => {
    test('The Scan Devices list Filter narrows by Selected, Exclude, Empty and AND, and Multi Update with Undo changes only the ticked devices, until Clear All', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'PET-12987' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(ScanDeviceSelectionCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const sd = pages.scanDevice;
        const { grid } = sd;
        const deps = { sessionApi, testInfo, pages };
        const { fields, match, columns } = s.selection;
        const e = s.expected;
        type Key = (typeof s.devices)[number]['key'];

        // 0. Arrange: five run-named devices (mixed type, Supervisor set or empty), teardown registered first.
        const sup = (await ensureCfFixtures(deps, s.fixtureCrew)).employees[0];
        const scratch = mintScratchDevices(deps, s.ticket, s.devices.length);
        const nameOf = (key: Key): string => scratch.names[s.devices.findIndex((d) => d.key === key)];
        const names = (keys: readonly Key[]): string[] => keys.map(nameOf).sort();
        const listed = async (): Promise<string[]> => (await grid.columnValues(columns.name)).sort();
        const expectListed = (keys: readonly Key[], message: string) => expect.poll(listed, { message, timeout: 30_000 }).toEqual(names(keys));
        const expectLines = (lines: string[], message: string) => expect.poll(async () => (await sd.selectionLines()).sort(), { message, timeout: 30_000 }).toEqual([...lines].sort());
        for (const [i, d] of s.devices.entries()) {
            await sd.createScratchDevice({
                name: scratch.names[i],
                deviceType: s.deviceTypeValues[d.type],
                webMailAddress: `${scratch.names[i].replace(/ /g, '-')}@${s.webMailDomain}`,
                ...(d.supervisor ? { supervisor: sup.name } : {}),
            });
        }

        // 1. Open the list, note the unfiltered total, narrow to the scratch devices by Name.
        await sd.gotoList();
        const baseline = await grid.totalRowCount();
        await grid.columnFilter(columns.name, scratch.stem);
        await expect.poll(() => grid.totalRowCount().catch(() => -1), { message: 'the Name filter lists the five scratch devices' }).toBe(s.devices.length);

        // 2. Filter: Device Type, Selected, Pocket PDA.
        await sd.openSelection();
        await sd.pickSelectionField(fields.deviceType);
        await sd.setSelectionMatch(match.inList);
        await sd.pickSelectionValues(fields.deviceType, [s.selection.filterType]);
        await sd.applySelection();
        await expectLines([e.lines.selected], 'the description names the Selected condition');
        await expect(sd.selectionCount, 'the Filter badge counts one condition').toHaveText(e.countSingle);
        await expectListed(e.pda, 'only the Pocket PDA scratch devices are listed');
        expect((await grid.columnValues(columns.deviceType)).every((v) => v === s.selection.filterType), 'every listed row is a Pocket PDA').toBe(true);

        // 3. Exclude on the same condition.
        await sd.openSelection();
        await sd.pickSelectionField(fields.deviceType);
        await sd.setSelectionExclude(fields.deviceType, true);
        await sd.applySelection();
        await expectLines([e.lines.excluded], 'the description reads "is not one of"');
        await expectListed(e.notPda, 'the non-Pocket-PDA scratch devices are listed');
        expect(await grid.columnValues(columns.deviceType), 'no Pocket PDA row remains').not.toContain(s.selection.filterType);

        // 4. Supervisor Empty and its Exclude add up to the unfiltered scratch total.
        await sd.openSelection();
        await sd.clearAllSelection();
        await sd.pickSelectionField(fields.supervisor);
        await sd.setSelectionMatch(match.empty);
        await sd.applySelection();
        await expectLines([e.lines.empty], 'the description reads "is empty"');
        await expectListed(e.supEmpty, 'the devices without a Supervisor are listed');
        const empty = await grid.totalRowCount();
        await sd.openSelection();
        await sd.pickSelectionField(fields.supervisor);
        await sd.setSelectionExclude(fields.supervisor, true);
        await sd.applySelection();
        await expectLines([e.lines.notEmpty], 'the description reads "is not empty"');
        await expectListed(e.supSet, 'the devices with a Supervisor are listed');
        const notEmpty = await grid.totalRowCount();
        expect(empty + notEmpty, 'Empty and Exclude counts add up to the unfiltered scratch total').toBe(s.devices.length);

        // 5. Two conditions AND: Device Type Pocket PDA with Supervisor not empty.
        await sd.openSelection();
        await sd.pickSelectionField(fields.deviceType);
        await sd.setSelectionMatch(match.inList);
        await sd.pickSelectionValues(fields.deviceType, [s.selection.filterType]);
        await sd.applySelection();
        await expect(sd.selectionCount, 'the Filter badge counts two conditions').toHaveText(e.countBoth);
        await expectLines([e.lines.selected, e.lines.notEmpty], 'the description lists both conditions');
        await expectListed(e.both, 'only devices matching both conditions are listed');

        // 6. Clear All, then Multi Update two scratch devices: Use Job Alias = Yes.
        await sd.openSelection();
        await sd.clearAllSelection();
        await sd.applySelection();
        await expectListed(s.devices.map((d) => d.key), 'Clear All lists the five scratch devices again');
        await sd.setMultiUpdate(true);
        const ticked = s.tick.map(nameOf);
        for (const name of ticked) expect(scratch.names, `${name} is a run-minted scratch device`).toContain(name);
        await grid.selectRows(ticked);
        await sd.chooseMuField(s.multiUpdate.field);
        await sd.chooseMuValue(s.multiUpdate.value);
        await expect(sd.muSubmit, 'exactly the two ticked devices are updated').toHaveText(e.updateLabel);
        await sd.muSubmit.click();
        await expect(sd.toast(e.updatedToast), 'the update toast counts two records').toBeVisible();

        // 7. Only the ticked devices changed.
        await sd.openSelection();
        await sd.pickSelectionField(fields.useJobAlias);
        await sd.setSelectionMatch(match.isTrue);
        await sd.applySelection();
        await expectLines([e.lines.aliasYes], 'the description reads "Use Job Alias is Yes"');
        await expectListed(s.tick, 'only the two ticked devices have Use Job Alias = Yes');

        // 8. Undo: update the same two back, then Undo restores the Yes values.
        await grid.selectRows(ticked);
        await sd.chooseMuValue(s.multiUpdate.undoValue);
        await expect(sd.muSubmit, 'exactly the two ticked devices are updated').toHaveText(e.updateLabel);
        await sd.muSubmit.click();
        await expectListed([], 'the two devices leave the Yes list');
        await expect(sd.toastUndo(), 'the success toast offers Undo (Access to Reverse)').toBeVisible({ timeout: 8_000 });
        await sd.toastUndo().click();
        await expect(sd.toast(e.undoneToast), 'Undo reports the update was undone').toBeVisible();
        await expectListed(s.tick, 'Undo restored Use Job Alias = Yes on the two devices');

        // 9. Clear the Name filter and the Filter: the full list returns.
        await grid.columnFilter(columns.name, '');
        await sd.openSelection();
        await sd.clearAllSelection();
        await sd.applySelection();
        await expect(sd.selectionDescription, 'no condition is described').toBeHidden();
        await expect(sd.selectionCount, 'the Filter badge is gone').toBeHidden();
        await expect.poll(() => grid.totalRowCount().catch(() => -1), { message: 'Clear All lists the full device list', timeout: 30_000 }).toBe(baseline);
        await sd.setMultiUpdate(false);
    });
});
