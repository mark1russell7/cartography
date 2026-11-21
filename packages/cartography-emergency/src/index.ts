/**
 * The add-on of `@mark1russell7/cartography` for emergency maps: evacuation zones, shelters and evacuation routes.
 * Each function gives layers of the core, with black and white styles for a print with no color.
 *
 * @packageDocumentation
 */

import { MapError, type FilterValue, type HatchStyle, type Layer, type Source } from "@mark1russell7/cartography";

/** The features of a layer: GeoJSON features with positions `[lon, lat]` on WGS84. */
export type Features = Layer["features"];

/** An evacuation zone: a value of the property of the zone features, and its text in the legend. */
export interface EvacuationZone {
  /** The value of the property of the zone, for example `A` or `1`. */
  readonly value: FilterValue;
  /** The text of the zone in the legend, for example `Zone A`. */
  readonly legend: string;
}

/** The options of `evacuationZoneLayers`. */
export interface EvacuationZoneOptions {
  /** The property of a feature that has the zone, for example `zone`. */
  readonly property: string;
  /** The zones, the first zone to leave first. The first zone gets the densest hatch. */
  readonly zones: readonly EvacuationZone[];
  /** The source of the zone features. */
  readonly source: Source;
}

/** The options of `shelterLayer` and `evacuationRouteLayer`. */
export interface EmergencyLayerOptions {
  /** The identifier of the layer. The default is `shelters` or `evacuation-routes`. */
  readonly id?: string;
  /** The text of the layer in the legend. The default is `Shelter` or `Evacuation route`. */
  readonly legend?: string;
}

/** The maximum number of evacuation zones on one map. More zones give hatches that a reader cannot tell apart. */
export const MAX_EVACUATION_ZONES = 6;

const ANGLES = [45, -45, 0, 90] as const;

/**
 * This function gives the hatch of a zone from its position in the sequence. The first zone has a cross hatch with
 * the smallest spacing. Each next zone has a larger spacing and a different angle.
 */
export function zoneHatch(index: number): HatchStyle {
  return { angleDegrees: ANGLES[index % ANGLES.length]!, spacingMm: 1.2 + 0.8 * index, widthMm: 0.25, cross: index === 0 };
}

/**
 * This function gives one layer for each evacuation zone, in the sequence of the zones. Each layer keeps the areas
 * whose property has the value of its zone. Each area has the hatch of `zoneHatch` and a line of 0.3 mm on its edge.
 *
 * @throws MapError - The code is `style`: there is no zone, there are more than `MAX_EVACUATION_ZONES` zones, or two
 *   zones have the same value.
 */
export function evacuationZoneLayers(features: Features, options: EvacuationZoneOptions): Layer[] {
  const { property, zones, source } = options;
  if (zones.length === 0 || zones.length > MAX_EVACUATION_ZONES) {
    throw new MapError("style", `The number of evacuation zones ${zones.length} is not from 1 to ${MAX_EVACUATION_ZONES}`);
  }
  const values = new Set(zones.map((zone) => zone.value));
  if (values.size !== zones.length) throw new MapError("style", "Two evacuation zones have the same value");
  return zones.map((zone, index) => ({
    id: `evacuation-zone-${index + 1}`,
    features,
    filter: { all: [{ geometry: "area" }, { property, in: [zone.value] }] },
    style: { fill: { hatch: zoneHatch(index) }, stroke: { widthMm: 0.3 } },
    source,
    legend: zone.legend,
  }));
}

/**
 * This function gives the layer of the shelters. A shelter point has an open square of 3 mm. A shelter area, for
 * example a building, has a dark gray fill and a black edge.
 */
export function shelterLayer(features: Features, source: Source, options: EmergencyLayerOptions = {}): Layer {
  return {
    id: options.id ?? "shelters",
    features,
    filter: { any: [{ geometry: "point" }, { geometry: "area" }] },
    style: { point: { symbol: "square", sizeMm: 3, filled: false }, fill: { gray: 0.35 }, stroke: { widthMm: 0.25 } },
    source,
    legend: options.legend ?? "Shelter",
  };
}

/** This function gives the layer of the evacuation routes: a dashed black line of 0.8 mm. */
export function evacuationRouteLayer(features: Features, source: Source, options: EmergencyLayerOptions = {}): Layer {
  return {
    id: options.id ?? "evacuation-routes",
    features,
    filter: { geometry: "line" },
    style: { stroke: { widthMm: 0.8, dashMm: [3, 1.5] } },
    source,
    legend: options.legend ?? "Evacuation route",
  };
}
