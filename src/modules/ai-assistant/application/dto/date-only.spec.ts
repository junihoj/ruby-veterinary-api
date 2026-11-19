import { toDateOnly } from './date-only';

describe('toDateOnly', () => {
  it('keeps the calendar day for a local-midnight Date from node-postgres', () => {
    expect(toDateOnly(new Date(2026, 10, 6))).toBe('2026-11-06');
  });

  it('accepts an ISO string and truncates it', () => {
    expect(toDateOnly('2026-11-06T00:00:00.000Z')).toBe('2026-11-06');
  });

  it('returns null for an absent date', () => {
    expect(toDateOnly(null)).toBeNull();
  });
});
