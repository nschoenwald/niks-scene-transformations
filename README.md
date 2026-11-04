# Nik's Scene Transformations

[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-V14-orange.svg)](https://foundryvtt.com)
[![Systems](https://img.shields.io/badge/Systems-Any-blue.svg)](https://foundryvtt.com/packages/systems)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/nschoenwald/niks-scene-transformations?color=purple)](https://github.com/nschoenwald/niks-scene-transformations/releases/latest)

Rotate, mirror, crop or extend a scene, change its grid size, attach another scene to it or extract part of it into a new scene, without rebuilding anything. Every token, wall, door, light, sound, tile, drawing, journal note and region moves along, so everything stays exactly where it belongs on the map. Works with **any game system** in **Foundry VTT v14**.

<img width="673" height="786" alt="image" src="https://github.com/user-attachments/assets/b71ad93d-c294-4bfa-a36a-24fa30036a88" />

<img width="672" height="780" alt="image" src="https://github.com/user-attachments/assets/19283486-edcb-4808-80b1-e3c8ea346c9d" />

---

## ✨ Features

- **Where to find it**: Open a scene's **Configure** window and switch to the **Transform** tab.
- **Add or remove space**:
  - Positive numbers add empty, playable space on a side, negative numbers cut grid spaces off it. Tick **Same on all sides** to set all four at once.
  - Unlike Foundry's own padding, players can move tokens, measure and draw in added space.
  - The background and foreground images become locked tiles in their old spot, so the map doesn't stretch. On scenes with a fog overlay they stay backgrounds instead, so the overlay keeps lining up (see below).
  - When removing space, **Delete what ends up outside** removes tokens, walls, lights, sounds, notes, tiles, drawings and regions that lie entirely in the removed part (the tab shows how many). Walls that cross the new edge are kept. Without it, they stay in the dark border around the scene.
  - **Cut images to the new size** (on by default) saves the visible part of the background and foreground images as new WebP files, so the removed part doesn't show in the border. Videos and rotated or scaled images are kept whole, with a warning.
  - Cut images are named after the scene, the image and the time, for example `dungeon-ground-background-2026-10-30-232315.webp`. Where they go is set by the module setting **Folder for cut images**: leave it empty for `worlds/<your world>/niks-scene-transformations/` (or the same S3 bucket when the map is stored there), or pick your own folder, for example `assets/maps/`, so the files survive exporting the scene to another world. Module and system folders aren't used, because updating the package would delete the files.
  - On hexagonal grids the offset is rounded to whole hexes, and tokens that were snapped to the grid stay snapped.
- **Rotate or mirror the scene**:
  - Turns the scene 90° clockwise, 90° counter-clockwise or 180°, or mirrors it left to right or top to bottom.
  - Tokens turn with the map and keep their grid spaces. Tokens with **Lock Artwork Rotation** keep their artwork upright. Tokens that are longer than they are wide (for example 2×1) swap width and height on a quarter turn.
  - When mirroring, tokens and lights turn to face the mirrored direction. Token artwork isn't mirrored, so faces and text stay readable. Tiles and the map image are mirrored. One-way walls keep blocking from the same side of the map, and doors swing the mirrored way.
  - The grid stays aligned with the map, even when the scene size isn't a multiple of the grid size.
  - On a quarter turn the background and foreground images become locked tiles turned with the map. A half turn or a mirror keeps them as backgrounds.
- **Change the grid size**:
  - Enter the new size of a grid space in pixels, for example 100 px for a map drawn at 200 px per grid space.
  - The map and everything on it grow or shrink with the grid, so the scene keeps the same number of grid spaces: a 30 × 30 map stays 30 × 30. Tokens keep their spaces, and lights and sounds keep their range in feet or metres.
  - Tiles, drawings, journal note icons and region shapes are resized along. The initial view zooms so it shows the same part of the map.
  - The background and foreground images stay backgrounds and scale with the scene.
- **Attach another scene**:
  - Pick a scene, the side to attach it to and how to line it up: along the top or left edges, centered, or along the bottom or right edges. **Gap** leaves empty grid spaces between the maps, **Shift along the side** moves the attached map along the edge.
  - This scene grows to fit both maps. The other scene's map, walls, lights, sounds, notes, tiles, drawings, regions and, with **Copy its tokens**, tokens are copied in. The other scene isn't changed.
  - The attached scene is scaled to this scene's grid size and lined up with its grid, so its tokens land on grid spaces.
  - If the two scenes measure a grid space differently (for example 5 ft and 10 ft), light, sound, vision and wall threshold ranges are converted so they cover the same number of grid spaces.
  - Levels are matched by id, otherwise by their order from the bottom.
- **Extract an area to a new scene**:
  - Choose the area in the preview: drag on the map to draw it, drag it to move it, drag its handles to resize it. A grid shows the grid spaces, and the rest of the map is dimmed. You can also type column, row, width and height, or focus the area and use the arrow keys (with Shift to resize).
  - The area always covers whole grid spaces, so the new scene's grid lines up with the map.
  - Below the preview, the tab lists what will be copied, for example "Tokens 3 · Walls 54 · Lights 6 · Images 1".
  - Everything overlapping the area is copied. Walls crossing the edge are cut at the edge, and the background and foreground images are cut to the area (saved like images cut by removing space). Tokens only next to the area aren't copied. **Copy tokens** can leave tokens out.
  - The new scene takes over all settings of this one (lighting, grid, fog, sounds…), gets the name you enter and isn't added to the navigation bar. With **Open the new scene** (on by default) the window closes and the new scene opens.
  - This scene isn't changed, so there's no confirmation and no backup copy.
- **Undo last transformation**:
  - When a transformation kept a backup copy, the tab shows it with a **Restore** button.
  - Restoring brings back everything as it was before that transformation, including the ids of tokens and other placeables, so combats and links keep working. Anything added since is removed. The backup copy is deleted afterwards.
  - The scene keeps its name, folder, navigation and permissions. Each restore steps back one transformation, as long as backup copies are left.
- **Preview**: Shows the scene's actual map (background, tiles and foreground of the level it opens on), the new layout and the current and new size before you apply anything. When removing space, the whole current map stays visible: removed parts are shaded and striped, the new scene edge is a dashed line, and added space is an empty area.
- **After applying**: The **Configure** window closes, so the transformed scene is in view right away.
- **Safety**:
  - **Keep a backup copy** (on by default) saves an untouched copy of the scene first, hidden from the navigation bar and named with the time it was made, for example "Dungeon (Backup 23:23)".
  - **Reset fog exploration** (on by default) clears explored areas, which no longer match the map.
  - Everything is saved in one step, so tokens don't animate, collide with walls or trigger region behaviors on the way.
  - The scene thumbnail is regenerated afterwards.

---

## ⚙️ For GMs

- **Images turned into tiles** are named after their level ("Ground Background", "Ground Foreground") and locked. Backgrounds block light and weather like a scene background does. Unlock a tile in the Tiles layer to edit it.
- **Levels**: Scenes with several levels work. Each level's images become tiles on that level.
- **Not supported**:
  - Rotating, mirroring, attaching or extracting from scenes with a hexagonal grid (adding space and changing the grid size work).
  - Fog overlay images can only follow a map that is stretched to fill the scene (Foundry's default). On such scenes the map stays a background instead of becoming a tile, and when space is removed the overlay is cut together with it. Maps with another fit mode become tiles as usual, and you'll get a warning that the overlay may no longer line up. An attached scene's fog overlay isn't copied.
  - Backup copies made before version 14.2.0 can't be restored from the tab.
  - Journal note icons don't get smaller than 32 px, which is Foundry's minimum.
  - Region shapes added by other modules with their own shape types are left in place, with a warning.
- **Unsaved changes**: Applying a transformation saves right away. Unsaved changes in other tabs of the Configure window are lost.

---

## 🧑‍💻 For Module Developers

The API is available on `game.modules.get("niks-scene-transformations").api` after `init`:

- `rotateScene(scene, angle, options)` rotates clockwise by 90, 180 or 270 degrees.
- `padScene(scene, {top, right, bottom, left}, options)` adds grid spaces on each side.
- `mirrorScene(scene, axis, options)` mirrors left to right (`"x"`) or top to bottom (`"y"`).
- `cropScene(scene, {top, right, bottom, left}, options)` removes grid spaces from each side. Extra options: `removeOutside = false`, `cropImages = true`.
- `resizeGrid(scene, size, options)` changes the grid size to `size` pixels and scales everything along.
- `stitchScenes(scene, other, {side, align, gap, offset, tokens}, options)` attaches a copy of `other`.
- `extractScene(scene, {x, y, width, height}, {name, tokens})` creates a new scene from an area in grid spaces (columns and rows from 0, see `extractGrid(scene)`) and returns `{scene, warnings}`.
- `options`: `{backup = false, resetFog = true, thumbnail = true}`. All of these return `{scene, backup, warnings}`.
- `findBackup(scene)` returns the latest backup copy, and `restoreBackup(scene, backup, {resetFog, thumbnail})` restores it.
- `planRotation(scene, angle)`, `planMirror(scene, axis)`, `planPadding(scene, padding)`, `planCrop(scene, crop, options)`, `planResize(scene, amounts, options)` (signed amounts), `planGridSize(scene, size)`, `planStitch(scene, other, placement)`, `planExtract(scene, area, {tokens})`, `countOutside(scene, plan)` and `buildSceneUpdate(scene, plan)` build the Scene update without saving it, for previews or custom workflows. `transformScene(scene, plan, options)` applies a plan.
- The Scene update carries the option `{"niks-scene-transformations": {type, angle, mirror}}` (`type: "restore"` when restoring), so `preUpdateScene` / `updateScene` hooks can tell a transformation apart.

---

## 🌐 Languages

🇬🇧 English · 🇩🇪 Deutsch

Translations into other languages by native speakers are welcome as an issue or pull request.

---

## Modules by Nik

### 🎲 D&D 5e Specific
* **[Nik's DnD5e Tweaks](https://github.com/nschoenwald/niks-dnd5e-tweaks)** – Consolidated collection of quality-of-life enhancements and combat automation tweaks for DnD5e.

### ⚔️ Combat & Token Tools
* **[Nik's Action HUD](https://github.com/nschoenwald/niks-action-hud)** – Sleek, modern canvas-docked Action HUD for quick access to attacks, spells, inventory, and utility rolls.
* **[Nik's Effects Panel](https://github.com/nschoenwald/niks-effects-panel)** – Floating panel next to the sidebar that shows the selected token's active effects, to check, disable or remove them without opening the character sheet.
* **[Nik's Token Tags](https://github.com/nschoenwald/niks-token-tags)** – Automatically numbers duplicate combatant NPCs (A, B, C…) with color-coded letter overlays.
* **[Nik's Shared NPC Initiative](https://github.com/nschoenwald/niks-shared-npc-initiative)** – Groups NPCs of the same type in combat so they share a single initiative roll.
* **[Nik's Movement Control](https://github.com/nschoenwald/niks-movement-control)** – GM controls to toggle player movement and automatically restrict/allow movement on combat start and end.
* **[Nik's Token Motion](https://github.com/nschoenwald/niks-token-motion)** – Tokens hop square by square like miniatures, lift and set down like chess pieces, or glide smoothly, and long moves no longer crawl across the map.
* **[Nik's Tiny Change Logs](https://github.com/nschoenwald/niks-tiny-changelogs)** – Compact, single-line chat messages logging token HP and Temp HP changes.

### 🎨 Visuals & Display
* **[Nik's Dynamic Roll Area](https://github.com/nschoenwald/niks-dynamic-roll-area)** – Dynamically restricts Dice So Nice 3D dice rolling area to exclude the sidebar / chat log across all screen resolutions and window sizes.

### ⚙️ Utilities & System Management
* **[Nik's Settings Locks](https://github.com/nschoenwald/niks-settings-locks)** – Soft-lock and hard-lock client settings and keybindings across all connected players.
* **[Nik's Compendium Search Tweaks](https://github.com/nschoenwald/niks-compendium-search-tweaks)** – Configure which compendium packs are included or excluded from native sidebar search.
* **[Nik's Copy Environment](https://github.com/nschoenwald/niks-copy-environment)** – Copy the list of systems, modules, and versions, and export/import game and player settings.
* **[Nik's Show & Tell](https://github.com/nschoenwald/niks-show-and-tell)** – Share popout images to chat and paste image files directly into chat messages.
* **[Nik's Zoom / Pan Options](https://github.com/nschoenwald/niks-zoom-pan-options)** – Touchpad and scroll wheel pan/zoom controls and canvas navigation enhancements.
* **[Nik's Scene Transformations](https://github.com/nschoenwald/niks-scene-transformations)** – Rotate scenes or add playable space around them, with tokens, walls, lights, tiles and regions moved along so everything stays in place.
* **[Nik's Wall Height](https://github.com/nschoenwald/niks-wall-height)** – Give walls a bottom and top elevation, so tokens, lights and sounds above or below a wall ignore it.
