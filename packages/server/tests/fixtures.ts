import PptxGenJS from "pptxgenjs";

/** A template as pptxgenjs writes one: a title slide and a title-and-content layout. */
export async function templateFixture(): Promise<Uint8Array<ArrayBuffer>> {
	const p = new PptxGenJS();
	p.layout = "LAYOUT_WIDE"; // 13.333 × 7.5 in → 144 px per inch on 1920 × 1080
	p.theme = { headFontFace: "Georgia", bodyFontFace: "Helvetica" };
	p.defineSlideMaster({
		title: "Title Slide",
		background: { color: "0F1F3D" },
		objects: [
			{
				placeholder: {
					options: { name: "title", type: "title", x: 0.5, y: 2, w: 10, h: 1.5, fontSize: 54 },
					text: "",
				},
			},
		],
	});
	p.defineSlideMaster({
		title: "Title and Content",
		background: { color: "FFFFFF" },
		objects: [
			{ rect: { x: 0, y: 0, w: "100%", h: 0.25, fill: { color: "F97316" } } },
			{
				placeholder: {
					options: { name: "title", type: "title", x: 0.5, y: 0.5, w: 12, h: 1, fontSize: 36 },
					text: "",
				},
			},
			{
				placeholder: {
					options: { name: "body", type: "body", x: 0.5, y: 1.75, w: 12, h: 5, fontSize: 20 },
					text: "",
				},
			},
		],
		slideNumber: { x: 12.3, y: 7, w: 0.75, h: 0.4, fontSize: 12 },
	});
	p.addSlide({ masterName: "Title Slide" });
	return new Uint8Array((await p.write({ outputType: "nodebuffer" })) as Buffer);
}

/** 1×1 red PNG. */
const PNG =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

/** A two-slide deck with a title, notes and a picture. */
export async function deckFixture(): Promise<Uint8Array<ArrayBuffer>> {
	const p = new PptxGenJS();
	p.layout = "LAYOUT_WIDE";
	p.title = "Fixture deck";
	p.author = "Astlide";
	p.defineSlideMaster({
		title: "BRAND",
		background: { color: "F8FAFC" },
		objects: [
			{
				placeholder: {
					options: { name: "title", type: "title", x: 0.5, y: 0.4, w: 12, h: 1, fontSize: 36 },
					text: "",
				},
			},
		],
	});
	const s1 = p.addSlide({ masterName: "BRAND" });
	s1.addText("Imported title", { placeholder: "title" });
	s1.addText("First point", { x: 0.5, y: 1.6, w: 6, h: 1, fontSize: 20 });
	s1.addNotes("Say hello");
	const s2 = p.addSlide();
	s2.addImage({ data: `image/png;base64,${PNG}`, x: 4, y: 1, w: 1, h: 1 });
	return new Uint8Array((await p.write({ outputType: "nodebuffer" })) as Buffer);
}
