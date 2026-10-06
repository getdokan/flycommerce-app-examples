import { HttpError, json, readJson } from '@flycommerce/app-server';
import { COLUMNS, type Column } from './columns.js';
import type { Route } from './server.js';
import { whoIsAsking } from './session.js';

// Placeholders aside, only characters that are safe in a file name on every system and in a header.
const PLACEHOLDERS = /\{(store|from|to)\}/g;
const SAFE = /^[\p{L}\p{N} ._-]*$/u;

export const showSettings: Route = async (app, req, res) => {
  const { store } = await whoIsAsking(app, req);

  json(res, 200, { store, ...app.data.settings(store) });
};

export const saveSettings: Route = async (app, req, res) => {
  const { store } = await whoIsAsking(app, req);
  const body = await readJson<{ fileName?: unknown; columns?: unknown }>(req);
  const settings = {
    fileName: checkFileName(body.fileName),
    columns: checkColumns(body.columns).map((column) => column.key),
  };

  app.data.setSettings(store, settings);
  json(res, 200, { store, ...settings });
};

/** The columns named in `keys`, in the file's order. */
export function checkColumns(keys: unknown): Column[] {
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new HttpError(400, 'no_columns', 'Choose at least one column.');
  }
  if (keys.some((key) => !COLUMNS.some((column) => column.key === key))) {
    const known = COLUMNS.map((column) => column.key).join(', ');
    throw new HttpError(400, 'unknown_column', `Choose columns from: ${known}.`);
  }

  return COLUMNS.filter((column) => keys.includes(column.key));
}

function checkFileName(value: unknown): string {
  const fileName = typeof value === 'string' ? value.trim() : '';

  if (!fileName) {
    throw new HttpError(400, 'no_file_name', 'Enter a file name format.');
  }
  if (fileName.length > 100) {
    throw new HttpError(400, 'file_name_too_long', 'Keep the file name format to 100 characters or fewer.');
  }
  if (!SAFE.test(fileName.replace(PLACEHOLDERS, ''))) {
    throw new HttpError(
      400,
      'bad_file_name',
      'Use only letters, digits, spaces, "-", "_", "." and the placeholders {store}, {from} and {to}.'
    );
  }

  return fileName;
}
