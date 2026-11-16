# Rack Room — Free Server Rack Sample

Version 1.0.1: license wording clarified for free recipients; model and sprites unchanged.

A free, usable sample from Rack Room: one static server rack GLB and four transparent PNG sprites. Original procedural geometry, renders and writing developed with AI assistance.

## Use it

- Import `models/server_rack.glb` into your engine or Blender. The model has 2,496 triangles, a base-plane pivot and constant-color materials; no external textures.
- `sprites/top/` is a 90-degree overhead view; `sprites/tilt/` is a 68-degree elevated view. Each has native 128 × 128 and 256 × 256 RGBA PNGs.
- For placement, the top sprite's ground-origin anchor is (64,64) at 128px and (128,128) at 256px. The tilted anchor is (64,76.910) and (128,153.819), measured from the top-left. The manifest records these values and model bounds.
- Sprites are antialiased Blender renders with a shared world scale. They are not hand-drawn pixel art. Use your own depth sorting and filtering as needed.

The sample files are byte-for-byte copies from Rack Room 1.1. The source model passed Blender reimport and Godot 4.5.1 headless checks for geometry, dimensions, materials and pivot; sprites passed dimensions and transparency checks. This is not a claim of gameplay, Godot rendered appearance or other-engine testing. There are no rigs, animations, collisions or gameplay scripts.

## License

You may modify the included model and sprites and use them in personal or commercial finished projects. Attribution is optional. Raw asset redistribution/resale is excluded. Read ASSET-LICENSE.txt for details. The sample is free to download and use within those terms; no full-pack purchase is needed for this sample.

## Optional full set

The US$5 Rack Room pack adds seven more props (eight total), 32 sprites total, editable Blender showcase and assembled 47-instance room, a Godot 4.5.1 example, placement JSON and optional scripts.
https://saiasue36.gumroad.com/l/rack-room-server-props?utm_source=itch&utm_medium=sample_readme&utm_campaign=rack_room_20260922

The full-set room and source scenes are not included in this free sample. Preview lighting and the background floor are presentation elements.
