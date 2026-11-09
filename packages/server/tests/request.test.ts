import { describe, expect, it } from "vitest";
import { attachment, downloadName } from "../src/request";

describe("download names", () => {
	it("joins the title's words with hyphens, in any script, Latin accents dropped", () => {
		expect(downloadName("Quarterly review", "pptx")).toBe("Quarterly-review.pptx");
		expect(downloadName("Résumé café", "pptx")).toBe("Resume-cafe.pptx");
		expect(downloadName("Überblick 2026", "pdf")).toBe("Uberblick-2026.pdf");
		expect(downloadName("四半期レビュー", "pdf")).toBe("四半期レビュー.pdf");
		expect(downloadName("../../etc/passwd", "pdf")).toBe("..-..-etc-passwd.pdf");
		expect(downloadName(undefined, "pdf")).toBe("slides.pdf");
	});

	it("cuts at 60 characters, not inside one", () => {
		const name = downloadName("𠮷".repeat(70), "pdf");
		expect([...name.replace(/\.pdf$/, "")]).toHaveLength(60);
		expect(name).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
	});

	it("names the file in UTF-8, with an ASCII name for older clients", () => {
		expect(attachment("Quarterly-review.pptx")).toBe(
			`attachment; filename="Quarterly-review.pptx"; filename*=UTF-8''Quarterly-review.pptx`,
		);
		expect(attachment("四半期レビュー.pdf")).toBe(
			`attachment; filename="slides.pdf"; filename*=UTF-8''${encodeURIComponent("四半期レビュー.pdf")}`,
		);
	});
});
