import type { Feature, Geometry, LatLon, Position } from "@mark1russell7/geo";
import { azimuthalEquidistant } from "@mark1russell7/geo/projection";
import { describe, expect, it } from "vitest";
import { MapError } from "./errors.ts";
import { attributionLines, checkMap, renderMap, type Layer, type MapDocument, type Source } from "./render.ts";

// A made-up town at a made-up center. It is not the place of a person.
const CENTER: LatLon = { lat: 45, lon: 10 };
const KM_LAT = 1 / 111.13;
const KM_LON = 1 / (111.41 * Math.cos((45 * Math.PI) / 180));
const TEST_SOURCE: Source = { title: "Made-up test data", license: "CC0 1.0" };
const OTHER_SOURCE: Source = { title: "Other test data", license: "CC BY 4.0", url: "https://example.org/license", date: "2026-11-21" };

function at(eastKm: number, northKm: number): Position {
  return [CENTER.lon + eastKm * KM_LON, CENTER.lat + northKm * KM_LAT];
}

function feature(geometry: Geometry, properties: Record<string, unknown> = {}): Feature {
  return { type: "Feature", geometry, properties };
}

function circle(radiusKm: number, count: number): Geometry {
  const ring: Position[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (2 * Math.PI * i) / count;
    ring.push(at(radiusKm * Math.cos(angle), radiusKm * Math.sin(angle)));
  }
  ring.push(ring[0]!);
  return { type: "Polygon", coordinates: [ring] };
}

const park = feature({ type: "Polygon", coordinates: [[at(-1, -1), at(1, -1), at(1, 1), at(-1, 1), at(-1, -1)]] }, { kind: "park" });
const farPark = feature({ type: "Polygon", coordinates: [[at(50, 50), at(51, 50), at(51, 51), at(50, 50)]] }, { kind: "park" });
const mainRoad = feature({ type: "LineString", coordinates: [at(-3, 0), at(3, 0)] }, { highway: "primary" });
const track = feature({ type: "LineString", coordinates: [at(0, -3), at(0, 3)] }, { highway: "track" });
const wells = feature({ type: "MultiPoint", coordinates: [at(0.5, 0.5), at(40, 40)] });

function map(layers: readonly Layer[], extra: Partial<MapDocument> = {}): MapDocument {
  return {
    id: "test-map",
    title: "A test map <of a made-up town> & its roads",
    frame: { projection: azimuthalEquidistant(CENTER), center: CENTER, scale: 24000, widthMm: 180, heightMm: 240 },
    layers,
    ...extra,
  };
}

const LAYERS: readonly Layer[] = [
  { id: "parks", features: [park, farPark], style: { fill: { gray: 0.85, hatch: { angleDegrees: 45, spacingMm: 2, widthMm: 0.2 } }, stroke: { widthMm: 0.2 } }, source: TEST_SOURCE, legend: "Park" },
  { id: "roads", features: [mainRoad, track], filter: { property: "highway", in: ["primary"] }, style: { stroke: { widthMm: 0.6 } }, source: TEST_SOURCE, legend: "Main road" },
  { id: "wells", features: [wells], style: { point: { symbol: "circle", sizeMm: 2 } }, source: OTHER_SOURCE, legend: "Well" },
];

function group(svg: string, id: string): string {
  const match = new RegExp(`<g id="${id}">(.*?)</g>`).exec(svg);
  expect(match, id).not.toBeNull();
  return match![1]!;
}

