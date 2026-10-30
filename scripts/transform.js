import { MODULE_ID, loc } from './config.js';
import { cropKeptLevels, cropLevelImages } from './image-crop.js';

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

/** Mirror axes supported by {@link planMirror}: "x" mirrors left to right, "y" top to bottom. */
export const MIRRORS = ['x', 'y'];

/** Sides a scene can be attached to by {@link planStitch}. */
export const SIDES = ['top', 'right', 'bottom', 'left'];

/** Embedded collections holding placeables, by Document name. */
const PLACEABLES = {
  Token: 'tokens', Tile: 'tiles', Drawing: 'drawings', AmbientLight: 'lights', AmbientSound: 'sounds',
  Note: 'notes', Wall: 'walls', Region: 'regions',
};

/** Error with a message meant for the user. */
export class TransformError extends Error {}

/**
 * Can this scene be rotated or mirrored? Hexagonal grids change orientation or stagger, which isn't supported.
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
 * @property {"rotate"|"mirror"|"pad"|"grid"|"stitch"|"extract"} type
 * @property {number} angle                         Clockwise rotation in degrees (0 unless rotating).
 * @property {"x"|"y"|null} mirror                  Mirror axis, if mirroring.
 * @property {number} scale                         Factor by which pixel sizes change (1 unless the grid size does).
 * @property {object} changes                       Scene field changes (width, height, shiftX, shiftY, grid.size).
 * @property {BaseGrid} grid                        The grid after the transformation.
 * @property {PIXI.Rectangle} rect                  The scene rectangle after the transformation.
 * @property {(x: number, y: number) => {x: number, y: number}} mapPoint    Maps an old canvas point to the new canvas.
 * @property {boolean} convertLevelTextures         Turn Level background and foreground images into tiles.
 * @property {boolean} [keepFogLevels=true]         Keep the images of Levels with a fog overlay as Level textures
 *                                                  instead, so the overlay keeps following the background.
 * @property {boolean} snapTokens                   Re-snap tokens that were snapped to the grid before.
 * @property {boolean} [removeOutside]              Delete placeables that end up entirely outside the scene.
 * @property {boolean} [clipWalls]                  Cut walls crossing the scene edge at the edge.
 * @property {boolean} [dropTokens]                 Delete all tokens.
 * @property {boolean} [cropImages]                 Cut images turned into tiles to the new scene rectangle.
 * @property {StitchSource} [source]                The scene attached by a stitch plan.
 */

/**
 * @typedef StitchSource
 * @property {Scene} scene                  The attached scene.
 * @property {TransformPlan} plan           Maps the attached scene's canvas onto the new canvas.
 * @property {PIXI.Rectangle} rect          The attached scene's rectangle on the new canvas.
 * @property {boolean} tokens               Copy its tokens too.
 * @property {number} distanceScale         Factor for ranges given in grid units (lights, sounds, vision).
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

  return {
    type: 'rotate', angle, mirror: null, scale: 1, changes, grid: scene.grid, rect: to, mapPoint,
    convertLevelTextures: quarter, snapTokens: false,
  };
}

/**
 * Plan mirroring the scene left to right ("x") or top to bottom ("y").
 * @param {Scene} scene
 * @param {"x"|"y"} axis
 * @returns {TransformPlan}
 */
export function planMirror(scene, axis) {
  if ( !MIRRORS.includes(axis) ) throw new TransformError(loc('Error.InvalidMirror'));
  if ( !canRotate(scene) ) throw new TransformError(loc('Error.HexRotation'));

  const { width: W, height: H, shiftX, shiftY } = scene._source;
  const size = scene.grid.size;
  const changes = {
    width: W,
    height: H,
    shiftX: axis === 'x' ? normalizePhase(W - shiftX, size) : shiftX,
    shiftY: axis === 'y' ? normalizePhase(H - shiftY, size) : shiftY,
  };

  const from = scene.dimensions.sceneRect;
  const to = computeSceneRect(scene, changes);
  const mapPoint = (x, y) => {
    const u = x - from.x;
    const v = y - from.y;
    return { x: to.x + (axis === 'x' ? W - u : u), y: to.y + (axis === 'y' ? H - v : v) };
  };

  // Level images stay backgrounds: a mirrored Level texture is the same image flipped around its anchor
  return {
    type: 'mirror', angle: 0, mirror: axis, scale: 1, changes, grid: scene.grid, rect: to, mapPoint,
    convertLevelTextures: false, snapTokens: false,
  };
}

/**
 * Plan adding or removing space around the scene. Amounts are whole grid spaces per side: positive adds space,
 * negative removes it.
 * @param {Scene} scene
 * @param {{top?: number, right?: number, bottom?: number, left?: number}} amounts
 * @param {object} [options]
 * @param {boolean} [options.removeOutside=false]   Delete placeables that end up entirely outside the scene.
 * @param {boolean} [options.cropImages=true]       Cut background and foreground images to the new scene.
 * @returns {TransformPlan}
 */
export function planResize(scene, { top = 0, right = 0, bottom = 0, left = 0 } = {},
  { removeOutside = false, cropImages = true } = {}) {
  const amounts = [top, right, bottom, left];
  if ( amounts.some(n => !Number.isInteger(n)) ) throw new TransformError(loc('Error.InvalidPadding'));
  if ( amounts.every(n => n === 0) ) throw new TransformError(loc('Error.NoPadding'));

  const grid = scene.grid;
  const step = gridStep(grid);
  const px = { top: Math.round(top * step.y), right: Math.round(right * step.x),
    bottom: Math.round(bottom * step.y), left: Math.round(left * step.x) };
  const changes = {
    width: scene._source.width + px.left + px.right,
    height: scene._source.height + px.top + px.bottom,
  };
  if ( (changes.width < step.x) || (changes.height < step.y) ) throw new TransformError(loc('Error.TooSmall'));

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

  const crops = amounts.some(n => n < 0);
  return {
    type: 'pad',
    angle: 0,
    mirror: null,
    scale: 1,
    changes,
    grid,
    rect: to,
    mapPoint: (x, y) => ({ x: x + dx, y: y + dy }),
    convertLevelTextures: true,
    snapTokens: grid.isHexagonal,
    removeOutside: crops && removeOutside,
    cropImages: crops && cropImages,
  };
}

