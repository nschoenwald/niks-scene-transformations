import { MODULE_ID, TAB_ID, loc } from './config.js';
import {
  MIRRORS, TransformError, buildSceneUpdate, canExtract, canRotate, countOutside, extractScene, findBackup,
  gridStep, planExtract, planGridSize, planMirror, planResize, planRotation, planStitch, restoreBackup, transformScene,
} from './transform.js';
import { readArea, renderAreaSelection, wireAreaSelector } from './area-selector.js';
import { attachRender } from './scene-render.js';

/**
 * The "Transform" tab of Scene Configuration.
 *
 * Its inputs have no `name`, so they are never submitted with the scene form. Their change events are stopped at the
 * tab, because SceneConfig#_onChangeForm syncs all inputs sharing the changed input's name, which would include every
 * unnamed input. The tab applies its transformation directly with its own button.
 */

const SIDES = ['top', 'right', 'bottom', 'left'];

/** Largest size of the preview in pixels. */
const PREVIEW = { width: 500, height: 220 };

/** Width of the Scene Configuration window, which core sizes (600px) to fit only its own six tabs in one row. */
const SHEET_WIDTH = 680;

/**
 * Add the tab and its template part to SceneConfig.
 */
export function registerSceneConfigTab() {
  const SceneConfig = foundry.applications.sheets.SceneConfig;
  const part = { template: `modules/${MODULE_ID}/templates/scene-config-tab.hbs`, scrollable: [''] };
  const { footer, ...parts } = SceneConfig.PARTS;
  SceneConfig.PARTS = footer ? { ...parts, [TAB_ID]: part, footer } : { ...parts, [TAB_ID]: part };
  SceneConfig.TABS.sheet.tabs.push({ id: TAB_ID, icon: 'fa-solid fa-arrows-rotate', label: `${MODULE_ID}.Tab.Label` });
  const position = SceneConfig.DEFAULT_OPTIONS.position;
  if ( !(position.width >= SHEET_WIDTH) ) position.width = SHEET_WIDTH;
  Hooks.on('renderSceneConfig', onRenderSceneConfig);
}

/**
 * Wire up the tab after each render that included it.
 * @param {SceneConfig} app
 * @param {HTMLElement} element
 */
function onRenderSceneConfig(app, element) {
  const tab = element.querySelector(`.tab[data-tab="${TAB_ID}"]`);
  if ( !tab || tab.dataset.nstReady ) return;
  tab.dataset.nstReady = 'true';
  const scene = app.document;

  if ( !canRotate(scene) ) {
    tab.querySelector('[data-nst="mode"] option[value="rotate"]').disabled = true;
    tab.querySelector('[data-nst-hex]').hidden = false;
  }
  if ( !canExtract(scene) ) tab.querySelector('[data-nst="mode"] option[value="extract"]').disabled = true;
  field(tab, 'exName').value = game.i18n.format(`${MODULE_ID}.Extract.DefaultName`, { name: scene.name });
  const gridSize = field(tab, 'gridSize');
  gridSize.min = CONST.GRID_MIN_SIZE;
  gridSize.value = scene._source.grid.size;

  // Scenes that can be attached, sorted by name
  const other = field(tab, 'other');
  const scenes = game.scenes.filter(s => s.id !== scene.id).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  for ( const s of scenes ) {
    const option = document.createElement('option');
    option.value = s.id;
    option.textContent = s.name;
    other.append(option);
  }

  // Undoing the last transformation
  const backup = findBackup(scene);
  if ( backup ) {
    const time = backup.getFlag(MODULE_ID, 'backup').time;
    tab.querySelector('[data-nst-restore]').hidden = false;
    tab.querySelector('[data-nst-backup-info]').textContent = game.i18n.format(`${MODULE_ID}.Restore.Info`, {
      name: backup.name, time: new Date(time).toLocaleString(game.i18n.lang),
    });
    tab.querySelector('[data-nst-restore-button]').addEventListener('click',
      event => restore(app, backup, tab, event.currentTarget));
  }

  const updateOutside = foundry.utils.debounce(() => refreshOutside(tab, scene), 200);
  const updateSummary = foundry.utils.debounce(() => refreshSummary(tab, scene), 200);
  const onChange = event => {
    event.stopPropagation();
    const side = event.target.dataset.nst;
    if ( SIDES.includes(side) && field(tab, 'linked').checked ) {
      for ( const s of SIDES ) if ( s !== side ) field(tab, s).value = event.target.value;
    }
    refresh(tab, scene);
    updateOutside();
    updateSummary();
  };
  if ( canExtract(scene) ) {
    wireAreaSelector(tab, scene, () => {
      refresh(tab, scene);
      updateSummary();
    });
  }
  tab.addEventListener('change', onChange);
  tab.addEventListener('input', onChange);
  tab.addEventListener('keydown', event => {
    if ( (event.key === 'Enter') && (event.target.tagName === 'INPUT') ) event.preventDefault();
  });
  tab.querySelector('[data-nst-apply]').addEventListener('click', event => apply(app, tab, event.currentTarget));

  refresh(tab, scene);
  updateSummary();
}

