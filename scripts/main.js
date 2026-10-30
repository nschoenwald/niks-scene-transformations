import { MODULE_ID } from './config.js';
import { registerSceneConfigTab } from './scene-config-tab.js';
import {
  MIRRORS, ROTATIONS, SIDES, buildSceneUpdate, canExtract, canRotate, countOutside, extractGrid, extractScene,
  findBackup, planCrop, planExtract, planGridSize, planMirror, planPadding, planResize, planRotation, planStitch,
  restoreBackup, transformScene,
} from './transform.js';

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, 'imageFolder', {
    name: `${MODULE_ID}.Settings.ImageFolder.Name`,
    hint: `${MODULE_ID}.Settings.ImageFolder.Hint`,
    scope: 'world',
    config: true,
    type: String,
    default: '',
    filePicker: 'folder',
  });
  registerSceneConfigTab();

  // Public API for macros and other modules
  game.modules.get(MODULE_ID).api = {
    ROTATIONS,
    MIRRORS,
    SIDES,
    canRotate,
    planRotation,
    planMirror,
    planPadding,
    planCrop,
    planResize,
    planGridSize,
    planStitch,
    planExtract,
    canExtract,
    extractGrid,
    extractScene,
    buildSceneUpdate,
    countOutside,
    transformScene,
    findBackup,
    restoreBackup,
    /**
     * Rotate a scene clockwise by 90, 180 or 270 degrees.
     * @param {Scene} scene
     * @param {number} angle
     * @param {object} [options]    See {@link transformScene}.
     */
    rotateScene: (scene, angle, options) => transformScene(scene, planRotation(scene, angle), options),
    /**
     * Mirror a scene left to right ("x") or top to bottom ("y").
     * @param {Scene} scene
     * @param {"x"|"y"} axis
     * @param {object} [options]    See {@link transformScene}.
     */
    mirrorScene: (scene, axis, options) => transformScene(scene, planMirror(scene, axis), options),
    /**
     * Add empty space around a scene, in grid spaces.
     * @param {Scene} scene
     * @param {{top?: number, right?: number, bottom?: number, left?: number}} padding
     * @param {object} [options]    See {@link transformScene}.
     */
    padScene: (scene, padding, options) => transformScene(scene, planPadding(scene, padding), options),
    /**
     * Remove space from the sides of a scene, in grid spaces.
     * @param {Scene} scene
     * @param {{top?: number, right?: number, bottom?: number, left?: number}} crop
     * @param {object} [options]    See {@link transformScene}, plus `removeOutside` and `cropImages` of
     *                              {@link planResize}.
     */
    cropScene: (scene, crop, { removeOutside, cropImages, ...options } = {}) => transformScene(scene,
      planCrop(scene, crop, { removeOutside, cropImages }), options),
    /**
     * Change the size of a grid space in pixels, scaling everything on the scene along.
     * @param {Scene} scene
     * @param {number} size         The new grid size in pixels.
     * @param {object} [options]    See {@link transformScene}.
     */
    resizeGrid: (scene, size, options) => transformScene(scene, planGridSize(scene, size), options),
    /**
     * Attach a copy of another scene to one side of a scene.
     * @param {Scene} scene
     * @param {Scene} other
     * @param {object} [placement]  `side`, `align`, `gap`, `offset` and `tokens`, see {@link planStitch}.
     * @param {object} [options]    See {@link transformScene}.
     */
    stitchScenes: (scene, other, placement, options) => transformScene(scene, planStitch(scene, other, placement),
      options),
  };
});
