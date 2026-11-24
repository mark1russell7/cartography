# Roadmap

This file is the plan of cartography. The Status page of the site reads it, and the tracker of the project mirrors it.

| ID | Item | Status | Summary |
| --- | --- | --- | --- |
| R1 | The first package | done | The core `@mark1russell7/cartography` 0.1.0 and the add-on `@mark1russell7/cartography-emergency` 0.1.0. |
| R2 | Labels | done | Put the names of places, roads and areas on the map, with no overlap. The caller measures the labels with `@mark1russell7/typeset`. |
| R3 | The demo site | open | Replace the first site with a live demo: a map of a made-up town, with its layers, its scale and its SVG. |
| R4 | Shared geometry of the labels | open | The labels test the overlap of two turned boxes, and clip a line to the frame by the boxes of its segments. Move the box test to `@mark1russell7/layout-contract` and import it. Add a segment clip there, so a label goes to the middle of the part on the frame. |
| R5 | A frame for a box, and the path data of a geometry | done | With no height, `frameAround` fits a box on the Earth into a width on the paper. `geometryPath` gives the SVG path data of a line or an area on a frame. Version 0.1.4. |
