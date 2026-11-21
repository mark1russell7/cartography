# @mark1russell7/cartography-emergency

The add-on of `@mark1russell7/cartography` for emergency maps. Each function gives layers of the core, with black and white styles for a print with no color.

```ts
import { renderMap } from "@mark1russell7/cartography";
import { evacuationRouteLayer, evacuationZoneLayers, shelterLayer } from "@mark1russell7/cartography-emergency";

const layers = [
  ...evacuationZoneLayers(zones, { property: "zone", zones: [{ value: "A", legend: "Zone A" }, { value: "B", legend: "Zone B" }], source }),
  evacuationRouteLayer(routes, source),
  shelterLayer(shelters, source),
];
const svg = renderMap({ id: "evacuation", title: "Evacuation zones and shelters", frame, layers });
```

## The functions

| Function | Result |
| --- | --- |
| `evacuationZoneLayers(features, options)` | One layer for each zone. The first zone has the densest hatch. |
| `shelterLayer(features, source, options)` | The layer of the shelters: an open square for a point, and a dark gray area for a building. |
| `evacuationRouteLayer(features, source, options)` | The layer of the routes: a dashed black line of 0.8 mm. |
| `zoneHatch(index)` | The hatch of a zone from its position in the sequence of the zones. |

## Rules

- Give the zones in their sequence: the first zone to leave first. A map has from 1 to `MAX_EVACUATION_ZONES` zones.
- Each layer keeps only the features of its kind. Thus all the layers can use one feature collection.
- The add-on gives no data. The features and their sources are input data.

## License

MIT