/**
 * Plan adding empty space around the scene. Amounts are whole grid spaces of 0 or more.
 * @param {Scene} scene
 * @param {{top?: number, right?: number, bottom?: number, left?: number}} padding
 * @returns {TransformPlan}
 */
export function planPadding(scene, padding = {}) {
  if ( Object.values(padding).some(n => n < 0) ) throw new TransformError(loc('Error.InvalidPadding'));
  return planResize(scene, padding);
}

/**
 * Plan removing space from the sides of the scene. Amounts are whole grid spaces of 0 or more.
 * @param {Scene} scene
 * @param {{top?: number, right?: number, bottom?: number, left?: number}} crop
 * @param {object} [options]    See {@link planResize}.
 * @returns {TransformPlan}
 */
export function planCrop(scene, crop = {}, options) {
  if ( Object.values(crop).some(n => n < 0) ) throw new TransformError(loc('Error.InvalidPadding'));
  return planResize(scene, Object.fromEntries(Object.entries(crop).map(([k, n]) => [k, -n])), options);
}

/**
 * The grid spaces covering a scene, for choosing an area to extract. Columns and rows are counted from the grid space
 * holding the scene's top-left corner, and include grid spaces only partly on the scene.
 * @param {Scene} scene
 * @returns {{size: number, column: number, row: number, columns: number, rows: number, rect: PIXI.Rectangle}}
 *   `column` and `row` are the grid offsets of the first grid space; `rect` is the scene rectangle.
 */
export function extractGrid(scene) {
  const size = scene.grid.size;
  const rect = scene.dimensions.sceneRect;
  const column = Math.floor((rect.x / size) + 1e-6);
  const row = Math.floor((rect.y / size) + 1e-6);
  return {
    size, column, row, rect,
    columns: Math.ceil(((rect.x + rect.width) / size) - 1e-6) - column,
    rows: Math.ceil(((rect.y + rect.height) / size) - 1e-6) - row,
  };
}

/**
 * Can an area of this scene be extracted? Hexagonal grids aren't supported.
 * @param {Scene} scene
 * @returns {boolean}
 */
export function canExtract(scene) {
  return !scene.grid.isHexagonal;
}

/**
 * Plan cutting a scene down to an area of whole grid spaces. Applied to a copy of a scene, this extracts the area:
 * placeables entirely outside are deleted, walls are cut at the new edge and images are cut to the area.
 * @param {Scene} scene
 * @param {{x: number, y: number, width: number, height: number}} area   In grid spaces, see {@link extractGrid}.
 * @param {object} [options]
 * @param {boolean} [options.tokens=true]   Keep tokens in the area.
 * @returns {TransformPlan}
 */
export function planExtract(scene, area, { tokens = true } = {}) {
  if ( !canExtract(scene) ) throw new TransformError(loc('Error.ExtractHex'));
  const g = extractGrid(scene);
  const { x, y, width, height } = area ?? {};
  const valid = [x, y, width, height].every(Number.isInteger) && (x >= 0) && (y >= 0) && (width >= 1)
    && (height >= 1) && (x + width <= g.columns) && (y + height <= g.rows);
  if ( !valid ) throw new TransformError(loc('Error.ExtractArea'));

  // The area starts on a grid line; with no shift, the new scene rectangle does too, so the grid stays on the map
  const selection = { x: (g.column + x) * g.size, y: (g.row + y) * g.size };
  const changes = { width: width * g.size, height: height * g.size, shiftX: 0, shiftY: 0 };
  const to = computeSceneRect(scene, changes);
  const dx = to.x - selection.x;
  const dy = to.y - selection.y;
  return {
    type: 'extract',
    angle: 0,
    mirror: null,
    scale: 1,
    changes,
    grid: scene.grid,
    rect: to,
    mapPoint: (px, py) => ({ x: px + dx, y: py + dy }),
    convertLevelTextures: true,
    snapTokens: false,
    removeOutside: true,
    clipWalls: true,
    cropImages: true,
    dropTokens: !tokens,
  };
}

/**
 * Create a new scene from an area of a scene. The scene itself isn't changed.
 * @param {Scene} scene
 * @param {{x: number, y: number, width: number, height: number}} area   In grid spaces, see {@link extractGrid}.
 * @param {object} [options]
 * @param {string} [options.name]           Name of the new scene.
 * @param {boolean} [options.tokens=true]   Copy tokens in the area.
 * @returns {Promise<{scene: Scene, warnings: string[]}>}
 */
export async function extractScene(scene, area, { name, tokens = true } = {}) {
  if ( !game.user.isGM ) throw new TransformError(loc('Error.NotGM'));
  planExtract(scene, area, { tokens }); // Validate before creating anything

  // Start from a full copy, which keeps all scene settings, then cut it down like removing space
  const data = scene.toObject();
  for ( const key of ['_id', '_stats', 'thumb', 'navOrder', 'sort'] ) delete data[key];
  Object.assign(data, {
    name: name?.trim() || game.i18n.format(`${MODULE_ID}.Extract.DefaultName`, { name: scene.name }),
    active: false,
    navigation: false,
  });
  delete data.flags?.[MODULE_ID]?.backup;
  const copy = await getDocumentClass('Scene').create(data);
  try {
    const { warnings } = await transformScene(copy, planExtract(copy, area, { tokens }),
      { backup: false, resetFog: false });
    return { scene: copy, warnings };
  } catch(err) {
    await copy.delete();
    throw err;
  }
}

/**
 * Plan changing the size of a grid space in pixels. Everything on the scene grows or shrinks with the grid, so the
 * scene keeps its size in grid spaces and each placeable stays on the same grid spaces.
 * @param {Scene} scene
 * @param {number} size     The new grid size in pixels.
 * @returns {TransformPlan}
 */
