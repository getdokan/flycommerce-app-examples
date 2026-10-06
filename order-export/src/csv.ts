// Spreadsheets run a cell starting with one of these as a formula, so a customer could name themselves into one.
const FORMULA = /^[=+\-@\t\r]/;

export function toCsv(rows: unknown[][]): string {
  // The byte-order mark makes Excel read UTF-8, so a name like "Zoë" arrives intact.
  return '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);

  const text = FORMULA.test(String(value)) ? `'${value}` : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
