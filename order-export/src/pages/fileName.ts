import { day } from './dates';

// What the server accepts in a format; anything else, such as a "/" in a store's name, becomes "-".
const UNSAFE = /[^\p{L}\p{N} ._-]/gu;

/** The file name for the orders from `from` to `last`, both days included, in the merchant's time zone. */
export function fileName(format: string, store: string, from: Date, last: Date): string {
  const name = format.replaceAll('{store}', store).replaceAll('{from}', day(from)).replaceAll('{to}', day(last));
  return `${name.replace(UNSAFE, '-')}.csv`;
}