export function planGridSize(scene, size) {
  if ( !Number.isInteger(size) || (size < CONST.GRID_MIN_SIZE) ) {
    throw new TransformError(game.i18n.format(`${MODULE_ID}.Error.InvalidGridSize`, { min: CONST.GRID_MIN_SIZE }));
  }
  const src = scene._source;
  if ( size === src.grid.size ) throw new TransformError(loc('Error.SameGridSize'));

  const k = size / src.grid.size;
  const changes = {
    width: Math.max(1, Math.round(src.width * k)),
    height: Math.max(1, Math.round(src.height * k)),
    shiftX: Math.round(src.shiftX * k),
    shiftY: Math.round(src.shiftY * k),
    grid: { size },
  };
  const target = previewClone(scene, changes);
  const grid = target.grid;

  // Grid lines sit at multiples of the grid size from the canvas origin, on every grid type, so scaling around the
  // origin maps grid spaces onto grid spaces. The padding usually scales along exactly; if rounding the scene size
  // changed the number of padding spaces, move everything by whole grid spaces to make up for it.
  const from = scene.dimensions;
  const to = target.dimensions;
  let dx = (to.sceneX + changes.shiftX) - (k * (from.sceneX + src.shiftX));
  let dy = (to.sceneY + changes.shiftY) - (k * (from.sceneY + src.shiftY));
  if ( dx || dy ) {
    const ref = grid.getCenterPoint(grid.getOffset({ x: k * from.sceneRect.center.x, y: k * from.sceneRect.center.y }));
    const moved = grid.getCenterPoint(grid.getOffset({ x: ref.x + dx, y: ref.y + dy }));
    dx = moved.x - ref.x;
    dy = moved.y - ref.y;
  }

  return {
    type: 'grid',
    angle: 0,
    mirror: null,
    scale: k,
    changes,
    grid,
    rect: to.sceneRect,
    mapPoint: (x, y) => ({ x: (k * x) + dx, y: (k * y) + dy }),
    convertLevelTextures: false,
    snapTokens: false,
  };
}

/**
 * Plan attaching another scene to one side of this one. The scene grows to fit both, and the other scene's map and
 * placeables are copied in, scaled to this scene's grid size and aligned to its grid. The other scene isn't changed.
 * @param {Scene} scene
 * @param {Scene} other
 * @param {object} [options]
 * @param {"top"|"right"|"bottom"|"left"} [options.side="right"]
 * @param {"start"|"center"|"end"} [options.align="start"]    Alignment along that side.
 * @param {number} [options.gap=0]          Empty grid spaces between the two scenes.
 * @param {number} [options.offset=0]       Grid spaces to move the other scene along the side.
 * @param {boolean} [options.tokens=true]   Copy the other scene's tokens.
 * @returns {TransformPlan}
 */
export function planStitch(scene, other, { side = 'right', align = 'start', gap = 0, offset = 0, tokens = true } = {}) {
  if ( !other || (other === scene) || (other.id === scene.id) ) throw new TransformError(loc('Error.StitchSame'));
  if ( !SIDES.includes(side) ) throw new TransformError(loc('Error.StitchSide'));
  if ( scene.grid.isHexagonal || other.grid.isHexagonal ) throw new TransformError(loc('Error.StitchHex'));
  if ( ![gap, offset].every(Number.isInteger) || (gap < 0) ) throw new TransformError(loc('Error.StitchGap'));

  const size = scene.grid.size;
  const k = size / other.grid.size;
  const R = scene.dimensions.sceneRect;
  const S = other.dimensions.sceneRect;
  const sw = S.width * k;
  const sh = S.height * k;
  const horizontal = (side === 'left') || (side === 'right');

  // Where the other scene's rectangle should go, before snapping
  const along = (start, length, own) => {
    let p = start;
    if ( align === 'center' ) p += (length - own) / 2;
    else if ( align === 'end' ) p += length - own;
    return p + (offset * size);
  };
  let x;
  let y;
  if ( horizontal ) {
    x = side === 'right' ? R.right + (gap * size) : R.x - (gap * size) - sw;
    y = along(R.y, R.height, sh);
  } else {
    y = side === 'bottom' ? R.bottom + (gap * size) : R.y - (gap * size) - sh;
    x = along(R.x, R.width, sw);
  }

  // Scaled to this grid size, the other scene's grid lines sit at multiples of the grid size too. Moving it by whole
  // grid spaces keeps both grids aligned. Round away from this scene on the attached side, so the two never overlap.
  const up = v => Math.ceil((v / size) - 1e-6) * size;
  const down = v => Math.floor((v / size) + 1e-6) * size;
  const nearest = v => Math.round(v / size) * size;
  const tx = (side === 'right' ? up : side === 'left' ? down : nearest)(x - (S.x * k));
  const ty = (side === 'bottom' ? up : side === 'top' ? down : nearest)(y - (S.y * k));
  const placed = { x: (S.x * k) + tx, y: (S.y * k) + ty, width: sw, height: sh };

  // Grow this scene by whole grid spaces until both rectangles fit
  const spaces = n => Math.max(0, Math.ceil((n / size) - 1e-6));
  const amounts = {
    left: spaces(R.x - placed.x),
    top: spaces(R.y - placed.y),
    right: spaces((placed.x + sw) - R.right),
    bottom: spaces((placed.y + sh) - R.bottom),
  };
  const plan = planResize(scene, amounts);
  plan.type = 'stitch';

  const sourcePlan = {
    type: 'stitch',
    angle: 0,
    mirror: null,
    scale: k,
    changes: {},
    grid: plan.grid,
    rect: plan.rect,
    mapPoint: (px, py) => plan.mapPoint((k * px) + tx, (k * py) + ty),
    convertLevelTextures: true,
    keepFogLevels: false, // Copies become tiles; the other scene's fog overlay isn't copied
    snapTokens: false,
  };
  const a = plan.mapPoint(placed.x, placed.y);
  plan.source = {
    scene: other,
    plan: sourcePlan,
    rect: new PIXI.Rectangle(a.x, a.y, sw, sh),
    tokens,
    distanceScale: scene.grid.distance / other.grid.distance,
  };
  return plan;
}

/* -------------------------------------------- */
/*  Applying a plan                             */
/* -------------------------------------------- */

/**
 * @typedef SceneUpdateResult
 * @property {object} update                            The Scene update, with embedded documents.
 * @property {string[]} warnings                        Messages for the user.
 * @property {Record<string, string[]>} deletions       Ids of placeables to delete first, by Document name.
 * @property {Record<string, object[]>} creations       Placeables to create afterwards, by Document name.
 * @property {KeptLevel[]} keptLevels                   Level images kept as Level textures, for cutting them.
 */

/**
 * Build the Scene update for a plan, including all embedded documents.
 * @param {Scene} scene
 * @param {TransformPlan} plan
 * @returns {SceneUpdateResult}
 */
