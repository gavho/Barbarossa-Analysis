// Dates are "YYYY-MM-DD" strings in the data; UTC math keeps them free of local time-zone shifts.
const DAY = 86_400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);

export const addDays = (d: string, n: number) => new Date(ms(d) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY);

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export const fmtDate = (d: string) => (d ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "");
export const fmtShort = (d: string) => (d ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}` : "");
