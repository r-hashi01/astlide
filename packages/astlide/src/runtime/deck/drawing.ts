/**
 * Pen and laser pointer (d / l). Both overlays live inside #slide-scaler in
 * slide coordinates, so they scale with the slide and line up in every
 * window. Strokes and laser positions are broadcast, so drawing in the
 * presenter window shows on the audience screen (and vice versa). Strokes are
 * kept per slide on `window`, which survives client-side navigations.
 *
 * @module
 */

import type { Stroke } from "../globals";
import type { Mount } from "./mount";
import { type DrawingMessage, isStroke, type Sync } from "./sync";

type Point = [number, number];

export interface Drawing {
	/** Take up a tool, or put it away when it's the one in hand. */
	setTool(next: "draw" | "laser"): void;
	/** The tool in hand. */
	readonly tool: "draw" | "laser" | null;
	/** Clear this slide's strokes (c), and the other window's when `broadcast`. */
	clear(broadcast: boolean): void;
	/** Clear every slide of the deck (Shift+C). */
	clearDeck(broadcast: boolean): void;
	/** A pen / laser message from the other window. */
	receive(message: DrawingMessage): void;
}

export function createDrawing(mount: Mount, sync: Sync): Drawing {
	const { deck, currentSlide, basePath, persistDrawings } = mount.config;
	const { scaler, isEmbedded } = mount;

	const drawLayer = document.getElementById("draw-layer") as HTMLCanvasElement | null;
	const laserDot = document.getElementById("laser-dot");
	const drawCtx = drawLayer?.getContext ? drawLayer.getContext("2d") : null;
	window.__astlide_drawings ??= {};
	const drawings = window.__astlide_drawings;
	const drawingKey = `${deck}/${currentSlide}`;

	// drawings.persist: keep this deck's strokes in localStorage. The key
	// includes the base path because several sites can share one origin
	// (e.g. user.github.io/<repo>). Loaded once per deck per window.
	const drawingsStorageKey = `astlide:drawings:${basePath}/${deck}`;
	window.__astlide_drawings_loaded ??= {};
	const loadedDecks = window.__astlide_drawings_loaded;
	if (persistDrawings && !loadedDecks[drawingsStorageKey]) {
		loadedDecks[drawingsStorageKey] = true;
		try {
			const saved = JSON.parse(localStorage.getItem(drawingsStorageKey) || "{}");
			// Only this deck's slides, and only well-formed strokes: storage is
			// shared with every page of the origin.
			for (const key of Object.keys(saved)) {
				if (!key.startsWith(`${deck}/`) || Object.hasOwn(drawings, key)) continue;
				const strokes = saved[key];
				if (Array.isArray(strokes) && strokes.every(isStroke)) drawings[key] = strokes;
			}
		} catch (_) {
			/* unavailable or corrupt storage: start empty */
		}
	}
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	function writeDrawings() {
		saveTimer = undefined;
		const deckDrawings: Record<string, Stroke[]> = {};
		for (const key of Object.keys(drawings)) {
			const strokes = drawings[key];
			if (key.startsWith(`${deck}/`) && strokes && strokes.length > 0) deckDrawings[key] = strokes;
		}
		try {
			if (Object.keys(deckDrawings).length > 0)
				localStorage.setItem(drawingsStorageKey, JSON.stringify(deckDrawings));
			else localStorage.removeItem(drawingsStorageKey);
		} catch (error) {
			console.warn("[astlide] Could not save drawings", error);
		}
	}
	function saveDrawings() {
		if (!persistDrawings) return;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(writeDrawings, 300);
	}
	let tool: "draw" | "laser" | null = null;
	let activeStroke: Stroke | null = null;
	let laserTimer: ReturnType<typeof setTimeout> | undefined;

	function slideStrokes() {
		drawings[drawingKey] ??= [];
		return drawings[drawingKey];
	}

	function sizeDrawLayer() {
		if (!drawLayer || !scaler) return;
		const w = parseFloat(scaler.style.width) || 1920;
		const h = parseFloat(scaler.style.height) || 1080;
		if (drawLayer.width !== w || drawLayer.height !== h) {
			drawLayer.width = w;
			drawLayer.height = h;
			redrawStrokes();
		}
	}

	function drawSegment(stroke: Stroke, from: Point, to: Point): void {
		if (!drawCtx) return;
		drawCtx.strokeStyle = stroke.color;
		drawCtx.lineWidth = stroke.width;
		drawCtx.lineCap = "round";
		drawCtx.lineJoin = "round";
		drawCtx.beginPath();
		drawCtx.moveTo(from[0], from[1]);
		drawCtx.lineTo(to[0], to[1]);
		drawCtx.stroke();
	}

	function drawStroke(stroke: Stroke): void {
		const pts = stroke.points;
		if (pts.length === 1) drawSegment(stroke, pts[0], pts[0]);
		for (let i = 1; i < pts.length; i++) drawSegment(stroke, pts[i - 1], pts[i]);
	}

	function redrawStrokes() {
		if (!drawCtx || !drawLayer) return;
		drawCtx.clearRect(0, 0, drawLayer.width, drawLayer.height);
		for (const stroke of slideStrokes()) drawStroke(stroke);
	}

	// Pointer position → slide coordinates (undoes the scaler's CSS transform).
	function toSlidePoint(e: PointerEvent): Point {
		if (!drawLayer) return [0, 0];
		const rect = drawLayer.getBoundingClientRect();
		return [
			Math.round(((e.clientX - rect.left) / rect.width) * drawLayer.width),
			Math.round(((e.clientY - rect.top) / rect.height) * drawLayer.height),
		];
	}

	function setTool(next: "draw" | "laser" | null): void {
		tool = tool === next ? null : next;
		window.__astlide_tool = tool;
		if (tool) document.documentElement.setAttribute("data-tool", tool);
		else document.documentElement.removeAttribute("data-tool");
		for (const btn of document.querySelectorAll(
			'.nav-btn[data-action="draw"], .nav-btn[data-action="laser"]',
		)) {
			btn.setAttribute("aria-pressed", String(btn.getAttribute("data-action") === tool));
		}
		if (tool !== "laser") hideLaser(true);
	}

	function clearDrawings(broadcast: boolean): void {
		drawings[drawingKey] = [];
		redrawStrokes();
		saveDrawings();
		if (broadcast) sync.post({ type: "draw-clear", slide: currentSlide });
	}

	// Shift+C: every slide of this deck.
	function clearDeckDrawings(broadcast: boolean): void {
		for (const key of Object.keys(drawings)) {
			if (key.startsWith(`${deck}/`)) drawings[key] = [];
		}
		redrawStrokes();
		saveDrawings();
		if (broadcast) sync.post({ type: "draw-clear-all", slide: currentSlide });
	}

	function showLaser(point: Point, broadcast: boolean): void {
		if (!laserDot) return;
		laserDot.hidden = false;
		laserDot.style.transform = `translate(${point[0]}px, ${point[1]}px)`;
		clearTimeout(laserTimer);
		// Fade out remote pointers that stop updating (e.g. the window lost focus).
		if (!broadcast)
			laserTimer = setTimeout(() => {
				laserDot.hidden = true;
			}, 2000);
		if (broadcast) sync.post({ type: "laser", slide: currentSlide, x: point[0], y: point[1] });
	}

	function hideLaser(broadcast: boolean): void {
		if (laserDot) laserDot.hidden = true;
		if (broadcast) sync.post({ type: "laser-off", slide: currentSlide });
	}

	function handleDrawPointerDown(e: PointerEvent): void {
		if (tool !== "draw") return;
		e.preventDefault();
		try {
			drawLayer?.setPointerCapture(e.pointerId);
		} catch (_) {
			/* keep drawing without capture */
		}
		const color =
			getComputedStyle(document.documentElement).getPropertyValue("--astlide-pen-color").trim() ||
			"#ef4444";
		activeStroke = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			color,
			width: 6,
			points: [toSlidePoint(e)],
		};
		slideStrokes().push(activeStroke);
		drawStroke(activeStroke);
		sync.post({ type: "draw", slide: currentSlide, stroke: activeStroke });
	}

	function handleDrawPointerMove(e: PointerEvent): void {
		if (tool === "laser") {
			showLaser(toSlidePoint(e), true);
			return;
		}
		if (tool !== "draw" || !activeStroke) return;
		const point = toSlidePoint(e);
		const pts = activeStroke.points;
		drawSegment(activeStroke, pts[pts.length - 1], point);
		pts.push(point);
		sync.post({
			type: "draw",
			slide: currentSlide,
			stroke: {
				id: activeStroke.id,
				color: activeStroke.color,
				width: activeStroke.width,
				points: [pts[pts.length - 2], point],
			},
		});
	}

	function handleDrawPointerUp() {
		if (activeStroke) saveDrawings();
		activeStroke = null;
	}

	function handleDrawPointerLeave() {
		if (tool === "laser") hideLaser(true);
	}

	// Incoming pen / laser messages from the other window.
	function receiveDrawing(data: DrawingMessage): void {
		if (data.type === "draw-clear-all") {
			clearDeckDrawings(false);
			return;
		}
		if (data.slide !== currentSlide) return;
		if (data.type === "laser") showLaser([data.x, data.y], false);
		else if (data.type === "laser-off") hideLaser(false);
		else if (data.type === "draw-clear") clearDrawings(false);
		else if (data.type === "draw") {
			const strokes = slideStrokes();
			let stroke = strokes.find((s) => s.id === data.stroke.id);
			if (!stroke) {
				stroke = {
					id: data.stroke.id,
					color: data.stroke.color,
					width: data.stroke.width,
					points: [],
				};
				strokes.push(stroke);
			}
			const incoming =
				stroke.points.length === 0 ? data.stroke.points : data.stroke.points.slice(1);
			for (const point of incoming) {
				const last = stroke.points[stroke.points.length - 1] || point;
				drawSegment(stroke, last, point);
				stroke.points.push(point);
			}
			saveDrawings();
		}
	}

	if (drawLayer && !isEmbedded) {
		sizeDrawLayer();
		mount.listen(drawLayer, "pointerdown", handleDrawPointerDown);
		mount.listen(drawLayer, "pointermove", handleDrawPointerMove);
		mount.listen(drawLayer, "pointerup", handleDrawPointerUp);
		mount.listen(drawLayer, "pointercancel", handleDrawPointerUp);
		mount.listen(drawLayer, "pointerleave", handleDrawPointerLeave);
		// Keep the tool active across slide changes.
		if (window.__astlide_tool) setTool(window.__astlide_tool);
	}

	mount.onDispose(() => {
		clearTimeout(laserTimer);
		if (saveTimer !== undefined) {
			clearTimeout(saveTimer);
			writeDrawings();
		}
	});

	return {
		setTool,
		get tool() {
			return tool;
		},
		clear: clearDrawings,
		clearDeck: clearDeckDrawings,
		receive: receiveDrawing,
	};
}
