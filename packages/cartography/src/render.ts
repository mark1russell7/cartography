/**
 * A map as data, and its render to SVG.
 *
 * @packageDocumentation
 */

import { simplifyLines, simplifyRegions, type Feature, type Geometry, type Position, type Region } from "@mark1russell7/geo";
import { escapeAttribute, escapeHtml } from "@mark1russell7/text";
import { MapError } from "./errors.ts";
import { checkFilter, matchesFilter, type Filter } from "./filter.ts";
import { frameView, type Frame, type FrameView, type PaperPoint } from "./frame.ts";
import { checkLabelRule, labelsSvg, placeLabels, type LabelFont, type LabelPlacement, type LabelRule } from "./labels.ts";
import { EDGE_TEXT_MM, edgeMarks, FRAME_EDGES, northArrowSvg, SCALE_BAR_ROW_MM, scaleBarLength, scaleBarSvg, type EdgeMark, type FrameEdge, type ScaleBarUnits } from "./marks.ts";
import { checkStyle, grayColor, hatchPattern, mm, pointSymbol, rounded, strokeAttributes, type Style } from "./style.ts";

/** The source of the data of a layer. The map prints each source in its attribution block. */
export interface Source {
  /** The name of the source, for example `© OpenStreetMap contributors`. */
  readonly title: string;
  /** The license of the data, for example `ODbL 1.0`. */
  readonly license: string;
  /** The web address of the source or of its license. */
  readonly url?: string;
  /** The date of the data, for example `2026-11-21`. */
  readonly date?: string;
}

/** A layer of a map: features, a filter, a style and the source of the features. */
export interface Layer {
  /** The identifier of the layer: lower case letters, digits and hyphens. It starts with a letter. */
  readonly id: string;
  /** The features. Their positions are `[lon, lat]` on WGS84. */
  readonly features: readonly Feature[];
  /** The style of the features. */
  readonly style: Style;
  /** The source of the features. */
  readonly source: Source;
  /** The filter of the features. No filter keeps each feature. */
  readonly filter?: Filter;
  /** The text of the layer in the legend. No text gives no entry in the legend. */
  readonly legend?: string;
  /** The tolerance in millimetres on the paper for the simplification of the areas and the lines. No value keeps each position. */
  readonly simplifyMm?: number;
  /** The rule of the labels of the features. No rule gives no labels. */
  readonly label?: LabelRule;
}

/** A map: a frame, layers from the bottom to the top, and its marks. */
export interface MapDocument {
  /** The identifier of the map: lower case letters, digits and hyphens. It starts each identifier in the SVG. */
  readonly id: string;
  /** The title of the map, for a reader of the screen. */
  readonly title: string;
  /** The frame. */
  readonly frame: Frame;
  /** The layers, from the bottom to the top. */
  readonly layers: readonly Layer[];
  /** The units of the scale bars. The default is `both`. */
  readonly scaleBar?: ScaleBarUnits;
  /** The value `false` gives no north arrow. The default is `true`. */
  readonly northArrow?: boolean;
  /** The place of the scale bars and the legend. The default is `below`. `fitFrame` finds the place with the largest frame. */
  readonly legendPlace?: LegendPlace;
  /**
   * The texts at the middle of the edges of the frame, for example the names of the neighbor pages of an atlas.
   * Each text is in a white box with an arrow that points out of the frame. No labels cover the boxes.
   */
  readonly edges?: Readonly<Partial<Record<FrameEdge, string>>>;
}

/** The place of the scale bars and the legend: below the frame, or in a column at the right side of the frame. */
export type LegendPlace = "below" | "side";

const LEGEND_PLACES: readonly LegendPlace[] = ["below", "side"];

const ID = /^[a-z][a-z0-9-]*$/;

function checkId(id: string, what: string): void {
  if (!ID.test(id)) throw new MapError("id", `The identifier "${id}" of the ${what} is not lower case letters, digits and hyphens that start with a letter`);
}

