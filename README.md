# Nik's Scene Transformations

[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-V14-orange.svg)](https://foundryvtt.com)
[![Systems](https://img.shields.io/badge/Systems-Any-blue.svg)](https://foundryvtt.com/packages/systems)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/nschoenwald/niks-scene-transformations?color=purple)](https://github.com/nschoenwald/niks-scene-transformations/releases/latest)

Rotate a scene or give it more room, without rebuilding anything. Every token, wall, door, light, sound, tile, drawing, journal note and region moves along, so everything stays exactly where it belongs on the map. Works with **any game system** in **Foundry VTT v14**.

<img width="670" height="784" alt="image" src="https://github.com/user-attachments/assets/79c53d2f-37d4-4206-b0d9-e44c2daab889" />

<img width="672" height="780" alt="image" src="https://github.com/user-attachments/assets/19283486-edcb-4808-80b1-e3c8ea346c9d" />

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

---

## Other Modules by Nik

### 🎲 D&D 5e Specific
* **[Nik's DnD5e Tweaks](https://github.com/nschoenwald/niks-dnd5e-tweaks)** – Consolidated collection of quality-of-life enhancements and combat automation tweaks for DnD5e.

### ⚔️ Combat & Token Tools
* **[Nik's Action HUD](https://github.com/nschoenwald/niks-action-hud)** – Sleek, modern canvas-docked Action HUD for quick access to attacks, spells, inventory, and utility rolls.
* **[Nik's Token Tags](https://github.com/nschoenwald/niks-token-tags)** – Automatically numbers duplicate combatant NPCs (A, B, C…) with color-coded letter overlays.
* **[Nik's Shared NPC Initiative](https://github.com/nschoenwald/niks-shared-npc-initiative)** – Groups NPCs of the same type in combat so they share a single initiative roll.
* **[Nik's Movement Control](https://github.com/nschoenwald/niks-movement-control)** – GM controls to toggle player movement and automatically restrict/allow movement on combat start and end.
* **[Nik's Tiny Change Logs](https://github.com/nschoenwald/niks-tiny-changelogs)** – Compact, single-line chat messages logging token HP and Temp HP changes.

### 🎲 Visuals & Display
* **[Nik's Dynamic Roll Area](https://github.com/nschoenwald/niks-dynamic-roll-area)** – Dynamically restricts Dice So Nice 3D dice rolling area to exclude the sidebar / chat log across all screen resolutions and window sizes.

### ⚙️ Utilities & System Management
* **[Nik's Settings Locks](https://github.com/nschoenwald/niks-settings-locks)** – Soft-lock and hard-lock client settings and keybindings across all connected players.
* **[Nik's Compendium Search Tweaks](https://github.com/nschoenwald/niks-compendium-search-tweaks)** – Configure which compendium packs are included or excluded from native sidebar search.
* **[Nik's Copy Environment](https://github.com/nschoenwald/niks-copy-environment)** – Copy the list of systems, modules, and versions, and export/import game and player settings.
* **[Nik's Show & Tell](https://github.com/nschoenwald/niks-show-and-tell)** – Share popout images to chat and paste image files directly into chat messages.
* **[Nik's Zoom / Pan Options](https://github.com/nschoenwald/niks-zoom-pan-options)** – Touchpad and scroll wheel pan/zoom controls and canvas navigation enhancements.
