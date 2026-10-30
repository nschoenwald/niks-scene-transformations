import { MODULE_ID, loc } from './config.js';

/**
 * Cutting background and foreground images down when space is removed from a scene.
 *
 * Foundry draws tiles in the scene padding too, so an image that reaches past the new scene edge would still show
 * there. The part inside the scene is saved as a new image, and the tile is shrunk to it.
 *
 * Levels with a fog overlay keep their images as Level textures; their background, foreground and overlay are cut
 * together, so the overlay keeps matching the background.
 *
 * Where the image goes: the folder of the "imageFolder" setting (an S3 URL picks that bucket), otherwise the same S3
 * bucket as the original image, otherwise `worlds/<world>/niks-scene-transformations`. Module and system folders are
 * never used, because updating the package would delete the files.
 */

/** Folders that belong to installed packages and are replaced when they update. */
const PACKAGE_FOLDER = /^(modules|systems)\//;

/**
 * Cut the images of new tiles converted from Level textures to the scene rectangle. Tiles are changed in place.
 * Videos, rotated or scaled images and images that can't be read or saved are left whole, with a warning.
 * @param {Scene} scene                    The scene, which names the new files.
 * @param {object[]} tiles                  Tile data of the Scene update; only new tiles (without _id) are cut.
 * @param {{x: number, y: number, width: number, height: number}} rect    The new scene rectangle.
 * @param {string[]} warnings               Warnings for the user are added here.
 */
