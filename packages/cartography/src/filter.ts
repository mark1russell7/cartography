/**
 * The filters of the layers. A filter is data, so a map document can be JSON.
 *
 * @packageDocumentation
 */

import type { Feature, Geometry } from "@mark1russell7/geo";
import { MapError } from "./errors.ts";

/** A value that a filter compares with a property of a feature. */
export type FilterValue = string | number | boolean;

/** The kind of a geometry: points, lines or areas. A collection of two kinds is `mixed`. */
export type GeometryKind = "point" | "line" | "area" | "mixed";

/**
 * A filter of the features of a layer.
 *
 * - `{ all }` matches when each filter matches. `{ any }` matches when one filter matches. `{ not }` reverses a filter.
 * - `{ property, in }` matches a feature whose property is equal to one of the values.
 * - `{ property, exists }` matches a feature that has the property, or that does not have it.
 * - `{ geometry }` matches a feature whose geometry has the kind.
 */
export type Filter =
  | { readonly all: readonly Filter[] }
  | { readonly any: readonly Filter[] }
  | { readonly not: Filter }
  | { readonly property: string; readonly in: readonly FilterValue[] }
  | { readonly property: string; readonly exists: boolean }
  | { readonly geometry: GeometryKind };

/** This function gives the kind of a geometry. */
export function geometryKind(geometry: Geometry): GeometryKind {
  switch (geometry.type) {
    case "Point":
    case "MultiPoint":
      return "point";
    case "LineString":
    case "MultiLineString":
      return "line";
    case "Polygon":
    case "MultiPolygon":
      return "area";
    case "GeometryCollection": {
      const kinds = new Set(geometry.geometries.map(geometryKind));
      return kinds.size === 1 ? ([...kinds][0] as GeometryKind) : "mixed";
    }
  }
}

/** This function tells if a feature matches a filter. A feature with no geometry matches no `{ geometry }` filter. */
export function matchesFilter(filter: Filter, feature: Feature): boolean {
  if ("all" in filter) return filter.all.every((item) => matchesFilter(item, feature));
  if ("any" in filter) return filter.any.some((item) => matchesFilter(item, feature));
  if ("not" in filter) return !matchesFilter(filter.not, feature);
  if ("geometry" in filter) return feature.geometry !== null && geometryKind(feature.geometry) === filter.geometry;
  const properties = feature.properties ?? {};
  const has = Object.hasOwn(properties, filter.property);
  if ("exists" in filter) return has === filter.exists;
  return has && filter.in.includes(properties[filter.property] as FilterValue);
}

const KINDS: readonly string[] = ["point", "line", "area", "mixed"];

/**
 * This function refuses a value that is not a `Filter`, for example a filter from JSON.
 *
 * @throws MapError - The code is `filter`.
 */
export function checkFilter(filter: unknown, path = "filter"): asserts filter is Filter {
  const fail = (reason: string): never => {
    throw new MapError("filter", `${path}: ${reason}`);
  };
  if (typeof filter !== "object" || filter === null || Array.isArray(filter)) fail("a filter must be an object");
  const value = filter as Record<string, unknown>;
  const keys = Object.keys(value).toSorted().join(",");
  if (keys === "all" || keys === "any") {
    const items = value[keys];
    if (!Array.isArray(items)) fail(`the member ${keys} must be an array`);
    (items as unknown[]).forEach((item, i) => checkFilter(item, `${path}.${keys}[${i}]`));
  } else if (keys === "not") {
    checkFilter(value["not"], `${path}.not`);
  } else if (keys === "geometry") {
    if (!KINDS.includes(value["geometry"] as string)) fail(`the geometry must be one of ${KINDS.join(", ")}`);
  } else if (keys === "in,property" || keys === "exists,property") {
    if (typeof value["property"] !== "string") fail("the property must be a string");
    if (keys === "exists,property" && typeof value["exists"] !== "boolean") fail("the member exists must be true or false");
    if (keys === "in,property") {
      const items = value["in"];
      if (!Array.isArray(items) || !items.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
        fail("the member in must be an array of strings, numbers and booleans");
      }
    }
  } else {
    fail(`the members ${keys === "" ? "(none)" : keys} are not a form of a filter`);
  }
}
