/**
 * Camera overlay and talk recording.
 *
 * - Camera (`v`): the webcam in a round, draggable bubble over the slides. The
 *   bubble element is `transition:persist`ed by DeckLayout, so the stream keeps
 *   playing across slide navigations.
 * - Recording (`r`): captures a screen / window / tab the presenter picks
 *   (`getDisplayMedia`) plus the microphone, records with `MediaRecorder`, and
 *   downloads a `.webm` when stopped. This module lives for the whole session
 *   (module scripts survive ClientRouter navigations), so a recording continues
 *   while you move through the deck.
 *
 * Both need a secure context (https or localhost) and the user's permission.
 */

const POSITION_KEY = "astlide:camera-position";

let cameraStream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let recordingStreams: MediaStream[] = [];
let recordingStartedAt = 0;
let recordingTimer = 0;

function cameraElement(): HTMLElement | null {
	return document.getElementById("astlide-camera");
}

// ── Camera ────────────────────────────────────────────────────────────────

export async function toggleCamera(): Promise<void> {
	const bubble = cameraElement();
	const video = bubble?.querySelector("video");
	if (!bubble || !video) return;

	if (cameraStream) {
		for (const track of cameraStream.getTracks()) track.stop();
		cameraStream = null;
		video.srcObject = null;
		bubble.hidden = true;
		setPressed("camera", false);
		return;
	}

	try {
		cameraStream = await navigator.mediaDevices.getUserMedia({
			video: { width: { ideal: 640 }, height: { ideal: 640 } },
			audio: false,
		});
	} catch (error) {
		console.warn("[astlide] Camera unavailable", error);
		return;
	}
	video.srcObject = cameraStream;
	bubble.hidden = false;
	restorePosition(bubble);
	setPressed("camera", true);
}

function restorePosition(bubble: HTMLElement): void {
	try {
		const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");
		if (saved && typeof saved.x === "number" && typeof saved.y === "number") {
			bubble.style.left = `${saved.x}px`;
			bubble.style.top = `${saved.y}px`;
			bubble.style.right = "auto";
			bubble.style.bottom = "auto";
		}
	} catch {
		// Corrupt or unavailable storage: keep the default corner.
	}
}

/** Drag the bubble anywhere; the position is remembered. */
function enableDrag(bubble: HTMLElement): void {
	if (bubble.dataset.dragReady) return;
	bubble.dataset.dragReady = "true";
	let startX = 0;
	let startY = 0;
	let originX = 0;
	let originY = 0;

	bubble.addEventListener("pointerdown", (e) => {
		const rect = bubble.getBoundingClientRect();
		startX = e.clientX;
		startY = e.clientY;
		originX = rect.left;
		originY = rect.top;
		bubble.setPointerCapture(e.pointerId);
		bubble.dataset.dragging = "true";
	});
	bubble.addEventListener("pointermove", (e) => {
		if (!bubble.dataset.dragging) return;
		const maxX = window.innerWidth - bubble.offsetWidth;
		const maxY = window.innerHeight - bubble.offsetHeight;
		const x = Math.min(Math.max(0, originX + e.clientX - startX), maxX);
		const y = Math.min(Math.max(0, originY + e.clientY - startY), maxY);
		bubble.style.left = `${x}px`;
		bubble.style.top = `${y}px`;
		bubble.style.right = "auto";
		bubble.style.bottom = "auto";
	});
	const end = () => {
		if (!bubble.dataset.dragging) return;
		delete bubble.dataset.dragging;
		try {
			localStorage.setItem(
				POSITION_KEY,
				JSON.stringify({ x: bubble.offsetLeft, y: bubble.offsetTop }),
			);
		} catch {
			// Position just won't be remembered.
		}
	};
	bubble.addEventListener("pointerup", end);
	bubble.addEventListener("pointercancel", end);
}

// ── Recording ─────────────────────────────────────────────────────────────

export function isRecording(): boolean {
	return recorder !== null && recorder.state !== "inactive";
}

export async function toggleRecording(fileStem: string): Promise<void> {
	if (isRecording()) {
		recorder?.stop();
		return;
	}

	let display: MediaStream;
	try {
		// The browser asks which screen / window / tab to record. Prefer this tab.
		display = await navigator.mediaDevices.getDisplayMedia({
			video: { frameRate: 30 },
			audio: true,
			// @ts-expect-error Chromium-only hint, ignored elsewhere.
			preferCurrentTab: true,
		});
	} catch (error) {
		console.warn("[astlide] Recording cancelled", error);
		return;
	}

	let microphone: MediaStream | null = null;
	try {
		microphone = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
	} catch {
		// Record without narration.
	}

	const tracks = [...display.getVideoTracks(), ...mixAudio([display, microphone])];
	const stream = new MediaStream(tracks);
	recordingStreams = [display, ...(microphone ? [microphone] : [])];

	const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(
		(type) => MediaRecorder.isTypeSupported(type),
	);
	const chunks: Blob[] = [];
	recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
	recorder.addEventListener("dataavailable", (e) => {
		if (e.data.size > 0) chunks.push(e.data);
	});
	recorder.addEventListener("stop", () => {
		for (const s of recordingStreams) for (const track of s.getTracks()) track.stop();
		recordingStreams = [];
		recorder = null;
		clearInterval(recordingTimer);
		updateRecordingIndicator();
		download(new Blob(chunks, { type: "video/webm" }), `${fileStem}-${timestamp()}.webm`);
	});
	// Stopping the share from the browser's own UI ends the recording too.
	display.getVideoTracks()[0]?.addEventListener("ended", () => {
		if (isRecording()) recorder?.stop();
	});

	recorder.start(1000);
	recordingStartedAt = Date.now();
	recordingTimer = window.setInterval(updateRecordingIndicator, 1000);
	updateRecordingIndicator();
}

/** Combine the shared tab's audio and the microphone into one track. */
function mixAudio(sources: Array<MediaStream | null>): MediaStreamTrack[] {
	const withAudio = sources.filter((s): s is MediaStream => !!s && s.getAudioTracks().length > 0);
	if (withAudio.length <= 1) return withAudio.flatMap((s) => s.getAudioTracks());
	const context = new AudioContext();
	const destination = context.createMediaStreamDestination();
	for (const s of withAudio) context.createMediaStreamSource(s).connect(destination);
	return destination.stream.getAudioTracks();
}

function download(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function timestamp(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// ── UI state (re-applied after every navigation) ──────────────────────────

function setPressed(action: string, pressed: boolean): void {
	for (const btn of document.querySelectorAll(`.nav-btn[data-action="${action}"]`)) {
		btn.setAttribute("aria-pressed", String(pressed));
	}
}

export function updateRecordingIndicator(): void {
	const recording = isRecording();
	document.documentElement.toggleAttribute("data-recording", recording);
	setPressed("record", recording);
	const label = document.getElementById("astlide-recording-time");
	if (label) {
		const seconds = recording ? Math.floor((Date.now() - recordingStartedAt) / 1000) : 0;
		label.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
	}
}

/** Re-sync toolbar state with the live camera / recorder after a page swap. */
export function syncMediaUi(): void {
	const bubble = cameraElement();
	if (bubble) enableDrag(bubble);
	setPressed("camera", cameraStream !== null);
	updateRecordingIndicator();
}
