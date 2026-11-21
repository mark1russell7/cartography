import type { Feature, Geometry, LatLon, Position } from "@mark1russell7/geo";
import { azimuthalEquidistant } from "@mark1russell7/geo/projection";
import { MapError } from "./errors.ts";
import { frameView, type Frame } from "./frame.ts";
import { checkLabelRule, labelText, placeLabels, type LabelFont, type LabelLayer, type PlacedLabel } from "./labels.ts";
import { overlapOf, type Rect } from "@mark1russell7/layout-contract";
import { mulberry32, seedOf } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { checkMap, mapLabels, renderMap, type Layer, type MapDocument, type Source } from "./render.ts";

// A made-up town at a made-up center. It is not the place of a person.
const CENTER: LatLon = { lat: 45, lon: 10 };
const KM_LAT = 1 / 111.13;
const KM_LON = 1 / (111.41 * Math.cos((45 * Math.PI) / 180));
const SOURCE: Source = { title: "Made-up test data", license: "CC0 1.0" };
/** At 1:24,000, 1 km is approximately 41.7 mm. The middle of the frame is at x 90 and y 120. */
const FRAME: Frame = { projection: azimuthalEquidistant(CENTER), center: CENTER, scale: 24000, widthMm: 180, heightMm: 240 };
const VIEW = frameView(FRAME);
/** A font for the tests: each character is 0.6 of the size. */
const FONT: LabelFont = { family: '"Test Sans", sans-serif', measure: (text, size) => 0.6 * size * [...text].length };

function at(eastKm: number, northKm: number): Position {
  return [CENTER.lon + eastKm * KM_LON, CENTER.lat + northKm * KM_LAT];
}

function feature(geometry: Geometry, properties: Record<string, unknown> = {}): Feature {
  return { type: "Feature", geometry, properties };
}

/** This function gives the place on the ground of a point on the paper, in millimetres from the top left corner. */
const paperAt = (x: number, y: number): [number, number] => [((x - 90) * FRAME.scale) / 1e6, ((120 - y) * FRAME.scale) / 1e6];
const point = (eastKm: number, northKm: number, name: string): Feature => feature({ type: "Point", coordinates: at(eastKm, northKm) }, { name });
const line = (positions: Position[], name: string): Feature => feature({ type: "LineString", coordinates: positions }, { name });

function layer(id: string, features: Feature[], extra: Partial<LabelLayer> = {}): LabelLayer {
  return { id, features, label: { properties: ["name"], sizeMm: 3 }, ...extra };
}

function only(labels: readonly PlacedLabel[]): PlacedLabel {
  expect(labels).toHaveLength(1);
  return labels[0]!;
}

/** The box of a label with the angle 0, as a rectangle of `@mark1russell7/layout-contract`. */
function rectOf(label: PlacedLabel): Rect {
  const h = 1.2 * label.sizeMm;
  return { x: label.x - label.widthMm / 2, y: label.y - h / 2, w: label.widthMm, h };
}

describe("checkLabelRule", () => {
  it("refuses a rule with no property, an empty property, or a size, a priority or a distance that is not correct", () => {
    const bad = [
      { properties: [], sizeMm: 3 },
      { properties: [""], sizeMm: 3 },
      { properties: ["name"], sizeMm: 0 },
      { properties: ["name"], sizeMm: Number.NaN },
      { properties: ["name"], sizeMm: 3, priority: Number.POSITIVE_INFINITY },
      { properties: ["name"], sizeMm: 3, repeatMm: -1 },
      { properties: "name" as unknown as string[], sizeMm: 3 },
    ];
    for (const rule of bad) {
      expect(() => checkLabelRule(rule, "roads"), JSON.stringify(rule)).toThrow(MapError);
      try {
        checkLabelRule(rule, "roads");
      } catch (error) {
        expect((error as MapError).code).toBe("label");
      }
    }
    expect(() => checkLabelRule({ properties: ["ref", "name"], sizeMm: 2.5, priority: -1, repeatMm: 80 }, "roads")).not.toThrow();
  });

  it("is a part of checkMap", () => {
    const map: MapDocument = { id: "m", title: "M", frame: FRAME, layers: [{ id: "roads", features: [], style: { stroke: { widthMm: 0.5 } }, source: SOURCE, label: { properties: [], sizeMm: 3 } }] };
    expect(() => checkMap(map)).toThrow(/The labels of the layer "roads": give at least one property/);
  });
});

