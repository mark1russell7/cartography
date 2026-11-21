import { checkMap, matchesFilter, MapError, renderMap, type Frame, type Source } from "@mark1russell7/cartography";
import { describe, expect, it } from "vitest";
import { evacuationRouteLayer, evacuationZoneLayers, MAX_EVACUATION_ZONES, shelterLayer, zoneHatch, type Features } from "./index.ts";

// Made-up features of a made-up town. They are not the places of a person.
const SOURCE: Source = { title: "Made-up test data", license: "CC0 1.0" };
const LAT0 = 45;
const LON0 = 10;

function square(east: number, north: number, size: number): [number, number][] {
  const d = size / 2;
  const at = (x: number, y: number): [number, number] => [LON0 + x / (111.32 * Math.cos((LAT0 * Math.PI) / 180)), LAT0 + y / 110.57];
  return [at(east - d, north - d), at(east + d, north - d), at(east + d, north + d), at(east - d, north + d), at(east - d, north - d)];
}

const FEATURES: Features = [
  { type: "Feature", geometry: { type: "Polygon", coordinates: [square(0, 0, 1)] }, properties: { zone: "A" } },
  { type: "Feature", geometry: { type: "Polygon", coordinates: [square(0, 0, 2.5)] }, properties: { zone: "B" } },
  { type: "Feature", geometry: { type: "Point", coordinates: [LON0, LAT0] }, properties: { zone: "A" } },
  { type: "Feature", geometry: { type: "Point", coordinates: [LON0 + 0.005, LAT0] }, properties: { amenity: "shelter" } },
  { type: "Feature", geometry: { type: "Polygon", coordinates: [square(0.6, 0.6, 0.1)] }, properties: { amenity: "shelter" } },
  { type: "Feature", geometry: { type: "LineString", coordinates: [[LON0, LAT0], [LON0 + 0.02, LAT0 + 0.01]] }, properties: { route: "evacuation" } },
];

// A local plane projection for the test: the plane is the tangent plane at the center, in metres.
const FRAME: Frame = {
  projection: {
    name: "Test plane",
    toPlane: (p) => ({ x: (p.lon - LON0) * 111320 * Math.cos((LAT0 * Math.PI) / 180), y: (p.lat - LAT0) * 110570 }),
    fromPlane: (p) => ({ lat: LAT0 + p.y / 110570, lon: LON0 + p.x / (111320 * Math.cos((LAT0 * Math.PI) / 180)) }),
    scale: () => ({ max: 1, min: 1 }),
  },
  center: { lat: LAT0, lon: LON0 },
  scale: 25000,
  widthMm: 160,
  heightMm: 160,
};

describe("zoneHatch", () => {
  it("gives the densest cross hatch to the first zone, and a different hatch to each zone", () => {
    expect(zoneHatch(0).cross).toBe(true);
    const hatches = Array.from({ length: MAX_EVACUATION_ZONES }, (_, i) => zoneHatch(i));
    for (let i = 1; i < hatches.length; i += 1) {
      expect(hatches[i]!.spacingMm).toBeGreaterThan(hatches[i - 1]!.spacingMm);
      expect(hatches[i]!.cross).toBe(false);
    }
    expect(new Set(hatches.map((h) => `${h.angleDegrees}/${h.spacingMm}`)).size).toBe(hatches.length);
  });
});

describe("evacuationZoneLayers", () => {
  const layers = evacuationZoneLayers(FEATURES, { property: "zone", zones: [{ value: "A", legend: "Zone A" }, { value: "B", legend: "Zone B" }], source: SOURCE });

  it("gives one layer for each zone that keeps only the areas of the zone", () => {
    expect(layers.map((layer) => [layer.id, layer.legend])).toEqual([
      ["evacuation-zone-1", "Zone A"],
      ["evacuation-zone-2", "Zone B"],
    ]);
    const kept = layers.map((layer) => FEATURES.filter((feature) => matchesFilter(layer.filter!, feature)).length);
    // The point of zone A is not an area, so the zone layer does not keep it.
    expect(kept).toEqual([1, 1]);
  });

  it("refuses no zone, too many zones and two zones with one value", () => {
    const zones = (count: number) => Array.from({ length: count }, (_, i) => ({ value: i, legend: `Zone ${i}` }));
    expect(() => evacuationZoneLayers(FEATURES, { property: "zone", zones: [], source: SOURCE })).toThrow(MapError);
    expect(() => evacuationZoneLayers(FEATURES, { property: "zone", zones: zones(MAX_EVACUATION_ZONES + 1), source: SOURCE })).toThrow(MapError);
    expect(() => evacuationZoneLayers(FEATURES, { property: "zone", zones: [{ value: "A", legend: "A" }, { value: "A", legend: "A again" }], source: SOURCE })).toThrow(MapError);
    expect(evacuationZoneLayers(FEATURES, { property: "zone", zones: zones(MAX_EVACUATION_ZONES), source: SOURCE })).toHaveLength(MAX_EVACUATION_ZONES);
  });
});

describe("shelterLayer and evacuationRouteLayer", () => {
  it("keep the shelter points and areas, and the route lines", () => {
    const shelters = shelterLayer(FEATURES, SOURCE);
    const routes = evacuationRouteLayer(FEATURES, SOURCE, { id: "routes", legend: "Route out" });
    expect([shelters.id, shelters.legend, routes.id, routes.legend]).toEqual(["shelters", "Shelter", "routes", "Route out"]);
    expect(routes.style.stroke).toEqual({ widthMm: 0.8, dashMm: [3, 1.5] });
    expect(FEATURES.filter((feature) => matchesFilter(routes.filter!, feature))).toHaveLength(1);
    expect(FEATURES.filter((feature) => matchesFilter(shelters.filter!, feature))).toHaveLength(5);
  });
});

describe("an emergency map", () => {
  it("is a correct map of the core, with the hatches, the dashes and the legend", () => {
    const zoneOnly = FEATURES.filter((feature) => feature.properties?.["zone"] !== undefined);
    const shelterOnly = FEATURES.filter((feature) => feature.properties?.["amenity"] === "shelter");
    const map = {
      id: "emergency-test",
      title: "An emergency map of a made-up town",
      frame: FRAME,
      layers: [
        ...evacuationZoneLayers(zoneOnly, { property: "zone", zones: [{ value: "A", legend: "Zone A" }, { value: "B", legend: "Zone B" }], source: SOURCE }),
        evacuationRouteLayer(FEATURES, SOURCE),
        shelterLayer(shelterOnly, SOURCE),
      ],
    };
    expect(() => checkMap(map)).not.toThrow();
    const svg = renderMap(map);
    expect(svg).toContain(`<pattern id="emergency-test-evacuation-zone-1-hatch"`);
    expect(svg).toContain(`<pattern id="emergency-test-evacuation-zone-2-hatch"`);
    expect(svg).toContain(`stroke-dasharray="3 1.5"`);
    for (const legend of ["Zone A", "Zone B", "Evacuation route", "Shelter"]) expect(svg).toContain(`>${legend}</text>`);
  });
});