export function buildSceneUpdate(scene, plan) {
  const { mapPoint, angle, mirror } = plan;
  const k = plan.scale ?? 1;
  const grid = scene.grid;
  const newGrid = plan.grid ?? grid;
  const warnings = [];
  const deletions = {};
  const box = r => turn(plan, r, 'box');
  const facing = r => turn(plan, r, 'south');
  const scaleInt = (n, min = 0) => Math.max(min, Math.round(n * k));
  const mapRounded = (x, y) => {
    const p = mapPoint(x, y);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  };

  // Placeables entirely outside the new scene rectangle are deleted instead of moved, if the plan asks for it
  const rect = plan.rect;
  const keep = (documentName, id, bounds) => {
    if ( (documentName === 'Token') && plan.dropTokens ) {
      (deletions.Token ??= []).push(id);
      return false;
    }
    if ( !plan.removeOutside || !rect || intersects(bounds, rect) ) return true;
    (deletions[documentName] ??= []).push(id);
    return false;
  };

  const update = foundry.utils.deepClone(plan.changes);

  // Initial view position
  const initial = scene._source.initial;
  if ( Number.isFinite(initial?.x) && Number.isFinite(initial?.y) ) {
    update.initial = { ...initial, ...mapRounded(initial.x, initial.y) };
    if ( (k !== 1) && Number.isFinite(initial.scale) ) update.initial.scale = initial.scale / k;
  }

  // Tokens: keep the footprint on the same grid spaces and turn the art with the map
  const newSize = grid.size * k;
  update.tokens = scene.tokens.map(token => {
    const src = token._source;
    let { x, y, width, height } = mapFootprint(src, plan, grid.size);
    // Only padding snaps tokens, and it keeps the grid, so the token can be snapped with the current one
    if ( plan.snapTokens && isSnapped(token) ) ({ x, y } = token.getSnappedPosition({ x, y, width, height }));
    if ( !keep('Token', token.id, { x, y, width: width * newSize, height: height * newSize }) ) return null;
    return {
      _id: token.id, x, y, width, height,
      rotation: src.lockRotation ? src.rotation : facing(src.rotation),
      _movementHistory: null,
    };
  }).filter(Boolean);

  // Tiles rotate around their anchor point at (x, y)
  const mapTile = (src, extra = {}) => {
    let { x, y } = src;
    const data = { ...extra };
    if ( mirror ) {
      // A negative scale flips the image around its anchor, but the tile frame doesn't flip with it. With the anchor
      // in the center both match, so move the anchor there first.
      const t = src.texture ?? {};
      const ax = t.anchorX ?? 0.5;
      const ay = t.anchorY ?? 0.5;
      if ( (ax !== 0.5) || (ay !== 0.5) ) {
        const a = Math.toRadians(src.rotation ?? 0);
        const ox = (0.5 - ax) * src.width;
        const oy = (0.5 - ay) * src.height;
        x += (ox * Math.cos(a)) - (oy * Math.sin(a));
        y += (ox * Math.sin(a)) + (oy * Math.cos(a));
      }
      const key = mirror === 'x' ? 'scaleX' : 'scaleY';
      data.texture = { ...extra.texture, anchorX: 0.5, anchorY: 0.5, [key]: -(t[key] ?? 1) };
    }
    Object.assign(data, mapRounded(x, y), { rotation: box(src.rotation) });
    if ( k !== 1 ) Object.assign(data, { width: scaleInt(src.width), height: scaleInt(src.height) });
    return data;
  };
  const tileBounds = (data, src) => frameBounds(data.x, data.y, data.width ?? src.width, data.height ?? src.height,
    data.texture?.anchorX ?? src.texture?.anchorX ?? 0.5, data.texture?.anchorY ?? src.texture?.anchorY ?? 0.5,
    data.rotation);
  update.tiles = scene.tiles.map(tile => {
    const data = mapTile(tile._source, { _id: tile.id });
    return keep('Tile', tile.id, tileBounds(data, tile._source)) ? data : null;
  }).filter(Boolean);

  // Level background and foreground images
  let keptLevels = [];
  if ( plan.convertLevelTextures ) {
    const { tiles, levels, kept, fogLost } = levelTexturesToTiles(scene, plan);
    for ( const tile of tiles ) update.tiles.push(mapTile(tile, tile));
    if ( levels.length ) update.levels = levels;
    keptLevels = kept;
    // A fog overlay the size of the background copies the background's placement, which a tile doesn't have
    if ( fogLost ) warnings.push(loc('Warning.FogOverlay'));
  } else if ( angle || mirror ) {
    // Half turns and mirrors keep the image's size, so a turned or flipped Level texture works and stays a background
    update.levels = scene.levels.map(level => {
      const t = level._source.textures;
      const textures = { rotation: box(t.rotation) };
      if ( angle ) Object.assign(textures, { offsetX: -t.offsetX, offsetY: -t.offsetY });
      else if ( mirror === 'x' ) Object.assign(textures, { offsetX: -t.offsetX, scaleX: -t.scaleX });
      else Object.assign(textures, { offsetY: -t.offsetY, scaleY: -t.scaleY });
      return { _id: level.id, textures };
    });
  } else if ( k !== 1 ) {
    // Level textures are drawn at the size of the scene rectangle, which scales with the grid; only offsets change
    update.levels = scene.levels.map(level => {
      const t = level._source.textures;
      return { _id: level.id, textures: { offsetX: t.offsetX * k, offsetY: t.offsetY * k } };
    });
  }

  // Drawings rotate around the center of their shape
  update.drawings = scene.drawings.map(drawing => {
    const src = drawing._source;
    const w = src.shape.width ?? 0;
    const h = src.shape.height ?? 0;
    const c = mapPoint(src.x + (w / 2), src.y + (h / 2));
    const data = { _id: drawing.id, rotation: box(src.rotation) };
    const nw = k !== 1 ? scaleInt(w) : w;
    const nh = k !== 1 ? scaleInt(h) : h;
    if ( (k !== 1) || mirror ) {
      let points = (src.shape.points ?? []).map(n => n * k);
      // Points are relative to the top-left corner of the shape box
      if ( mirror ) points = points.map((n, i) => ((i % 2) === (mirror === 'x' ? 0 : 1) ? (mirror === 'x' ? nw : nh) - n : n));
      data.shape = { points };
    }
    if ( k !== 1 ) {
      Object.assign(data.shape, { width: nw, height: nh });
      if ( src.shape.radius ) data.shape.radius = scaleInt(src.shape.radius, 1);
      data.strokeWidth = scaleInt(src.strokeWidth);
      data.fontSize = Math.clamp(Math.round(src.fontSize * k), 8, 256);
    }
    Object.assign(data, { x: c.x - (nw / 2), y: c.y - (nh / 2) });
    return keep('Drawing', drawing.id, frameBounds(c.x, c.y, nw, nh, 0.5, 0.5, data.rotation)) ? data : null;
  }).filter(Boolean);

  const point = p => ({ x: p.x, y: p.y, width: 0, height: 0 });
  update.lights = scene.lights.map(light => {
    const data = { _id: light.id, ...mapRounded(light._source.x, light._source.y), rotation: facing(light._source.rotation) };
    return keep('AmbientLight', light.id, point(data)) ? data : null;
  }).filter(Boolean);
  update.sounds = scene.sounds.map(sound => {
    const data = { _id: sound.id, ...mapRounded(sound._source.x, sound._source.y) };
    return keep('AmbientSound', sound.id, point(data)) ? data : null;
  }).filter(Boolean);
  update.notes = scene.notes.map(note => {
    const src = note._source;
    const data = { _id: note.id, ...mapRounded(src.x, src.y) };
    if ( k !== 1 ) {
      data.iconSize = scaleInt(src.iconSize, 32);
      data.fontSize = Math.clamp(Math.round(src.fontSize * k), 8, 128);
    }
    return keep('Note', note.id, point(data)) ? data : null;
  }).filter(Boolean);

  // Walls keep their endpoint order, so the left/right direction of one-way walls is preserved by a rotation.
  // A mirror swaps left and right, and turns doors the other way.
  update.walls = scene.walls.map(wall => {
    const src = wall._source;
    const [x0, y0, x1, y1] = src.c;
    const a = mapRounded(x0, y0);
    const b = mapRounded(x1, y1);
    const data = { _id: wall.id, c: [a.x, a.y, b.x, b.y] };
    if ( mirror ) {
      const { LEFT, RIGHT } = CONST.EDGE_DIRECTIONS;
      if ( src.dir === LEFT ) data.dir = RIGHT;
      else if ( src.dir === RIGHT ) data.dir = LEFT;
      if ( src.animation ) {
        data.animation = { flip: !src.animation.flip };
        if ( src.animation.type === 'swing' ) data.animation.direction = -(src.animation.direction ?? 1);
      }
    }
    if ( plan.removeOutside && rect ) {
      const clipped = clipSegment(a, b, rect);
      // Walls only touching the edge are outside too
      const length = clipped ? Math.hypot(clipped[1].x - clipped[0].x, clipped[1].y - clipped[0].y) : 0;
      if ( length < 1 ) {
        (deletions.Wall ??= []).push(wall.id);
        return null;
      }
      if ( plan.clipWalls ) {
        const [p, q] = clipped.map(pt => ({ x: Math.round(pt.x), y: Math.round(pt.y) }));
        data.c = [p.x, p.y, q.x, q.y];
      }
    }
    return data;
  }).filter(Boolean);

  update.regions = scene.regions.map(region => {
    const shapes = region._source.shapes.map(shape => {
      try {
        return mapShape(shape, plan, grid, newGrid);
      } catch(err) {
        if ( !(err instanceof TransformError) ) throw err;
        warnings.push(err.message);
        return shape;
      }
    });
    const bounds = shapes.map(s => shapeBounds(s, newGrid, newSize)).filter(Boolean);
    if ( bounds.length && !keep('Region', region.id, unionBounds(bounds)) ) return null;
    return { _id: region.id, shapes, _shapeConstraints: null };
  }).filter(Boolean);

  // Copies of another scene's placeables
  let creations = {};
  if ( plan.source ) {
    const result = buildStitchCreations(scene, plan);
    creations = result.creations;
    warnings.push(...result.warnings);
  }

  return { update, warnings: Array.from(new Set(warnings)), deletions, creations, keptLevels };
}

