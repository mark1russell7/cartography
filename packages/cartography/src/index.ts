/**
 * A map as data for print and screen: a frame, and layers with black and white styles. The render gives an SVG with
 * a scale bar, a north arrow, a legend, labels with no overlap and the attribution of each source. The core names no
 * topic. An add-on gives the layers and the styles of a topic.
 *
 * @packageDocumentation
 */

export {
  ATLAS_OVERLAP_MM,
  atlasIndexFrame,
  atlasOutlines,
  atlasPages,
  columnName,
  type Atlas,
  type AtlasPage,
  type AtlasPlan,
} from "./atlas.ts";
export { MapError, type MapErrorCode } from "./errors.ts";
export { checkFilter, geometryKind, matchesFilter, type Filter, type FilterValue, type GeometryKind } from "./filter.ts";
export { checkFrame, frameAround, frameBBox, frameView, NICE_SCALE_STEPS, niceScale, type Frame, type FrameAroundOptions, type FrameView, type PaperPoint } from "./frame.ts";
export {
  checkLabelRule,
  labelsSvg,
  labelText,
  placeLabels,
  type LabelFont,
  type LabelLayer,
  type LabelPlacement,
  type LabelRule,
  type PlacedLabel,
} from "./labels.ts";
export {
  EDGE_TEXT_MM,
  edgeMarks,
  FRAME_EDGES,
  niceNumber,
  northArrowSvg,
  SCALE_BAR_ROW_MM,
  scaleBarLength,
  scaleBarSvg,
  type EdgeMark,
  type FrameEdge,
  type ScaleBarLength,
  type ScaleBarUnits,
} from "./marks.ts";
export {
  attributionLines,
  checkMap,
  fitFrame,
  mapLabels,
  mapMargins,
  renderMap,
  type FitOptions,
  type FrameFit,
  type Layer,
  type LegendPlace,
  type MapDocument,
  type MapMargins,
  type MapSpace,
  type RenderOptions,
  type Source,
} from "./render.ts";
export {
  checkStyle,
  grayColor,
  hatchPattern,
  mm,
  pointSymbol,
  strokeAttributes,
  type FillStyle,
  type HatchStyle,
  type PointStyle,
  type PointSymbol,
  type StrokeStyle,
  type Style,
} from "./style.ts";