export async function cropLevelImages(scene, tiles, rect, warnings) {
  const stamp = timestamp(new Date());
  for ( const tile of tiles ) {
    if ( tile._id || !tile.flags?.[MODULE_ID]?.layer ) continue;
    const frame = tileFrame(tile);
    const overlap = intersection(frame, rect);
    if ( !overlap || ((overlap.width === frame.width) && (overlap.height === frame.height)) ) continue;
    try {
      if ( !canCrop(tile) ) throw new Error('unsupported');
      await cropTile(tile, frame, overlap, {
        target: uploadTarget(tile.texture.src, warnings),
        name: `${slug(scene.name, 'scene')}-${slug(tile.name, 'image')}-${stamp}.webp`,
      });
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
 * @typedef UploadTarget
 * @property {"data"|"s3"} source
 * @property {string} path          Folder within the source.
 * @property {string} [bucket]      S3 bucket.
 */

/**
 * Where to save a cut image.
 * @param {string} src              The original image.
 * @param {string[]} warnings       A warning is added if the folder setting can't be used.
 * @returns {UploadTarget}
 */
export function uploadTarget(src, warnings = []) {
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  const fallback = { source: 'data', path: `worlds/${game.world.id}/${MODULE_ID}` };
  const folder = String(game.settings.get(MODULE_ID, 'imageFolder') ?? '').trim().replace(/\/+$/, '');
  if ( folder ) {
    const s3 = FilePicker.matchS3URL(folder);
    if ( s3 ) return { source: 's3', bucket: s3.groups.bucket, path: s3.groups.key.replace(/\/+$/, '') };
    if ( !PACKAGE_FOLDER.test(folder) ) return { source: 'data', path: folder };
    const warning = game.i18n.format(`${MODULE_ID}.Warning.PackageFolder`, { folder });
    if ( !warnings.includes(warning) ) warnings.push(warning);
    return fallback;
  }
  const s3 = FilePicker.matchS3URL(src);
  if ( s3 ) return { source: 's3', bucket: s3.groups.bucket, path: MODULE_ID };
  return fallback;
}

/**
 * A file name part from a name, or the fallback if nothing is left of it.
 * @param {string} name
 * @param {string} fallback
 * @returns {string}
 */
function slug(name, fallback) {
  return String(name ?? '').slugify({ strict: true }) || fallback;
}

/**
 * A local date and time for file names, such as 2026-10-30-232315.
 * @param {Date} date
 * @returns {string}
 */
function timestamp(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-`
    + `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * Save the part of the tile's image inside the overlap as a new file and shrink the tile to it.
 * @param {object} tile
 * @param {{x: number, y: number, width: number, height: number}} frame
 * @param {{x: number, y: number, width: number, height: number}} overlap
 * @param {object} file
 * @param {UploadTarget} file.target
 * @param {string} file.name
 */
async function cropTile(tile, frame, overlap, { target, name }) {
  const path = await cutImage(tile.texture.src, frame, overlap, { target, name });
  const ax = tile.texture.anchorX ?? 0.5;
  const ay = tile.texture.anchorY ?? 0.5;
  tile.texture = { ...tile.texture, src: path };
  Object.assign(tile, {
    width: Math.round(overlap.width),
    height: Math.round(overlap.height),
    x: Math.round(overlap.x + (ax * overlap.width)),
    y: Math.round(overlap.y + (ay * overlap.height)),
  });
}

/**
 * Save the part of an image shown in `overlap` as a new file. The image fills `frame` on the canvas; the cut keeps
 * the image's own resolution, so images of the same size (a background and its fog overlay) stay the same size.
 * @param {string} src
 * @param {{x: number, y: number, width: number, height: number}} frame
 * @param {{x: number, y: number, width: number, height: number}} overlap
 * @param {object} file
 * @param {UploadTarget} file.target
 * @param {string} file.name
 * @returns {Promise<string>}   The path of the new file.
 */
async function cutImage(src, frame, overlap, { target, name }) {
  const response = await fetch(src);
  if ( !response.ok ) throw new Error(`HTTP ${response.status}`);
  const image = await createImageBitmap(await response.blob());

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

  const file = new File([blob], name, { type: 'image/webp' });
  await ensureFolder(target);
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  const body = target.bucket ? { bucket: target.bucket } : {};
  const result = await FilePicker.upload(target.source, target.path, file, body, { notify: false });
  if ( !result?.path ) throw new Error(loc('Error.Upload'));
  return result.path;
}

/**
 * Cut the images of Levels kept as Level textures (because of a fog overlay) to the scene rectangle: background,
 * foreground and fog overlay together, so the overlay keeps matching the background. The Level updates are changed in
 * place to use the new files, filling the part of the scene they cover. If any image of a Level can't be cut, that
 * Level is left whole, with a warning.
 * @param {Scene} scene
 * @param {object[]} levelUpdates           Level data of the Scene update.
 * @param {KeptLevel[]} kept
 * @param {{x: number, y: number, width: number, height: number}} rect    The new scene rectangle.
 * @param {string[]} warnings
 */
export async function cropKeptLevels(scene, levelUpdates, kept, rect, warnings) {
  const stamp = timestamp(new Date());
  for ( const level of kept ) {
    const frame = {
      x: level.x - (level.anchorX * level.width), y: level.y - (level.anchorY * level.height),
      width: level.width, height: level.height,
    };
    const overlap = intersection(frame, rect);
    if ( !overlap || ((overlap.width === frame.width) && (overlap.height === frame.height)) ) continue;
    const layers = Object.entries(level.layers).filter(([, src]) => src);
    try {
      if ( level.flipped || Math.normalizeDegrees(level.rotation ?? 0) ) throw new Error('unsupported');
      if ( layers.some(([, src]) => isVideo(src)) ) throw new Error('unsupported');
      const paths = {};
      for ( const [layer, src] of layers ) {
        paths[layer] = await cutImage(src, frame, overlap, {
          target: uploadTarget(src, warnings),
          name: `${slug(scene.name, 'scene')}-${slug(level.name, 'level')}-${layer}-${stamp}.webp`,
        });
      }
      // The cut images fill exactly the overlap: center them on it, scaled from the scene rectangle's size
      const data = levelUpdates.find(l => l._id === level.level);
      if ( !data ) continue;
      for ( const [layer, path] of Object.entries(paths) ) data[`${layer}.src`] = path;
      Object.assign(data.textures, {
        anchorX: 0.5, anchorY: 0.5,
        offsetX: (overlap.x + (overlap.width / 2)) - (rect.x + (rect.width / 2)),
        offsetY: (overlap.y + (overlap.height / 2)) - (rect.y + (rect.height / 2)),
        scaleX: overlap.width / rect.width,
        scaleY: overlap.height / rect.height,
      });
    } catch(err) {
      console.warn(`${MODULE_ID} | Could not cut the images of level "${level.name}".`, err);
      warnings.push(game.i18n.format(`${MODULE_ID}.Warning.CropFailed`, { name: level.name }));
    }
  }
}

/**
 * Is the file a video?
 * @param {string} src
 * @returns {boolean}
 */
function isVideo(src) {
  return src.split('?')[0].split('.').pop().toLowerCase() in CONST.VIDEO_FILE_EXTENSIONS;
}

/**
 * Create the folder for cut images, and any missing parent folders.
 * @param {UploadTarget} target
 */
async function ensureFolder({ source, path, bucket }) {
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  const options = bucket ? { bucket } : {};
  try {
    await FilePicker.browse(source, path, options);
    return;
  } catch {
    // Missing: create it below
  }
  let current = '';
  for ( const part of path.split('/').filter(Boolean) ) {
    current = current ? `${current}/${part}` : part;
    try {
      await FilePicker.browse(source, current, options);
    } catch {
      await FilePicker.createDirectory(source, current, options);
    }
  }
}