/**
 * Count the placeables a plan would delete because they end up outside the scene.
 * @param {Scene} scene
 * @param {TransformPlan} plan
 * @returns {number}
 */
export function countOutside(scene, plan) {
  const { deletions } = buildSceneUpdate(scene, { ...plan, removeOutside: true, source: undefined });
  return Object.values(deletions).reduce((n, ids) => n + ids.length, 0);
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
  const { update, warnings, deletions, creations, keptLevels } = buildSceneUpdate(scene, plan);

  let copy = null;
  if ( backup ) {
    copy = await scene.clone({
      name: game.i18n.format(`${MODULE_ID}.Backup.Name`, {
        name: scene.name,
        time: new Date().toLocaleTimeString(game.i18n.lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
      }),
      active: false,
      navigation: false,
      flags: { [MODULE_ID]: { backup: { of: scene.id, type: plan.type, time: Date.now() } } },
    }, { save: true });
  }

  if ( plan.cropImages ) {
    await cropLevelImages(scene, update.tiles, plan.rect, warnings);
    await cropKeptLevels(scene, update.levels ?? [], keptLevels, plan.rect, warnings);
  }

  // Deleted placeables are left out of the update, which would otherwise create them again
  for ( const [documentName, ids] of Object.entries(deletions) ) {
    await scene.deleteEmbeddedDocuments(documentName, ids);
  }
  const redrawn = canvasRedrawn(scene);
  await scene.update(update, { [MODULE_ID]: { type: plan.type, angle: plan.angle, mirror: plan.mirror } });
  await redrawn;

  // Copies are created as documents of their own, so creation hooks and Region behaviors run as usual
  for ( const [documentName, data] of Object.entries(creations) ) {
    if ( data.length ) await scene.createEmbeddedDocuments(documentName, data);
  }

  await finishTransformation(scene, { resetFog, thumbnail });
  return { scene, backup: copy, warnings };
}

/* -------------------------------------------- */
/*  Backups                                     */
/* -------------------------------------------- */

/**
 * The most recent backup copy of a scene made by a transformation.
 * @param {Scene} scene
 * @returns {Scene|null}
 */
export function findBackup(scene) {
  let latest = null;
  for ( const s of game.scenes ) {
    const info = s.getFlag(MODULE_ID, 'backup');
    if ( (info?.of === scene.id) && (!latest || (info.time > latest.getFlag(MODULE_ID, 'backup').time)) ) latest = s;
  }
  return latest;
}

/**
 * Restore a scene from a backup copy and delete the copy. The scene keeps its id, name, folder and navigation, so
 * links, combats and journal pins pointing at it keep working, and placeables get back the ids they had.
 * @param {Scene} scene
 * @param {Scene} backup
 * @param {object} [options]
 * @param {boolean} [options.resetFog=true]
 * @param {boolean} [options.thumbnail=true]
 * @returns {Promise<Scene>}
 */
export async function restoreBackup(scene, backup, { resetFog = true, thumbnail = true } = {}) {
  if ( !game.user.isGM ) throw new TransformError(loc('Error.NotGM'));
  if ( backup?.getFlag(MODULE_ID, 'backup')?.of !== scene.id ) throw new TransformError(loc('Error.NoBackup'));

  const data = backup.toObject();
  for ( const key of ['_id', 'name', 'navName', 'active', 'navigation', 'navOrder', 'folder', 'sort', 'ownership',
    '_stats', 'thumb'] ) delete data[key];
  delete data.flags?.[MODULE_ID]?.backup;

  // Replace the embedded collections as a whole: placeables added since are removed, and none are deleted and
  // created again, so no token leaves its combat
  for ( const collection of [...Object.values(PLACEABLES), 'levels'] ) {
    if ( collection in data ) data[collection] = _replace(data[collection]);
  }
  const redrawn = canvasRedrawn(scene);
  await scene.update(data, { [MODULE_ID]: { type: 'restore' } });
  await redrawn;
  await backup.delete();
  await finishTransformation(scene, { resetFog, thumbnail });
  return scene;
}

/**
 * When the scene is on the canvas, the update makes core redraw the canvas without waiting for it. Resetting fog or
 * rendering the thumbnail during that redraw leaves the canvas black, so wait for it to finish.
 * Call before the update; the returned promise resolves once the canvas is ready again (or right away).
 * @param {Scene} scene
 * @returns {Promise<void>}
 */
function canvasRedrawn(scene) {
  if ( canvas.scene?.id !== scene.id ) return Promise.resolve();
  return new Promise(resolve => {
    const id = Hooks.once('canvasReady', () => {
      clearTimeout(timeout);
      resolve();
    });
    // Don't wait forever if the update didn't redraw the canvas or the redraw failed
    const timeout = setTimeout(() => {
      Hooks.off('canvasReady', id);
      resolve();
    }, REDRAW_TIMEOUT);
  });
}

/** Longest time in milliseconds to wait for the canvas to redraw after an update. */
const REDRAW_TIMEOUT = 20000;

/**
 * Reset fog and regenerate the thumbnail after the scene changed.
 * @param {Scene} scene
 * @param {object} options
 * @param {boolean} options.resetFog
 * @param {boolean} options.thumbnail
 */
async function finishTransformation(scene, { resetFog, thumbnail }) {
  if ( resetFog ) game.socket.emit('resetFog', scene.id);
  if ( thumbnail ) {
    try {
      const { thumb } = await scene.createThumbnail() ?? {};
      if ( thumb ) await scene.update({ thumb }, { diff: false });
    } catch(err) {
      console.warn(`${MODULE_ID} | Could not regenerate the thumbnail of scene "${scene.name}".`, err);
    }
  }
  // Last resort: redraw a canvas that didn't come back, which the GM would otherwise do with "View Scene"
  if ( (canvas.scene?.id === scene.id) && !canvas.ready ) await canvas.draw();
}

/* -------------------------------------------- */
/*  Stitching                                   */
/* -------------------------------------------- */

/**
 * Creation data for the copies of the attached scene's placeables and images.
 * @param {Scene} scene
 * @param {TransformPlan} plan
 * @returns {{creations: Record<string, object[]>, warnings: string[]}}
 */
function buildStitchCreations(scene, plan) {
  const { scene: other, plan: sourcePlan, tokens, distanceScale } = plan.source;
  const { update, warnings } = buildSceneUpdate(other, sourcePlan);
  const levelId = mapLevels(other, scene);
  const sorts = scene.tiles.map(t => t._source.sort);
  const minSort = Math.min(0, ...sorts) - 1;
  const maxSort = Math.max(0, ...sorts) + 1;

  const creations = {};
  for ( const [documentName, collection] of Object.entries(PLACEABLES) ) {
    if ( (collection === 'tokens') && !tokens ) continue;
    const changes = new Map();
    const added = [];
    for ( const d of update[collection] ?? [] ) {
      if ( d._id ) changes.set(d._id, d);
      else added.push(d);
    }
    const data = other[collection].map(doc => foundry.utils.mergeObject(doc.toObject(), changes.get(doc.id) ?? {},
      { inplace: false }));
    for ( const d of added ) {
      // Images of the attached scene's Levels sit with this scene's background or foreground
      const layer = d.flags?.[MODULE_ID]?.layer;
      data.push({ ...d, sort: layer === 'foreground' ? maxSort : minSort });
    }
    for ( const d of data ) {
      delete d._id;
      delete d._movementHistory;
      delete d._shapeConstraints;
      if ( Array.isArray(d.levels) ) d.levels = Array.from(new Set(d.levels.map(levelId)));
      if ( typeof d.level === 'string' ) d.level = levelId(d.level);
      if ( distanceScale !== 1 ) scaleRanges(documentName, d, distanceScale);
    }
    creations[documentName] = data;
  }
  return { creations, warnings };
}

/**
 * Match the Levels of one scene to the Levels of another: the same id if it exists there, otherwise the Level in
 * the same place from the bottom, or the top one.
 * @param {Scene} from
 * @param {Scene} to
 * @returns {(id: string) => string}
 */
function mapLevels(from, to) {
  const order = scene => scene.levels.contents
    .sort((a, b) => (a._source.elevation.bottom ?? 0) - (b._source.elevation.bottom ?? 0)).map(l => l.id);
  const source = order(from);
  const target = order(to);
  return id => {
    if ( target.includes(id) ) return id;
    const i = source.indexOf(id);
    return target[Math.clamp(i, 0, target.length - 1)] ?? id;
  };
}

/**
 * Keep ranges given in grid units the same number of grid spaces long when the scenes measure them differently.
 * @param {string} documentName
 * @param {object} data
 * @param {number} factor
 */
function scaleRanges(documentName, data, factor) {
  const scale = n => (Number.isFinite(n) ? Math.round(n * factor * 100) / 100 : n);
  switch ( documentName ) {
    case 'AmbientLight':
      if ( data.config ) Object.assign(data.config, { dim: scale(data.config.dim), bright: scale(data.config.bright) });
      break;
    case 'AmbientSound':
      data.radius = scale(data.radius);
      break;
    case 'Token':
      if ( data.sight ) data.sight.range = scale(data.sight.range);
      for ( const mode of Object.values(data.detectionModes ?? {}) ) mode.range = scale(mode.range);
      break;
    case 'Wall':
      for ( const key of ['light', 'sight', 'sound'] ) {
        if ( data.threshold?.[key] ) data.threshold[key] = scale(data.threshold[key]);
      }
      break;
  }
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * Turn an angle of a placeable with the plan.
 * @param {TransformPlan} plan
 * @param {number} r                    The angle in degrees.
 * @param {"box"|"south"|"east"} kind   What the angle means: the rotation of a box that is symmetric along its axes
 *                                      (tiles, drawings, rectangles, ellipses), or a direction where 0° points
 *                                      south (tokens, lights) or east (cones, lines).
 * @returns {number}
 */
function turn(plan, r, kind) {
  r ??= 0;
  const { mirror, angle } = plan;
  if ( !mirror ) return Math.normalizeDegrees(r + angle);
  if ( kind === 'box' ) return Math.normalizeDegrees(-r);
  const flipsToOpposite = (kind === 'south') === (mirror === 'y');
  return Math.normalizeDegrees(flipsToOpposite ? 180 - r : -r);
}

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
  return previewClone(scene, changes).dimensions.sceneRect;
}

/**
 * An unsaved copy of the scene with changes, for measuring. Scene#clone writes `active: false` and
 * `navigation: false` into the data it's given, so it gets a copy: passing the plan's changes would put those into the
 * scene update, deactivating the scene and hiding it from the navigation bar.
 * @param {Scene} scene
 * @param {object} changes
 * @returns {Scene}
 */
function previewClone(scene, changes) {
  return scene.clone(foundry.utils.deepClone(changes));
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
  const newSize = size * (plan.scale ?? 1);
  return {
    x: Math.round(c.x - (width * newSize / 2)),
    y: Math.round(c.y - (height * newSize / 2)),
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
 * Pixel sizes scale with the grid; this includes grid-based shapes, whose sizes are in pixels too.
 * @param {object} shape        The shape source data.
 * @param {TransformPlan} plan
 * @param {BaseGrid} grid       The current grid.
 * @param {BaseGrid} newGrid    The grid after the transformation.
 * @returns {object}            The mapped shape source data.
 */
function mapShape(shape, plan, grid, newGrid) {
  const { mapPoint, mirror } = plan;
  const k = plan.scale ?? 1;
  const s = foundry.utils.deepClone(shape);
  const scaleKeys = keys => {
    if ( k !== 1 ) for ( const key of keys ) s[key] *= k;
  };
  switch ( s.type ) {
    case 'rectangle':
      Object.assign(s, mapPoint(s.x, s.y));
      s.rotation = turn(plan, s.rotation, 'box');
      // Mirrored, the rectangle extends to the other side of its anchor
      if ( mirror === 'x' ) s.anchorX = 1 - (s.anchorX ?? 0);
      else if ( mirror === 'y' ) s.anchorY = 1 - (s.anchorY ?? 0);
      scaleKeys(['width', 'height']);
      break;
    case 'ellipse':
      Object.assign(s, mapPoint(s.x, s.y));
      s.rotation = turn(plan, s.rotation, 'box');
      scaleKeys(['radiusX', 'radiusY']);
      break;
    case 'cone':
    case 'line':
      Object.assign(s, mapPoint(s.x, s.y));
      s.rotation = turn(plan, s.rotation, 'east');
      scaleKeys(s.type === 'cone' ? ['radius'] : ['length', 'width']);
      break;
    case 'circle':
    case 'ring':
      Object.assign(s, mapPoint(s.x, s.y));
      scaleKeys(s.type === 'ring' ? ['radius', 'innerWidth', 'outerWidth'] : ['radius']);
      break;
    case 'emanation':
      s.base = mapShape(s.base, plan, grid, newGrid);
      scaleKeys(['radius']);
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
        const { i, j } = newGrid.getOffset(mapPoint(c.x, c.y));
        return { i, j };
      });
      if ( s.origin ) s.origin = mapPoint(s.origin.x, s.origin.y);
      break;
    default:
      throw new TransformError(game.i18n.format(`${MODULE_ID}.Warning.UnknownShape`, { type: s.type }));
  }
  return s;
}

/* -------------------------------------------- */
/*  Bounds                                      */
/* -------------------------------------------- */

/**
 * Axis-aligned bounds of a rotated box with the given anchor at (x, y).
 * @returns {{x: number, y: number, width: number, height: number}}
 */
function frameBounds(x, y, width, height, anchorX, anchorY, rotation = 0) {
  const a = Math.toRadians(rotation ?? 0);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const xs = [];
  const ys = [];
  for ( const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]] ) {
    const ox = (u - anchorX) * width;
    const oy = (v - anchorY) * height;
    xs.push(x + (ox * cos) - (oy * sin));
    ys.push(y + (ox * sin) + (oy * cos));
  }
  return pointsBounds(xs, ys);
}

