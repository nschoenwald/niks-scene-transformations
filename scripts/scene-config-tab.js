import { MODULE_ID, TAB_ID, loc } from './config.js';
import {
  MIRRORS, TransformError, canRotate, countOutside, findBackup, gridStep, planGridSize, planMirror, planResize,
  planRotation, planStitch, restoreBackup, transformScene,
} from './transform.js';

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
      event => restore(scene, backup, tab, event.currentTarget));
  }

  const updateOutside = foundry.utils.debounce(() => refreshOutside(tab, scene), 200);
  const onChange = event => {
    event.stopPropagation();
    const side = event.target.dataset.nst;
    if ( SIDES.includes(side) && field(tab, 'linked').checked ) {
      for ( const s of SIDES ) if ( s !== side ) field(tab, s).value = event.target.value;
    }
    refresh(tab, scene);
    updateOutside();
  };
  tab.addEventListener('change', onChange);
  tab.addEventListener('input', onChange);
  tab.addEventListener('keydown', event => {
    if ( (event.key === 'Enter') && (event.target.tagName === 'INPUT') ) event.preventDefault();
  });
  tab.querySelector('[data-nst-apply]').addEventListener('click', event => apply(scene, tab, event.currentTarget));

  refresh(tab, scene);
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
  } else {
    const p = state.padding;
    left = Math.round(p.left * step.x);
    top = Math.round(p.top * step.y);
    width = W + left + Math.round(p.right * step.x);
    height = H + top + Math.round(p.bottom * step.y);
    valid = SIDES.some(s => p[s] !== 0) && (width >= step.x) && (height >= step.y);
    if ( !valid ) [width, height, left, top] = [W, H, 0, 0];
  }

  // Preview: the new scene area, with the current map (and an attached scene) placed inside it. Parts of the map
  // that are cut off fall outside the area and are clipped.
  scale ??= Math.min(PREVIEW.width / width, PREVIEW.height / height);
  const area = tab.querySelector('.nst-preview-area');
  area.style.width = `${Math.round(width * scale)}px`;
  area.style.height = `${Math.round(height * scale)}px`;
  const place = (rect, el, src) => {
    Object.assign(el.style, {
      left: `${(rect.x / width) * 100}%`,
      top: `${(rect.y / height) * 100}%`,
      width: `${(rect.width / width) * 100}%`,
      height: `${(rect.height / height) * 100}%`,
    });
    el.style.backgroundImage = src ? `url(${JSON.stringify(src)})` : '';
    el.classList.toggle('no-image', !src);
  };
  const map = tab.querySelector('.nst-preview-map:not(.nst-preview-other)');
  place({ x: left, y: top, width: mapW, height: mapH }, map, previewImage(scene));
  map.style.transform = transform;
  const otherMap = tab.querySelector('.nst-preview-other');
  otherMap.hidden = !otherRect;
  if ( otherRect ) place(otherRect, otherMap, previewImage(state.other));

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
 * Confirm and run the transformation.
 * @param {Scene} scene
 * @param {HTMLElement} tab
 * @param {HTMLButtonElement} button
 */
async function apply(scene, tab, button) {
  const state = readState(tab);
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
 * Confirm and restore the scene from its latest backup copy.
 * @param {Scene} scene
 * @param {Scene} backup
 * @param {HTMLElement} tab
 * @param {HTMLButtonElement} button
 */
async function restore(scene, backup, tab, button) {
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
    ui.notifications.info(game.i18n.format(`${MODULE_ID}.Notify.Restored`, { name: scene.name }));
  } catch(err) {
    console.error(`${MODULE_ID} | Restoring scene "${scene.name}" failed.`, err);
    ui.notifications.error(err instanceof TransformError ? err.message
      : game.i18n.format(`${MODULE_ID}.Error.RestoreFailed`, { error: err.message }));
  } finally {
    if ( button.isConnected ) button.disabled = false;
  }
}