/** This function refuses a source with no title or no license. The owner is the text of its layer or its place in a list. */
function checkSource(source: Source | undefined, owner: string): void {
  if (source === undefined || source === null || typeof source !== "object") throw new MapError("source", `${owner.charAt(0).toUpperCase()}${owner.slice(1)} has no source`);
  if (typeof source.title !== "string" || source.title.trim() === "") throw new MapError("source", `The source of ${owner} has no title`);
  if (typeof source.license !== "string" || source.license.trim() === "") throw new MapError("source", `The source of ${owner} has no license`);
}

/**
 * This function examines a map. It refuses a frame, an identifier, a style, a filter or a source that is not correct.
 * Each layer must have a source with a title and a license, so the attribution block names each source of the map.
 *
 * @throws MapError - The code tells the reason.
 */
export function checkMap(map: MapDocument): void {
  checkId(map.id, "map");
  frameView(map.frame);
  if (map.legendPlace !== undefined && !LEGEND_PLACES.includes(map.legendPlace)) {
    throw new MapError("style", `The place of the legend "${String(map.legendPlace)}" is not "below" or "side"`);
  }
  const ids = new Set<string>();
  for (const layer of map.layers) {
    checkId(layer.id, "layer");
    if (ids.has(layer.id)) throw new MapError("id", `Two layers have the identifier "${layer.id}"`);
    ids.add(layer.id);
    checkSource(layer.source, `the layer "${layer.id}"`);
    checkStyle(layer.style, layer.id);
    if (layer.filter !== undefined) checkFilter(layer.filter, `layer "${layer.id}" filter`);
    if (layer.label !== undefined) checkLabelRule(layer.label, layer.id);
    if (layer.simplifyMm !== undefined && !(Number.isFinite(layer.simplifyMm) && layer.simplifyMm > 0)) {
      throw new MapError("style", `The layer "${layer.id}": the tolerance ${layer.simplifyMm} is not a finite number more than 0`);
    }
  }
  if (map.edges !== undefined) {
    if (typeof map.edges !== "object" || map.edges === null) throw new MapError("label", "The edge texts of the map are not an object");
    for (const [edge, text] of Object.entries(map.edges)) {
      if (!(FRAME_EDGES as readonly string[]).includes(edge)) throw new MapError("label", `The edge "${edge}" is not top, right, bottom or left`);
      if (text !== undefined && (typeof text !== "string" || text.trim() === "")) throw new MapError("label", `The text of the edge "${edge}" is not a text that is not empty`);
    }
  }
}

/** The box of the points on the paper that a feature uses. */
class PaperBox {
  minX = Number.POSITIVE_INFINITY;
  minY = Number.POSITIVE_INFINITY;
  maxX = Number.NEGATIVE_INFINITY;
  maxY = Number.NEGATIVE_INFINITY;

  add(point: PaperPoint): void {
    this.minX = Math.min(this.minX, point.x);
    this.minY = Math.min(this.minY, point.y);
    this.maxX = Math.max(this.maxX, point.x);
    this.maxY = Math.max(this.maxY, point.y);
  }

  /** It tells if the box touches the frame, with a margin in millimetres. */
  touches(frame: Frame, margin: number): boolean {
    return this.maxX >= -margin && this.minX <= frame.widthMm + margin && this.maxY >= -margin && this.minY <= frame.heightMm + margin;
  }
}

function paperOf(position: Position, view: FrameView): PaperPoint {
  return view.toPaper({ lat: position[1] as number, lon: position[0] as number });
}

function linePath(positions: readonly Position[], view: FrameView, box: PaperBox, close: boolean, decimals: number): string {
  let d = "";
  positions.forEach((position, i) => {
    const point = paperOf(position, view);
    box.add(point);
    d += `${i === 0 ? "M" : "L"}${rounded(point.x, decimals)} ${rounded(point.y, decimals)}`;
  });
  return close ? `${d}Z` : d;
}

