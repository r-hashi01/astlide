/**
 * In-browser PDF export — wraps `@astlide/crispdf` for one-click download from
 * the deck UI. Loads the deck's `/[deck]/all` print page into a hidden iframe,
 * hands every `.slide` element to crispdf, and triggers a Blob download.
 *
 * Lazy-imported from DeckLayout's toolbar so the heavy raster + vector pipeline
 * stays out of the main page bundle.
 */

export interface ExportToPdfOptions {
	/** Deck name (URL segment). */
	deck: string;
	/** Slide width in DOM pixels. Default 1920. */
	width?: number;
	/** Slide height in DOM pixels. Default 1080. */
	height?: number;
	/** Called as `(done, total)` for each completed page. */
	onProgress?: (done: number, total: number) => void;
}

export interface ExportToPdfResult {
	blob: Blob;
	warnings: string[];
}

const PT_PER_PX = 72 / 96;

/**
 * Render every slide of a deck into a single PDF Blob using `@astlide/crispdf`.
 *
 * crispdf is an optional peer dependency; this function throws if it isn't
 * installed (the caller should surface a friendly message in that case).
 */
export async function exportDeckToPdf(opts: ExportToPdfOptions): Promise<ExportToPdfResult> {
	const { deck, width = 1920, height = 1080, onProgress } = opts;

	// Dynamic import keeps crispdf out of the main DeckLayout chunk.
	const crispdf = await import("@astlide/crispdf");

	// Host the /[deck]/all print page in a hidden iframe sized to the slide so
	// layouts and font metrics match exactly what users see at full size.
	const iframe = document.createElement("iframe");
	iframe.style.cssText = "position:fixed; left:-99999px; top:0; border:0; visibility:hidden;";
	iframe.width = String(width);
	iframe.height = String(height);
	iframe.src = `/${encodeURIComponent(deck)}/all`;
	document.body.appendChild(iframe);

	try {
		await new Promise<void>((resolve, reject) => {
			const onLoad = () => resolve();
			const onError = () => reject(new Error("Failed to load /all print page"));
			iframe.addEventListener("load", onLoad, { once: true });
			iframe.addEventListener("error", onError, { once: true });
		});

		const doc = iframe.contentDocument;
		if (!doc) throw new Error("Iframe contentDocument is unavailable");

		// Wait for fonts to settle so text metrics in crispdf's vector overlay are stable.
		await doc.fonts?.ready?.catch(() => {});

		const slides = Array.from(doc.querySelectorAll<HTMLElement>("body > .slide"));
		if (slides.length === 0) {
			throw new Error(`No slides found at /${deck}/all`);
		}

		const result = await crispdf.domToPdf({
			pages: slides,
			source: { width, height },
			output: {
				width: width * PT_PER_PX,
				height: height * PT_PER_PX,
				unit: "pt",
			},
			// PNG preserves transparency; the PDF viewer composites against the page's
			// white default. JPEG would flatten transparent pixels to black, which is
			// what users see when a slide background is rendered via a CSS custom
			// property that html-to-image can't resolve in the foreignObject capture.
			rasterFormat: "png",
			onProgress: (pageIndex, totalPages) => {
				onProgress?.(pageIndex + 1, totalPages);
			},
		});

		return { blob: result.blob, warnings: result.warnings ?? [] };
	} finally {
		iframe.remove();
	}
}

/** Trigger a browser download for a Blob with the given filename. */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	// Defer revocation a tick so the navigation finishes before the URL is freed.
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
