/**
 * The toolbar's PDF download: the progress overlay around the host's
 * `window.__astlide_download_pdf` (`@astlide/crispdf`, loaded on demand).
 *
 * @module
 */

import type { Mount } from "./mount";

/** Download the deck as a PDF (once at a time). */
export function createPdfDownload(mount: Mount): () => Promise<void> {
	const { deck } = mount.config;
	const pdfOverlay = document.getElementById("pdf-overlay");
	const pdfBar = document.getElementById("pdf-overlay-bar");
	const pdfStatus = document.getElementById("pdf-overlay-status");
	let pdfBusy = false;

	function setPdfStatus(text: string, percent: number): void {
		if (pdfStatus) pdfStatus.textContent = text;
		if (pdfBar && typeof percent === "number")
			pdfBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
	}

	function showPdfOverlay(show: boolean): void {
		if (!pdfOverlay) return;
		pdfOverlay.setAttribute("aria-hidden", String(!show));
		pdfOverlay.classList.toggle("open", !!show);
	}

	async function downloadPdf() {
		if (pdfBusy) return;
		if (!window.__astlide_download_pdf) {
			console.error("[astlide] PDF download module is not available");
			return;
		}
		pdfBusy = true;
		showPdfOverlay(true);
		setPdfStatus("Loading PDF engine…", 0);
		try {
			const { warnings } = await window.__astlide_download_pdf({
				deck,
				onProgress: (done, total) => {
					setPdfStatus(`Rendering slide ${done} / ${total}`, (done / total) * 100);
				},
			});
			setPdfStatus("Saving…", 100);
			if (warnings?.length) {
				console.warn("[astlide] PDF export warnings:", warnings);
			}
		} catch (caught) {
			const err = caught as { message?: string; code?: string } | null;
			console.error("[astlide] PDF export failed:", err);
			// Friendly text ONLY when crispdf truly isn't installed — match the
			// specific Vite/Node "cannot find module" shape, not just any string
			// that happens to contain "crispdf".
			const missingCrispdf =
				err?.message &&
				(err.code === "ERR_MODULE_NOT_FOUND" ||
					/Cannot find (?:module|package) ['"]@astlide\/crispdf/i.test(err.message));
			const msg = missingCrispdf
				? "Install @astlide/crispdf to enable PDF download."
				: "PDF export failed — see console for details.";
			setPdfStatus(msg, 0);
			await new Promise((r) => setTimeout(r, 2500));
		} finally {
			showPdfOverlay(false);
			pdfBusy = false;
		}
	}

	return downloadPdf;
}
