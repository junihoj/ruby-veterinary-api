/**
 * node-postgres parses `date` columns into a JS Date at local midnight, so
 * `toISOString()` would shift the calendar day in non-UTC zones. API contracts
 * expose `@db.Date` values as YYYY-MM-DD.
 */
export function toDateOnly(value: string | Date | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
