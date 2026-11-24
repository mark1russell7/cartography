/**
 * The marks of a map: the scale bar, the north arrow and the texts at the edges of the frame.
 *
 * @packageDocumentation
 */

import { escapeAttribute, escapeHtml } from "@mark1russell7/text";
import { MapError } from "./errors.ts";
import { mm } from "./style.ts";

/** The units of the scale bars of a map. `both` gives a metric bar and an imperial bar. */
export type ScaleBarUnits = "metric" | "imperial" | "both" | "none";

/** The length of a scale bar on the ground and its label. */
export interface ScaleBarLength {
  /** The length on the ground in metres. */
  readonly meters: number;
  /** The label, for example `500 m`, `2 km`, `0.5 mi` or `200 ft`. */
  readonly label: string;
}

const METERS_PER_MILE = 1609.344;
const METERS_PER_FOOT = 0.3048;

/** This function gives the largest number 1, 2 or 5 times a power of 10 that is not more than a number more than 0. */
export function niceNumber(max: number): number {
  const power = 10 ** Math.floor(Math.log10(max));
  for (const step of [5, 2, 1]) {
    const value = Number((step * power).toPrecision(1));
    if (value <= max) return value;
  }
  return Number((power / 2).toPrecision(1));
}

/**
 * This function gives the length of a scale bar that is not longer than a length on the ground.
 *
 * - The metric bar is in metres below 1 km, and in kilometres from 1 km.
 * - The imperial bar is in miles from a quarter of a mile, and in feet below that.
 */
export function scaleBarLength(maxMeters: number, units: "metric" | "imperial"): ScaleBarLength {
  if (units === "metric") {
    const meters = niceNumber(maxMeters);
    return { meters, label: meters >= 1000 ? `${meters / 1000} km` : `${meters} m` };
  }
  const miles = maxMeters / METERS_PER_MILE;
  if (miles >= 0.25) {
    const value = niceNumber(miles);
    return { meters: value * METERS_PER_MILE, label: `${value} mi` };
  }
  const feet = niceNumber(maxMeters / METERS_PER_FOOT);
  return { meters: feet * METERS_PER_FOOT, label: `${feet} ft` };
}

/** The height of one scale bar with its label, in millimetres. */
export const SCALE_BAR_ROW_MM = 4.5;

/**
 * The colors of a mark. A print map uses the defaults: black ink on white paper. A screen map can give
 * `currentColor` or a CSS variable. Then the CSS of the page sets the colors of the mark in its light and dark theme.
 */
export interface MarkPaint {
  /** The color of the lines, the texts and the dark parts. The default is `#000000`. */
  readonly ink?: string;
  /** The color of the light parts. The default is `#ffffff`. The value `none` gives light parts with no fill. */
  readonly paper?: string;
}

/** The colors of a mark with the defaults, as values for SVG attributes, and the fill of its texts. */
interface Paint {
  readonly ink: string;
  readonly paper: string;
  /** The attribute `fill` of a text: none for the default ink, so a print map stays the same. */
  readonly text: string;
}

function paintOf(paint: MarkPaint): Paint {
  for (const [name, value] of [
    ["ink", paint.ink],
    ["paper", paint.paper],
  ] as const) {
    if (value !== undefined && (typeof value !== "string" || value.trim() === "")) {
      throw new MapError("style", `The ${name} color of a mark is not a text that is not empty`);
    }
  }
  const ink = paint.ink === undefined ? "#000000" : escapeAttribute(paint.ink);
  const paper = paint.paper === undefined ? "#ffffff" : escapeAttribute(paint.paper);
  return { ink, paper, text: paint.ink === undefined ? "" : ` fill="${ink}"` };
}

/**
 * This function gives the SVG of a scale bar of four parts, with its top left corner at a point on the paper.
 *
 * @throws MapError - The code is `style`: a color of the paint is not a text that is not empty.
 */
export function scaleBarSvg(x: number, y: number, length: ScaleBarLength, mmPerMeter: number, paint: MarkPaint = {}): string {
  const { ink, paper, text } = paintOf(paint);
  const total = length.meters * mmPerMeter;
  const part = total / 4;
  let parts = "";
  for (let i = 0; i < 4; i += 1) {
    parts += `<rect x="${mm(x + i * part)}" y="${mm(y)}" width="${mm(part)}" height="1.5" fill="${i % 2 === 0 ? ink : paper}" stroke="${ink}" stroke-width="0.15"/>`;
  }
  return `<g class="scale-bar">${parts}<text x="${mm(x + total + 1.5)}" y="${mm(y + 1.5)}" font-size="2.4"${text}>${escapeHtml(length.label)}</text></g>`;
}

