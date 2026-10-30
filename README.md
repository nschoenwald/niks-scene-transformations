# Nik's Scene Transformations

[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-V14-orange.svg)](https://foundryvtt.com)
[![Systems](https://img.shields.io/badge/Systems-Any-blue.svg)](https://foundryvtt.com/packages/systems)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/nschoenwald/niks-scene-transformations?color=purple)](https://github.com/nschoenwald/niks-scene-transformations/releases/latest)

Rotate a scene or give it more room, without rebuilding anything. Every token, wall, door, light, sound, tile, drawing, journal note and region moves along, so everything stays exactly where it belongs on the map. Works with **any game system** in **Foundry VTT v14**.

---

## ✨ Features

- **Where to find it**: Open a scene's **Configure** window and switch to the **Transform** tab.
- **Add space around the scene**:
  - Adds empty, playable space on any side, measured in grid spaces. Tick **Same on all sides** to set all four at once.
  - Unlike Foundry's own padding, players can move tokens, measure and draw in the new space.
  - The background and foreground images become locked tiles in their old spot, so the map doesn't stretch.
  - On hexagonal grids the offset is rounded to whole hexes, and tokens that were snapped to the grid stay snapped.
- **Rotate the scene**:
  - Turns the scene 90° clockwise, 90° counter-clockwise or 180°.
  - Tokens turn with the map and keep their grid spaces. Tokens with **Lock Artwork Rotation** keep their artwork upright. Tokens that are longer than they are wide (for example 2×1) swap width and height on a quarter turn.
  - The grid stays aligned with the map, even when the scene size isn't a multiple of the grid size.
  - On a quarter turn the background and foreground images become locked tiles turned with the map. A half turn keeps them as backgrounds.
- **Preview**: Shows the new layout and the current and new size before you apply anything.
- **Safety**:
  - **Keep a backup copy** (on by default) saves an untouched copy of the scene first, hidden from the navigation bar.
  - **Reset fog exploration** (on by default) clears explored areas, which no longer match the map.
  - Everything is saved in one step, so tokens don't animate, collide with walls or trigger region behaviors on the way.
  - The scene thumbnail is regenerated afterwards.

---

## ⚙️ For GMs

- **Images turned into tiles** are named after their level ("Ground Background", "Ground Foreground") and locked. Backgrounds block light and weather like a scene background does. Unlock a tile in the Tiles layer to edit it.
- **Levels**: Scenes with several levels work. Each level's images become tiles on that level.
- **Not supported**:
  - Rotating scenes with a hexagonal grid (adding space works).
  - Fog overlay images aren't moved or rotated. You'll get a warning if the scene has one.
  - Region shapes added by other modules with their own shape types are left in place, with a warning.
- **Unsaved changes**: Applying a transformation saves right away. Unsaved changes in other tabs of the Configure window are lost.

---

## 🧑‍💻 For Module Developers

The API is available on `game.modules.get("niks-scene-transformations").api` after `init`:

- `rotateScene(scene, angle, options)` rotates clockwise by 90, 180 or 270 degrees.
- `padScene(scene, {top, right, bottom, left}, options)` adds grid spaces on each side.
- `options`: `{backup = false, resetFog = true, thumbnail = true}`. Both return `{scene, backup, warnings}`.
- `planRotation(scene, angle)`, `planPadding(scene, padding)` and `buildSceneUpdate(scene, plan)` build the Scene update without saving it, for previews or custom workflows. `transformScene(scene, plan, options)` applies a plan.
- The Scene update carries the option `{"niks-scene-transformations": {type, angle}}`, so `preUpdateScene` / `updateScene` hooks can tell a transformation apart.