/** Bounds of a set of points. */
function pointsBounds(xs, ys) {
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Bounds around a circle. */
function circleBounds(x, y, r) {
  return { x: x - r, y: y - r, width: 2 * r, height: 2 * r };
}

/** Bounds of several bounds. */
function unionBounds(list) {
  return pointsBounds(list.flatMap(b => [b.x, b.x + b.width]), list.flatMap(b => [b.y, b.y + b.height]));
}

/**
 * Rough bounds of a mapped Region shape, large enough to contain it.
 * @param {object} s
 * @param {BaseGrid} grid       The grid the shape is on.
 * @param {number} size         The grid size in pixels.
 * @returns {{x: number, y: number, width: number, height: number}|null}
 */
function shapeBounds(s, grid, size) {
  switch ( s.type ) {
    case 'rectangle': return frameBounds(s.x, s.y, s.width, s.height, s.anchorX ?? 0, s.anchorY ?? 0, s.rotation);
    case 'ellipse': return circleBounds(s.x, s.y, Math.max(s.radiusX, s.radiusY));
    case 'circle':
    case 'cone': return circleBounds(s.x, s.y, s.radius);
    case 'ring': return circleBounds(s.x, s.y, s.radius + (s.outerWidth ?? 0));
    case 'line': return circleBounds(s.x, s.y, s.length + s.width);
    case 'emanation': {
      const b = shapeBounds(s.base, grid, size);
      return b && { x: b.x - s.radius, y: b.y - s.radius, width: b.width + (2 * s.radius), height: b.height + (2 * s.radius) };
    }
    case 'polygon': return pointsBounds(s.points.filter((_, i) => !(i % 2)), s.points.filter((_, i) => i % 2));
    case 'token': return { x: s.x, y: s.y, width: s.width * size, height: s.height * size };
    case 'grid': {
      if ( !s.offsets.length ) return null;
      const centers = s.offsets.map(o => grid.getCenterPoint(o));
      const b = pointsBounds(centers.map(c => c.x), centers.map(c => c.y));
      return { x: b.x - (size / 2), y: b.y - (size / 2), width: b.width + size, height: b.height + size };
    }
    default: return null;
  }
}

/**
 * Do two rectangles overlap? Boxes that only touch don't, so a token next to the edge counts as outside. A point
 * (no width or height) counts when it lies inside or on the edge.
 * @returns {boolean}
 */
function intersects(a, b) {
  const overlaps = (start, length, otherStart, otherLength) => (length
    ? (start < otherStart + otherLength) && (start + length > otherStart)
    : (start >= otherStart) && (start <= otherStart + otherLength));
  return overlaps(a.x, a.width, b.x, b.width) && overlaps(a.y, a.height, b.y, b.height);
}

/**
 * The part of a line segment inside a rectangle, or null. (Liang–Barsky clipping)
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @param {{x: number, y: number, width: number, height: number}} r
 * @returns {[{x: number, y: number}, {x: number, y: number}]|null}
 */
function clipSegment(a, b, r) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges = [[-dx, a.x - r.x], [dx, r.x + r.width - a.x], [-dy, a.y - r.y], [dy, r.y + r.height - a.y]];
  for ( const [p, q] of edges ) {
    if ( p === 0 ) {
      if ( q < 0 ) return null;
      continue;
    }
    const t = q / p;
    if ( p < 0 ) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if ( t0 > t1 ) return null;
  }
  return [{ x: a.x + (t0 * dx), y: a.y + (t0 * dy) }, { x: a.x + (t1 * dx), y: a.y + (t1 * dy) }];
}

