/**
 * The labels of a map: the names of points, lines and areas, with no overlap.
 *
 * @packageDocumentation
 */

import { locatePoint, type Feature, type Geometry, type Polygon, type Position } from "@mark1russell7/geo";
import { escapeAttribute, escapeHtml } from "@mark1russell7/text";
import { MapError } from "./errors.ts";
import type { FrameView, PaperPoint } from "./frame.ts";
import { mm } from "./style.ts";

/** The rule of the labels of a layer. */
export interface LabelRule {
  /** The properties of a feature, in sequence. The first property with a text that is not empty gives the label. */
  readonly properties: readonly string[];
  /** The size of the font in millimetres on the paper. */
  readonly sizeMm: number;
  /** The rank of the labels of the layer. A lower rank gets its places first. The default is 0. */
  readonly priority?: number;
  /** For a line: the distance in millimetres between two labels of the same text. No value gives one label for each text. */
  readonly repeatMm?: number;
}

/** The font of the labels. The width of a label comes from `measure`, so the font of the print must be the same font. */
export interface LabelFont {
  /** The CSS font family of the labels, for example `"Liberation Sans", Arial, sans-serif`. */
  readonly family: string;
  /** This function gives the width in millimetres of a text at a size of the font in millimetres. */
  readonly measure: (text: string, sizeMm: number) => number;
}

/** A label with its place: the middle of its box on the paper, and its angle. */
export interface PlacedLabel {
  /** The identifier of the layer of the label. */
  readonly layer: string;
  readonly text: string;
  /** The middle of the label on the paper, in millimetres from the top left corner of the frame. */
  readonly x: number;
  readonly y: number;
  /** The angle of the text in degrees, clockwise, more than -90 and not more than 90. So each label reads from the left. */
  readonly angle: number;
  readonly sizeMm: number;
  readonly widthMm: number;
}

/** The labels of a map: the labels with a place, and the texts with no place. */
export interface LabelPlacement {
  readonly placed: readonly PlacedLabel[];
  /** Each text that has no place with no overlap, inside the frame. */
  readonly skipped: readonly { readonly layer: string; readonly text: string }[];
}

/** A layer as the labels see it: its identifier, its features after its filter, its rule and the size of its points. */
export interface LabelLayer {
  readonly id: string;
  readonly features: readonly Feature[];
  readonly label?: LabelRule | undefined;
  /** The size in millimetres of the point symbol of the layer, when its style has points. */
  readonly pointSizeMm?: number | undefined;
}

/** The gap in millimetres between a point symbol and its label. */
const POINT_GAP_MM = 0.6;
/** The margin in millimetres between a label and the edge of the frame. */
const FRAME_MARGIN_MM = 0.5;
/** The height of the box of a label, as a part of the size of the font. */
const BOX_HEIGHT = 1.2;
/** The room in millimetres at each end of a label along a line. */
const LINE_PAD_MM = 1;
/** The largest distance from a line to the chord of a label, as a part of the size of the font. */
const LINE_BEND = 0.25;

/**
 * This function examines the label rule of a layer.
 *
 * @throws MapError - The code is `label`.
 */
export function checkLabelRule(rule: LabelRule, layer: string): void {
  const fail = (reason: string): never => {
    throw new MapError("label", `The labels of the layer "${layer}": ${reason}`);
  };
  if (!Array.isArray(rule.properties) || rule.properties.length === 0) fail("give at least one property");
  for (const property of rule.properties) if (typeof property !== "string" || property === "") fail("each property is a text that is not empty");
  if (!(Number.isFinite(rule.sizeMm) && rule.sizeMm > 0)) fail(`the size ${rule.sizeMm} is not a finite number more than 0`);
  if (rule.priority !== undefined && !Number.isFinite(rule.priority)) fail(`the priority ${rule.priority} is not a finite number`);
  if (rule.repeatMm !== undefined && !(Number.isFinite(rule.repeatMm) && rule.repeatMm > 0)) fail(`the distance ${rule.repeatMm} is not a finite number more than 0`);
}

