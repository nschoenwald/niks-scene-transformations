import { MODULE_ID, TAB_ID, loc } from './config.js';
import {
  TransformError, canRotate, gridStep, planGridSize, planPadding, planRotation, transformScene,
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

  const onChange = event => {
    event.stopPropagation();
    const side = event.target.dataset.nst;
    if ( SIDES.includes(side) && field(tab, 'linked').checked ) {
      for ( const s of SIDES ) if ( s !== side ) field(tab, s).value = event.target.value;
    }
    refresh(tab, scene);
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
  return {
    mode: field(tab, 'mode').value,
    angle: Number(field(tab, 'angle').value),
    gridSize: Math.round(Number(field(tab, 'gridSize').value) || 0),
    padding: Object.fromEntries(SIDES.map(s => [s, Math.max(0, Math.floor(Number(field(tab, s).value) || 0))])),
    backup: field(tab, 'backup').checked,
    resetFog: field(tab, 'resetFog').checked,
  };
}

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

  const { width: W, height: H } = scene._source;
  const step = gridStep(scene.grid);
  let newStep = step;
  let width = W;
  let height = H;
  let left = 0;
  let top = 0;
  let rotation = 0;
  let valid;
  if ( state.mode === 'rotate' ) {
    if ( state.angle !== 180 ) [width, height] = [H, W];
    left = (width - W) / 2;
    top = (height - H) / 2;
    rotation = state.angle;
    valid = canRotate(scene);
  } else if ( state.mode === 'grid' ) {
    const k = state.gridSize / scene._source.grid.size;
    valid = (state.gridSize >= CONST.GRID_MIN_SIZE) && (k !== 1);
    if ( valid ) {
      width = Math.max(1, Math.round(W * k));
      height = Math.max(1, Math.round(H * k));
      newStep = { x: step.x * k, y: step.y * k };
    }
  } else {
    const p = state.padding;
    left = Math.round(p.left * step.x);
    top = Math.round(p.top * step.y);
    width = W + left + Math.round(p.right * step.x);
    height = H + top + Math.round(p.bottom * step.y);
    valid = SIDES.some(s => p[s] > 0);
  }

  // Preview: the new scene area, with the current map placed inside it. When the grid size changes, the map scales
  // with the scene, and the preview is sized to the larger of the two so it visibly grows or shrinks.
  const mapScale = width / W;
  const scale = state.mode === 'grid'
    ? Math.min(PREVIEW.width / Math.max(W, width), PREVIEW.height / Math.max(H, height))
    : Math.min(PREVIEW.width / width, PREVIEW.height / height);
  const area = tab.querySelector('.nst-preview-area');
  area.style.width = `${Math.round(width * scale)}px`;
  area.style.height = `${Math.round(height * scale)}px`;
  const map = tab.querySelector('.nst-preview-map');
  const mapW = state.mode === 'grid' ? W * mapScale : W;
  const mapH = state.mode === 'grid' ? H * mapScale : H;
  Object.assign(map.style, {
    left: `${(left / width) * 100}%`,
    top: `${(top / height) * 100}%`,
    width: `${(mapW / width) * 100}%`,
    height: `${(mapH / height) * 100}%`,
    transform: rotation ? `rotate(${rotation}deg)` : '',
  });
  const src = previewImage(scene);
  map.style.backgroundImage = src ? `url(${JSON.stringify(src)})` : '';
  map.classList.toggle('no-image', !src);

  const describe = (w, h, s) => game.i18n.format(`${MODULE_ID}.Size.Value`, {
    width: w, height: h, columns: Math.round(w / s.x), rows: Math.round(h / s.y),
  });
  tab.querySelector('[data-nst-size="current"]').textContent = describe(W, H, step);
  tab.querySelector('[data-nst-size="new"]').textContent = describe(width, height, newStep);
  tab.querySelector('[data-nst-apply]').disabled = !valid;
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
 * Confirm and run the transformation.
 * @param {Scene} scene
 * @param {HTMLElement} tab
 * @param {HTMLButtonElement} button
 */
async function apply(scene, tab, button) {
  const state = readState(tab);
  let plan;
  try {
    if ( state.mode === 'rotate' ) plan = planRotation(scene, state.angle);
    else if ( state.mode === 'grid' ) plan = planGridSize(scene, state.gridSize);
    else plan = planPadding(scene, state.padding);
  } catch(err) {
    if ( !(err instanceof TransformError) ) throw err;
    ui.notifications.warn(err.message);
    return;
  }

  const confirm = { rotate: 'Confirm.Rotate', grid: 'Confirm.Grid', pad: 'Confirm.Pad' }[state.mode];
  const lines = [loc(confirm), loc('Confirm.Unsaved')];
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
