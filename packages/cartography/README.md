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
| `renderMap(map)` | The SVG of the map, with the scale bars, the legend, the north arrow and the attribution block. |
| `checkMap(map)` | Nothing. It throws a `MapError` for a map that is not correct. |
| `frameView(frame)` | The functions between the Earth and the paper, and the direction of north. |
| `frameBBox(frame)` | The box on the Earth around the frame, for a fetch of the data of a map. |
| `matchesFilter(filter, feature)` | `true` when the feature matches the filter. |
| `checkFilter(value)` | Nothing. It throws a `MapError` for a value that is not a `Filter`. |
| `attributionLines(map)` | The lines of the attribution block: the scale, the projection and each source. |
| `scaleBarLength(meters, units)` | The longest round length of a scale bar that is not longer than a length on the ground. |

## Rules

- The scale of the frame is the true scale at the center. Use `azimuthalEquidistant` for a map of a small area.
- Web Mercator changes its scale with the latitude. On the ellipsoid, it also changes its scale with the direction: at 45 degrees, by approximately 0.34 %.
- The render removes a feature that is not on the frame, and the frame clips each layer.
- Each identifier in the SVG starts with the identifier of the map. Thus two maps can be in one HTML page.
- The simplification uses `simplifyRegions` of `@mark1russell7/geo`. A tolerance of 0.2 mm on the paper at 1:24,000 is 4.8 m on the ground.
- Each refusal is a `MapError` with a code: `frame`, `id`, `filter`, `style` or `source`.

## License

MIT
