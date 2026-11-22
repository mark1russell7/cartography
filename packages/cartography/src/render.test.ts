import type { Feature, Geometry, LatLon, Position } from "@mark1russell7/geo";
import { azimuthalEquidistant } from "@mark1russell7/geo/projection";
import { describe, expect, it } from "vitest";
import { MapError } from "./errors.ts";
import { attributionLines, checkMap, fitFrame, mapMargins, renderMap, type Layer, type MapDocument, type Source } from "./render.ts";

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

function sizeOf(svg: string): { width: number; height: number } {
  const match = /^<svg [^>]*?width="([\d.]+)mm" height="([\d.]+)mm"/.exec(svg);
  expect(match).not.toBeNull();
  return { width: Number(match![1]), height: Number(match![2]) };
}

// A made-up font: each character is two times the size of the font.
const WIDE_FONT = { family: "Test Sans", measure: (text: string, sizeMm: number): number => text.length * sizeMm * 2 };

describe("mapMargins", () => {
  it("gives the space below the frame for the legend below", () => {
    // Two scale bars and three legend entries in two columns give two rows. The attribution block has three lines.
    expect(mapMargins(map(LAYERS))).toEqual({ rightMm: 0, belowMm: 2 + 2 * 4.5 + 2.5 + 2 * 3 + 1.5, leastHeightMm: 0 });
    expect(sizeOf(renderMap(map(LAYERS)))).toEqual({ width: 180, height: 240 + 21 });
  });

  it("gives the column at the side, with an estimate of the widths of the texts when the options have no font", () => {
    // The widest text is "Main road": 9 characters of 0.6 of 2.4 mm. That is less than the least width of 30 mm.
    expect(mapMargins(map(LAYERS, { legendPlace: "side" }))).toEqual({ rightMm: 3 + 30, belowMm: 2 + 2.5 + 2 * 3 + 1.5, leastHeightMm: 1 + 5 * 4.5 + 1.5 });
  });

  it("measures the legend texts with the label font of the options", () => {
    const margins = mapMargins(map(LAYERS, { legendPlace: "side" }), { labelFont: WIDE_FONT });
    expect(margins.rightMm).toBeCloseTo(3 + 7.5 + 9 * 2.4 * 2 + 1, 9);
  });

  it("does not change with the size of the frame", () => {
    for (const legendPlace of ["below", "side"] as const) {
      const small = map(LAYERS, { legendPlace });
      const large: MapDocument = { ...small, frame: { ...small.frame, widthMm: 600, heightMm: 900 } };
      expect(mapMargins(large)).toEqual(mapMargins(small));
    }
  });

  it("gives no column when the map has no scale bar and no legend", () => {
    const plain = map([{ ...LAYERS[1]!, legend: undefined as never }], { scaleBar: "none", legendPlace: "side" });
    expect(mapMargins(plain)).toEqual({ rightMm: 0, belowMm: 2 + 2.5 + 1 * 3 + 1.5, leastHeightMm: 0 });
  });
});

describe("renderMap with the legend at the side", () => {
  const side = map(LAYERS, { legendPlace: "side" });
  const svg = renderMap(side);

  it("makes the SVG wider by the column, and keeps the attribution block below the frame", () => {
    const margins = mapMargins(side);
    expect(sizeOf(svg)).toEqual({ width: 180 + margins.rightMm, height: 240 + margins.belowMm });
    expect(svg).toContain(`<text x="0.5" y="${240 + 4.5}" font-size="2.2">Scale 1:24,000 at the center. Projection: Azimuthal equidistant.</text>`);
  });

  it("puts the scale bars and the legend in the column at the right of the frame", () => {
    expect(svg.match(/class="scale-bar"/g)).toHaveLength(2);
    const bar = /<g class="scale-bar"><rect x="([\d.]+)" y="([\d.]+)"/.exec(svg)!;
    expect(Number(bar[1])).toBe(183);
    expect(Number(bar[2])).toBe(1);
    expect(svg).toContain(`<text x="190.5" y="${1 + 2 * 4.5 + 1.5 + 2.9}" font-size="2.4">Park</text>`);
    expect(svg).toContain(`<text x="190.5" y="${1 + 3 * 4.5 + 1.5 + 2.9}" font-size="2.4">Main road</text>`);
  });

  it("keeps each scale bar and its label in the column", () => {
    // The bar of 1:24,000 is at most 18 mm, the column minus 12 mm for the label.
    for (const match of svg.matchAll(/<g class="scale-bar">(.*?)<\/g>/g)) {
      const xs = [...match[1]!.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)].map((rect) => Number(rect[1]) + Number(rect[2]));
      expect(Math.max(...xs)).toBeLessThanOrEqual(183 + 30 - 12 + 0.02);
    }
  });

  it("makes the SVG taller when the frame is shorter than the column", () => {
    const short: MapDocument = { ...side, frame: { ...side.frame, heightMm: 10 } };
    const margins = mapMargins(short);
    expect(sizeOf(renderMap(short)).height).toBeCloseTo(margins.leastHeightMm + margins.belowMm, 2);
  });
});

