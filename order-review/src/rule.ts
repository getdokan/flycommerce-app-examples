/** An order needs a person to check it when its total is above the store's limit. */
export function needsReview(total: number | string, limit: number): boolean {
  return Number(total) > limit;
}
