/**
 * Tables looked up by CSS values: without a prototype, so `constructor` or
 * `__proto__` (a value a page can write) finds nothing instead of
 * `Object.prototype`'s members.
 *
 * @module
 */

/** `entries` as a table without a prototype. */
export function lookup<T>(entries: Record<string, T>): Readonly<Record<string, T>> {
	return Object.assign(Object.create(null) as Record<string, T>, entries);
}