/**
 * @param {HTMLElement} tab
 * @param {string} key
 * @returns {HTMLInputElement|HTMLSelectElement}
 */
function field(tab, key) {
  return tab.querySelector(`[data-nst="${key}"]`);
}

/**
 * Read the tab's inputs.
 * @param {HTMLElement} tab
 */
function readState(tab) {
  const int = key => Math.trunc(Number(field(tab, key).value) || 0);
  const angle = field(tab, 'angle').value;
  return {
    mode: field(tab, 'mode').value,
    angle: MIRRORS.includes(angle) ? 0 : Number(angle),
    mirror: MIRRORS.includes(angle) ? angle : null,
    padding: Object.fromEntries(SIDES.map(s => [s, int(s)])),
    removeOutside: field(tab, 'removeOutside').checked,
    cropImages: field(tab, 'cropImages').checked,
    gridSize: Math.round(Number(field(tab, 'gridSize').value) || 0),
    other: game.scenes.get(field(tab, 'other').value) ?? null,
    stitch: {
      side: field(tab, 'side').value,
      align: field(tab, 'align').value,
      gap: Math.max(0, int('gap')),
      offset: int('offset'),
      tokens: field(tab, 'tokens').checked,
    },
    extract: {
      area: readArea(tab),
      name: field(tab, 'exName').value,
      tokens: field(tab, 'exTokens').checked,
      open: field(tab, 'exOpen').checked,
    },
    backup: field(tab, 'backup').checked,
    resetFog: field(tab, 'resetFog').checked,
  };
}

/**
 * Build the plan for the current inputs.
 * @param {Scene} scene
 * @param {ReturnType<readState>} state
 * @returns {TransformPlan}
 */
function buildPlan(scene, state) {
  switch ( state.mode ) {
    case 'rotate': return state.mirror ? planMirror(scene, state.mirror) : planRotation(scene, state.angle);
    case 'grid': return planGridSize(scene, state.gridSize);
    case 'stitch': return planStitch(scene, state.other, state.stitch);
    case 'extract': return planExtract(scene, state.extract.area, { tokens: state.extract.tokens });
    default: return planResize(scene, state.padding,
      { removeOutside: state.removeOutside, cropImages: state.cropImages });
  }
}

/** Does the state remove space from any side? */
const crops = state => SIDES.some(s => state.padding[s] < 0);

/**
 * Update sections, preview, sizes and the apply button from the current inputs.
 * @param {HTMLElement} tab
 * @param {Scene} scene
 */