describe("labelText", () => {
  it("gives the first property with a text, and a number as a text", () => {
    const rule = { properties: ["ref", "name"], sizeMm: 3 };
    expect(labelText(rule, feature({ type: "Point", coordinates: at(0, 0) }, { ref: "I 93", name: "Main Road" }))).toBe("I 93");
    expect(labelText(rule, feature({ type: "Point", coordinates: at(0, 0) }, { ref: "  ", name: " Main Road " }))).toBe("Main Road");
    expect(labelText(rule, feature({ type: "Point", coordinates: at(0, 0) }, { ref: 93 }))).toBe("93");
    expect(labelText(rule, feature({ type: "Point", coordinates: at(0, 0) }, { ref: true, name: null }))).toBeUndefined();
    expect(labelText(rule, { type: "Feature", geometry: { type: "Point", coordinates: at(0, 0) }, properties: null })).toBeUndefined();
  });
});

describe("placeLabels: points", () => {
  it("puts the label of a point at the right of its symbol, in the middle of its height", () => {
    const label = only(placeLabels([layer("wells", [point(0, 0, "Well A")], { pointSizeMm: 2 })], VIEW, FONT).placed);
    const width = 0.6 * 3 * 6;
    expect(label).toMatchObject({ layer: "wells", text: "Well A", angle: 0, sizeMm: 3, widthMm: width });
    expect(label.x).toBeCloseTo(90 + 1 + 0.6 + width / 2, 6);
    expect(label.y).toBeCloseTo(120, 6);
  });

  it("puts the label at the left when a symbol is at the right", () => {
    const labels = placeLabels([layer("wells", [point(0, 0, "Well A"), point(0.25, 0, "B")], { pointSizeMm: 2 })], VIEW, FONT).placed;
    const a = labels.find((label) => label.text === "Well A")!;
    expect(a.x).toBeLessThan(90);
    expect(a.y).toBeCloseTo(120, 6);
  });

  it("keeps each label inside the frame", () => {
    // The point is 1 mm from the right edge: the places at the right are outside the frame.
    const east = (89 / 1000) * (24000 / 1000);
    const label = only(placeLabels([layer("wells", [point(east, 0, "Edge")], { pointSizeMm: 2 })], VIEW, FONT).placed);
    expect(label.x + label.widthMm / 2).toBeLessThanOrEqual(179.5);
  });

  it("does not put a label on an obstacle", () => {
    // The point is at the left of the north arrow, so the place at the right is on the arrow.
    const label = only(placeLabels([layer("wells", [point(...paperAt(166, 6.5), "N1")], { pointSizeMm: 1 })], VIEW, FONT, [{ x: 173.5, y: 6.5, half: 4.7 }]).placed);
    expect(label.x).toBeLessThan(166);
    const clear = Math.abs(label.x - 173.5) >= label.widthMm / 2 + 4.7 || Math.abs(label.y - 6.5) >= 1.8 + 4.7;
    expect(clear).toBe(true);
  });

  it("gives no label and no skipped text for a point outside the frame", () => {
    expect(placeLabels([layer("wells", [point(40, 40, "Far")], { pointSizeMm: 2 })], VIEW, FONT)).toEqual({ placed: [], skipped: [] });
  });

  it("skips a text with no free place", () => {
    // Five symbols around the point close each of the 8 places.
    const crowd = [point(0, 0, "Center well")];
    for (const [e, n] of [[0.05, 0], [-0.05, 0], [0, 0.05], [0, -0.05], [0.04, 0.04], [0.04, -0.04], [-0.04, 0.04], [-0.04, -0.04]] as const) crowd.push(feature({ type: "Point", coordinates: at(e, n) }));
    const result = placeLabels([layer("wells", crowd, { pointSizeMm: 2 })], VIEW, FONT);
    expect(result.placed).toEqual([]);
    expect(result.skipped).toEqual([{ layer: "wells", text: "Center well" }]);
  });

  it("gives labels that do not overlap and stay inside the frame, for seeded sets of points", () => {
    const random = mulberry32(seedOf("cartography point labels"));
    for (let round = 0; round < 25; round += 1) {
      const features = Array.from({ length: 40 }, (_, i) => point((random() - 0.5) * 4, (random() - 0.5) * 5.5, `Place ${i} ${"x".repeat(Math.floor(random() * 8))}`));
      const { placed, skipped } = placeLabels([layer("places", features, { pointSizeMm: 1.5 })], VIEW, FONT);
      expect(placed.length + skipped.length, `round ${round}`).toBe(40);
      for (const label of placed) {
        expect(label.x - label.widthMm / 2).toBeGreaterThanOrEqual(0.5 - 1e-9);
        expect(label.x + label.widthMm / 2).toBeLessThanOrEqual(179.5 + 1e-9);
        expect(label.y - 1.8).toBeGreaterThanOrEqual(0.5 - 1e-9);
        expect(label.y + 1.8).toBeLessThanOrEqual(239.5 + 1e-9);
      }
      for (let i = 0; i < placed.length; i += 1) {
        for (let j = i + 1; j < placed.length; j += 1) {
          const overlap = overlapOf(rectOf(placed[i]!), rectOf(placed[j]!));
          expect(Math.min(overlap.x, overlap.y), `round ${round}: ${i} and ${j}`).toBeLessThanOrEqual(1e-9);
        }
      }
    }
  });
});

