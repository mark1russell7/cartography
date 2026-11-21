/**
 * The black and white styles of the layers: lines with dashes, areas with gray levels and hatches, and point symbols.
 * The print of a map has no color, so each style uses black, white and gray only.
 *
 * @packageDocumentation
 */

import { MapError } from "./errors.ts";

/**
 * A line. The gray level goes from 0 (black) to 1 (white). The default is 0.
 */
export interface StrokeStyle {
  /** The width of the line in millimetres. */
  readonly widthMm: number;
  /** The gray level from 0 (black) to 1 (white). The default is 0. */
  readonly gray?: number;
  /** The lengths of the dashes and the gaps in millimetres. No value gives a solid line. */
  readonly dashMm?: readonly number[];
}

/** Parallel lines in an area. A cross hatch adds the same lines at right angles. */
export interface HatchStyle {
  /** The angle of the lines in degrees, clockwise from horizontal. */
  readonly angleDegrees: number;
  /** The distance between two lines in millimetres. It is more than the width of a line. */
  readonly spacingMm: number;
  /** The width of a line in millimetres. */
  readonly widthMm: number;
  /** The value `true` adds the lines at right angles. The default is `false`. */
  readonly cross?: boolean;
}

/** The fill of an area: a gray level, a hatch, or the two. The hatch is on top of the gray level. */
export interface FillStyle {
  /** The gray level from 0 (black) to 1 (white). No value gives no solid fill. */
  readonly gray?: number;
  /** The hatch. No value gives no hatch. */
  readonly hatch?: HatchStyle;
}

/** The symbols of the points. */
export type PointSymbol = "circle" | "square" | "triangle" | "diamond" | "cross";

/** The symbol of each point. */
export interface PointStyle {
  /** The shape of the symbol. */
  readonly symbol: PointSymbol;
  /** The size of the symbol in millimetres. */
  readonly sizeMm: number;
  /** The value `false` gives a white symbol with a black outline. The default is `true`, a black symbol. */
  readonly filled?: boolean;
}

/** The style of a layer. The line is for the lines and the edges of the areas. The fill is for the areas, and the symbol is for the points. */
export interface Style {
  /** The line. */
  readonly stroke?: StrokeStyle;
  /** The fill of the areas. */
  readonly fill?: FillStyle;
  /** The symbol of the points. */
  readonly point?: PointStyle;
}

const SYMBOLS: readonly string[] = ["circle", "square", "triangle", "diamond", "cross"];

function positive(value: unknown, name: string, layer: string): void {
  if (!(typeof value === "number" && Number.isFinite(value) && value > 0)) {
    throw new MapError("style", `The layer "${layer}": the ${name} ${String(value)} is not a finite number more than 0`);
  }
}

function grayLevel(value: unknown, layer: string): void {
  if (value === undefined) return;
  if (!(typeof value === "number" && value >= 0 && value <= 1)) {
    throw new MapError("style", `The layer "${layer}": the gray level ${String(value)} is not from 0 to 1`);
  }
}

/**
 * This function refuses a style that draws nothing, and a size, a gray level, a dash or a symbol that is not correct.
 *
 * @throws MapError - The code is `style`.
 */