function refresh(tab, scene) {
  const state = readState(tab);
  for ( const section of tab.querySelectorAll('[data-nst-section]') ) {
    section.hidden = section.dataset.nstSection !== state.mode;
  }
  tab.querySelector('[data-nst-crop]').hidden = !crops(state);
  const extracting = state.mode === 'extract';
  // Extracting leaves this scene as it is, so backup and fog options don't apply
  tab.querySelector('[data-nst-options]').hidden = extracting;
  tab.querySelector('[data-nst-apply-label]').textContent = loc(extracting ? 'Extract.Create' : 'Apply');

  const { width: W, height: H } = scene._source;
  const step = gridStep(scene.grid);
  let newStep = step;
  let width = W;
  let height = H;
  let left = 0;
  let top = 0;
  let mapW = W;
  let mapH = H;
  let transform = '';
  let otherRect = null;
  let valid;
  let scale;
  const stitchError = tab.querySelector('[data-nst-stitch-error]');
  stitchError.hidden = true;

  if ( state.mode === 'rotate' ) {
    if ( state.mirror ) transform = state.mirror === 'x' ? 'scaleX(-1)' : 'scaleY(-1)';
    else {
      if ( state.angle !== 180 ) [width, height] = [H, W];
      left = (width - W) / 2;
      top = (height - H) / 2;
      transform = `rotate(${state.angle}deg)`;
    }
    valid = canRotate(scene);
  } else if ( state.mode === 'grid' ) {
    const k = state.gridSize / scene._source.grid.size;
    valid = (state.gridSize >= CONST.GRID_MIN_SIZE) && (k !== 1);
    if ( valid ) {
      width = Math.max(1, Math.round(W * k));
      height = Math.max(1, Math.round(H * k));
      newStep = { x: step.x * k, y: step.y * k };
      mapW = width;
      mapH = height;
    }
    // Sized to the larger of the two, so the map visibly grows or shrinks
    scale = Math.min(PREVIEW.width / Math.max(W, width), PREVIEW.height / Math.max(H, height));
  } else if ( state.mode === 'stitch' ) {
    valid = false;
    if ( state.other ) {
      try {
        const plan = planStitch(scene, state.other, state.stitch);
        const r = plan.rect;
        const a = plan.mapPoint(scene.dimensions.sceneRect.x, scene.dimensions.sceneRect.y);
        ({ width, height } = plan.changes);
        left = a.x - r.x;
        top = a.y - r.y;
        const s = plan.source.rect;
        otherRect = { x: s.x - r.x, y: s.y - r.y, width: s.width, height: s.height };
        valid = true;
      } catch(err) {
        if ( !(err instanceof TransformError) ) throw err;
        stitchError.textContent = err.message;
        stitchError.hidden = false;
      }
    }
  } else if ( extracting ) {
    valid = false;
    if ( canExtract(scene) ) {
      try {
        const plan = planExtract(scene, state.extract.area);
        ({ width, height } = plan.changes);
        valid = true;
      } catch(err) {
        if ( !(err instanceof TransformError) ) throw err;
      }
    }
  } else {
    const p = state.padding;
    left = Math.round(p.left * step.x);
    top = Math.round(p.top * step.y);
    width = W + left + Math.round(p.right * step.x);
    height = H + top + Math.round(p.bottom * step.y);
    valid = SIDES.some(s => p[s] !== 0) && (width >= step.x) && (height >= step.y);
    if ( !valid ) [width, height, left, top] = [W, H, 0, 0];
  }

  // Preview: the new scene, with the current map (and an attached scene) placed on it. The preview covers both the
  // new scene and the current map, so space that is removed stays visible, shaded, outside the new scene's edge.
  const mapRect = { x: left, y: top, width: mapW, height: mapH };
  const bounds = state.mode === 'pad' ? {
    x: Math.min(0, left), y: Math.min(0, top),
    right: Math.max(width, left + W), bottom: Math.max(height, top + H),
  } : { x: 0, y: 0, right: extracting ? W : width, bottom: extracting ? H : height };
  const areaW = bounds.right - bounds.x;
  const areaH = bounds.bottom - bounds.y;
  scale ??= Math.min(PREVIEW.width / areaW, PREVIEW.height / areaH);
  const area = tab.querySelector('.nst-preview-area');
  area.style.width = `${Math.round(areaW * scale)}px`;
  area.style.height = `${Math.round(areaH * scale)}px`;
  const position = (el, rect, outer = { x: bounds.x, y: bounds.y, width: areaW, height: areaH }) => {
    Object.assign(el.style, {
      left: `${((rect.x - outer.x) / outer.width) * 100}%`,
      top: `${((rect.y - outer.y) / outer.height) * 100}%`,
      width: `${(rect.width / outer.width) * 100}%`,
      height: `${(rect.height / outer.height) * 100}%`,
    });
  };
  const place = (el, rect, src) => {
    position(el, rect);
    el.style.backgroundImage = src ? `url(${JSON.stringify(src)})` : '';
    el.classList.toggle('no-image', !src);
  };
  position(tab.querySelector('.nst-preview-scene'), { x: 0, y: 0, width, height });
  const map = tab.querySelector('.nst-preview-map:not(.nst-preview-other)');
  // The background image shows right away; the rendered map with its tiles replaces it once ready
  place(map, mapRect, previewImage(scene));
  attachRender(map, scene);
  map.style.transform = transform;
  const otherMap = tab.querySelector('.nst-preview-other');
  otherMap.hidden = !otherRect;
  if ( otherRect ) {
    place(otherMap, otherRect, previewImage(state.other));
    attachRender(otherMap, state.other);
  }

  // Shade the parts of the map outside the new scene: up to four strips around the part that is kept
  const removing = (state.mode === 'pad') && valid && crops(state);
  const keep = {
    x: Math.max(0, -left), y: Math.max(0, -top),
    right: Math.min(W, width - left), bottom: Math.min(H, height - top),
  };
  const strips = {
    top: { x: 0, y: 0, width: W, height: keep.y },
    bottom: { x: 0, y: keep.bottom, width: W, height: H - keep.bottom },
    left: { x: 0, y: keep.y, width: keep.x, height: keep.bottom - keep.y },
    right: { x: keep.right, y: keep.y, width: W - keep.right, height: keep.bottom - keep.y },
  };
  for ( const strip of tab.querySelectorAll('[data-nst-cut]') ) {
    const rect = strips[strip.dataset.nstCut];
    strip.hidden = !removing || (rect.width <= 0) || (rect.height <= 0);
    if ( !strip.hidden ) position(strip, rect, { x: 0, y: 0, width: W, height: H });
  }
  // Choosing the area to extract: the preview shows the whole scene with a grid and the selected area
  area.classList.toggle('nst-selecting', extracting);
  tab.querySelector('.nst-preview-select').hidden = !extracting;
  tab.querySelector('[data-nst-select-hint]').hidden = !extracting;
  if ( extracting ) {
    position(tab.querySelector('.nst-preview-scene'), { x: 0, y: 0, width: W, height: H });
    renderAreaSelection(tab, scene, state.extract.area, scale);
  } else tab.querySelector('.nst-preview-grid').hidden = true;

  const adding = (state.mode === 'pad') && valid && SIDES.some(s => state.padding[s] > 0);
  tab.querySelector('[data-nst-legend]').hidden = !removing && !adding;
  tab.querySelector('[data-nst-legend="added"]').hidden = !adding;
  tab.querySelector('[data-nst-legend="removed"]').hidden = !removing;

  const describe = (w, h, s) => game.i18n.format(`${MODULE_ID}.Size.Value`, {
    width: w, height: h, columns: Math.round(w / s.x), rows: Math.round(h / s.y),
  });
  tab.querySelector('[data-nst-size="current"]').textContent = describe(W, H, step);
  tab.querySelector('[data-nst-size="new"]').textContent = describe(width, height, newStep);
  tab.querySelector('[data-nst-apply]').disabled = !valid;
}