describe("placeLabels: lines", () => {
  it("puts the text along the middle of a line", () => {
    const label = only(placeLabels([layer("roads", [line([at(-1.5, 0), at(1.5, 0)], "Main Street")])], VIEW, FONT).placed);
    expect(label.angle).toBeCloseTo(0, 3);
    expect(label.x).toBeCloseTo(90, 1);
    expect(label.y).toBeCloseTo(120, 1);
  });

  it("turns the text so it reads from the left, for each direction of the line", () => {
    const west = only(placeLabels([layer("roads", [line([at(1.5, 0), at(-1.5, 0)], "West")])], VIEW, FONT).placed);
    expect(Math.abs(west.angle)).toBeLessThan(1e-6);
    const north = only(placeLabels([layer("roads", [line([at(0, -1.5), at(0, 1.5)], "North")])], VIEW, FONT).placed);
    expect(north.angle).toBeCloseTo(90, 6);
    const northEast = only(placeLabels([layer("roads", [line([at(-1, -1), at(1, 1)], "North east")])], VIEW, FONT).placed);
    expect(northEast.angle).toBeCloseTo(-45, 0);
    const northWest = only(placeLabels([layer("roads", [line([at(1, -1), at(-1, 1)], "North west")])], VIEW, FONT).placed);
    expect(northWest.angle).toBeCloseTo(45, 0);
  });

  it("gives one label for the features with the same text, on the longest line", () => {
    const labels = placeLabels([layer("roads", [line([at(-1.8, 2), at(-1.2, 2)], "Main Street"), line([at(-1, 0), at(1, 0)], "Main Street")])], VIEW, FONT).placed;
    expect(only(labels).y).toBeCloseTo(120, 1);
  });

  it("repeats a text along a long line, at the distance of the rule", () => {
    const roads = layer("roads", [line([at(-5, 0), at(5, 0)], "Long Road")], { label: { properties: ["name"], sizeMm: 3, repeatMm: 50 } });
    const labels = placeLabels([roads], VIEW, FONT).placed;
    expect(labels.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < labels.length; i += 1) for (let j = i + 1; j < labels.length; j += 1) expect(Math.hypot(labels[i]!.x - labels[j]!.x, labels[i]!.y - labels[j]!.y)).toBeGreaterThanOrEqual(50);
  });

  it("puts the label of a line that crosses the frame inside the frame", () => {
    // The two ends of the line are outside the frame.
    const label = only(placeLabels([layer("roads", [line([at(-5, 0), at(5, 0)], "Through Road")])], VIEW, FONT).placed);
    expect(label.x).toBeCloseTo(90, 1);
    // Only 10.8 mm of this line is on the frame: too short for the text.
    const long = "A very long name of a road";
    expect(placeLabels([layer("roads", [line([at(-3, 0), at(-1.9, 0)], long)])], VIEW, FONT)).toEqual({ placed: [], skipped: [{ layer: "roads", text: long }] });
    expect(placeLabels([layer("roads", [line([at(10, 0), at(12, 0)], "Far Road")])], VIEW, FONT)).toEqual({ placed: [], skipped: [] });
  });

  it("does not put a text on a part that bends, or on a line that is too short", () => {
    const zigzag: Position[] = [];
    for (let i = 0; i <= 40; i += 1) zigzag.push(at(-1 + i * 0.05, i % 2 === 0 ? 0 : 0.05));
    expect(placeLabels([layer("roads", [line(zigzag, "Zigzag Road")])], VIEW, FONT).placed).toEqual([]);
    expect(placeLabels([layer("roads", [line([at(0, 0), at(0.1, 0)], "Short Road Name")])], VIEW, FONT).placed).toEqual([]);
    // The middle of the line is at its corner. The label goes on one straight part, so its angle is near 0 or near 90.
    const bent = only(placeLabels([layer("roads", [line([at(-1, 0), at(0, 0), at(0, 1)], "Bent")])], VIEW, FONT).placed);
    expect(Math.min(Math.abs(bent.angle), Math.abs(bent.angle - 90))).toBeLessThan(5);
  });
});

