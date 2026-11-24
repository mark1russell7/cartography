/**
 * The frame of a map: the part of the Earth that the map shows, its scale and its size on the paper.
 *
 * @packageDocumentation
 */

import { bboxOfPoints, geodesicDirect, type BBox, type LatLon } from "@mark1russell7/geo";
import type { Projection } from "@mark1russell7/geo/projection";
import { MapError } from "./errors.ts";

/** The frame of a map. The center of the frame is at the middle of the paper. */
export interface Frame {
  /** The projection from the Earth to the plane, from `@mark1russell7/geo/projection`. */
  readonly projection: Projection;
  /** The point on the Earth at the middle of the map. */
  readonly center: LatLon;
  /** The denominator of the scale at the center: 24000 for the scale 1:24,000. */
  readonly scale: number;
  /** The width of the map on the paper, in millimetres. */
  readonly widthMm: number;
  /** The height of the map on the paper, in millimetres. */
  readonly heightMm: number;
}

/** A point on the paper in millimetres, from the top left corner of the map. The y axis points down. */
export interface PaperPoint {
  /** The distance to the right, in millimetres. */
  readonly x: number;
  /** The distance down, in millimetres. */
  readonly y: number;
}

/** The functions of a frame between the Earth and the paper. */
export interface FrameView {
  /** The frame. */
  readonly frame: Frame;
  /** The millimetres of paper for one metre on the ground at the center. */
  readonly mmPerMeter: number;
  /** The millimetres of paper for one metre on the plane of the projection. */
  readonly mmPerPlaneMeter: number;
  /** This function gives the point on the paper for a point on the Earth. */
  readonly toPaper: (point: LatLon) => PaperPoint;
  /** This function gives the point on the Earth for a point on the paper. */
  readonly fromPaper: (point: PaperPoint) => LatLon;
  /** The direction of north at the center, in degrees clockwise from the top of the paper. */
  readonly northDegrees: number;
}

/** This function refuses a frame with a scale or a size that is not a finite number more than 0. */
export function checkFrame(frame: Frame): void {
  for (const [name, value] of [
    ["scale", frame.scale],
    ["width", frame.widthMm],
    ["height", frame.heightMm],
  ] as const) {
    if (!(Number.isFinite(value) && value > 0)) throw new MapError("frame", `The ${name} ${value} of the frame is not a finite number more than 0`);
  }
}

/**
 * This function gives the functions of a frame between the Earth and the paper.
 *
 * - The scale of the frame is the true scale at the center. The function divides by the scale factor of the projection
 *   at the center: the square root of `max * min` of `projection.scale`.
 * - For Web Mercator, the scale changes with the latitude. For `azimuthalEquidistant`, it is almost the same on all
 *   the map.
 *
 * @throws MapError - The code is `frame`.
 * @throws GeoError - The center is not a correct point for the projection.
 */
export function frameView(frame: Frame): FrameView {
  checkFrame(frame);
  const { projection, center } = frame;
  const factors = projection.scale(center);
  const mmPerMeter = 1000 / frame.scale;
  const mmPerPlaneMeter = mmPerMeter / Math.sqrt(factors.max * factors.min);
  const origin = projection.toPlane(center);
  const middleX = frame.widthMm / 2;
  const middleY = frame.heightMm / 2;
  const toPaper = (point: LatLon): PaperPoint => {
    const plane = projection.toPlane(point);
    return { x: middleX + (plane.x - origin.x) * mmPerPlaneMeter, y: middleY - (plane.y - origin.y) * mmPerPlaneMeter };
  };
  const fromPaper = (point: PaperPoint): LatLon =>
    projection.fromPlane({ x: origin.x + (point.x - middleX) / mmPerPlaneMeter, y: origin.y - (point.y - middleY) / mmPerPlaneMeter });
  // The direction of a geodesic of 1 mm on the paper to the north.
  const north = toPaper(geodesicDirect(center, 0, 1 / mmPerMeter).point);
  const northDegrees = (Math.atan2(north.x - middleX, middleY - north.y) * 180) / Math.PI;
  return Object.freeze({ frame, mmPerMeter, mmPerPlaneMeter, toPaper, fromPaper, northDegrees: northDegrees + 0 });
}

/**
 * This function gives the box on the Earth around the frame, for a fetch of the data of a map. It is the box of 64
 * points on each side of the frame, so it contains the corners and the edges of the frame.
 *
 * @throws MapError - The code is `frame`.
 */
export function frameBBox(frame: Frame): BBox {
  const view = frameView(frame);
  const { widthMm: w, heightMm: h } = frame;
  const points: LatLon[] = [];
  const steps = 64;
  for (let i = 0; i < steps; i += 1) {
    const t = i / steps;
    points.push(view.fromPaper({ x: t * w, y: 0 }), view.fromPaper({ x: w, y: t * h }), view.fromPaper({ x: w - t * w, y: h }), view.fromPaper({ x: 0, y: h - t * h }));
  }
  return bboxOfPoints(points) as BBox;
}

