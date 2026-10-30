# Changelog

All notable changes to **Nik's Scene Transformations (`niks-scene-transformations`)** are documented in this file.

## [14.2.0] - 2026-10-30
### Added
- **Flip Scene**: Flips a scene left to right or top to bottom. Walls, one-way walls and doors, lights, tiles, drawings and regions are mirrored with the map. Tokens turn to face the mirrored direction, and their artwork isn't mirrored.
- **Remove Space**: Enter negative numbers under **Add or remove space** to cut grid spaces off any side, for example a legend strip or a wide border. You can delete what ends up outside the scene, and background images are cut to the new size so the removed part doesn't show in the dark border.
- **Undo Last Transformation**: When a transformation kept a backup copy, the **Transform** tab offers to restore the scene from it. Everything goes back to how it was, tokens keep their place in combat, and the backup copy is removed.
- **Attach Another Scene**: Attaches a copy of another scene to any side of this one, with a gap and alignment of your choice. Its map, walls, lights, sounds, notes, tiles, drawings, regions and, if you want, tokens are copied in, scaled to this scene's grid size and lined up with its grid. The other scene isn't changed.

### Changed
- **Transform Tab**: The modes are now **Add or remove space**, **Rotate or flip the scene**, **Change the grid size** and **Attach another scene**.

## [14.1.0] - 2026-10-30
### Added
- **Change Grid Size**: A new option in the **Transform** tab. Enter how many pixels a grid space should be, and the map and everything on it grow or shrink to match. The scene keeps its size in grid spaces, so a 30 × 30 map at 200 px is still 30 × 30 at 100 px, and every token stays on its spaces.

## [14.0.0] - 2026-10-30
### Added
- **Transform Tab**: A new **Transform** tab in each scene's **Configure** window, with a live preview of the new layout and size.
- **Add Space**: Adds playable empty space around a scene, in grid spaces per side. Background and foreground images become locked tiles in their old place, and everything on the scene moves along.
- **Rotate Scene**: Rotates a scene 90° clockwise, 90° counter-clockwise or 180°. Tokens, walls, doors, lights, sounds, tiles, drawings, notes and regions turn with the map and stay on the grid.
- **Backup Copy & Fog Reset**: Optionally keeps an untouched copy of the scene and resets fog exploration.