/**
 * Show how many placeables end up outside the scene when space is removed.
 * @param {HTMLElement} tab
 * @param {Scene} scene
 */
function refreshOutside(tab, scene) {
  const output = tab.querySelector('[data-nst-outside]');
  if ( !output?.isConnected ) return;
  const state = readState(tab);
  let count = 0;
  if ( (state.mode === 'pad') && crops(state) ) {
    try {
      count = countOutside(scene, planResize(scene, state.padding));
    } catch(err) {
      if ( !(err instanceof TransformError) ) throw err;
    }
  }
  output.textContent = count ? game.i18n.format(`${MODULE_ID}.Crop.OutsideCount`, { count }) : '';
}

/**
 * List what an extracted area would contain, below the preview.
 * @param {HTMLElement} tab
 * @param {Scene} scene
 */
function refreshSummary(tab, scene) {
  const output = tab.querySelector('[data-nst-summary]');
  if ( !output?.isConnected ) return;
  const state = readState(tab);
  output.hidden = state.mode !== 'extract';
  if ( output.hidden ) return;
  let update;
  try {
    ({ update } = buildSceneUpdate(scene, planExtract(scene, state.extract.area, { tokens: state.extract.tokens })));
  } catch(err) {
    if ( !(err instanceof TransformError) ) throw err;
    output.hidden = true;
    return;
  }
  const parts = [];
  for ( const [documentName, collection] of Object.entries(SUMMARY) ) {
    const count = (update[collection] ?? []).filter(d => d._id).length;
    if ( count ) parts.push(`${game.i18n.localize(getDocumentClass(documentName).metadata.labelPlural)} ${count}`);
  }
  const images = (update.tiles ?? []).filter(d => !d._id).length;
  if ( images ) parts.push(`${loc('Extract.Images')} ${images}`);
  output.textContent = parts.length
    ? game.i18n.format(`${MODULE_ID}.Extract.Summary`, { list: parts.join(' · ') })
    : loc('Extract.Empty');
}