describe("renderMap", () => {
  const svg = renderMap(map(LAYERS));

  it("gives an SVG in millimetres with the title, the clip and the frame", () => {
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="180mm" height="[\d.]+mm" viewBox="0 0 180 [\d.]+"/);
    expect(svg).toContain(`aria-label="A test map &lt;of a made-up town&gt; &amp; its roads"`);
    expect(svg).toContain("<title>A test map &lt;of a made-up town&gt; &amp; its roads</title>");
    expect(svg).toContain(`<clipPath id="test-map-clip">`);
    expect(svg).toContain(`<g clip-path="url(#test-map-clip)">`);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("starts each identifier with the identifier of the map", () => {
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]!);
    expect(ids).toEqual(["test-map-clip", "test-map-parks-hatch", "test-map-parks", "test-map-roads", "test-map-wells"]);
    expect(group(svg, "test-map-parks")).toContain(`fill="url(#test-map-parks-hatch)"`);
  });

  it("keeps the features on the frame, and removes the features off the frame", () => {
    // The near park gives a gray path and a hatch path. The far park gives nothing.
    expect(group(svg, "test-map-parks").match(/<path /g)).toHaveLength(2);
    expect(group(svg, "test-map-wells").match(/<circle /g)).toHaveLength(1);
  });

  it("applies the filter of a layer", () => {
    const roads = group(svg, "test-map-roads");
    expect(roads.match(/<path /g)).toHaveLength(1);
    // The main road goes from west to east, so its two points have almost the same y. Its ends are off the frame.
    const [, x1, y1, x2, y2] = /M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/.exec(roads)!.map(Number);
    expect(y1).toBeCloseTo(y2!, 1);
    expect(x1).toBeLessThan(0);
    expect(x2).toBeGreaterThan(180);
  });

  it("puts the scale bars, the legend, the north arrow and the attribution below the map", () => {
    expect(svg.match(/class="scale-bar"/g)).toHaveLength(2);
    expect(svg).toContain(">Park</text>");
    expect(svg).toContain(">Main road</text>");
    expect(svg).toContain(">Well</text>");
    expect(svg).toContain(`class="north-arrow"`);
    expect(svg).toContain(">Scale 1:24,000 at the center. Projection: Azimuthal equidistant.</text>");
    expect(svg).toContain(">Data: Made-up test data. License: CC0 1.0.</text>");
  });

  it("gives no scale bar and no north arrow when the map asks for none", () => {
    const plain = renderMap(map(LAYERS, { scaleBar: "none", northArrow: false }));
    expect(plain).not.toContain("scale-bar");
    expect(plain).not.toContain("north-arrow");
    expect(renderMap(map(LAYERS, { scaleBar: "metric" })).match(/class="scale-bar"/g)).toHaveLength(1);
  });

  it("simplifies the areas of a layer to the tolerance on the paper", () => {
    const round = feature(circle(1, 2000));
    const layer = (simplifyMm?: number): Layer => ({ id: "round", features: [round], style: { stroke: { widthMm: 0.2 } }, source: TEST_SOURCE, ...(simplifyMm === undefined ? {} : { simplifyMm }) });
    const count = (doc: string): number => group(doc, "test-map-round").match(/L/g)!.length;
    const full = count(renderMap(map([layer()])));
    const simplified = count(renderMap(map([layer(0.2)])));
    expect(full).toBe(2000);
    expect(simplified).toBeLessThan(200);
    expect(simplified).toBeGreaterThan(8);
  });
});

describe("attributionLines", () => {
  it("names each source one time, with its license, its address and its date", () => {
    expect(attributionLines(map(LAYERS))).toEqual([
      "Scale 1:24,000 at the center. Projection: Azimuthal equidistant.",
      "Data: Made-up test data. License: CC0 1.0.",
      "Data: Other test data. License: CC BY 4.0. https://example.org/license Date: 2026-11-21.",
    ]);
  });
});

describe("checkMap", () => {
  const roads = LAYERS[1]!;

  it("refuses an identifier that is not correct, and two layers with one identifier", () => {
    expect(() => checkMap(map(LAYERS, { id: "Test Map" }))).toThrow(expect.objectContaining({ code: "id" }));
    expect(() => checkMap(map([roads, { ...roads, id: "2roads" }]))).toThrow(expect.objectContaining({ code: "id" }));
    expect(() => checkMap(map([roads, roads]))).toThrow(expect.objectContaining({ code: "id" }));
  });

  it("refuses a layer with no source, or a source with no title or no license", () => {
    for (const source of [undefined, { title: "", license: "CC0 1.0" }, { title: "Data", license: " " }]) {
      expect(() => checkMap(map([{ ...roads, source: source as never }]))).toThrow(expect.objectContaining({ code: "source" }));
    }
  });

  it("refuses a filter, a style or a tolerance that is not correct", () => {
    expect(() => checkMap(map([{ ...roads, filter: { geometry: "volume" } as never }]))).toThrow(expect.objectContaining({ code: "filter" }));
    expect(() => checkMap(map([{ ...roads, style: {} }]))).toThrow(expect.objectContaining({ code: "style" }));
    expect(() => checkMap(map([{ ...roads, simplifyMm: 0 }]))).toThrow(MapError);
    expect(() => checkMap(map(LAYERS))).not.toThrow();
  });
});
