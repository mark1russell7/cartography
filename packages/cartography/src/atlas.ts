/**
 * An atlas: the pages of a large area at one scale, with the names of the neighbor pages and the outlines for an index map.
 *
 * @packageDocumentation
 */

import type { Feature, LatLon } from "@mark1russell7/geo";
import type { Projection } from "@mark1russell7/geo/projection";
import { MapError } from "./errors.ts";
import { checkFrame, frameView, type Frame } from "./frame.ts";
import type { FrameEdge } from "./marks.ts";

/** The plan of an atlas: the area, the scale and the size of the map on each page. */
export interface AtlasPlan {
  /** The projection of all the pages. One projection puts the pages on one plane, so the edges of neighbor pages agree. */
  readonly projection: Projection;
  /** The center of the area on the Earth. The grid of the pages has its middle at this point. */
  readonly center: LatLon;
  /** The radius of the area on the ground, in metres. The atlas keeps each page that shows a part of the circle. */
  readonly radiusMeters: number;
  /** The denominator of the scale of each page: 63360 for the scale 1:63,360 (1 inch for 1 mile). */
  readonly scale: number;
  /** The width of the map on each page, in millimetres. */
  readonly widthMm: number;
  /** The height of the map on each page, in millimetres. */
  readonly heightMm: number;
  /** The width of the strip at each edge that the neighbor page also shows, in millimetres. The default is 10. */
  readonly overlapMm?: number | undefined;
}

/** One page of an atlas. */
export interface AtlasPage {
  /**
   * The name of the page: the letters of its column and the number of its row, for example `B3`.
   * The columns go from west to east, and the rows from north to south.
   */
  readonly id: string;
  /** The index of the column in the grid, from 0 at the west. */
  readonly column: number;
  /** The index of the row in the grid, from 0 at the north. */
  readonly row: number;
  /** The frame of the map of the page. */
  readonly frame: Frame;
  /**
   * The names of the neighbor pages at the edges of the page. An edge with no page in the atlas has no name.
   * The top edge is at the north of the center of the area.
   */
  readonly neighbors: Readonly<Partial<Record<FrameEdge, string>>>;
}

/** The pages of an atlas, in the order of the rows and then the columns. */
export interface Atlas {
  /** The plan of the atlas. */
  readonly plan: AtlasPlan;
  /** The number of columns of the grid. */
  readonly columns: number;
  /** The number of rows of the grid. */
  readonly rows: number;
  /** The pages that show a part of the area. A page of the grid outside the circle is not in the list. */
  readonly pages: readonly AtlasPage[];
}

/** The default width of the overlap of neighbor pages, in millimetres. */
export const ATLAS_OVERLAP_MM = 10;

/**
 * This function gives the name of a column: A to Z, then AA, AB and the next names.
 *
 * @throws MapError - The code is `atlas`. The index is not an integer of 0 or more.
 */
export function columnName(index: number): string {
  if (!(Number.isInteger(index) && index >= 0)) throw new MapError("atlas", `The column ${index} is not an integer of 0 or more`);
  let name = "";
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  return name;
}

/**
 * This function gives the pages of an atlas: a grid of frames on the plane of the projection.
 * The middle of the grid is at the center of the area.
 *
 * - Neighbor pages share a strip of `overlapMm` at their common edge.
 * - The grid has the smallest number of columns and rows that shows the full circle.
 * - Each page has the scale of the plan at its own center. For `azimuthalEquidistant` over 50 km, the edges of neighbor pages agree to 0.01 mm.
 *
 * @throws MapError - The code is `frame` or `atlas`.
 */
