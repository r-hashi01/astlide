/**
 * Stub for `pdfjs-dist`, which `@astlide/crispdf` declares as an *optional* peer
 * dependency for its opt-in `selfCheck` feature. Astlide never enables that
 * feature, so we alias `pdfjs-dist*` to this no-op module to keep Rollup happy
 * when the real package isn't installed.
 *
 * If a future caller does want self-check, they should install `pdfjs-dist`
 * directly and override this alias in their own Vite config.
 */

const STUB_ERROR =
	"@astlide: pdfjs-dist is not installed. Install it directly if you need crispdf's selfCheck feature.";

function notInstalled(): never {
	throw new Error(STUB_ERROR);
}

export const getDocument = notInstalled;
export const GlobalWorkerOptions = new Proxy(
	{},
	{
		get() {
			return undefined;
		},
		set() {
			return true;
		},
	},
);

export default {
	getDocument,
	GlobalWorkerOptions,
};