/**
 * This function gives the SVG of a north arrow at a point on the paper, with the direction of north in degrees.
 *
 * @throws MapError - The code is `style`: a color of the paint is not a text that is not empty.
 */
export function northArrowSvg(x: number, y: number, northDegrees: number, paint: MarkPaint = {}): string {
  const { ink, paper, text } = paintOf(paint);
  return (
    `<g class="north-arrow" transform="translate(${mm(x)} ${mm(y)}) rotate(${mm(northDegrees)})">` +
    `<circle r="4.5" fill="${paper}" stroke="${ink}" stroke-width="0.2"/>` +
    `<path d="M0 -3.6L1.6 1.2L0 0.4L-1.6 1.2Z" fill="${ink}"/>` +
    `<text y="3.9" font-size="2.2" text-anchor="middle"${text}>N</text></g>`
  );
}

/** The four edges of a frame. When north is up, the top edge is at the north. */
export type FrameEdge = "top" | "right" | "bottom" | "left";

/** The four edges of a frame, in the sequence of the marks. */
export const FRAME_EDGES: readonly FrameEdge[] = ["top", "right", "bottom", "left"];

/** The size of the font of a text at an edge of the frame, in millimetres. */
export const EDGE_TEXT_MM = 2.6;

/** The space in the box of an edge text around the arrow and the text, and the size of the arrow, in millimetres. */
const EDGE = { pad: 0.8, arrow: 1.8, gap: 0.7 } as const;

/** The angle of the arrow of each edge. The arrow points out of the frame. */
const EDGE_TURN: Readonly<Record<FrameEdge, number>> = { top: 0, right: 90, bottom: 180, left: 270 };

/** The mark of a text at an edge of the frame: its box on the paper and its SVG. */
export interface EdgeMark {
  /** The edge of the mark. */
  readonly edge: FrameEdge;
  /** The middle of the box on the paper, in millimetres from the top left corner of the frame. */
  readonly x: number;
  /** The middle of the box on the paper, in millimetres from the top left corner of the frame. */
  readonly y: number;
  /** The half width of the box, in millimetres. */
  readonly halfWidth: number;
  /** The half height of the box, in millimetres. */
  readonly halfHeight: number;
  /** The SVG of the mark: a white box at the middle of the edge, an arrow that points out of the frame, and the text. */
  readonly svg: string;
}

/**
 * This function gives the marks of the texts at the middle of the edges of a frame, in the sequence top, right, bottom and left.
 * An edge with no text has no mark.
 *
 * @param measure - This function gives the width of a text in millimetres at the size `EDGE_TEXT_MM`.
 */
export function edgeMarks(widthMm: number, heightMm: number, texts: Readonly<Partial<Record<FrameEdge, string>>>, measure: (text: string) => number): EdgeMark[] {
  return FRAME_EDGES.flatMap((edge) => {
    const text = texts[edge];
    if (text === undefined) return [];
    const boxWidth = 2 * EDGE.pad + EDGE.arrow + EDGE.gap + measure(text);
    const boxHeight = 2 * EDGE.pad + EDGE_TEXT_MM;
    const x = edge === "left" ? boxWidth / 2 : edge === "right" ? widthMm - boxWidth / 2 : widthMm / 2;
    const y = edge === "top" ? boxHeight / 2 : edge === "bottom" ? heightMm - boxHeight / 2 : heightMm / 2;
    const left = x - boxWidth / 2;
    const top = y - boxHeight / 2;
    const arrowX = left + EDGE.pad + EDGE.arrow / 2;
    const half = EDGE.arrow / 2;
    const svg =
      `<g class="edge-${edge}"><rect x="${mm(left)}" y="${mm(top)}" width="${mm(boxWidth)}" height="${mm(boxHeight)}" fill="#ffffff" stroke="#000000" stroke-width="0.2"/>` +
      `<path transform="translate(${mm(arrowX)} ${mm(y)}) rotate(${EDGE_TURN[edge]})" d="M0 ${mm(-half)}L${mm(half)} ${mm(half)}L${mm(-half)} ${mm(half)}Z" fill="#000000"/>` +
      `<text x="${mm(arrowX + half + EDGE.gap)}" y="${mm(y + EDGE_TEXT_MM * 0.35)}" font-size="${EDGE_TEXT_MM}" font-weight="bold">${escapeHtml(text)}</text></g>`;
    return [{ edge, x, y, halfWidth: boxWidth / 2, halfHeight: boxHeight / 2, svg }];
  });
}