export function atlasPages(plan: AtlasPlan): Atlas {
  const overlapMm = plan.overlapMm ?? ATLAS_OVERLAP_MM;
  checkFrame(plan);
  if (!(Number.isFinite(plan.radiusMeters) && plan.radiusMeters > 0)) throw new MapError("atlas", `The radius ${plan.radiusMeters} of the atlas is not a finite number more than 0`);
  if (!(Number.isFinite(overlapMm) && overlapMm >= 0 && overlapMm < Math.min(plan.widthMm, plan.heightMm) / 2)) {
    throw new MapError("atlas", `The overlap ${overlapMm} of the atlas is not from 0 to less than half of the smaller side of the page`);
  }
  const middle = frameView(plan);
  const origin = plan.projection.toPlane(plan.center);
  // All the sizes are in millimetres on the paper, at the scale of the center of the area.
  const radiusMm = plan.radiusMeters * middle.mmPerMeter;
  const stepX = plan.widthMm - overlapMm;
  const stepY = plan.heightMm - overlapMm;
  const columns = Math.max(1, Math.ceil((2 * radiusMm - plan.widthMm) / stepX) + 1);
  const rows = Math.max(1, Math.ceil((2 * radiusMm - plan.heightMm) / stepY) + 1);
  const offsetX = (column: number): number => (column - (columns - 1) / 2) * stepX;
  const offsetY = (row: number): number => ((rows - 1) / 2 - row) * stepY;
  const shows = (column: number, row: number): boolean => {
    if (column < 0 || column >= columns || row < 0 || row >= rows) return false;
    const dx = Math.max(Math.abs(offsetX(column)) - plan.widthMm / 2, 0);
    const dy = Math.max(Math.abs(offsetY(row)) - plan.heightMm / 2, 0);
    return dx * dx + dy * dy < radiusMm * radiusMm;
  };
  const name = (column: number, row: number): string => `${columnName(column)}${row + 1}`;
  const pages: AtlasPage[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (!shows(column, row)) continue;
      const center = plan.projection.fromPlane({ x: origin.x + offsetX(column) / middle.mmPerPlaneMeter, y: origin.y + offsetY(row) / middle.mmPerPlaneMeter });
      const neighbors: Partial<Record<FrameEdge, string>> = {};
      for (const [edge, dc, dr] of [["top", 0, -1], ["right", 1, 0], ["bottom", 0, 1], ["left", -1, 0]] as const) {
        if (shows(column + dc, row + dr)) neighbors[edge] = name(column + dc, row + dr);
      }
      const frame: Frame = { projection: plan.projection, center, scale: plan.scale, widthMm: plan.widthMm, heightMm: plan.heightMm };
      pages.push({ id: name(column, row), column, row, frame, neighbors });
    }
  }
  return { plan, columns, rows, pages };
}

/**
 * This function gives the outline of each page of an atlas as a polygon feature, with the name of the page in the property `id`.
 * A layer of an index map draws them. Each edge has `pointsPerEdge` points, because the edges of the pages are curves on the Earth.
 *
 * @throws MapError - The code is `atlas`. The number of points is not an integer of 1 or more.
 */
export function atlasOutlines(atlas: Atlas, pointsPerEdge = 16): Feature[] {
  if (!(Number.isInteger(pointsPerEdge) && pointsPerEdge >= 1)) throw new MapError("atlas", `The number of points ${pointsPerEdge} of an edge is not an integer of 1 or more`);
  return atlas.pages.map((page) => {
    const view = frameView(page.frame);
    const { widthMm: w, heightMm: h } = page.frame;
    const ring: [number, number][] = [];
    for (let i = 0; i < pointsPerEdge; i += 1) ring.push(lonLat(view.fromPaper({ x: (i / pointsPerEdge) * w, y: 0 })));
    for (let i = 0; i < pointsPerEdge; i += 1) ring.push(lonLat(view.fromPaper({ x: w, y: (i / pointsPerEdge) * h })));
    for (let i = 0; i < pointsPerEdge; i += 1) ring.push(lonLat(view.fromPaper({ x: w - (i / pointsPerEdge) * w, y: h })));
    for (let i = 0; i < pointsPerEdge; i += 1) ring.push(lonLat(view.fromPaper({ x: 0, y: h - (i / pointsPerEdge) * h })));
    // GeoJSON gives the outer ring of a polygon in the counterclockwise direction. The walk on the paper is clockwise, so it is reversed.
    ring.reverse();
    ring.push(ring[0]!);
    return { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: { id: page.id } };
  });
}

/**
 * This function gives the frame of an index map of an atlas. The frame shows all the pages of the grid in the space, at the largest scale.
 * Its center is the middle of the grid.
 *
 * @throws MapError - The code is `frame`.
 */
export function atlasIndexFrame(atlas: Atlas, widthMm: number, heightMm: number): Frame {
  const { plan } = atlas;
  checkFrame({ ...plan, widthMm, heightMm });
  const overlapMm = plan.overlapMm ?? ATLAS_OVERLAP_MM;
  const gridWidthMm = (atlas.columns - 1) * (plan.widthMm - overlapMm) + plan.widthMm;
  const gridHeightMm = (atlas.rows - 1) * (plan.heightMm - overlapMm) + plan.heightMm;
  const scale = plan.scale * Math.max(gridWidthMm / widthMm, gridHeightMm / heightMm);
  return { projection: plan.projection, center: plan.center, scale, widthMm, heightMm };
}

/** This function gives the GeoJSON position `[lon, lat]` of a point. */
function lonLat(point: LatLon): [number, number] {
  return [point.lon, point.lat];
}