/** Placeables listed in the extract summary, by Document name. */
const SUMMARY = {
  Token: 'tokens', Wall: 'walls', AmbientLight: 'lights', AmbientSound: 'sounds', Tile: 'tiles', Drawing: 'drawings',
  Note: 'notes', Region: 'regions',
};

/**
 * The background image of the Level the scene opens on, unless it is a video.
 * @param {Scene} scene
 * @returns {string|null}
 */
function previewImage(scene) {
  const level = (scene.isView && (canvas.level?.parent === scene)) ? canvas.level : scene.initialLevel;
  const src = level?._source.background?.src;
  if ( !src ) return null;
  const ext = src.split('?')[0].split('.').pop().toLowerCase();
  return ext in CONST.VIDEO_FILE_EXTENSIONS ? null : src;
}

/**
 * The confirmation question for a plan.
 * @param {TransformPlan} plan
 * @param {ReturnType<readState>} state
 * @returns {string}
 */
function confirmText(plan, state) {
  switch ( plan.type ) {
    case 'rotate': return loc('Confirm.Rotate');
    case 'mirror': return loc('Confirm.Mirror');
    case 'grid': return loc('Confirm.Grid');
    case 'stitch': return game.i18n.format(`${MODULE_ID}.Confirm.Stitch`, { name: foundry.utils.escapeHTML(state.other.name) });
    default: return loc(crops(state) ? 'Confirm.Crop' : 'Confirm.Pad');
  }
}

/**
 * Confirm and run the transformation, then close the window so the transformed scene can be seen.
 * @param {SceneConfig} app
 * @param {HTMLElement} tab
 * @param {HTMLButtonElement} button
 */
