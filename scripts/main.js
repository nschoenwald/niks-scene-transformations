import { MODULE_ID } from './config.js';
import { registerSceneConfigTab } from './scene-config-tab.js';
import {
  ROTATIONS, buildSceneUpdate, canRotate, planGridSize, planPadding, planRotation, transformScene,
} from './transform.js';

Hooks.once('init', () => {
  registerSceneConfigTab();

  // Public API for macros and other modules
  game.modules.get(MODULE_ID).api = {
    ROTATIONS,
    canRotate,
    planRotation,
    planPadding,
    planGridSize,
    buildSceneUpdate,
    transformScene,
    /**
     * Rotate a scene clockwise by 90, 180 or 270 degrees.
     * @param {Scene} scene
     * @param {number} angle
     * @param {object} [options]    See {@link transformScene}.
     */
    rotateScene: (scene, angle, options) => transformScene(scene, planRotation(scene, angle), options),
    /**
     * Add empty space around a scene, in grid spaces.
     * @param {Scene} scene
     * @param {{top?: number, right?: number, bottom?: number, left?: number}} padding
     * @param {object} [options]    See {@link transformScene}.
     */
    padScene: (scene, padding, options) => transformScene(scene, planPadding(scene, padding), options),
    /**
     * Change the size of a grid space in pixels, scaling everything on the scene along.
     * @param {Scene} scene
     * @param {number} size         The new grid size in pixels.
     * @param {object} [options]    See {@link transformScene}.
     */
    resizeGrid: (scene, size, options) => transformScene(scene, planGridSize(scene, size), options),
  };
});
