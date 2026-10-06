export function lastDays(count: number): { from: Date; to: Date } {
  const today = addDays(new Date(), 0);
  return { from: addDays(today, 1 - count), to: today };
}

// Midnight, `count` calendar days later; plain milliseconds would drift an hour across a daylight-saving change.
export function addDays(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
}

export function day(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
