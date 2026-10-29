import PptxGenJS from "pptxgenjs";

/** A template: a title slide layout and a title-and-content layout with a slide number. */
export async function templateFixture(): Promise<Buffer> {
	const p = new PptxGenJS();
	p.layout = "LAYOUT_WIDE";
	p.theme = { headFontFace: "Georgia", bodyFontFace: "Helvetica" };
	p.defineSlideMaster({
		title: "Title Slide",
		background: { color: "0F1F3D" },
		objects: [
			{
				placeholder: {
					options: { name: "title", type: "title", x: 0.5, y: 2, w: 10, h: 1.5 },
					text: "",
				},
			},
		],
	});
	p.defineSlideMaster({
		title: "Title and Content",
		objects: [
			{
				placeholder: {
					options: { name: "title", type: "title", x: 0.5, y: 0.5, w: 12, h: 1 },
					text: "",
				},
			},
			{
				placeholder: {
					options: { name: "body", type: "body", x: 0.5, y: 1.75, w: 12, h: 5 },
					text: "",
				},
			},
		],
		slideNumber: { x: 12.3, y: 7, w: 0.75, h: 0.4 },
	});
	p.addSlide({ masterName: "Title Slide" });
	return (await p.write({ outputType: "nodebuffer" })) as Buffer;
}