/** This function gives the path data of a geometry, and adds each of its points to the box. */
function pathOf(geometry: Geometry, view: FrameView, box: PaperBox, decimals: number): string {
  switch (geometry.type) {
    case "Point":
    case "MultiPoint":
      return "";
    case "LineString":
      return linePath(geometry.coordinates, view, box, false, decimals);
    case "MultiLineString":
      return geometry.coordinates.map((line) => linePath(line, view, box, false, decimals)).join("");
    case "Polygon":
    case "MultiPolygon": {
      const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
      return polygons.flatMap((rings) => rings.map((ring) => linePath(ring, view, box, true, decimals))).join("");
    }
    case "GeometryCollection":
      return geometry.geometries.map((item) => pathOf(item, view, box, decimals)).join("");
  }
}

/** The options of `geometryPath`. */
export interface PathOptions {
  /** The number of decimals of each millimetre value: an integer from 0 to 10. The default is 2, as in `renderMap`. */
  readonly decimals?: number;
}

/**
 * This function gives the SVG path data (the attribute `d`) of a geometry on the paper of a frame, in millimetres.
 * `renderMap` uses the same path data for its lines and areas.
 *
 * - Each ring of a polygon is `M` and its first point, `L` and each next point, and `Z`: `M10 20L30 20L30 40Z`.
 * - A line is the same with no `Z`.
 * - A polygon with holes and a multi-polygon give one path data. Use `fill-rule="evenodd"` to fill it.
 * - A point gives no path data. A geometry collection gives the path data of each of its geometries.
 * - The function does not clip. A point out of the frame gives values out of the frame.
 *
 * @throws MapError - The code is `style`. The number of decimals is not an integer from 0 to 10.
 * @throws GeoError - A position is not correct for the projection.
 */
export function geometryPath(view: FrameView, geometry: Geometry, options: PathOptions = {}): string {
  const decimals = options.decimals ?? 2;
  if (!(Number.isInteger(decimals) && decimals >= 0 && decimals <= 10)) throw new MapError("style", `The number of decimals ${decimals} is not an integer from 0 to 10`);
  return pathOf(geometry, view, new PaperBox(), decimals);
}

/** This function gives the SVG of one geometry with a style. */
function drawGeometry(geometry: Geometry, style: Style, view: FrameView, fill: string | undefined): string {
  const frame = view.frame;
  switch (geometry.type) {
    case "Point":
    case "MultiPoint": {
      if (style.point === undefined) return "";
      const positions = geometry.type === "Point" ? [geometry.coordinates] : geometry.coordinates;
      return positions
        .map((position) => paperOf(position, view))
        .filter((point) => point.x >= -style.point!.sizeMm && point.x <= frame.widthMm + style.point!.sizeMm && point.y >= -style.point!.sizeMm && point.y <= frame.heightMm + style.point!.sizeMm)
        .map((point) => pointSymbol(style.point!, point.x, point.y))
        .join("");
    }
    case "LineString":
    case "MultiLineString": {
      if (style.stroke === undefined) return "";
      const box = new PaperBox();
      const d = pathOf(geometry, view, box, 2);
      if (!box.touches(frame, style.stroke.widthMm)) return "";
      return `<path d="${d}" fill="none" ${strokeAttributes(style.stroke)}/>`;
    }
    case "Polygon":
    case "MultiPolygon": {
      const box = new PaperBox();
      const d = pathOf(geometry, view, box, 2);
      if (!box.touches(frame, style.stroke?.widthMm ?? 0)) return "";
      const stroke = style.stroke === undefined ? `stroke="none"` : strokeAttributes(style.stroke);
      let svg = "";
      if (style.fill?.gray !== undefined) svg += `<path d="${d}" fill="${grayColor(style.fill.gray)}" fill-rule="evenodd" stroke="none"/>`;
      svg += `<path d="${d}" fill="${fill ?? "none"}" fill-rule="evenodd" ${stroke}/>`;
      return svg;
    }
    case "GeometryCollection":
      return geometry.geometries.map((item) => drawGeometry(item, style, view, fill)).join("");
  }
}

