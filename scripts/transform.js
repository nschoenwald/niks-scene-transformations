import { MODULE_ID, loc } from './config.js';

/**
 * Scene transformations.
 *
 * Each transformation is described by a plan: the new scene size and grid shift, and a function that maps a point of
 * the old canvas to the new canvas. The plan is then applied to every placeable in a single Scene update, the same
 * way Foundry's own "reposition objects on resize" works, so the canvas redraws once and no token movement workflow
 * (animation, wall collision, region events) runs.
 */

/** Rotation angles supported by {@link planRotation}, clockwise in degrees. */
export const ROTATIONS = [90, 180, 270];

/** Error with a message meant for the user. */
export class TransformError extends Error {}

/**
 * Can this scene be rotated? Hexagonal grids change orientation on a quarter turn, which isn't supported.
 * @param {Scene} scene
 * @returns {boolean}
 */
export function canRotate(scene) {
  return !scene.grid.isHexagonal;
}

/**
 * Size of one grid space in pixels along each axis, used to turn "grid spaces" of padding into pixels.
 * On hexagonal grids the rows (or columns) overlap by a quarter.
 * @param {BaseGrid} grid
 * @returns {{x: number, y: number}}
 */
export function gridStep(grid) {
  let x = grid.sizeX;
  let y = grid.sizeY;
  if ( grid.isHexagonal ) {
    if ( grid.columns ) x *= 0.75;
    else y *= 0.75;
  }
  return { x, y };
}

/* -------------------------------------------- */
/*  Plans                                       */
/* -------------------------------------------- */

/**
 * @typedef TransformPlan
 * @property {"rotate"|"pad"} type
 * @property {number} angle                         Clockwise rotation in degrees (0 for padding).
 * @property {{width: number, height: number, shiftX?: number, shiftY?: number}} changes   Scene field changes.
 * @property {(x: number, y: number) => {x: number, y: number}} mapPoint    Maps an old canvas point to the new canvas.
 * @property {boolean} convertLevelTextures         Turn Level background and foreground images into tiles.
 * @property {boolean} snapTokens                   Re-snap tokens that were snapped to the grid before.
 */

/**
 * Plan a clockwise rotation of the scene by 90, 180 or 270 degrees.
 * @param {Scene} scene
 * @param {number} angle
 * @returns {TransformPlan}
 */
export function planRotation(scene, angle) {
  angle = Math.normalizeDegrees(angle);
  if ( !ROTATIONS.includes(angle) ) throw new TransformError(loc('Error.InvalidAngle'));
  if ( !canRotate(scene) ) throw new TransformError(loc('Error.HexRotation'));

  const { width: W, height: H, shiftX, shiftY } = scene._source;
  const quarter = angle !== 180;
  const size = scene.grid.size;

  // Grid lines sit at local scene coordinates u ≡ shiftX and v ≡ shiftY (mod grid size). Rotate that phase along with
  // the scene so the grid still runs through the same spots of the map, and placeables stay aligned to it.
  let phase;
  if ( angle === 90 ) phase = [H - shiftY, shiftX];
  else if ( angle === 180 ) phase = [W - shiftX, H - shiftY];
  else phase = [shiftY, W - shiftX];
  const changes = {
    width: quarter ? H : W,
    height: quarter ? W : H,
    shiftX: normalizePhase(phase[0], size),
    shiftY: normalizePhase(phase[1], size),
  };

  const from = scene.dimensions.sceneRect;
  const to = computeSceneRect(scene, changes);
  const mapPoint = (x, y) => {
    const u = x - from.x;
    const v = y - from.y;
    let p;
    if ( angle === 90 ) p = [H - v, u];
    else if ( angle === 180 ) p = [W - u, H - v];
    else p = [v, W - u];
    return { x: to.x + p[0], y: to.y + p[1] };
  };

  return { type: 'rotate', angle, changes, mapPoint, convertLevelTextures: quarter, snapTokens: false };
}

/**
 * Plan adding empty space around the scene. Amounts are in grid spaces.
 * @param {Scene} scene
 * @param {{top?: number, right?: number, bottom?: number, left?: number}} padding
 * @returns {TransformPlan}
 */
