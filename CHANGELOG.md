# Changelog

All notable changes to **Nik's Scene Transformations (`niks-scene-transformations`)** are documented in this file.

## [14.1.0] - 2026-10-30
### Added
- **Change Grid Size**: A new option in the **Transform** tab. Enter how many pixels a grid space should be, and the map and everything on it grow or shrink to match. The scene keeps its size in grid spaces, so a 30 × 30 map at 200 px is still 30 × 30 at 100 px, and every token stays on its spaces.

## [14.0.0] - 2026-10-30
### Added
- **Transform Tab**: A new **Transform** tab in each scene's **Configure** window, with a live preview of the new layout and size.
- **Add Space**: Adds playable empty space around a scene, in grid spaces per side. Background and foreground images become locked tiles in their old place, and everything on the scene moves along.
- **Rotate Scene**: Rotates a scene 90° clockwise, 90° counter-clockwise or 180°. Tokens, walls, doors, lights, sounds, tiles, drawings, notes and regions turn with the map and stay on the grid.
- **Backup Copy & Fog Reset**: Optionally keeps an untouched copy of the scene and resets fog exploration.
