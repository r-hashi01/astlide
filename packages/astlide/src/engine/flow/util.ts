/** Margins collapse: the largest positive plus the most negative (CSS 2 §8.3.1). */
export const join = (a: number, b: number) => Math.max(a, b, 0) + Math.min(a, b, 0);
export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
