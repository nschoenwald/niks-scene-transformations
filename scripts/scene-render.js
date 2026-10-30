import { MODULE_ID } from './config.js';

/**
 * A small picture of a scene's map for the Transform tab's preview: the Level background, tiles and the Level
 * foreground of the Level the scene opens on, drawn the way the canvas draws them (anchor, fit, scale, rotation).
 * Tokens and walls are left out, so the picture shows the map itself.
 */

/** Largest size of a rendered picture in CSS pixels; device pixel ratio is applied on top. */
const MAX_SIZE = { width: 500, height: 220 };

/** Largest canvas side in device pixels. */
const MAX_CANVAS = 2048;

/** Draw order of images at the same elevation. */
const LAYER = { background: 0, tile: 1, foreground: 2 };

/**
 * Render a scene's map into a canvas of the scene rectangle's proportions.
 * @param {Scene} scene
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderScene(scene) {
  const rect = scene.dimensions.sceneRect;
  const ratio = globalThis.devicePixelRatio || 1;
  let s = Math.min(MAX_SIZE.width / rect.width, MAX_SIZE.height / rect.height) * ratio;
  s = Math.min(s, MAX_CANVAS / rect.width, MAX_CANVAS / rect.height);
  const width = Math.max(1, Math.round(rect.width * s));
  const height = Math.max(1, Math.round(rect.height * s));
  const level = (scene.isView && (canvas.level?.parent === scene)) ? canvas.level : scene.initialLevel;

  const map = createCanvas(width, height, 'nst-preview-render');
  const ctx = map.getContext('2d');
  const color = level?.background?.color ?? scene.backgroundColor;
  ctx.fillStyle = color?.css ?? (color ? String(color) : '#999999');
  ctx.fillRect(0, 0, width, height);
  ctx.setTransform(s, 0, 0, s, -rect.x * s, -rect.y * s);
  for ( const item of await loadItems(scene, level, rect) ) drawItem(ctx, item);
  return map;
}

/**
 * Show a scene's picture in a preview map element, replacing an earlier one. Pictures are rendered once per scene
 * and change, then reused.
 * @param {HTMLElement} element
 * @param {Scene} scene
 */
export function attachRender(element, scene) {
  const key = `${scene.uuid}:${scene._stats?.modifiedTime ?? ''}`;
  if ( element.dataset.nstRender === key ) return;
  element.dataset.nstRender = key;
  for ( const old of element.querySelectorAll('.nst-preview-render') ) old.remove();
  element.classList.remove('rendered');
  renderScene(scene).then(map => {
    if ( element.dataset.nstRender !== key ) return; // Another scene was chosen meanwhile
    element.prepend(map);
    element.classList.add('rendered');
  }).catch(err => console.warn(`${MODULE_ID} | Could not render a preview of scene "${scene.name}".`, err));
}

/**
 * @param {number} width
 * @param {number} height
 * @param {string} className
 * @returns {HTMLCanvasElement}
 */
function createCanvas(width, height, className) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  element.className = className;
  return element;
}

/**
 * Everything to draw, with loaded images, in draw order.
 * @param {Scene} scene
 * @param {Level|null} level
 * @param {PIXI.Rectangle} rect
 * @returns {Promise<object[]>}
 */
async function loadItems(scene, level, rect) {
  const items = [];
  const onLevel = levels => !level || !levels?.size || levels.has(level.id);

  if ( level ) {
    const t = level.textures ?? {};
    const elevation = level.elevation ?? {};
    for ( const layer of ['background', 'foreground'] ) {
      const src = level[layer]?.src;
      if ( !src ) continue;
      items.push({
        src, layer: LAYER[layer], elevation: (layer === 'background' ? elevation.bottom : elevation.top) ?? 0, sort: 0,
        x: rect.x + (rect.width / 2) + (t.offsetX ?? 0), y: rect.y + (rect.height / 2) + (t.offsetY ?? 0),
        width: rect.width, height: rect.height, rotation: t.rotation, alpha: 1,
        texture: { anchorX: t.anchorX, anchorY: t.anchorY, fit: t.fit, scaleX: t.scaleX, scaleY: t.scaleY },
      });
    }
  }

  for ( const tile of scene.tiles ) {
    if ( !tile.texture?.src || !onLevel(tile.levels) ) continue;
    items.push({
      src: tile.texture.src, layer: LAYER.tile, elevation: tile.elevation ?? 0, sort: tile.sort ?? 0,
      x: tile.x, y: tile.y, width: tile.width, height: tile.height, rotation: tile.rotation,
      alpha: (tile.hidden ? 0.5 : 1) * (tile.alpha ?? 1), texture: tile.texture,
    });
  }

  items.sort((a, b) => (a.elevation - b.elevation) || (a.layer - b.layer) || (a.sort - b.sort));
  await Promise.all(items.map(async item => {
    try {
      const texture = await foundry.canvas.loadTexture(item.src);
      item.image = texture?.baseTexture?.resource?.source ?? null;
      item.textureSize = texture ? { width: texture.width, height: texture.height } : null;
    } catch {
      item.image = null;
    }
  }));
  return items.filter(item => item.image && item.textureSize?.width && item.textureSize?.height);
}

/**
 * Draw an image like a PrimarySpriteMesh: anchored at (x, y), sized to the base size by the fit mode, then scaled
 * and rotated.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} item
 */
function drawItem(ctx, item) {
  const { width: tw, height: th } = item.textureSize;
  const t = item.texture ?? {};
  let sx;
  let sy;
  switch ( t.fit ) {
    case 'cover': sx = sy = Math.max(item.width / tw, item.height / th); break;
    case 'contain': sx = sy = Math.min(item.width / tw, item.height / th); break;
    case 'width': sx = sy = item.width / tw; break;
    case 'height': sx = sy = item.height / th; break;
    default:
      sx = item.width / tw;
      sy = item.height / th;
  }
  sx *= t.scaleX ?? 1;
  sy *= t.scaleY ?? 1;
  ctx.save();
  ctx.globalAlpha = item.alpha ?? 1;
  ctx.translate(item.x, item.y);
  ctx.rotate(Math.toRadians(item.rotation ?? 0));
  ctx.scale(sx, sy);
  try {
    ctx.drawImage(item.image, -(t.anchorX ?? 0.5) * tw, -(t.anchorY ?? 0.5) * th, tw, th);
  } catch {
    // A video without a frame yet, or an image that can't be drawn
  }
  ctx.restore();
}
