# Changelog

All notable changes to **Nik's Scene Transformations (`niks-scene-transformations`)** are documented in this file.

## [14.4.0] - 2026-11-02
### Added
- The module is now available in German, French, Spanish, Italian, Brazilian Portuguese, Japanese, Polish and Czech.

## [14.3.0] - 2026-10-30
### Added
- **Extract an Area to a New Scene**: Creates a new scene from part of the current one, for example a single building from a city map. Drag on the map preview to choose the area, move it or resize it by its handles; it snaps to grid spaces, and you can also type it in or use the arrow keys. The tab shows what will be copied. Walls are cut at the edge, the map image is cut to the area, and all scene settings are taken over. The current scene isn't changed.
- **Folder for Cut Images**: A new module setting picks the folder where cut background and foreground images are saved, for example your own maps folder. Left empty, they go to the world folder, or to the same S3 bucket as the map. Module and system folders aren't used, because updates would delete the files.

### Changed
- **Cut Image Names**: Cut images are named after the scene, the image and the time, for example `dungeon-ground-background-2026-10-30-232315.webp`.
- **Preview Shows the Real Map**: The preview now shows the scene's actual map, including maps made of tiles (for example after an earlier transformation), instead of only the background image or an empty box.
- **Remove Space Preview**: The preview now shows the whole current map with the removed parts shaded and striped, the new scene edge as a dashed line, and added space as an empty area, with a small legend underneath.
- **After Applying**: The **Configure** window closes once a transformation or a restore is done, so you see the transformed scene right away.
- **Backup Names**: Backup copies now include the time they were made, for example "Dungeon (Backup 23:23)".
- **Mirror Scene**: "Flip" is now called **Mirror**: **Rotate or mirror the scene** offers **Mirror left to right** and **Mirror top to bottom**.

### Fixed
- **Active Scene**: Transforming a scene no longer deactivates it or removes it from the navigation bar. If an earlier version did this to one of your scenes, activate it again and switch **Navigation** back on in its configuration.
- **Fog Overlay**: Scenes with a fog overlay image keep their map as a background when adding or removing space, turning by 90°, attaching another scene or extracting an area, so the overlay stays lined up with the map. When space is removed, the overlay is cut together with the map. The warning about the overlay now only appears when the map isn't stretched to fill the scene, the one case where it can't follow.
- **Black Canvas**: The canvas no longer stays black after transforming the scene you're viewing, so there's no need to click **View Scene** again.

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
