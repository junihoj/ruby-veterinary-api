const MONTHS: Record<string, number> = { monthly: 1, quarterly: 3 };

/** First order lands one full period out; the timer then advances by period. */
export function firstDueDate(frequency: string, from = new Date()): Date {
  const due = new Date(from.getTime());
  due.setUTCMonth(due.getUTCMonth() + MONTHS[frequency]);
  return due;
}
