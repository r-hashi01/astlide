/**
 * The JSX runtime for MDX slides in Vue (`jsxImportSource: "@astlide/vue"`):
 * `vue/jsx-runtime`, except that a component's children go in as its default
 * slot function, as Vue expects (no "non-function value for default slot"
 * warnings).
 *
 * @module
 */

import { Fragment, h } from "vue";

type Props = Record<string, unknown> & { children?: unknown };

export function jsx(type: unknown, props: Props, key?: unknown) {
	const { children, ...rest } = props;
	if (key !== undefined) rest.key = key;
	if (typeof type === "string" || type === Fragment || children === undefined)
		return h(type as string, rest, children as never);
	return h(type as never, rest, { default: () => children });
}

export { Fragment, jsx as jsxDEV, jsx as jsxs };
