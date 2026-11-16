# Digital Twin Designer Overrides

This page is a desktop engineering editor. These rules override the generic landing-page pattern in `MASTER.md`.

## Product direction

- Treat the interface as a CAD and DCIM workstation, never as a marketing dashboard or cinematic HUD.
- The 3D room is the primary work surface. Permanent chrome must preserve at least 55 percent of the application width for the viewport at 1280px.
- Visual polish comes from correct scale, materials, lighting, hierarchy and interaction feedback. Avoid scan lines, fake telemetry, decorative neon and excessive glass blur.

## Color system

- App background `#070B10`
- Panel surface `#111820`
- Raised surface `#17212B`
- Border `#2A3744`
- Primary text `#F1F5F9`
- Secondary text `#B3C0CD`
- Muted text `#8291A2`
- Selection blue `#4EA7FF`
- Compute green `#45D483`
- Power orange `#F59E42`
- Cooling cyan `#34C6D8`
- Network violet `#9A8AFB`
- Warning amber `#F4C24F`
- Error red `#F45B6A`

Use domain colors only for assets, paths, legends and findings. Neutral surfaces should occupy most of the screen. Never encode a status by color alone.

## Typography and density

- Use Inter when available, then Segoe UI, Microsoft YaHei and system-ui. Do not load a decorative heading font.
- Body and actionable labels are 12px to 14px. Secondary engineering annotations may be 11px, never smaller.
- Use Cascadia Code or Consolas only for coordinates, IDs, rule codes and aligned numeric data.
- Use tabular numerals for capacity, power, temperature, coordinates and time.
- Follow a 4px and 8px spacing rhythm. Common gaps are 4, 8, 12 and 16px.

## 3D realism

- Use physical dimensions in metres with every asset rooted at its bottom centre.
- Racks must show frame depth, perforated doors, server trays, handles, hinges, status lamps, plinths and front or rear orientation.
- The room must show raised-floor tiles, walls, structural columns, doors, cold and hot aisles, containment, overhead busways, cable trays and cooling supply and return pipes.
- Lighting should resemble a real white-lit technical room. Use neutral white area lights, restrained ambient fill, contact shadows and material roughness. Avoid green room-wide tinting.
- Selection, heat and domain overlays are temporary analysis modes. Normal mode should retain realistic material colors.
- Drag placement must show the equipment footprint, required front and rear service clearance, snap dimensions and a text reason when invalid.

## Interaction

- Dragging is not the only placement method. Every asset card also provides an Add button and keyboard operation.
- Keep pointer feedback under 100ms. Use a movement threshold before treating a click as a drag.
- Rotation must re-run boundary, collision and clearance validation.
- Empty or unimplemented commands are disabled and labelled as unavailable. No clickable control may silently do nothing.
- Show autosave and validation freshness as separate states.
- Support visible focus, Escape to cancel placement, Delete to remove, R to rotate and Ctrl or Cmd plus Z for undo.

## Motion

- Motion level is subtle. Use 120 to 180ms transitions for hover and selection, 180 to 240ms for panels and camera focus.
- Animate transform and opacity only. Respect `prefers-reduced-motion`.
- Do not use entrance choreography or looping decorative animation in the engineering workspace.

## Accessibility

- Icon-only controls need accessible names and pressed or expanded state where relevant.
- The WebGL canvas needs a descriptive accessible label.
- Provide keyboard and button alternatives to drag placement.
- Tables and findings must be keyboard focusable.
- Focus must remain visible above sticky headers, bottom drawers and transient toasts.

