# Changelog

## 0.1.1

- The field `legendPlace` of a map puts the scale bars and the legend below the frame (the default) or in a column at the right side.
- `mapMargins` gives the space of the SVG around the frame. The size of the frame does not change it.
- `fitFrame` gives the frame with the largest area in one of a list of spaces, and the place of the legend. A list can have a paper upright and in landscape.

## 0.1.0

- The first version.
- A map is data: a frame, layers with filters and black and white styles, and the source of each layer.
- `renderMap` gives an SVG in millimetres, with the scale bars, the legend, the north arrow and the attribution block.