/**
 * @typedef KeptLevel
 * A Level whose images stay Level textures through a transformation, placed on the new canvas.
 * @property {string} level         Level id.
 * @property {string} name          Level name.
 * @property {number} x             Anchor point of the images on the new canvas.
 * @property {number} y
 * @property {number} width         Size of the images on the canvas, before rotation.
 * @property {number} height
 * @property {number} anchorX
 * @property {number} anchorY
 * @property {number} rotation
 * @property {boolean} flipped      Mirrored by a negative scale.
 * @property {{background?: string, foreground?: string, fog?: string}} layers   Image paths.
 */

/**
 * Turn the background and foreground images of all Levels into tiles that look the same, so the image stays put
 * while the scene changes size or turns. Tiles are returned in the current canvas coordinates.
 * A Level texture is drawn like a tile with the scene rectangle's size, anchored at the rectangle's center plus the
 * texture offset, so the conversion copies anchor, fit, scale and rotation as they are.
 *
 * Levels with a fog overlay image keep their images as Level textures when they fill the scene ("fill" fit): the
 * overlay copies the background's placement only while there is a Level background. Their offset, scale and
 * rotation are changed instead, so the images stay where they are on the new canvas.
 * @param {Scene} scene
 * @param {TransformPlan} plan
 * @returns {{tiles: object[], levels: object[], kept: KeptLevel[], fogLost: boolean}}
 *   Tile creation data, Level updates (clearing converted images or moving kept ones), the kept Levels, and whether a
 *   fog overlay can no longer follow its background.
 */