describe("fitFrame", () => {
  const below = 21;
  const sideRight = 33;
  const sideBelow = 12;

  it("gives the place of the legend with the largest frame", () => {
    // 200 by 300 mm: below gives 200 by 279 mm, the side gives 167 by 288 mm.
    expect(fitFrame(map(LAYERS), [{ widthMm: 200, heightMm: 300 }])).toEqual({ widthMm: 200, heightMm: 300 - below, legendPlace: "below", space: 0 });
    // 400 by 60 mm: below gives 400 by 39 mm, the side gives 367 by 48 mm.
    expect(fitFrame(map(LAYERS), [{ widthMm: 400, heightMm: 60 }])).toEqual({ widthMm: 400 - sideRight, heightMm: 60 - sideBelow, legendPlace: "side", space: 0 });
  });

  it("examines only the places of the options", () => {
    expect(fitFrame(map(LAYERS), [{ widthMm: 200, heightMm: 300 }], { places: ["side"] })).toEqual({ widthMm: 167, heightMm: 288, legendPlace: "side", space: 0 });
  });

  it("gives the space of the largest frame from a list of spaces", () => {
    // A paper with a heading of 20 mm: 300 by 100 mm gives a frame of 300 by 59 mm. In portrait, 100 by 280 mm gives 100 by 259 mm.
    const spaces = [{ widthMm: 300, heightMm: 100 - 20 }, { widthMm: 100, heightMm: 300 - 20 }];
    expect(fitFrame(map(LAYERS), spaces.slice(0, 1), { places: ["below"] }).space).toBe(0);
    expect(fitFrame(map(LAYERS), spaces, { places: ["below"] })).toEqual({ widthMm: 100, heightMm: 280 - below, legendPlace: "below", space: 1 });
    expect(() => fitFrame(map(LAYERS), [])).toThrow(expect.objectContaining({ code: "frame" }));
  });

  it("gives a frame whose SVG fills the space", () => {
    for (const space of [{ widthMm: 200, heightMm: 300 }, { widthMm: 400, heightMm: 60 }]) {
      const fit = fitFrame(map(LAYERS), [space], { labelFont: WIDE_FONT });
      const fitted = map(LAYERS, { legendPlace: fit.legendPlace });
      const size = sizeOf(renderMap({ ...fitted, frame: { ...fitted.frame, widthMm: fit.widthMm, heightMm: fit.heightMm } }, { labelFont: WIDE_FONT }));
      expect(size.width).toBeCloseTo(space.widthMm, 1);
      expect(size.height).toBeCloseTo(space.heightMm, 1);
    }
  });

  it("skips the side when the frame is shorter than the column", () => {
    // 100 by 30 mm: the side gives a frame of 18 mm, less than the column of 25 mm.
    expect(fitFrame(map(LAYERS), [{ widthMm: 100, heightMm: 30 }]).legendPlace).toBe("below");
    expect(() => fitFrame(map(LAYERS), [{ widthMm: 100, heightMm: 30 }], { places: ["side"] })).toThrow(expect.objectContaining({ code: "frame" }));
  });

  it("refuses a space or a place that is not correct", () => {
    expect(() => fitFrame(map(LAYERS), [{ widthMm: 200, heightMm: 300 }, { widthMm: 0, heightMm: 300 }])).toThrow(expect.objectContaining({ code: "frame" }));
    expect(() => fitFrame(map(LAYERS), [{ widthMm: Number.NaN, heightMm: 300 }])).toThrow(MapError);
    expect(() => fitFrame(map(LAYERS), [{ widthMm: 200, heightMm: 300 }], { places: ["top" as never] })).toThrow(expect.objectContaining({ code: "style" }));
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

  it("refuses a place of the legend that is not below or side", () => {
    expect(() => checkMap(map(LAYERS, { legendPlace: "top" as never }))).toThrow(expect.objectContaining({ code: "style" }));
    expect(() => checkMap(map(LAYERS, { legendPlace: "side" }))).not.toThrow();
  });
});
