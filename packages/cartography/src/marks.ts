/**
 * The marks of a map: the scale bar and the north arrow.
 *
 * @packageDocumentation
 */

import { escapeHtml } from "@mark1russell7/text";
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

/** This function gives the SVG of a scale bar of four parts, with its top left corner at a point on the paper. */
export function scaleBarSvg(x: number, y: number, length: ScaleBarLength, mmPerMeter: number): string {
  const total = length.meters * mmPerMeter;
  const part = total / 4;
  let parts = "";
  for (let i = 0; i < 4; i += 1) {
    parts += `<rect x="${mm(x + i * part)}" y="${mm(y)}" width="${mm(part)}" height="1.5" fill="${i % 2 === 0 ? "#000000" : "#ffffff"}" stroke="#000000" stroke-width="0.15"/>`;
  }
  return `<g class="scale-bar">${parts}<text x="${mm(x + total + 1.5)}" y="${mm(y + 1.5)}" font-size="2.4">${escapeHtml(length.label)}</text></g>`;
}

/** This function gives the SVG of a north arrow at a point on the paper, with the direction of north in degrees. */
export function northArrowSvg(x: number, y: number, northDegrees: number): string {
  return (
    `<g class="north-arrow" transform="translate(${mm(x)} ${mm(y)}) rotate(${mm(northDegrees)})">` +
    `<circle r="4.5" fill="#ffffff" stroke="#000000" stroke-width="0.2"/>` +
    `<path d="M0 -3.6L1.6 1.2L0 0.4L-1.6 1.2Z" fill="#000000"/>` +
    `<text y="3.9" font-size="2.2" text-anchor="middle">N</text></g>`
  );
}