function levelTexturesToTiles(scene, plan) {
  const rect = scene.dimensions.sceneRect;
  const to = plan.rect;
  const keepFog = (plan.keepFogLevels !== false) && !!to;
  const kept = [];
  let fogLost = false;
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

    if ( src.fog?.src ) {
      if ( keepFog && ((t.fit ?? 'fill') === 'fill') ) {
        // With "fill", the image is the scene rectangle's size times the scale: compensate the new rectangle's size
        const p = plan.mapPoint(rect.x + (rect.width / 2) + t.offsetX, rect.y + (rect.height / 2) + t.offsetY);
        const scaleX = t.scaleX * (rect.width / to.width);
        const scaleY = t.scaleY * (rect.height / to.height);
        const rotation = turn(plan, t.rotation, 'box');
        levels.push({ _id: level.id, textures: {
          offsetX: p.x - (to.x + (to.width / 2)), offsetY: p.y - (to.y + (to.height / 2)), scaleX, scaleY, rotation,
        } });
        kept.push({
          level: level.id, name: src.name, x: p.x, y: p.y,
          width: Math.abs(rect.width * t.scaleX), height: Math.abs(rect.height * t.scaleY),
          anchorX: t.anchorX ?? 0.5, anchorY: t.anchorY ?? 0.5, rotation, flipped: (scaleX < 0) || (scaleY < 0),
          layers: { background: src.background?.src, foreground: src.foreground?.src, fog: src.fog.src },
        });
        continue;
      }
      // The copies of an attached scene don't take its fog overlay along, so nothing is lost there
      if ( plan.keepFogLevels !== false ) fogLost = true;
    }

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
  return { tiles, levels, kept, fogLost };
}