describe("placeLabels: areas", () => {
  const square = (half: number, name: string): Feature => feature({ type: "Polygon", coordinates: [[at(-half, -half), at(half, -half), at(half, half), at(-half, half), at(-half, -half)]] }, { name });

  it("puts the text in the middle of an area", () => {
    const label = only(placeLabels([layer("parks", [square(1, "Central Park")])], VIEW, FONT).placed);
    expect(label.x).toBeCloseTo(90, 1);
    expect(label.y).toBeCloseTo(120, 1);
  });

  it("skips an area that is too small for its text, and an area with a hole in its middle", () => {
    expect(placeLabels([layer("parks", [square(0.05, "A long name of a small park")])], VIEW, FONT).skipped).toHaveLength(1);
    const ring = (half: number): Position[] => [at(-half, -half), at(-half, half), at(half, half), at(half, -half), at(-half, -half)];
    const donut = feature({ type: "Polygon", coordinates: [[at(-1, -1), at(1, -1), at(1, 1), at(-1, 1), at(-1, -1)], ring(0.5)] }, { name: "Ring Park" });
    expect(placeLabels([layer("parks", [donut])], VIEW, FONT).skipped).toEqual([{ layer: "parks", text: "Ring Park" }]);
  });

  it("reads each polygon of a multipolygon, and the members of a collection", () => {
    const multi = feature({ type: "MultiPolygon", coordinates: [[[at(-2, -2), at(-1, -2), at(-1, -1), at(-2, -1), at(-2, -2)]], [[at(1, 1), at(2, 1), at(2, 2), at(1, 2), at(1, 1)]]] }, { name: "Twin" });
    expect(placeLabels([layer("parks", [multi])], VIEW, FONT).placed).toHaveLength(2);
    const collection = feature({ type: "GeometryCollection", geometries: [{ type: "Point", coordinates: at(0, 2) }, { type: "MultiPoint", coordinates: [at(0, -2)] }, { type: "MultiLineString", coordinates: [[at(-2, 0), at(2, 0)]] }] }, { name: "Mixed" });
    const labels = placeLabels([layer("mixed", [collection])], VIEW, FONT).placed;
    expect(labels).toHaveLength(3);
  });

  it("ignores an area with too few positions and an area outside the frame", () => {
    const open = feature({ type: "Polygon", coordinates: [[at(0, 0), at(1, 0), at(0, 0)]] }, { name: "Bad" });
    const far = feature({ type: "Polygon", coordinates: [[at(40, 40), at(41, 40), at(41, 41), at(40, 40)]] }, { name: "Far" });
    expect(placeLabels([layer("parks", [open, far, { type: "Feature", geometry: null, properties: { name: "None" } }])], VIEW, FONT)).toEqual({ placed: [], skipped: [{ layer: "parks", text: "Bad" }] });
  });
});

