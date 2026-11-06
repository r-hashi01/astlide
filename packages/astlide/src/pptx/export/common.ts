/**
 * What the PPTX exporter's modules share: the scene's types and colours.
 *
 * @module
 */

import type { SceneItem } from "@astlide/core/engine";

/** Where a helper reports what it left out. */
export type Warn = (message: string) => void;

export type TextItem = Extract<SceneItem, { kind: "text" }>;
export type Engine = typeof import("@astlide/core/engine");

/** A scene colour as PowerPoint's `RRGGBB`. */
export const hex = (c: { hex: string }) => c.hex.toUpperCase();
