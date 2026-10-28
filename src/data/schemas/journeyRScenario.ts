import { z } from 'zod';
import { CleanupStepSchema } from './cleanupStep';

// Journey R (Reports). Read-only: favorites and Last Run are browser-local, a report run writes no record.

const Annotation = z.object({ type: z.string().min(1), description: z.string().min(1) }).strict();
const Text = z.string().min(1);
const contains = (haystack: string, needle: string): boolean => haystack.toLowerCase().includes(needle.toLowerCase());

function compiles(source: string): boolean {
    try {
        new RegExp(source);
        return true;
    } catch {
        return false;
    }
}

export const ReportsHubCaseSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        workflow: z.literal('R1'),
        hub: z
            .object({ menuPath: z.array(Text).min(1), url: Text, heading: Text, gridName: Text, loadFailureText: Text })
            .strict(),
        nameFilter: z.object({ text: Text }).strict(),
        moduleFilter: z.object({ module: Text }).strict(),
        intersection: z.object({ mustInclude: z.array(Text).min(1) }).strict(),
        favorites: z
            .object({ module: Text, nameFilter: Text, star: z.array(Text), unstar: Text })
            .strict(),
        sorting: z.object({ neverRunText: Text }).strict(),
        /** `module` absent = a report with no For value ("—"), found with the module filter cleared. */
        notAvailable: z.object({ module: Text.optional(), nameFilter: Text, report: Text, badge: Text }).strict(),
        observation: z.object({ rawIdentifierPattern: Text }).strict(),
        annotations: z.array(Annotation).default([]),
        cleanup: z.array(CleanupStepSchema).default([]),
    })
    .strict()
    .superRefine((s, ctx) => {
        const issue = (path: Array<string | number>, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

        if (s.favorites.star.length !== 3 || new Set(s.favorites.star).size !== 3) issue(['favorites', 'star'], 'must be exactly 3 distinct names');
        if (!s.favorites.star.includes(s.favorites.unstar)) issue(['favorites', 'unstar'], 'must be one of favorites.star');
        s.favorites.star.forEach((name, i) => {
            if (!contains(name, s.favorites.nameFilter)) issue(['favorites', 'star', i], `must contain the filter text '${s.favorites.nameFilter}'`);
        });
        s.intersection.mustInclude.forEach((name, i) => {
            if (!contains(name, s.nameFilter.text)) issue(['intersection', 'mustInclude', i], `must contain the name filter '${s.nameFilter.text}'`);
        });
        if (!contains(s.notAvailable.report, s.notAvailable.nameFilter)) issue(['notAvailable', 'report'], 'must contain notAvailable.nameFilter');
        if (!compiles(s.observation.rawIdentifierPattern)) issue(['observation', 'rawIdentifierPattern'], 'must be a valid regular expression');
    });

export type ReportsHubCase = z.infer<typeof ReportsHubCaseSchema>;

const YesNo = z.object({ label: Text, options: z.array(Text).length(2), default: Text, pick: Text }).strict();
const Choice = z.object({ label: Text, options: z.array(Text).min(1), pick: Text }).strict();

export const RunDialogCaseSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        workflow: z.literal('R2'),
        hub: z.object({ menuPath: z.array(Text).min(1), url: Text }).strict(),
        dialog: z.object({ titlePrefix: Text, description: Text, rawLabelPattern: Text }).strict(),
        variantReport: z
            .object({
                module: Text,
                nameFilter: Text,
                report: Text,
                labels: z.array(Text).min(1),
                descriptions: z.record(z.string(), Text),
                yesNo: YesNo,
                choice: Choice,
                variant: z.object({ label: Text, options: z.array(Text).min(2), switchTo: Text, labelsAfter: z.array(Text).min(1) }).strict(),
            })
            .strict(),
        runReport: z
            .object({
                module: Text,
                nameFilter: Text,
                report: Text,
                labels: z.array(Text).min(1),
                descriptions: z.record(z.string(), Text),
                dates: z.array(z.object({ label: Text, dayOffset: z.number().int() }).strict()).length(2),
                singleDatePrompt: Text,
                range: z.object({ label: Text, prompt: Text }).strict(),
                entity: z.object({ label: Text, placeholder: Text, searchText: Text, pick: Text }).strict(),
                choice: Choice,
                runningText: Text,
                viewerHeadingPrefix: Text,
                pdfMagic: Text,
            })
            .strict(),
        lastRunPattern: Text,
        neverRunText: Text,
        noRunWindowMs: z.number().int(),
        annotations: z.array(Annotation).default([]),
        cleanup: z.array(CleanupStepSchema).default([]),
    })
    .strict()
    .superRefine((s, ctx) => {
        const issue = (path: Array<string | number>, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
        const { variantReport: v, runReport: r } = s;

        if (v.yesNo.options[0] !== 'Yes' || v.yesNo.options[1] !== 'No') issue(['variantReport', 'yesNo', 'options'], 'must be exactly ["Yes","No"]');
        for (const key of ['default', 'pick'] as const) {
            if (!v.yesNo.options.includes(v.yesNo[key])) issue(['variantReport', 'yesNo', key], 'must be one of yesNo.options');
        }
        if (v.yesNo.default === v.yesNo.pick) issue(['variantReport', 'yesNo', 'pick'], 'must differ from the default');
        if (!v.labels.includes(v.yesNo.label)) issue(['variantReport', 'yesNo', 'label'], 'must be one of variantReport.labels');

        if (!v.choice.options.includes(v.choice.pick)) issue(['variantReport', 'choice', 'pick'], 'must be one of choice.options');
        if (!r.choice.options.includes(r.choice.pick)) issue(['runReport', 'choice', 'pick'], 'must be one of choice.options');

        if (!v.variant.options.includes(v.variant.switchTo)) issue(['variantReport', 'variant', 'switchTo'], 'must be one of variant.options');
        if (v.variant.switchTo === v.report) issue(['variantReport', 'variant', 'switchTo'], 'must differ from the report the dialog opened on');
        const subset = v.variant.labelsAfter.every((l) => v.labels.includes(l)) && v.variant.labelsAfter.length < v.labels.length;
        if (!subset) issue(['variantReport', 'variant', 'labelsAfter'], 'must be a strict subset of variantReport.labels');

        for (const key of Object.keys(v.descriptions)) {
            if (!v.labels.includes(key)) issue(['variantReport', 'descriptions', key], 'must be one of variantReport.labels');
        }
        for (const key of Object.keys(r.descriptions)) {
            if (!r.labels.includes(key)) issue(['runReport', 'descriptions', key], 'must be one of runReport.labels');
        }

        r.dates.forEach((d, i) => {
            if (!r.labels.includes(d.label)) issue(['runReport', 'dates', i, 'label'], 'must be one of runReport.labels');
            if (d.dayOffset < -27 || d.dayOffset > 0) issue(['runReport', 'dates', i, 'dayOffset'], 'must be between -27 and 0');
        });
        if (!(r.dates[0].dayOffset < r.dates[1].dayOffset)) issue(['runReport', 'dates'], 'the first date must be earlier than the last');

        if (!contains(r.entity.pick, r.entity.searchText)) issue(['runReport', 'entity', 'pick'], 'must contain entity.searchText');
        if (!contains(v.report, v.nameFilter)) issue(['variantReport', 'report'], 'must contain nameFilter');
        if (!contains(r.report, r.nameFilter)) issue(['runReport', 'report'], 'must contain nameFilter');

        if (!compiles(s.lastRunPattern)) issue(['lastRunPattern'], 'must be a valid regular expression');
        if (!compiles(s.dialog.rawLabelPattern)) issue(['dialog', 'rawLabelPattern'], 'must be a valid regular expression');
        if (s.noRunWindowMs < 1000 || s.noRunWindowMs > 10000) issue(['noRunWindowMs'], 'must be between 1000 and 10000');
    });

export type RunDialogCase = z.infer<typeof RunDialogCaseSchema>;
