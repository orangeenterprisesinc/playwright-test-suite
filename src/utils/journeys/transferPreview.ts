import type { PageObjects } from '@fixtures/pages.fixture';

export interface PreviewClock {
    job: string;
    /** `HH:MM`, 24 h. */
    start: string;
    end: string;
    grossMinutes: number;
    netMinutes: number;
}

type PreviewSegments = Awaited<ReturnType<PageObjects['transferToJobCards']['previewSegments']>>;

/**
 * The Job Cards preview's segments as clock times and minutes, in chronological order. The Gross and Net
 * Time cells are decimal hours (minutes = hours x 60); an HH:MM cell throws by name.
 */
export function previewClock(segments: PreviewSegments): PreviewClock[] {
    const hhmm = (cell: string, what: string): string => {
        const match = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?/i.exec(cell);
        if (!match) throw new Error(`Job Cards preview '${what}' reads "${cell}", which carries no clock time`);
        const hour = match[3] ? (Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0) : Number(match[1]);
        return `${String(hour).padStart(2, '0')}:${match[2]}`;
    };
    const minutes = (cell: string, what: string): number => {
        const hours = Number(cell.replace(/,/g, '').trim());
        if (!Number.isFinite(hours)) throw new Error(`Job Cards preview '${what}' reads "${cell}", which is not decimal hours`);
        return Math.round(hours * 60);
    };
    return segments
        .map((s) => ({
            job: s.job,
            start: hhmm(s.timeIn, 'Date Time In'),
            end: hhmm(s.timeOut, 'Date Time Out'),
            grossMinutes: minutes(s.grossTime, 'Gross Time'),
            netMinutes: minutes(s.netTime, 'Net Time'),
        }))
        .sort((a, b) => a.start.localeCompare(b.start));
}