describe("placeLabels: the sequence of the layers", () => {
  it("places a lower priority first, then a higher layer first", () => {
    const wells = layer("wells", [point(0, 0, "Well")], { pointSizeMm: 2, label: { properties: ["name"], sizeMm: 3, priority: 0 } });
    const shops = layer("shops", [point(0, 0, "Shop")], { label: { properties: ["name"], sizeMm: 3, priority: 1 } });
    const [first] = placeLabels([shops, wells], VIEW, FONT).placed;
    expect(first!.text).toBe("Well");
    const a = layer("a", [point(0, 0, "Lower layer")]);
    const b = layer("b", [point(0, 0, "Higher layer")]);
    expect(placeLabels([a, b], VIEW, FONT).placed[0]!.text).toBe("Higher layer");
  });

  it("refuses a width that is not a finite number of 0 or more", () => {
    expect(() => placeLabels([layer("wells", [point(0, 0, "Well")])], VIEW, { family: "x", measure: () => Number.NaN })).toThrow(/The width NaN of the label "Well"/);
    expect(() => placeLabels([layer("wells", [point(0, 0, "Well")])], VIEW, { family: "x", measure: () => -1 })).toThrow(MapError);
  });

  it("gives nothing for the layers with no rule", () => {
    expect(placeLabels([{ id: "plain", features: [point(0, 0, "No rule")] }], VIEW, FONT)).toEqual({ placed: [], skipped: [] });
  });
});

describe("renderMap and mapLabels with labels", () => {
  const roads: Layer = { id: "roads", features: [line([at(-3, 0), at(3, 0)], "Main & Church"), line([at(-1, -1), at(1, 1)], "Diagonal Way")], style: { stroke: { widthMm: 0.5 } }, source: SOURCE, label: { properties: ["name"], sizeMm: 2.5 } };
  const map: MapDocument = { id: "label-map", title: "Labels", frame: FRAME, layers: [roads] };

  it("needs a label font for a layer with labels", () => {
    for (const labelFont of [undefined, { family: "", measure: FONT.measure }, { family: "x" } as unknown as LabelFont]) {
      expect(() => renderMap(map, labelFont === undefined ? {} : { labelFont })).toThrow(/The layer "roads" has labels, so the options need a label font/);
    }
    expect(() => mapLabels(map)).toThrow(MapError);
  });

  it("draws the labels above the layers, with a white halo and the family of the font", () => {
    const svg = renderMap(map, { labelFont: FONT });
    const group = /<g class="labels" font-family="([^"]*)" data-skipped="(\d+)">(.*?)<\/g>/.exec(svg);
    expect(group).not.toBeNull();
    expect(group![1]).toBe("&quot;Test Sans&quot;, sans-serif");
    expect(group![2]).toBe("0");
    expect(group![3]).toContain(">Main &amp; Church</text>");
    expect(group![3]).toContain('stroke="#ffffff"');
    expect(group![3]).toContain('paint-order="stroke"');
    expect(group![3]).toMatch(/transform="rotate\(-4[45]\.\d+ /);
    expect(svg.indexOf('<g class="labels"')).toBeGreaterThan(svg.indexOf('<g id="label-map-roads">'));
    const placement = mapLabels(map, { labelFont: FONT });
    expect(placement.placed).toHaveLength((group![3]!.match(/<text /g) ?? []).length);
  });

  it("keeps the labels off the north arrow, and only with the arrow", () => {
    const corner: Layer = { id: "wells", features: [point(...paperAt(166, 6.5), "Corner")], style: { point: { symbol: "circle", sizeMm: 1 } }, source: SOURCE, label: { properties: ["name"], sizeMm: 3 } };
    const withArrow = mapLabels({ ...map, layers: [corner] }, { labelFont: FONT }).placed[0]!;
    const noArrow = mapLabels({ ...map, layers: [corner], northArrow: false }, { labelFont: FONT }).placed[0]!;
    expect(withArrow.x).not.toBeCloseTo(noArrow.x, 3);
  });

  it("gives no labels for a map with no rule, with or without a font", () => {
    const { label: _rule, ...unlabelled } = roads;
    const plain: MapDocument = { ...map, layers: [unlabelled] };
    expect(mapLabels(plain)).toEqual({ placed: [], skipped: [] });
    expect(renderMap(plain, { labelFont: FONT })).not.toContain('class="labels"');
  });
});
