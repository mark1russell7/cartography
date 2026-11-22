import type { Feature, LatLon, Position } from "@mark1russell7/geo";
import { azimuthalEquidistant } from "@mark1russell7/geo/projection";
import { describe, expect, it } from "vitest";
import { MapError } from "./errors.ts";
import type { LabelFont } from "./labels.ts";
import { EDGE_TEXT_MM, edgeMarks, type EdgeMark } from "./marks.ts";
import { checkMap, mapLabels, renderMap, type Layer, type MapDocument } from "./render.ts";

// A made-up center. It is not the place of a person.
const CENTER: LatLon = { lat: 45, lon: 10 };
const SCALE = 24_000;
const FONT: LabelFont = { family: "sans-serif", measure: (text, sizeMm) => text.length * sizeMm * 0.55 };
const measure = (text: string): number => FONT.measure(text, EDGE_TEXT_MM);

/** This function gives the position on the Earth of a point on the paper of the test frame of 180 by 240 mm. */
function onPaper(x: number, y: number): Position {
  const eastKm = ((x - 90) * SCALE) / 1e6;
  const northKm = ((120 - y) * SCALE) / 1e6;
  return [CENTER.lon + eastKm / (111.41 * Math.cos((45 * Math.PI) / 180)), CENTER.lat + northKm / 111.13];
}

function map(layers: readonly Layer[], extra: Partial<MapDocument> = {}): MapDocument {
  return {
    id: "edge-map",
    title: "A test map with edge texts",
    frame: { projection: azimuthalEquidistant(CENTER), center: CENTER, scale: SCALE, widthMm: 180, heightMm: 240 },
    layers,
    ...extra,
  };
}

const overlaps = (mark: EdgeMark, x: number, y: number, hw: number, hh: number): boolean =>
  Math.abs(mark.x - x) < mark.halfWidth + hw && Math.abs(mark.y - y) < mark.halfHeight + hh;

describe("edgeMarks", () => {
  const marks = edgeMarks(180, 240, { left: "Page A2", top: "Page B1", bottom: "Page B3", right: "Page C2" }, measure);

  it("gives the marks in the sequence top, right, bottom and left, at the middle of each edge and inside the frame", () => {
    expect(marks.map((mark) => mark.edge)).toEqual(["top", "right", "bottom", "left"]);
    const [top, right, bottom, left] = marks as [EdgeMark, EdgeMark, EdgeMark, EdgeMark];
    expect(top.x).toBeCloseTo(90, 9);
    expect(top.y - top.halfHeight).toBeCloseTo(0, 9);
    expect(bottom.x).toBeCloseTo(90, 9);
    expect(bottom.y + bottom.halfHeight).toBeCloseTo(240, 9);
    expect(left.y).toBeCloseTo(120, 9);
    expect(left.x - left.halfWidth).toBeCloseTo(0, 9);
    expect(right.y).toBeCloseTo(120, 9);
    expect(right.x + right.halfWidth).toBeCloseTo(180, 9);
    for (const mark of marks) expect(2 * mark.halfWidth).toBeGreaterThan(measure("Page B1"));
  });

  it("turns the arrow of each edge out of the frame, and gives no mark for an edge with no text", () => {
    expect(marks.map((mark) => /rotate\((\d+)\)/.exec(mark.svg)?.[1])).toEqual(["0", "90", "180", "270"]);
    expect(edgeMarks(180, 240, { top: "Page B1" }, measure)).toHaveLength(1);
    expect(edgeMarks(180, 240, {}, measure)).toEqual([]);
  });

  it("escapes the text", () => {
    expect(edgeMarks(180, 240, { top: "A <B> & C" }, measure)[0]!.svg).toContain("A &lt;B&gt; &amp; C");
  });
});

describe("renderMap with edge texts", () => {
  it("draws each edge text above the layers, and draws none with no field", () => {
    const svg = renderMap(map([], { edges: { top: "Page B1", left: "Page A2" } }), { labelFont: FONT });
    expect(svg).toContain('class="edge-top"');
    expect(svg).toContain('class="edge-left"');
    expect(svg).not.toContain('class="edge-right"');
    expect(svg.indexOf('class="edge-top"')).toBeGreaterThan(svg.indexOf('clip-path="url(#edge-map-clip)"'));
    expect(renderMap(map([]))).not.toContain('class="edge-');
  });

  it("keeps each label off the box of an edge text", () => {
    // Made-up points along the top edge, near its middle. Their labels go to a free place.
    const points: Feature[] = [84, 88, 92, 96].map((x, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: onPaper(x, 3 + i) }, properties: { name: `Well ${i}` } }));
    const wells: Layer = {
      id: "wells",
      features: points,
      style: { point: { symbol: "circle", sizeMm: 1 } },
      source: { title: "Made-up test data", license: "CC0 1.0" },
      label: { properties: ["name"], sizeMm: 2 },
    };
    const edges = { top: "Page B1" };
    const top = edgeMarks(180, 240, edges, measure)[0]!;
    const free = mapLabels(map([wells]), { labelFont: FONT });
    expect(free.placed.some((label) => overlaps(top, label.x, label.y, label.widthMm / 2, label.sizeMm / 2))).toBe(true);
    const placement = mapLabels(map([wells], { edges }), { labelFont: FONT });
    for (const label of placement.placed) expect(overlaps(top, label.x, label.y, label.widthMm / 2, (label.sizeMm * 0.6) / 2), label.text).toBe(false);
  });
});

describe("checkMap with edge texts", () => {
  it("refuses an edge that is not one of the four, and a text that is empty", () => {
    const code = (edges: unknown): string | undefined => {
      try {
        checkMap(map([], { edges: edges as NonNullable<MapDocument["edges"]> }));
        return undefined;
      } catch (error) {
        return error instanceof MapError ? error.code : "other";
      }
    };
    expect(code({ top: "Page B1", bottom: undefined })).toBeUndefined();
    expect(code({ north: "Page B1" })).toBe("label");
    expect(code({ top: " " })).toBe("label");
    expect(code({ top: 3 })).toBe("label");
    expect(code(null)).toBe("label");
  });
});
