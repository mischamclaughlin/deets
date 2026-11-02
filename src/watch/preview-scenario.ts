/** Browser viewing state only: never included in a design or normal Garmin export. */
export interface PreviewScenario {
    time: string;
    date: string;
    readings: 'sample' | 'large' | 'missing';
    weather: 'sample' | 'sun' | 'cloud' | 'cloud-rain' | 'cloud-storm' | 'snowflake' | 'wind' | 'mist' | 'missing';
}
export const defaultPreviewScenario: PreviewScenario = {
    time: '10:08:23', date: '2026-10-26', readings: 'sample', weather: 'sample',
};
const weather = new Set(['sample', 'sun', 'cloud', 'cloud-rain', 'cloud-storm', 'snowflake', 'wind', 'mist', 'missing']);

export function parsePreviewScenario(value: unknown): PreviewScenario {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose valid preview values.');
    const candidate = value as Record<string, unknown>;
    if (Object.keys(candidate).length !== 4 || Object.keys(candidate).some((key) => !['time', 'date', 'readings', 'weather'].includes(key)) ||
        typeof candidate.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(candidate.time) ||
        typeof candidate.date !== 'string' || !/^(20\d{2})-\d{2}-\d{2}$/.test(candidate.date) ||
        !['sample', 'large', 'missing'].includes(candidate.readings as string) || !weather.has(candidate.weather as string))
        throw new Error('Choose valid preview values.');
    const date = new Date(`${candidate.date}T12:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== candidate.date)
        throw new Error('Choose a valid preview date from 2000 to 2099.');
    return { time: candidate.time, date: candidate.date, readings: candidate.readings, weather: candidate.weather } as PreviewScenario;
}
