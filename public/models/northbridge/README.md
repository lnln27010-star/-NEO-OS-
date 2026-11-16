# Northbridge IFC derivative

Source: https://github.com/MassingCloud/masslibrary/tree/main/samples/data-center

License: CC0 1.0. Upstream explicitly identifies all samples as SYNTHETIC, not an actual site, owner model or field-verified building. License: https://raw.githubusercontent.com/MassingCloud/masslibrary/main/LICENSE-SAMPLES

`building.glb` is tessellated from `northbridge_data_hall.ifc` using the checked-in `scripts/convert-ifc.mjs` and web-ifc 0.0.78. `elements.json` contains source SHA-256, per-element IFC GlobalIds, original metre/Y-up bounds and conversion statistics. Run `npm run assets:ifc` to reproduce.

854 elements exported. Eight geometry parts had no renderable triangles. The sample's roof, beams and several MEP parts are at ground elevation in its source IFC. The viewer applies a documented **test presentation correction**, not a surveyed engineering correction: roof +8.5 m, beams +8.05 m, ducts +6.35 m, air terminals/sensors/fire terminals +6.1 m, cable carrier +5.25 m, horizontal pipe +5.6 m. A covering at 2.7 m and a zero-thickness structural surface are hidden to permit the test data-hall view. The original source and exported GLB remain unchanged.

Surrounding paving, cooling plant, generators, parked vehicles and 192 racks are locally authored synthetic test geometry. They are not a real Chinese facility, point cloud, vendor model or a NVIDIA asset. The unrelated campus satellite image from the old diorama is not used here.
