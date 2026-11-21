import { describe, expect, it } from "vitest";
import * as entry from "./index.ts";

describe("the entry", () => {
  it("gives the functions of the core", () => {
    for (const name of ["renderMap", "checkMap", "frameView", "frameBBox", "matchesFilter", "checkFilter", "checkStyle", "scaleBarLength", "attributionLines"]) {
      expect(entry[name as keyof typeof entry], name).toBeTypeOf("function");
    }
    expect(entry.SCALE_BAR_ROW_MM).toBe(4.5);
  });
});
