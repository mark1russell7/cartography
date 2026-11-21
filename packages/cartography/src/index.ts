/**
 * A map as data for print and screen: a frame, and layers with black and white styles. The render gives an SVG with
 * a scale bar, a north arrow, a legend, labels with no overlap and the attribution of each source. The core names no
 * topic. An add-on gives the layers and the styles of a topic.
 *
 * @packageDocumentation
 */

export { MapError, type MapErrorCode } from "./errors.ts";
export { checkFilter, geometryKind, matchesFilter, type Filter, type FilterValue, type GeometryKind } from "./filter.ts";
export { checkFrame, frameBBox, frameView, type Frame, type FrameView, type PaperPoint } from "./frame.ts";
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
export { niceNumber, northArrowSvg, SCALE_BAR_ROW_MM, scaleBarLength, scaleBarSvg, type ScaleBarLength, type ScaleBarUnits } from "./marks.ts";
export { attributionLines, checkMap, mapLabels, renderMap, type Layer, type MapDocument, type RenderOptions, type Source } from "./render.ts";
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
