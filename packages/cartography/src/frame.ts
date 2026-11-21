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
