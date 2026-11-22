# Changelog

## 0.1.2

- `atlasPages` gives the pages of an atlas: a grid of frames at one scale on one plane that shows a circle on the Earth.
- Neighbor pages share a strip at their common edge. Each page has a name, for example `B3`, and the names of its neighbor pages.
- `atlasOutlines` gives the outline of each page as a polygon feature, for a layer of an index map.
- `atlasIndexFrame` gives the frame of an index map that shows all the pages.
- The field `edges` of a map puts a text at the middle of an edge of the frame, in a white box with an arrow. No label covers the box.
- An obstacle of `placeLabels` can have a half height `halfHeight` that is not its half width.
- The new code `atlas` of `MapError` tells that the radius or the overlap of an atlas is not correct.

## 0.1.1

- The field `legendPlace` of a map puts the scale bars and the legend below the frame (the default) or in a column at the right side.
- `mapMargins` gives the space of the SVG around the frame. The size of the frame does not change it.
- `fitFrame` gives the frame with the largest area in one of a list of spaces, and the place of the legend. A list can have a paper upright and in landscape.

## 0.1.0

- The first version.
- A map is data: a frame, layers with filters and black and white styles, and the source of each layer.
- `renderMap` gives an SVG in millimetres, with the scale bars, the legend, the north arrow and the attribution block.