/** The options of `frameAround`. */
export interface FrameAroundOptions {
  /** This function gives the projection of the frame for its center, for example `azimuthalEquidistant` of geo. */
  readonly projection: (center: LatLon) => Projection;
  /** The width of the map on the paper, in millimetres. */
  readonly widthMm: number;
  /**
   * The height of the map on the paper, in millimetres. With no height, the scale fits the width only. Then the height
   * is the extent of the points in y at that scale, with the margins. It is rounded up to a whole millimetre.
   */
  readonly heightMm?: number;
  /** The space between each point and the edge of the frame, in millimetres. The default is 0. */
  readonly marginMm?: number;
  /** The center of the frame. The default is the middle of the box of the points. */
  readonly center?: LatLon;
  /** The value `true`, the default, rounds the scale up to a value of `NICE_SCALE_STEPS`. */
  readonly roundScale?: boolean;
}

/** The first digits of a round scale, for example 1:25,000 or 1:1,500,000. `frameAround` rounds a scale up to one of them. */
export const NICE_SCALE_STEPS: readonly number[] = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5];

/** This function gives the smallest round scale that is not less than the value, from `NICE_SCALE_STEPS`. */
export function niceScale(value: number): number {
  if (!(Number.isFinite(value) && value > 0)) throw new MapError("frame", `The scale ${value} is not a finite number more than 0`);
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [...NICE_SCALE_STEPS, 10]) {
    // The factor 1e-9 keeps a value that is already round, against the error of the floating point.
    if (step * power >= value * (1 - 1e-9)) return step * power;
  }
  return 10 * power;
}

/**
 * This function gives the frame with the largest scale that shows each point inside the margin.
 *
 * - The center is the middle of the box of the points, or the option `center`. The frame has the center at the middle
 *   of the paper, so the space on the two sides of the center is the same.
 * - The function finds the scale on the plane of the projection, as `frameView` uses it.
 * - With `roundScale`, the scale goes up to a round value. A larger denominator shows more ground, so each point stays inside.
 * - With no `heightMm`, the scale fits the width only, and the height follows from the points. For a box on the Earth,
 *   the points are its 4 corners and the middles of its north and south edges.
 *
 * @throws MapError - The code is `frame`. The reason is no point, a size or a margin that is not correct, or all the
 *   points at the center. With no height, the reason can also be all the points on one vertical line, or no height.
 */
export function frameAround(points: readonly LatLon[], options: FrameAroundOptions): Frame {
  const { widthMm, heightMm } = options;
  const margin = options.marginMm ?? 0;
  if (points.length === 0) throw new MapError("frame", "The frame has no point to show");
  if (!(Number.isFinite(margin) && margin >= 0)) throw new MapError("frame", `The margin ${margin} is not a finite number from 0`);
  checkFrame({ projection: options.projection(points[0]!), center: points[0]!, scale: 1, widthMm, heightMm: heightMm ?? 1 });
  const halfWidth = widthMm / 2 - margin;
  const halfHeight = heightMm === undefined ? Number.POSITIVE_INFINITY : heightMm / 2 - margin;
  if (halfWidth <= 0 || halfHeight <= 0) throw new MapError("frame", `The margin ${margin} mm leaves no space in the frame`);
  const box = bboxOfPoints(points) as BBox;
  const center = options.center ?? { lat: (box.south + box.north) / 2, lon: (box.west + box.east) / 2 };
  const projection = options.projection(center);
  const origin = projection.toPlane(center);
  let reachX = 0;
  let reachY = 0;
  for (const point of points) {
    const plane = projection.toPlane(point);
    reachX = Math.max(reachX, Math.abs(plane.x - origin.x));
    reachY = Math.max(reachY, Math.abs(plane.y - origin.y));
  }
  if (reachX === 0 && reachY === 0) throw new MapError("frame", "All the points are at the center, so no scale fits them");
  if (heightMm === undefined && reachX === 0) throw new MapError("frame", "All the points are on one vertical line, so no scale fits the width");
  // The plane metres for one millimetre of paper, then the true scale at the center, as frameView gives it.
  const planeMetersPerMm = Math.max(reachX / halfWidth, reachY / halfHeight);
  const factors = projection.scale(center);
  const root = Math.sqrt(factors.max * factors.min);
  const exact = planeMetersPerMm * 1000 * root;
  const scale = options.roundScale === false ? exact : niceScale(exact);
  if (heightMm !== undefined) return { projection, center, scale, widthMm, heightMm };
  // The frame has the center at its middle, so it needs the reach of the points in y on the two sides of the center.
  // The factor 1e-9 keeps a whole value, against the error of the floating point.
  const mmPerPlaneMeter = 1000 / (scale * root);
  const frame: Frame = { projection, center, scale, widthMm, heightMm: Math.ceil((2 * reachY * mmPerPlaneMeter + 2 * margin) * (1 - 1e-9)) };
  checkFrame(frame);
  return frame;
}