/** This function gives the text of the label of a feature: the first property of the rule with a text. */
export function labelText(rule: LabelRule, feature: Feature): string | undefined {
  for (const property of rule.properties) {
    const value = feature.properties?.[property];
    if ((typeof value === "string" || typeof value === "number") && String(value).trim() !== "") return String(value).trim();
  }
  return undefined;
}

/** A box on the paper with an angle: its middle, its half width, its half height and its angle in radians. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly hw: number;
  readonly hh: number;
  readonly angle: number;
}

function corners(box: Box): PaperPoint[] {
  const c = Math.cos(box.angle);
  const s = Math.sin(box.angle);
  return [
    [-box.hw, -box.hh],
    [box.hw, -box.hh],
    [box.hw, box.hh],
    [-box.hw, box.hh],
  ].map(([u, v]) => ({ x: box.x + u! * c - v! * s, y: box.y + u! * s + v! * c }));
}

/** This function tells if two boxes overlap: the test of the separating axis for two rectangles. */
function overlaps(a: Box, b: Box): boolean {
  const ca = corners(a);
  const cb = corners(b);
  for (const angle of [a.angle, a.angle + Math.PI / 2, b.angle, b.angle + Math.PI / 2]) {
    const ax = Math.cos(angle);
    const ay = Math.sin(angle);
    const pa = ca.map((p) => p.x * ax + p.y * ay);
    const pb = cb.map((p) => p.x * ax + p.y * ay);
    if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
  }
  return true;
}

/** The boxes that a label must not overlap, and the frame. */
class Room {
  readonly boxes: Box[] = [];
  readonly widthMm: number;
  readonly heightMm: number;

  constructor(widthMm: number, heightMm: number) {
    this.widthMm = widthMm;
    this.heightMm = heightMm;
  }

  fits(box: Box): boolean {
    for (const p of corners(box)) {
      if (p.x < FRAME_MARGIN_MM || p.y < FRAME_MARGIN_MM || p.x > this.widthMm - FRAME_MARGIN_MM || p.y > this.heightMm - FRAME_MARGIN_MM) return false;
    }
    return !this.boxes.some((other) => overlaps(box, other));
  }
}

function paperOf(position: Position, view: FrameView): PaperPoint {
  return view.toPaper({ lat: position[1] as number, lon: position[0] as number });
}

/** This function gives the points, the lines and the areas of a geometry. */
function parts(geometry: Geometry, out: { points: Position[]; lines: (readonly Position[])[]; areas: Polygon[] }): void {
  switch (geometry.type) {
    case "Point":
      out.points.push(geometry.coordinates);
      break;
    case "MultiPoint":
      out.points.push(...geometry.coordinates);
      break;
    case "LineString":
      out.lines.push(geometry.coordinates);
      break;
    case "MultiLineString":
      out.lines.push(...geometry.coordinates);
      break;
    case "Polygon":
      out.areas.push(geometry);
      break;
    case "MultiPolygon":
      for (const coordinates of geometry.coordinates) out.areas.push({ type: "Polygon", coordinates });
      break;
    case "GeometryCollection":
      for (const item of geometry.geometries) parts(item, out);
      break;
  }
}

/** This function gives the angle of a direction in radians, more than -pi/2 and not more than pi/2, so the text reads from the left. */
function readable(dx: number, dy: number): number {
  let angle = Math.atan2(dy, dx);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle <= -Math.PI / 2) angle += Math.PI;
  return angle;
}

/**
 * This function gives the runs of a line on the paper: the parts with each segment in a box that touches the frame. So
 * a segment that crosses the frame stays in its run. A run can go past the frame, but a label box outside the frame
 * does not fit.
 */