export function checkStyle(style: Style, layer: string): void {
  if (style.stroke === undefined && style.fill === undefined && style.point === undefined) {
    throw new MapError("style", `The layer "${layer}": the style has no stroke, no fill and no point, so it draws nothing`);
  }
  if (style.stroke !== undefined) {
    positive(style.stroke.widthMm, "width of the line", layer);
    grayLevel(style.stroke.gray, layer);
    for (const dash of style.stroke.dashMm ?? []) positive(dash, "length of a dash", layer);
  }
  if (style.fill !== undefined) {
    grayLevel(style.fill.gray, layer);
    if (style.fill.gray === undefined && style.fill.hatch === undefined) {
      throw new MapError("style", `The layer "${layer}": the fill has no gray level and no hatch`);
    }
    const hatch = style.fill.hatch;
    if (hatch !== undefined) {
      positive(hatch.widthMm, "width of a hatch line", layer);
      positive(hatch.spacingMm, "spacing of the hatch", layer);
      if (!Number.isFinite(hatch.angleDegrees)) throw new MapError("style", `The layer "${layer}": the angle ${hatch.angleDegrees} is not finite`);
      if (hatch.spacingMm <= hatch.widthMm) throw new MapError("style", `The layer "${layer}": the spacing of the hatch is not more than its width`);
    }
  }
  if (style.point !== undefined) {
    positive(style.point.sizeMm, "size of the symbol", layer);
    if (!SYMBOLS.includes(style.point.symbol)) throw new MapError("style", `The layer "${layer}": the symbol "${style.point.symbol}" is not one of ${SYMBOLS.join(", ")}`);
  }
}

/** This function gives a number for SVG, to 0.01 mm. */
export function mm(value: number): string {
  return String(Math.round(value * 100) / 100 + 0);
}

/** This function gives the color of a gray level, from `#000000` to `#ffffff`. */
export function grayColor(gray: number): string {
  const hex = Math.round(gray * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

/** This function gives the SVG attributes of a line. */
export function strokeAttributes(stroke: StrokeStyle): string {
  const dash = stroke.dashMm === undefined || stroke.dashMm.length === 0 ? "" : ` stroke-dasharray="${stroke.dashMm.map(mm).join(" ")}"`;
  return `stroke="${grayColor(stroke.gray ?? 0)}" stroke-width="${mm(stroke.widthMm)}"${dash} stroke-linecap="round" stroke-linejoin="round"`;
}

/** This function gives the SVG pattern of a hatch, with an identifier. */
export function hatchPattern(id: string, hatch: HatchStyle): string {
  const s = mm(hatch.spacingMm);
  const half = mm(hatch.spacingMm / 2);
  const line = `stroke="#000000" stroke-width="${mm(hatch.widthMm)}"`;
  const across = hatch.cross === true ? `<line x1="${half}" y1="0" x2="${half}" y2="${s}" ${line}/>` : "";
  return (
    `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${s}" height="${s}" patternTransform="rotate(${mm(hatch.angleDegrees)})">` +
    `<line x1="0" y1="${half}" x2="${s}" y2="${half}" ${line}/>${across}</pattern>`
  );
}

/** This function gives the SVG of a point symbol at a point on the paper. */
export function pointSymbol(point: PointStyle, x: number, y: number): string {
  const r = point.sizeMm / 2;
  const filled = point.filled !== false;
  const paint = filled ? `fill="#000000"` : `fill="#ffffff" stroke="#000000" stroke-width="${mm(point.sizeMm / 8)}"`;
  switch (point.symbol) {
    case "circle":
      return `<circle cx="${mm(x)}" cy="${mm(y)}" r="${mm(r)}" ${paint}/>`;
    case "square":
      return `<rect x="${mm(x - r)}" y="${mm(y - r)}" width="${mm(2 * r)}" height="${mm(2 * r)}" ${paint}/>`;
    case "triangle":
      return `<path d="M${mm(x)} ${mm(y - r)}L${mm(x + r)} ${mm(y + r)}L${mm(x - r)} ${mm(y + r)}Z" ${paint}/>`;
    case "diamond":
      return `<path d="M${mm(x)} ${mm(y - r)}L${mm(x + r)} ${mm(y)}L${mm(x)} ${mm(y + r)}L${mm(x - r)} ${mm(y)}Z" ${paint}/>`;
    case "cross":
      return `<path d="M${mm(x - r)} ${mm(y)}L${mm(x + r)} ${mm(y)}M${mm(x)} ${mm(y - r)}L${mm(x)} ${mm(y + r)}" stroke="#000000" stroke-width="${mm(point.sizeMm / 5)}" fill="none"/>`;
  }
}