export function planPadding(scene, { top = 0, right = 0, bottom = 0, left = 0 } = {}) {
  const amounts = [top, right, bottom, left];
  if ( amounts.some(n => !Number.isInteger(n) || (n < 0)) ) throw new TransformError(loc('Error.InvalidPadding'));
  if ( amounts.every(n => n === 0) ) throw new TransformError(loc('Error.NoPadding'));

  const grid = scene.grid;
  const step = gridStep(grid);
  const px = { top: Math.round(top * step.y), right: Math.round(right * step.x),
    bottom: Math.round(bottom * step.y), left: Math.round(left * step.x) };
  const changes = {
    width: scene._source.width + px.left + px.right,
    height: scene._source.height + px.top + px.bottom,
  };

  const from = scene.dimensions.sceneRect;
  const to = computeSceneRect(scene, changes);
  let dx = to.x + px.left - from.x;
  let dy = to.y + px.top - from.y;

  // On hex grids, round the offset to the distance between two hex centers so the map stays aligned to the grid.
  // Square offsets are whole grid spaces already, because the scene origin is always snapped to the grid size.
  if ( grid.isHexagonal ) {
    const ref = grid.getCenterPoint(grid.getOffset(from.center));
    const target = grid.getCenterPoint(grid.getOffset({ x: ref.x + dx, y: ref.y + dy }));
    dx = Math.round(target.x - ref.x);
    dy = Math.round(target.y - ref.y);
  }

  return {
    type: 'pad',
    angle: 0,
    changes,
    mapPoint: (x, y) => ({ x: x + dx, y: y + dy }),
    convertLevelTextures: true,
    snapTokens: grid.isHexagonal,
  };
}

/* -------------------------------------------- */
/*  Applying a plan                             */
/* -------------------------------------------- */

/**
 * Build the Scene update for a plan, including all embedded documents.
 * @param {Scene} scene
 * @param {TransformPlan} plan
 * @returns {{update: object, warnings: string[]}}
 */
export function buildSceneUpdate(scene, plan) {
  const { mapPoint, angle } = plan;
  const grid = scene.grid;
  const warnings = [];
  const rotate = r => Math.normalizeDegrees((r ?? 0) + angle);
  const mapRounded = (x, y) => {
    const p = mapPoint(x, y);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  };

  const update = foundry.utils.deepClone(plan.changes);

  // Initial view position
  const initial = scene._source.initial;
  if ( Number.isFinite(initial.x) && Number.isFinite(initial.y) ) {
    update.initial = { ...initial, ...mapRounded(initial.x, initial.y) };
  }

  // Tokens: keep the footprint on the same grid spaces and turn the art with the map
  update.tokens = scene.tokens.map(token => {
    const src = token._source;
    let { x, y, width, height } = mapFootprint(src, plan, grid.size);
    if ( plan.snapTokens && isSnapped(token) ) ({ x, y } = token.getSnappedPosition({ x, y, width, height }));
    return {
      _id: token.id, x, y, width, height,
      rotation: src.lockRotation ? src.rotation : rotate(src.rotation),
      _movementHistory: null,
    };
  });

  // Tiles rotate around their anchor point at (x, y)
  const mapTile = (src, extra = {}) => ({ ...extra, ...mapRounded(src.x, src.y), rotation: rotate(src.rotation) });
  update.tiles = scene.tiles.map(tile => mapTile(tile._source, { _id: tile.id }));

  // Level background and foreground images
  if ( plan.convertLevelTextures ) {
    const { tiles, levels } = levelTexturesToTiles(scene);
    for ( const tile of tiles ) update.tiles.push(mapTile(tile, tile));
    if ( levels.length ) update.levels = levels;
  } else if ( angle ) {
    // Half turn: the image keeps its size, so a rotated Level texture works and stays a background
    update.levels = scene.levels.map(level => {
      const t = level._source.textures;
      return { _id: level.id, textures: { rotation: rotate(t.rotation), offsetX: -t.offsetX, offsetY: -t.offsetY } };
    });
  }
  if ( scene.levels.some(l => l._source.fog?.src) ) warnings.push(loc('Warning.FogOverlay'));

  // Drawings rotate around the center of their shape
  update.drawings = scene.drawings.map(drawing => {
    const src = drawing._source;
    const w = src.shape.width ?? 0;
    const h = src.shape.height ?? 0;
    const c = mapPoint(src.x + (w / 2), src.y + (h / 2));
    return { _id: drawing.id, x: c.x - (w / 2), y: c.y - (h / 2), rotation: rotate(src.rotation) };
  });

  update.lights = scene.lights.map(light => ({
    _id: light.id, ...mapRounded(light._source.x, light._source.y), rotation: rotate(light._source.rotation),
  }));
  update.sounds = scene.sounds.map(sound => ({ _id: sound.id, ...mapRounded(sound._source.x, sound._source.y) }));
  update.notes = scene.notes.map(note => ({ _id: note.id, ...mapRounded(note._source.x, note._source.y) }));

  // Walls keep their endpoint order, so the left/right direction of one-way walls is preserved by a rotation
  update.walls = scene.walls.map(wall => {
    const [x0, y0, x1, y1] = wall._source.c;
    const a = mapRounded(x0, y0);
    const b = mapRounded(x1, y1);
    return { _id: wall.id, c: [a.x, a.y, b.x, b.y] };
  });

  update.regions = scene.regions.map(region => {
    const shapes = region._source.shapes.map(shape => {
      try {
        return mapShape(shape, plan, grid);
      } catch(err) {
        if ( !(err instanceof TransformError) ) throw err;
        warnings.push(err.message);
        return shape;
      }
    });
    return { _id: region.id, shapes, _shapeConstraints: null };
  });

  return { update, warnings };
}

