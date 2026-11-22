# @mark1russell7/cartography

Maps as data for print and screen. A map is a frame, layers from the bottom to the top, and its marks. The render gives an SVG in millimetres, for a print at the scale of the frame. The core names no topic. An add-on gives the layers and the styles of a topic, for example `@mark1russell7/cartography-emergency`.

```ts
import { renderMap, type MapDocument } from "@mark1russell7/cartography";
import { azimuthalEquidistant } from "@mark1russell7/geo/projection";

const center = { lat: 45, lon: 10 };
const map: MapDocument = {
  id: "town",
  title: "The roads of the town",
  frame: { projection: azimuthalEquidistant(center), center, scale: 24000, widthMm: 180, heightMm: 240 },
  layers: [
    {
      id: "roads",
      features: roads, // GeoJSON features, positions [lon, lat] on WGS84
      filter: { property: "highway", in: ["primary", "secondary"] },
      style: { stroke: { widthMm: 0.6 } },
      source: { title: "© OpenStreetMap contributors", license: "ODbL 1.0", url: "https://www.openstreetmap.org/copyright" },
      legend: "Main road",
    },
  ],
};
const svg = renderMap(map);
```

## The parts of a map

| Part | Type | Rules |
| --- | --- | --- |
| Frame | `Frame` | A projection, a center, the denominator of the scale, and the width and the height on the paper in millimetres. |
| Layer | `Layer` | Features, a filter, a style, a source and a legend text. The tolerance `simplifyMm` simplifies the areas. |
| Filter | `Filter` | Data, so a map can be JSON: `all`, `any`, `not`, `property` with `in` or `exists`, and `geometry`. |
| Style | `Style` | Black, white and gray only: lines with dashes, areas with gray levels and hatches, and point symbols. |
| Source | `Source` | A title and a license. Each layer must have a source. The attribution block names each source one time. |

## The functions

| Function | Result |
| --- | --- |
| `renderMap(map, options)` | The SVG of the map, with the scale bars, the legend, the north arrow, the labels and the attribution block. |
| `checkMap(map)` | Nothing. It throws a `MapError` for a map that is not correct. |
| `frameView(frame)` | The functions between the Earth and the paper, and the direction of north. |
| `frameBBox(frame)` | The box on the Earth around the frame, for a fetch of the data of a map. |
| `matchesFilter(filter, feature)` | `true` when the feature matches the filter. |
| `checkFilter(value)` | Nothing. It throws a `MapError` for a value that is not a `Filter`. |
| `attributionLines(map)` | The lines of the attribution block: the scale, the projection and each source. |
| `scaleBarLength(meters, units)` | The longest round length of a scale bar that is not longer than a length on the ground. |
| `mapLabels(map, options)` | The labels of the map with their places, and the texts with no place. |
| `mapMargins(map, options)` | The space of the SVG around the frame: the column at the right, the block below, and the least height of the frame. |
| `fitFrame(map, space, options)` | The frame with the largest area in a space, for example a paper, and the place of its legend. |
| `placeLabels(layers, view, font)` | The places of the labels of the layers, with no overlap, inside the frame. |
| `labelText(rule, feature)` | The text of the label of a feature, or `undefined`. |

## Labels

A layer with a `label` rule shows the names of its features. The labels do not overlap, and each label is inside the frame.

```ts
import { readFileSync } from "node:fs";
import { measureWidth, readFont } from "@mark1russell7/typeset/fonts";

const font = readFont(readFileSync("LiberationSans-Regular.ttf"));
const labelFont = {
  family: '"Liberation Sans", Arial, sans-serif',
  measure: (text: string, sizeMm: number) => measureWidth(font, text, sizeMm),
};
const roads = { ...layer, label: { properties: ["ref", "name"], sizeMm: 2.5, repeatMm: 80 } };
const svg = renderMap({ ...map, layers: [roads] }, { labelFont });
```

- The core has no font tables. The caller gives the font family and a function that measures a text in millimetres.
- Use the same font for the print. Liberation Sans has the same widths as Arial.
- A point label goes to the first free place of 8 places around its symbol.
- A line label goes along an almost straight part of the line, near its middle. `repeatMm` gives more labels on a long line.
- An area label goes to the middle of the area, when the area has the full box of the text.
- A layer with a lower `priority` gets its places first. With the same priority, a higher layer is first.
- The point symbols and the north arrow are obstacles. No label covers them.
- The render puts the labels above the layers, in black with a white halo.
- A text with no free place is in the list `skipped` of `mapLabels`. The SVG gives the count in `data-skipped`.

## Rules

- The scale of the frame is the true scale at the center. Use `azimuthalEquidistant` for a map of a small area.
- Web Mercator changes its scale with the latitude. On the ellipsoid, it also changes its scale with the direction: at 45 degrees, by approximately 0.34 %.
- The render removes a feature that is not on the frame, and the frame clips each layer.
- Each identifier in the SVG starts with the identifier of the map. Thus two maps can be in one HTML page.
- The simplification uses `simplifyRegions` of `@mark1russell7/geo`. A tolerance of 0.2 mm on the paper at 1:24,000 is 4.8 m on the ground.
- Each refusal is a `MapError` with a code: `frame`, `id`, `filter`, `style`, `source` or `label`.

## License

MIT

## A map that fills a paper

`fitFrame` gives the frame with the largest area in a space, and the place of the legend. The scale does not change, so a larger frame shows more ground.

```ts
// The printable area of a paper of 24 by 36 in, with a margin of 0.5 in.
const fit = fitFrame(map, { widthMm: 584.2, heightMm: 889 }, { labelFont, turn: true });
const frame = { ...map.frame, widthMm: fit.widthMm, heightMm: fit.heightMm };
const svg = renderMap({ ...map, frame, legendPlace: fit.legendPlace }, { labelFont });
```

- The place `below` puts the scale bars and the legend in two columns below the frame. This is the default.
- The place `side` puts them in one column at the right of the frame. The attribution block stays below the frame.
- `mapMargins` gives the space around the frame for each place. The label font measures the legend texts.
- With `turn: true`, `fitFrame` also examines the space with a quarter turn. When `fit.turned` is `true`, print the map in landscape.
