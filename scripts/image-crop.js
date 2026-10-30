import { MODULE_ID, loc } from './config.js';

/**
 * Cutting background and foreground images down when space is removed from a scene.
 *
 * Foundry draws tiles in the scene padding too, so an image that reaches past the new scene edge would still show
 * there. The part inside the scene is saved as a new image in the world folder, and the tile is shrunk to it.
 */

/**
 * Cut the images of new tiles converted from Level textures to the scene rectangle. Tiles are changed in place.
 * Videos, rotated or scaled images and images that can't be read or saved are left whole, with a warning.
 * @param {object[]} tiles                  Tile data of the Scene update; only new tiles (without _id) are cut.
 * @param {{x: number, y: number, width: number, height: number}} rect    The new scene rectangle.
 * @param {string[]} warnings               Warnings for the user are added here.
 */
export async function cropLevelImages(tiles, rect, warnings) {
  for ( const tile of tiles ) {
    if ( tile._id || !tile.flags?.[MODULE_ID]?.layer ) continue;
    const frame = tileFrame(tile);
    const overlap = intersection(frame, rect);
    if ( !overlap || ((overlap.width === frame.width) && (overlap.height === frame.height)) ) continue;
    try {
      if ( !canCrop(tile) ) throw new Error('unsupported');
      await cropTile(tile, frame, overlap);
    } catch(err) {
      console.warn(`${MODULE_ID} | Could not cut the image "${tile.texture.src}".`, err);
      warnings.push(game.i18n.format(`${MODULE_ID}.Warning.CropFailed`, { name: tile.name }));
    }
  }
}

/**
 * Only plain images that fill their frame unrotated can be cut by their frame.
 * @param {object} tile
 * @returns {boolean}
 */
function canCrop(tile) {
  const { src, fit, scaleX, scaleY } = tile.texture;
  const ext = src.split('?')[0].split('.').pop().toLowerCase();
  return !(ext in CONST.VIDEO_FILE_EXTENSIONS) && ((fit ?? 'fill') === 'fill') && ((scaleX ?? 1) === 1)
    && ((scaleY ?? 1) === 1) && !Math.normalizeDegrees(tile.rotation ?? 0);
}

/**
 * The tile's frame on the canvas, ignoring rotation.
 * @param {object} tile
 */
function tileFrame(tile) {
  const ax = tile.texture.anchorX ?? 0.5;
  const ay = tile.texture.anchorY ?? 0.5;
  return { x: tile.x - (ax * tile.width), y: tile.y - (ay * tile.height), width: tile.width, height: tile.height };
}

/**
 * The overlap of two rectangles, or null.
 */
function intersection(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return (width > 0) && (height > 0) ? { x, y, width, height } : null;
}

/**
 * Save the part of the tile's image inside the overlap as a new file and shrink the tile to it.
 * @param {object} tile
 * @param {{x: number, y: number, width: number, height: number}} frame
 * @param {{x: number, y: number, width: number, height: number}} overlap
 */
async function cropTile(tile, frame, overlap) {
  const response = await fetch(tile.texture.src);
  if ( !response.ok ) throw new Error(`HTTP ${response.status}`);
  const image = await createImageBitmap(await response.blob());

  // Keep the image's own resolution
  const sx = image.width / frame.width;
  const sy = image.height / frame.height;
  const left = Math.round((overlap.x - frame.x) * sx);
  const top = Math.round((overlap.y - frame.y) * sy);
  const width = Math.max(1, Math.round(overlap.width * sx));
  const height = Math.max(1, Math.round(overlap.height * sy));
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d').drawImage(image, left, top, width, height, 0, 0, width, height);
  image.close();
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.92 });

  const name = tile.texture.src.split('?')[0].split('/').pop().replace(/\.[^.]+$/, '');
  const file = new File([blob], `${name}-${foundry.utils.randomID(6)}.webp`, { type: 'image/webp' });
  const path = await uploadFolder();
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  const result = await FilePicker.upload('data', path, file, {}, { notify: false });
  if ( !result?.path ) throw new Error(loc('Error.Upload'));

  const ax = tile.texture.anchorX ?? 0.5;
  const ay = tile.texture.anchorY ?? 0.5;
  tile.texture = { ...tile.texture, src: result.path };
  Object.assign(tile, {
    width: Math.round(overlap.width),
    height: Math.round(overlap.height),
    x: Math.round(overlap.x + (ax * overlap.width)),
    y: Math.round(overlap.y + (ay * overlap.height)),
  });
}

/**
 * The folder for cut images, created if needed.
 * @returns {Promise<string>}
 */
async function uploadFolder() {
  const path = `worlds/${game.world.id}/${MODULE_ID}`;
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  try {
    await FilePicker.browse('data', path);
  } catch {
    await FilePicker.createDirectory('data', path);
  }
  return path;
}