function runs(line: readonly Position[], view: FrameView): PaperPoint[][] {
  const { widthMm: w, heightMm: h } = view.frame;
  const points = line.map((position) => paperOf(position, view));
  const out: PaperPoint[][] = [];
  let run: PaperPoint[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (Math.max(a.x, b.x) >= 0 && Math.min(a.x, b.x) <= w && Math.max(a.y, b.y) >= 0 && Math.min(a.y, b.y) <= h) {
      if (run.length === 0) run.push(a);
      run.push(b);
    } else {
      if (run.length > 1) out.push(run);
      run = [];
    }
  }
  if (run.length > 1) out.push(run);
  return out;
}

/** This function gives the length of a run on the paper. */
function runLength(run: readonly PaperPoint[]): number {
  let total = 0;
  for (let i = 1; i < run.length; i += 1) total += Math.hypot(run[i]!.x - run[i - 1]!.x, run[i]!.y - run[i - 1]!.y);
  return total;
}

/** This function gives the point at a distance along a run, with the cumulative lengths of the run. */
function along(run: readonly PaperPoint[], lengths: readonly number[], s: number): PaperPoint {
  let i = 1;
  while (i < run.length - 1 && lengths[i]! < s) i += 1;
  const a = run[i - 1]!;
  const b = run[i]!;
  const span = lengths[i]! - lengths[i - 1]!;
  const t = span === 0 ? 0 : (s - lengths[i - 1]!) / span;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/**
 * This function gives the boxes of a label along a run, from the middle of the run to its ends. A box is on an almost
 * straight part of the run. No point of that part is farther from the chord than `LINE_BEND` of the size.
 */
function lineCandidates(run: readonly PaperPoint[], width: number, size: number): Box[] {
  const lengths = [0];
  for (let i = 1; i < run.length; i += 1) lengths.push(lengths[i - 1]! + Math.hypot(run[i]!.x - run[i - 1]!.x, run[i]!.y - run[i - 1]!.y));
  const total = lengths.at(-1)!;
  const span = width + 2 * LINE_PAD_MM;
  if (total < span) return [];
  const step = Math.max(span / 4, 2);
  // The middles go from the middle of the run to its ends, one step at a time, first toward the start.
  const middles = [total / 2];
  for (let k = 1; k * step <= total / 2 - span / 2; k += 1) middles.push(total / 2 - k * step, total / 2 + k * step);
  const boxes: Box[] = [];
  for (const middle of middles) {
    const start = along(run, lengths, middle - span / 2);
    const end = along(run, lengths, middle + span / 2);
    const chord = Math.hypot(end.x - start.x, end.y - start.y);
    if (chord < 0.9 * span) continue;
    const inside = run.filter((_, i) => lengths[i]! > middle - span / 2 && lengths[i]! < middle + span / 2);
    const bend = Math.max(0, ...inside.map((p) => Math.abs((end.x - start.x) * (start.y - p.y) - (start.x - p.x) * (end.y - start.y)) / chord));
    if (bend > LINE_BEND * size) continue;
    boxes.push({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, hw: width / 2, hh: (BOX_HEIGHT * size) / 2, angle: readable(end.x - start.x, end.y - start.y) });
  }
  return boxes;
}

/** This function gives the boxes of a label around a point, in the sequence of the preferred places. */
function pointCandidates(p: PaperPoint, width: number, size: number, symbolMm: number): Box[] {
  const hw = width / 2;
  const hh = (BOX_HEIGHT * size) / 2;
  const d = symbolMm / 2 + POINT_GAP_MM;
  const k = d * Math.SQRT1_2;
  return [
    [d + hw, 0],
    [-d - hw, 0],
    [0, -d - hh],
    [0, d + hh],
    [k + hw, -k - hh],
    [k + hw, k + hh],
    [-k - hw, -k - hh],
    [-k - hw, k + hh],
  ].map(([dx, dy]) => ({ x: p.x + dx!, y: p.y + dy!, hw, hh, angle: 0 }));
}

/** This function gives the box of a label in the middle of an area, when the area has each corner of the box. */
function areaCandidates(area: Polygon, view: FrameView, width: number, size: number): Box[] {
  const ring = area.coordinates[0] ?? [];
  if (ring.length < 4) return [];
  const points = ring.map((position) => paperOf(position, view));
  let doubled = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const cross = a.x * b.y - b.x * a.y;
    doubled += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const middle = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const centers = doubled === 0 ? [middle] : [{ x: cx / (3 * doubled), y: cy / (3 * doubled) }, middle];
  const hw = width / 2;
  const hh = (BOX_HEIGHT * size) / 2;
  return centers
    .map((c) => ({ x: c.x, y: c.y, hw, hh, angle: 0 }))
    .filter((box) => [...corners(box), { x: box.x, y: box.y }].every((p) => locatePoint(view.fromPaper(p), area) === "inside"));
}

/** This function tells if the box of the outer ring of an area on the paper touches the frame. */
function areaOnFrame(area: Polygon, view: FrameView): boolean {
  const points = (area.coordinates[0] ?? []).map((position) => paperOf(position, view));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return points.length > 0 && Math.max(...xs) >= 0 && Math.min(...xs) <= view.frame.widthMm && Math.max(...ys) >= 0 && Math.min(...ys) <= view.frame.heightMm;
}

/** One text of a layer, and the parts of the features with that text. */
interface Job {
  readonly layer: LabelLayer;
  readonly rule: LabelRule;
  readonly text: string;
  readonly width: number;
  readonly points: Position[];
  readonly lines: (readonly Position[])[];
  readonly areas: Polygon[];
}

/**
 * This function gives the places of the labels of the layers. The labels do not overlap, and each label is inside the
 * frame.
 *
 * - The layers with a lower `priority` get their places first. With the same priority, a higher layer is first.
 * - In a layer, the features with the same text are one job. A longer line is first, then the sequence of the features.
 * - A point gets the first free place of 8 places around its symbol: right, left, above, below, then the corners.
 * - A line gets its text along an almost straight part. The longest run is first, and the middle of a run is first.
 * - With `repeatMm`, a line gets more labels of its text, at that distance or more from each other.
 * - An area gets its text at its centroid or at the middle of its box, when the area has the box of the text.
 * - Each point symbol of the layers and the north arrow are obstacles too.
 * - A text with a part on the frame and no free place is in `skipped`. A text with no part on the frame is in neither list.
 *
 * @param obstacles - The boxes on the paper that no label covers, as the middle and the half size in millimetres.
 * @throws MapError - The code is `label`: the width of a text from `measure` is not a finite number of 0 or more.
 */
export function placeLabels(layers: readonly LabelLayer[], view: FrameView, font: LabelFont, obstacles: readonly { x: number; y: number; half: number }[] = []): LabelPlacement {
  const room = new Room(view.frame.widthMm, view.frame.heightMm);
  for (const o of obstacles) room.boxes.push({ x: o.x, y: o.y, hw: o.half, hh: o.half, angle: 0 });
  for (const layer of layers) {
    if (layer.pointSizeMm === undefined) continue;
    const out: { points: Position[]; lines: (readonly Position[])[]; areas: Polygon[] } = { points: [], lines: [], areas: [] };
    for (const feature of layer.features) if (feature.geometry !== null) parts(feature.geometry, out);
    for (const position of out.points) {
      const p = paperOf(position, view);
      room.boxes.push({ x: p.x, y: p.y, hw: layer.pointSizeMm / 2, hh: layer.pointSizeMm / 2, angle: 0 });
    }
  }

  const order = layers
    .map((layer, index) => ({ layer, index }))
    .filter((entry): entry is { layer: LabelLayer & { label: LabelRule }; index: number } => entry.layer.label !== undefined)
    .sort((a, b) => (a.layer.label.priority ?? 0) - (b.layer.label.priority ?? 0) || b.index - a.index);

  const placed: PlacedLabel[] = [];
  const skipped: { layer: string; text: string }[] = [];
  for (const { layer } of order) {
    const rule = layer.label;
    const jobs = new Map<string, Job>();
    for (const feature of layer.features) {
      if (feature.geometry === null) continue;
      const text = labelText(rule, feature);
      if (text === undefined) continue;
      let job = jobs.get(text);
      if (job === undefined) {
        const width = font.measure(text, rule.sizeMm);
        if (!(Number.isFinite(width) && width >= 0)) throw new MapError("label", `The width ${width} of the label "${text}" is not a finite number of 0 or more`);
        job = { layer, rule, text, width, points: [], lines: [], areas: [] };
        jobs.set(text, job);
      }
      parts(feature.geometry, job);
    }
    // The runs of each job, the longest first. The jobs with the most length of line are first.
    const sorted = [...jobs.values()]
      .map((job) => {
        const lineRuns = job.lines
          .flatMap((line) => runs(line, view))
          .map((run) => ({ run, length: runLength(run) }))
          .sort((a, b) => b.length - a.length);
        return { job, lineRuns, length: lineRuns.reduce((t, entry) => t + entry.length, 0) };
      })
      .sort((a, b) => b.length - a.length);
    for (const { job, lineRuns } of sorted) {
      const mine: PlacedLabel[] = [];
      // A text is in `skipped` only when a part of its features is on the frame.
      let onFrame = false;
      const take = (box: Box): boolean => {
        if (!room.fits(box)) return false;
        if (job.rule.repeatMm !== undefined && mine.some((other) => Math.hypot(other.x - box.x, other.y - box.y) < job.rule.repeatMm!)) return false;
        room.boxes.push(box);
        mine.push({ layer: layer.id, text: job.text, x: box.x, y: box.y, angle: (box.angle * 180) / Math.PI + 0, sizeMm: job.rule.sizeMm, widthMm: job.width });
        return true;
      };
      for (const position of job.points) {
        const p = paperOf(position, view);
        if (p.x < 0 || p.y < 0 || p.x > view.frame.widthMm || p.y > view.frame.heightMm) continue;
        onFrame = true;
        pointCandidates(p, job.width, job.rule.sizeMm, layer.pointSizeMm ?? 0).some(take);
      }
      if (lineRuns.length > 0) onFrame = true;
      lines: for (const { run } of lineRuns) {
        for (const box of lineCandidates(run, job.width, job.rule.sizeMm)) {
          if (take(box) && job.rule.repeatMm === undefined) break lines;
        }
      }
      for (const area of job.areas) {
        if (!areaOnFrame(area, view)) continue;
        onFrame = true;
        areaCandidates(area, view, job.width, job.rule.sizeMm).some(take);
      }
      if (mine.length === 0 && onFrame) skipped.push({ layer: layer.id, text: job.text });
      placed.push(...mine);
    }
  }
  return { placed, skipped };
}

/** This function gives the SVG of the labels: black text with a white halo, so a label reads over the lines of the map. */
export function labelsSvg(placement: LabelPlacement, font: LabelFont): string {
  const texts = placement.placed.map((label) => {
    const rotate = label.angle === 0 ? "" : ` transform="rotate(${mm(label.angle)} ${mm(label.x)} ${mm(label.y)})"`;
    return (
      `<text x="${mm(label.x)}" y="${mm(label.y)}" font-size="${mm(label.sizeMm)}"${rotate} text-anchor="middle" dominant-baseline="central" ` +
      `fill="#000000" stroke="#ffffff" stroke-width="${mm(label.sizeMm * 0.25)}" stroke-linejoin="round" paint-order="stroke">${escapeHtml(label.text)}</text>`
    );
  });
  return `<g class="labels" font-family="${escapeAttribute(font.family)}" data-skipped="${placement.skipped.length}">${texts.join("")}</g>`;
}