/**
 * Transform a scene according to a plan.
 * @param {Scene} scene
 * @param {TransformPlan} plan
 * @param {object} [options]
 * @param {boolean} [options.backup=false]      Save a copy of the untransformed scene first.
 * @param {boolean} [options.resetFog=true]     Reset fog exploration, which no longer matches the map.
 * @param {boolean} [options.thumbnail=true]    Regenerate the scene thumbnail.
 * @returns {Promise<{scene: Scene, backup: Scene|null, warnings: string[]}>}
 */
export async function transformScene(scene, plan, { backup = false, resetFog = true, thumbnail = true } = {}) {
  if ( !game.user.isGM ) throw new TransformError(loc('Error.NotGM'));
  const { update, warnings } = buildSceneUpdate(scene, plan);

  let copy = null;
  if ( backup ) {
    copy = await scene.clone({
      name: game.i18n.format(`${MODULE_ID}.Backup.Name`, { name: scene.name }),
      active: false,
      navigation: false,
    }, { save: true });
  }

  await scene.update(update, { [MODULE_ID]: { type: plan.type, angle: plan.angle } });

  if ( resetFog ) game.socket.emit('resetFog', scene.id);

  if ( thumbnail ) {
    try {
      const { thumb } = await scene.createThumbnail() ?? {};
      if ( thumb ) await scene.update({ thumb }, { diff: false });
    } catch(err) {
      console.warn(`${MODULE_ID} | Could not regenerate the thumbnail of scene "${scene.name}".`, err);
    }
  }

  return { scene, backup: copy, warnings };
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * Normalize a grid phase to the range (-size/2, size/2].
 * @param {number} phase
 * @param {number} size
 * @returns {number}
 */
function normalizePhase(phase, size) {
  let n = ((phase % size) + size) % size;
  if ( n > (size / 2) ) n -= size;
  return n;
}

/**
 * The scene rectangle the scene would have with the given changes.
 * @param {Scene} scene
 * @param {object} changes
 * @returns {PIXI.Rectangle}
 */
function computeSceneRect(scene, changes) {
  return scene.clone(changes).dimensions.sceneRect;
}

/**
 * Map a footprint given by its top-left corner and its size in grid spaces (tokens and token shapes).
 * The center is mapped, and width and height swap on a quarter turn.
 * @param {{x: number, y: number, width: number, height: number}} data
 * @param {TransformPlan} plan
 * @param {number} size     The grid size in pixels.
 * @returns {{x: number, y: number, width: number, height: number}}
 */
function mapFootprint({ x, y, width, height }, plan, size) {
  const c = plan.mapPoint(x + (width * size / 2), y + (height * size / 2));
  if ( plan.angle % 180 ) [width, height] = [height, width];
  return {
    x: Math.round(c.x - (width * size / 2)),
    y: Math.round(c.y - (height * size / 2)),
    width,
    height,
  };
}

/**
 * Is the token at its snapped grid position?
 * @param {TokenDocument} token
 * @returns {boolean}
 */
function isSnapped(token) {
  const { x, y } = token._source;
  const snapped = token.getSnappedPosition({ x, y });
  return (Math.round(snapped.x) === x) && (Math.round(snapped.y) === y);
}

/**
 * Map a Region shape. Shapes rotate around their origin; circles and rings have no rotation.
 * @param {object} shape        The shape source data.
 * @param {TransformPlan} plan
 * @param {BaseGrid} grid
 * @returns {object}            The mapped shape source data.
 */
function mapShape(shape, plan, grid) {
  const { mapPoint, angle } = plan;
  const s = foundry.utils.deepClone(shape);
  switch ( s.type ) {
    case 'rectangle':
    case 'ellipse':
    case 'cone':
    case 'line':
      Object.assign(s, mapPoint(s.x, s.y));
      s.rotation = Math.normalizeDegrees((s.rotation ?? 0) + angle);
      break;
    case 'circle':
    case 'ring':
      Object.assign(s, mapPoint(s.x, s.y));
      break;
    case 'emanation':
      s.base = mapShape(s.base, plan, grid);
      break;
    case 'polygon':
      for ( let i = 0; i < s.points.length; i += 2 ) {
        const p = mapPoint(s.points[i], s.points[i + 1]);
        s.points[i] = p.x;
        s.points[i + 1] = p.y;
      }
      if ( s.origin ) s.origin = mapPoint(s.origin.x, s.origin.y);
      break;
    case 'token':
      Object.assign(s, mapFootprint(s, plan, grid.size));
      break;
    case 'grid':
      // Map the center of every grid space; the plans keep grid spaces aligned, so centers land on centers
      s.offsets = s.offsets.map(offset => {
        if ( typeof offset === 'string' ) {
          const [i, j] = offset.split('.').map(Number);
          offset = { i, j };
        }
        const c = grid.getCenterPoint(offset);
        const { i, j } = grid.getOffset(mapPoint(c.x, c.y));
        return { i, j };
      });
      if ( s.origin ) s.origin = mapPoint(s.origin.x, s.origin.y);
      break;
    default:
      throw new TransformError(game.i18n.format(`${MODULE_ID}.Warning.UnknownShape`, { type: s.type }));
  }
  return s;
}

/**
 * Turn the background and foreground images of all Levels into tiles that look the same, so the image stays put
 * while the scene changes size or turns. Tiles are returned in the current canvas coordinates.
 * A Level texture is drawn like a tile with the scene rectangle's size, anchored at the rectangle's center plus the
 * texture offset, so the conversion copies anchor, fit, scale and rotation as they are.
 * @param {Scene} scene
 * @returns {{tiles: object[], levels: object[]}}   Tile creation data and Level updates that clear the images.
 */
function levelTexturesToTiles(scene) {
  const rect = scene.dimensions.sceneRect;
  const sorts = scene.tiles.map(t => t._source.sort);
  let minSort = Math.min(0, ...sorts);
  let maxSort = Math.max(0, ...sorts);
  const tiles = [];
  const levels = [];

  for ( const level of scene.levels ) {
    const src = level._source;
    const layers = ['background', 'foreground'].filter(k => src[k]?.src);
    if ( !layers.length ) continue;
    const t = src.textures;
    const bottom = src.elevation.bottom ?? 0;
    const top = src.elevation.top ?? bottom;
    const visibleIn = Array.from(new Set([level.id, ...(src.visibility?.levels ?? [])]));

    for ( const layer of layers ) {
      const isBackground = layer === 'background';
      tiles.push({
        name: game.i18n.format(`${MODULE_ID}.Tile.${layer}`, { level: src.name }),
        texture: {
          src: src[layer].src,
          anchorX: t.anchorX,
          anchorY: t.anchorY,
          fit: t.fit,
          scaleX: t.scaleX,
          scaleY: t.scaleY,
          tint: src[layer].tint,
          alphaThreshold: src[layer].alphaThreshold,
        },
        x: rect.x + (rect.width / 2) + t.offsetX,
        y: rect.y + (rect.height / 2) + t.offsetY,
        width: rect.width,
        height: rect.height,
        rotation: t.rotation,
        elevation: isBackground ? bottom : top,
        levels: visibleIn,
        sort: isBackground ? --minSort : ++maxSort,
        locked: true,
        restrictions: { light: isBackground, weather: isBackground },
        occlusion: { modes: isBackground ? [] : [CONST.OCCLUSION_MODES.SURFACE] },
        video: { autoplay: true, loop: true, volume: 0 },
        flags: { [MODULE_ID]: { level: level.id, layer } },
      });
    }
    levels.push({ _id: level.id, ...Object.fromEntries(layers.map(k => [`${k}.src`, null])) });
  }
  return { tiles, levels };
}