async function apply(app, tab, button) {
  const scene = app.document;
  const state = readState(tab);
  if ( state.mode === 'extract' ) return extract(app, state, button);
  let plan;
  try {
    plan = buildPlan(scene, state);
  } catch(err) {
    if ( !(err instanceof TransformError) ) throw err;
    ui.notifications.warn(err.message);
    return;
  }

  const lines = [confirmText(plan, state)];
  if ( plan.removeOutside ) {
    const count = countOutside(scene, plan);
    if ( count ) lines.push(game.i18n.format(`${MODULE_ID}.Confirm.Delete`, { count }));
  }
  lines.push(loc('Confirm.Unsaved'));
  if ( !state.backup ) lines.push(loc('Confirm.NoBackup'));
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: 'niks-scene-transformations.Confirm.Title', icon: 'fa-solid fa-arrows-rotate' },
    content: lines.map(l => `<p>${l}</p>`).join(''),
    rejectClose: false,
  });
  if ( !confirmed ) return;

  button.disabled = true;
  try {
    const result = await transformScene(scene, plan, { backup: state.backup, resetFog: state.resetFog });
    await app.close();
    ui.notifications.info(game.i18n.format(`${MODULE_ID}.Notify.Success`, { name: scene.name }));
    if ( result.backup ) {
      ui.notifications.info(game.i18n.format(`${MODULE_ID}.Notify.Backup`, { name: result.backup.name }));
    }
    for ( const warning of result.warnings ) ui.notifications.warn(warning);
  } catch(err) {
    console.error(`${MODULE_ID} | Transforming scene "${scene.name}" failed.`, err);
    ui.notifications.error(err instanceof TransformError ? err.message
      : game.i18n.format(`${MODULE_ID}.Error.Failed`, { error: err.message }));
  } finally {
    if ( button.isConnected ) button.disabled = false;
  }
}

/**
 * Create a new scene from the selected area. Nothing is changed here, so there's no confirmation; the window closes
 * only when the new scene is opened.
 * @param {SceneConfig} app
 * @param {ReturnType<readState>} state
 * @param {HTMLButtonElement} button
 */
async function extract(app, state, button) {
  const scene = app.document;
  const { area, name, tokens, open } = state.extract;
  button.disabled = true;
  try {
    const result = await extractScene(scene, area, { name, tokens });
    ui.notifications.info(game.i18n.format(`${MODULE_ID}.Notify.Extracted`, { name: result.scene.name }));
    for ( const warning of result.warnings ) ui.notifications.warn(warning);
    if ( open ) {
      await app.close();
      await result.scene.view();
    }
  } catch(err) {
    console.error(`${MODULE_ID} | Extracting an area of scene "${scene.name}" failed.`, err);
    ui.notifications.error(err instanceof TransformError ? err.message
      : game.i18n.format(`${MODULE_ID}.Error.ExtractFailed`, { error: err.message }));
  } finally {
    if ( button.isConnected ) button.disabled = false;
  }
}

/**
 * Confirm and restore the scene from its latest backup copy, then close the window.
 * @param {SceneConfig} app
 * @param {Scene} backup
 * @param {HTMLElement} tab
 * @param {HTMLButtonElement} button
 */
async function restore(app, backup, tab, button) {
  const scene = app.document;
  const name = foundry.utils.escapeHTML(backup.name);
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: 'niks-scene-transformations.Restore.Legend', icon: 'fa-solid fa-clock-rotate-left' },
    content: [game.i18n.format(`${MODULE_ID}.Confirm.Restore`, { name }), loc('Confirm.Unsaved')]
      .map(l => `<p>${l}</p>`).join(''),
    rejectClose: false,
  });
  if ( !confirmed ) return;

  button.disabled = true;
  try {
    await restoreBackup(scene, backup, { resetFog: field(tab, 'resetFog').checked });
    await app.close();
    ui.notifications.info(game.i18n.format(`${MODULE_ID}.Notify.Restored`, { name: scene.name }));
  } catch(err) {
    console.error(`${MODULE_ID} | Restoring scene "${scene.name}" failed.`, err);
    ui.notifications.error(err instanceof TransformError ? err.message
      : game.i18n.format(`${MODULE_ID}.Error.RestoreFailed`, { error: err.message }));
  } finally {
    if ( button.isConnected ) button.disabled = false;
  }
}