/** This function gives the features of a layer after its filter and its simplification. */
function featuresOf(layer: Layer, frame: Frame): Feature[] {
  const kept = layer.features.filter((feature) => feature.geometry !== null && (layer.filter === undefined || matchesFilter(layer.filter, feature)));
  if (layer.simplifyMm === undefined) return kept;
  // A tolerance of t mm on the paper is t * scale mm on the ground, and t * scale / 1e6 km.
  const toleranceKm = (layer.simplifyMm * frame.scale) / 1e6;
  const result = [...kept];
  const areas = kept.flatMap((feature, i) => (feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon" ? [i] : []));
  if (areas.length > 0) {
    const simplified = simplifyRegions(
      areas.map((i) => kept[i]!.geometry as Region),
      toleranceKm,
    );
    areas.forEach((index, j) => {
      result[index] = { ...kept[index]!, geometry: simplified[j]! };
    });
  }
  // The lines of the layer go to simplifyLines together, so lines that meet at a position still meet there.
  const lines = kept.flatMap((feature, i) => (feature.geometry?.type === "LineString" || feature.geometry?.type === "MultiLineString" ? [i] : []));
  if (lines.length > 0) {
    const parts = lines.flatMap((i) => {
      const geometry = kept[i]!.geometry!;
      return geometry.type === "LineString" ? [geometry.coordinates] : geometry.type === "MultiLineString" ? geometry.coordinates : [];
    });
    const simplified = simplifyLines(parts, toleranceKm);
    let next = 0;
    for (const index of lines) {
      const geometry = kept[index]!.geometry!;
      if (geometry.type === "LineString") {
        result[index] = { ...kept[index]!, geometry: { type: "LineString", coordinates: simplified[next]! } };
        next += 1;
      } else if (geometry.type === "MultiLineString") {
        result[index] = { ...kept[index]!, geometry: { type: "MultiLineString", coordinates: simplified.slice(next, next + geometry.coordinates.length) } };
        next += geometry.coordinates.length;
      }
    }
  }
  return result;
}

/** The options of `renderMap` and `mapLabels`. */
export interface RenderOptions {
  /** The font of the labels. A map with a label rule needs it. */
  readonly labelFont?: LabelFont;
}

/** The middle of the north arrow, from the top right corner of the frame, and the half size of its box, in millimetres. */
const NORTH_ARROW = { inset: 6.5, half: 4.7 };

/** This function gives the marks of the edge texts of a map. Without a font, the width of a text is an estimate. */
function edgeMarksOf(map: MapDocument, font: LabelFont | undefined): EdgeMark[] {
  const measure = (text: string): number => (font === undefined ? text.length * EDGE_TEXT_MM * CHARACTER_WIDTH : font.measure(text, EDGE_TEXT_MM));
  return edgeMarks(map.frame.widthMm, map.frame.heightMm, map.edges ?? {}, measure);
}

function placementOf(map: MapDocument, features: readonly Feature[][], view: FrameView, font: LabelFont): LabelPlacement {
  const obstacles = [
    ...(map.northArrow === false ? [] : [{ x: map.frame.widthMm - NORTH_ARROW.inset, y: NORTH_ARROW.inset, half: NORTH_ARROW.half }]),
    ...edgeMarksOf(map, font).map((mark) => ({ x: mark.x, y: mark.y, half: mark.halfWidth, halfHeight: mark.halfHeight })),
  ];
  const layers = map.layers.map((layer, i) => ({ id: layer.id, features: features[i]!, label: layer.label, pointSizeMm: layer.style.point?.sizeMm }));
  return placeLabels(layers, view, font, obstacles);
}

function labelFontOf(map: MapDocument, options: RenderOptions): LabelFont | undefined {
  const labelled = map.layers.find((layer) => layer.label !== undefined);
  if (labelled === undefined) return undefined;
  const font = options.labelFont;
  if (font === undefined || typeof font.measure !== "function" || typeof font.family !== "string" || font.family.trim() === "") {
    throw new MapError("label", `The layer "${labelled.id}" has labels, so the options need a label font with a family and a measure`);
  }
  return font;
}

/**
 * This function gives the labels of a map with their places, and the texts with no place. `renderMap` draws the same
 * labels.
 *
 * @throws MapError - The map is not correct, as `checkMap` tells, or a layer has labels and the options have no font.
 */
export function mapLabels(map: MapDocument, options: RenderOptions = {}): LabelPlacement {
  checkMap(map);
  const font = labelFontOf(map, options);
  if (font === undefined) return { placed: [], skipped: [] };
  return placementOf(map, map.layers.map((layer) => featuresOf(layer, map.frame)), frameView(map.frame), font);
}

/** This function gives the swatch of a layer in the legend, with its top left corner at a point. */
function swatch(style: Style, x: number, y: number, fill: string | undefined): string {
  if (style.point !== undefined) return pointSymbol(style.point, x + 3, y + 1.75);
  if (style.fill !== undefined) {
    const stroke = style.stroke === undefined ? `stroke="#000000" stroke-width="0.1"` : strokeAttributes(style.stroke);
    const base = style.fill.gray === undefined ? "" : `<rect x="${mm(x)}" y="${mm(y)}" width="6" height="3.5" fill="${grayColor(style.fill.gray)}"/>`;
    return `${base}<rect x="${mm(x)}" y="${mm(y)}" width="6" height="3.5" fill="${fill ?? "none"}" ${stroke}/>`;
  }
  return `<path d="M${mm(x)} ${mm(y + 1.75)}L${mm(x + 6)} ${mm(y + 1.75)}" ${strokeAttributes(style.stroke!)}/>`;
}

function thousands(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** The space between the frame and the column of the legend at the side, in millimetres. */
const SIDE_GAP_MM = 3;
/** The space above the first row of the column of the legend at the side, in millimetres. */
const SIDE_TOP_MM = 1;
/** The least width of the column of the legend at the side, in millimetres. */
const SIDE_LEAST_WIDTH_MM = 30;
/** The space between the scale bars and the legend in the column at the side, in millimetres. */
const SIDE_GROUP_GAP_MM = 1.5;
/** The space at the right of a scale bar in the column at the side for its label, in millimetres. */
const SCALE_LABEL_MM = 12;
/** The size of the font of the legend texts, in millimetres. */
const LEGEND_TEXT_MM = 2.4;
/** The distance from the left side of a swatch to its text, in millimetres. */
const LEGEND_TEXT_X_MM = 7.5;
/** The width of a character of a legend text, as a part of the size of the font, when the options have no font. */
const CHARACTER_WIDTH = 0.6;

/** The parts of the legend of a map, with the space that they use. The size of the frame does not change them. */
interface LegendLayout {
  readonly bars: readonly ("metric" | "imperial")[];
  readonly lines: readonly string[];
  /** The width of the column at the side, or 0. */
  readonly columnMm: number;
  /** The height of the column at the side, or 0. */
  readonly columnHeightMm: number;
  /** The height of the block of the scale bars and the legend below the frame, or 0. */
  readonly blockMm: number;
}

/** This function gives the font that measures the legend texts: the label font of the options, if it has a measure. */
function measureFontOf(options: RenderOptions): LabelFont | undefined {
  const font = options.labelFont;
  return font !== undefined && typeof font.measure === "function" ? font : undefined;
}

function legendLayout(map: MapDocument, font: LabelFont | undefined): LegendLayout {
  const units = map.scaleBar ?? "both";
  const bars = units === "none" ? [] : units === "both" ? (["metric", "imperial"] as const) : [units];
  const texts = map.layers.flatMap((layer) => (layer.legend === undefined ? [] : [layer.legend]));
  const lines = attributionLines(map);
  const place = map.legendPlace ?? "below";
  if (place === "below" || bars.length + texts.length === 0) {
    const blockMm = place === "below" ? Math.max(bars.length, Math.ceil(texts.length / 2)) * SCALE_BAR_ROW_MM : 0;
    return { bars, lines, columnMm: 0, columnHeightMm: 0, blockMm };
  }
  const width = (text: string): number => (font === undefined ? text.length * LEGEND_TEXT_MM * CHARACTER_WIDTH : font.measure(text, LEGEND_TEXT_MM));
  const widest = Math.max(0, ...texts.map(width));
  const columnMm = Math.max(SIDE_LEAST_WIDTH_MM, LEGEND_TEXT_X_MM + widest + 1);
  const gap = bars.length > 0 && texts.length > 0 ? SIDE_GROUP_GAP_MM : 0;
  const columnHeightMm = SIDE_TOP_MM + (bars.length + texts.length) * SCALE_BAR_ROW_MM + gap;
  return { bars, lines, columnMm, columnHeightMm, blockMm: 0 };
}

/** The space of the SVG of a map around its frame, in millimetres. */
export interface MapMargins {
  /** The width at the right of the frame: the gap and the column of the legend at the side, or 0. */
  readonly rightMm: number;
  /** The height below the frame: the legend below the frame, if it is there, and the attribution block. */
  readonly belowMm: number;
  /** The height of the column of the legend at the side, or 0. A frame with less height makes the SVG taller. */
  readonly leastHeightMm: number;
}

function marginsOf(layout: LegendLayout): MapMargins {
  return {
    rightMm: layout.columnMm === 0 ? 0 : SIDE_GAP_MM + layout.columnMm,
    belowMm: 2 + layout.blockMm + 2.5 + (layout.lines.length - 1) * 3 + 1.5,
    leastHeightMm: layout.columnHeightMm,
  };
}

/**
 * This function gives the space of the SVG of a map around its frame, for the place of the legend of the map. The
 * size of the frame does not change it.
 *
 * - The label font of the options measures the legend texts. With no font, each character is 0.6 of the size of the font.
 * - The SVG of the map is `rightMm` wider and `belowMm` taller than its frame.
 *
 * @throws MapError - The map is not correct, as `checkMap` tells.
 */
export function mapMargins(map: MapDocument, options: RenderOptions = {}): MapMargins {
  checkMap(map);
  return marginsOf(legendLayout(map, measureFontOf(options)));
}

/** A space for the SVG of a map, in millimetres, for example the printable area of a paper below a heading. */
export interface MapSpace {
  readonly widthMm: number;
  readonly heightMm: number;
}

/** The options of `fitFrame`. */
export interface FitOptions {
  /** The font of the labels. It also measures the legend texts. */
  readonly labelFont?: LabelFont;
  /** The places of the legend to examine. The default is `below` and `side`. */
  readonly places?: readonly LegendPlace[];
}

/** The frame with the largest area for a map in one of a list of spaces. */
export interface FrameFit {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly legendPlace: LegendPlace;
  /** The index of the space of the frame in the list of spaces. */
  readonly space: number;
}

/**
 * This function gives the frame with the largest area for a map in one of a list of spaces, and the place of its
 * legend. The SVG of the map with that frame and that place fits that space.
 *
 * - Give one space for each choice of the caller, for example a paper upright and the same paper in landscape.
 * - The scale of the map does not change, so a larger frame shows more ground.
 * - The size of the frame of the map does not change the result.
 * - With two choices of equal area, the first place of the options wins, and then the first space.
 *
 * @throws MapError - The map is not correct, a place or a space is not correct, or no choice leaves space for a frame.
 */
export function fitFrame(map: MapDocument, spaces: readonly MapSpace[], options: FitOptions = {}): FrameFit {
  checkMap(map);
  for (const { widthMm, heightMm } of spaces) {
    if (![widthMm, heightMm].every((value) => Number.isFinite(value) && value > 0)) {
      throw new MapError("frame", `The space ${widthMm} by ${heightMm} mm is not two finite numbers more than 0`);
    }
  }
  const places = options.places ?? LEGEND_PLACES;
  const font = measureFontOf(options);
  let best: FrameFit | undefined;
  for (const place of places) {
    if (!LEGEND_PLACES.includes(place)) throw new MapError("style", `The place of the legend "${String(place)}" is not "below" or "side"`);
    const margins = marginsOf(legendLayout({ ...map, legendPlace: place }, font));
    for (const [index, { widthMm, heightMm }] of spaces.entries()) {
      const frameWidth = widthMm - margins.rightMm;
      const frameHeight = heightMm - margins.belowMm;
      if (!(frameWidth > 0 && frameHeight > 0 && frameHeight >= margins.leastHeightMm)) continue;
      if (best === undefined || frameWidth * frameHeight > best.widthMm * best.heightMm) {
        best = { widthMm: frameWidth, heightMm: frameHeight, legendPlace: place, space: index };
      }
    }
  }
  if (best === undefined) throw new MapError("frame", "No space of the list has space for a frame after the legend");
  return best;
}

/** The options of `frameAttribution`. */
export interface AttributionOptions {
  /** The value `false` leaves out the scale, for a screen map. The default is `true`. */
  readonly scale?: boolean;
}

/** This function gives the lines of the attribution block: the scale, the projection and each source one time. */
export function attributionLines(map: MapDocument): string[] {
  return frameAttribution(
    map.frame,
    map.layers.map((layer) => layer.source),
  );
}

/**
 * This function gives the lines of an attribution block for a frame and its sources. The first line has the scale
 * and the projection of the frame. Then each source has one line, in the sequence of the list. Use it for a map that
 * a page draws itself, for example a screen map from `geometryPath`. `attributionLines` gives the same lines for a
 * map document.
 *
 * A screen map changes its size with the window, so its scale is not the scale of the frame. With the option
 * `scale: false`, the first line has only the projection. The scale bar stays correct on a screen.
 *
 * @throws MapError - The code is `source`: a source has no title or no license.
 */
export function frameAttribution(frame: Frame, sources: readonly Source[], options: AttributionOptions = {}): string[] {
  const projection = `Projection: ${frame.projection.name}.`;
  const lines = [options.scale === false ? projection : `Scale 1:${thousands(frame.scale)} at the center. ${projection}`];
  const seen = new Set<string>();
  sources.forEach((source, i) => {
    checkSource(source, `the item ${i + 1} of the list of sources`);
    const line = `Data: ${source.title}. License: ${source.license}.${source.url === undefined ? "" : ` ${source.url}`}${source.date === undefined ? "" : ` Date: ${source.date}.`}`;
    if (seen.has(line)) return;
    seen.add(line);
    lines.push(line);
  });
  return lines;
}

/**
 * This function gives the SVG of a map. The units of the SVG are millimetres, for a print at the scale of the frame.
 *
 * - The map is at the top. Below it are the scale bars, the legend and the attribution block.
 * - With the place `side`, the scale bars and the legend are in a column at the right of the frame. The attribution
 *   block stays below.
 * - The layers are in their sequence, from the bottom to the top. The frame clips each layer.
 * - A feature that is not on the frame is not in the SVG.
 * - Each identifier in the SVG starts with the identifier of the map. Thus two maps can be in one HTML page.
 * - The labels are above the layers. `placeLabels` tells their places. The group of the labels tells the number of
 *   texts with no place in `data-skipped`.
 *
 * @throws MapError - The map is not correct, as `checkMap` tells, or a layer has labels and the options have no font.
 * @throws GeoError - A position is not correct for the projection.
 */
export function renderMap(map: MapDocument, options: RenderOptions = {}): string {
  checkMap(map);
  const font = labelFontOf(map, options);
  const view = frameView(map.frame);
  const { widthMm: w, heightMm: h } = map.frame;
  const defs: string[] = [`<clipPath id="${map.id}-clip"><rect width="${mm(w)}" height="${mm(h)}"/></clipPath>`];
  const fills = map.layers.map((layer) => {
    const hatch = layer.style.fill?.hatch;
    if (hatch === undefined) return undefined;
    const id = `${map.id}-${layer.id}-hatch`;
    defs.push(hatchPattern(id, hatch));
    return `url(#${id})`;
  });
  const features = map.layers.map((layer) => featuresOf(layer, map.frame));
  const layers = map.layers.map((layer, i) => {
    const body = features[i]!
      .map((feature) => drawGeometry(feature.geometry as Geometry, layer.style, view, fills[i]))
      .join("");
    return `<g id="${map.id}-${layer.id}">${body}</g>`;
  });
  const labels = font === undefined ? "" : labelsSvg(placementOf(map, features, view, font), font);

  const layout = legendLayout(map, measureFontOf(options));
  const side = layout.columnMm > 0;
  const { bars, lines } = layout;
  const top = (side ? Math.max(h, layout.columnHeightMm) : h) + 2;
  const sideX = w + SIDE_GAP_MM;
  const maxMeters = (side ? layout.columnMm - SCALE_LABEL_MM : 0.3 * w) / view.mmPerMeter;
  const scaleBars = bars
    .map((unit, i) => {
      const length = scaleBarLength(maxMeters, unit);
      return side ? scaleBarSvg(sideX, SIDE_TOP_MM + i * SCALE_BAR_ROW_MM, length, view.mmPerMeter) : scaleBarSvg(0.5, top + i * SCALE_BAR_ROW_MM, length, view.mmPerMeter);
    })
    .join("");
  const legendLayers = map.layers.flatMap((layer, i) => (layer.legend === undefined ? [] : [{ layer, fill: fills[i] }]));
  const columnWidth = w * 0.275;
  const sideTop = SIDE_TOP_MM + bars.length * SCALE_BAR_ROW_MM + (bars.length > 0 ? SIDE_GROUP_GAP_MM : 0);
  const legend = legendLayers
    .map(({ layer, fill }, i) => {
      const x = side ? sideX : w * 0.45 + (i % 2) * columnWidth;
      const y = side ? sideTop + i * SCALE_BAR_ROW_MM : top + Math.floor(i / 2) * SCALE_BAR_ROW_MM - 1;
      return `${swatch(layer.style, x, y, fill)}<text x="${mm(x + LEGEND_TEXT_X_MM)}" y="${mm(y + 2.9)}" font-size="${LEGEND_TEXT_MM}">${escapeHtml(layer.legend!)}</text>`;
    })
    .join("");
  const firstLine = top + layout.blockMm + 2.5;
  const attribution = lines.map((line, i) => `<text x="0.5" y="${mm(firstLine + i * 3)}" font-size="2.2">${escapeHtml(line)}</text>`).join("");
  const total = firstLine + (lines.length - 1) * 3 + 1.5;
  const width = side ? sideX + layout.columnMm : w;
  const arrow = map.northArrow === false ? "" : northArrowSvg(w - 6.5, 6.5, view.northDegrees);
  const edges = edgeMarksOf(map, measureFontOf(options))
    .map((mark) => mark.svg)
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${mm(width)}mm" height="${mm(total)}mm" viewBox="0 0 ${mm(width)} ${mm(total)}" ` +
    `role="img" aria-label="${escapeAttribute(map.title)}" font-family="sans-serif">` +
    `<title>${escapeHtml(map.title)}</title><defs>${defs.join("")}</defs>` +
    `<rect width="${mm(width)}" height="${mm(total)}" fill="#ffffff"/>` +
    `<g clip-path="url(#${map.id}-clip)">${layers.join("")}</g>${labels}` +
    `<rect width="${mm(w)}" height="${mm(h)}" fill="none" stroke="#000000" stroke-width="0.3"/>` +
    `${arrow}${edges}<g class="legend">${scaleBars}${legend}</g><g class="attribution">${attribution}</g></svg>`
  );
}

