import type { Feature, Geometry } from "@mark1russell7/geo";
import { describe, expect, it } from "vitest";
import { MapError } from "./errors.ts";
import { checkFilter, geometryKind, matchesFilter, type Filter } from "./filter.ts";

function feature(geometry: Geometry | null, properties: Record<string, unknown> | null = {}): Feature {
  return { type: "Feature", geometry, properties };
}

const point: Geometry = { type: "Point", coordinates: [10, 45] };
const line: Geometry = { type: "LineString", coordinates: [[10, 45], [10.01, 45]] };
const area: Geometry = { type: "Polygon", coordinates: [[[10, 45], [10.01, 45], [10.01, 45.01], [10, 45]]] };

describe("geometryKind", () => {
  it("gives the kind of each geometry, and mixed for a collection of two kinds", () => {
    expect(geometryKind(point)).toBe("point");
    expect(geometryKind({ type: "MultiLineString", coordinates: [] })).toBe("line");
    expect(geometryKind(area)).toBe("area");
    expect(geometryKind({ type: "GeometryCollection", geometries: [point, point] })).toBe("point");
    expect(geometryKind({ type: "GeometryCollection", geometries: [point, area] })).toBe("mixed");
  });
});

describe("matchesFilter", () => {
  const road = feature(line, { highway: "primary", lanes: 2, oneway: false });

  it("matches a property with one of the values", () => {
    expect(matchesFilter({ property: "highway", in: ["primary", "secondary"] }, road)).toBe(true);
    expect(matchesFilter({ property: "lanes", in: [2] }, road)).toBe(true);
    expect(matchesFilter({ property: "lanes", in: ["2"] }, road)).toBe(false);
    expect(matchesFilter({ property: "oneway", in: [false] }, road)).toBe(true);
    expect(matchesFilter({ property: "name", in: ["x"] }, road)).toBe(false);
  });

  it("matches a property that exists or does not exist, with no properties", () => {
    expect(matchesFilter({ property: "highway", exists: true }, road)).toBe(true);
    expect(matchesFilter({ property: "name", exists: false }, road)).toBe(true);
    expect(matchesFilter({ property: "name", exists: true }, feature(line, null))).toBe(false);
  });

  it("matches the kind of the geometry, and no geometry matches no kind", () => {
    expect(matchesFilter({ geometry: "line" }, road)).toBe(true);
    expect(matchesFilter({ geometry: "area" }, road)).toBe(false);
    expect(matchesFilter({ geometry: "point" }, feature(null))).toBe(false);
  });

  it("combines filters with all, any and not", () => {
    const filter: Filter = { all: [{ geometry: "line" }, { not: { property: "oneway", in: [true] } }, { any: [{ property: "lanes", in: [1] }, { property: "lanes", in: [2] }] }] };
    expect(matchesFilter(filter, road)).toBe(true);
    expect(matchesFilter({ all: [] }, road)).toBe(true);
    expect(matchesFilter({ any: [] }, road)).toBe(false);
  });
});

describe("checkFilter", () => {
  it("accepts each form of a filter, as JSON", () => {
    const filter: Filter = { all: [{ any: [{ geometry: "area" }] }, { not: { property: "a", exists: true } }, { property: "b", in: ["x", 1, true] }] };
    expect(() => checkFilter(JSON.parse(JSON.stringify(filter)))).not.toThrow();
  });

  it("refuses a value that is not a filter, and tells the path", () => {
    for (const bad of [null, [], "x", {}, { all: {} }, { geometry: "volume" }, { property: 1, in: [] }, { property: "a", in: [null] }, { property: "a", exists: "yes" }, { property: "a", in: [], exists: true }]) {
      expect(() => checkFilter(bad), JSON.stringify(bad)).toThrow(MapError);
    }
    expect(() => checkFilter({ all: [{ not: { geometry: "x" } }] })).toThrow("filter.all[0].not");
  });
});
