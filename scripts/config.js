export const MODULE_ID = 'niks-scene-transformations';

/** Id of the tab and template part added to Scene Configuration. */
export const TAB_ID = 'niksTransform';

/**
 * Localize a key of this module.
 * @param {string} key    The key without the module prefix.
 * @returns {string}
 */
export function loc(key) {
  return game.i18n.localize(`${MODULE_ID}.${key}`);
}
