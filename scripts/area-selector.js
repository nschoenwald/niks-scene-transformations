import { extractGrid } from './transform.js';

/**
 * Choosing an area of grid spaces in the Transform tab's preview, for extracting it to a new scene.
 *
 * The area is kept in four number inputs (column and row from 1, width and height in grid spaces), which can be typed
 * into. In the preview, drag on the map to draw a new area, drag the area to move it, and drag its handles to resize
 * it. With the area focused, arrow keys move it and Shift + arrow keys resize it. Everything snaps to grid spaces.
 */

/** Inputs holding the area, by area property. */
const INPUTS = { x: 'exColumn', y: 'exRow', width: 'exWidth', height: 'exHeight' };

/** Handles and the edges each one moves. */
const HANDLES = {
  n: ['top'], s: ['bottom'], e: ['right'], w: ['left'],
  ne: ['top', 'right'], nw: ['top', 'left'], se: ['bottom', 'right'], sw: ['bottom', 'left'],
};

/**
 * @typedef GridArea
 * @property {number} x         First column, from 0.
 * @property {number} y         First row, from 0.
 * @property {number} width     Columns.
 * @property {number} height    Rows.
 */

/**
 * Read the area from the inputs.
 * @param {HTMLElement} tab
 * @returns {GridArea}
 */
export function readArea(tab) {
  const value = key => Math.trunc(Number(tab.querySelector(`[data-nst="${INPUTS[key]}"]`).value) || 0);
  return { x: value('x') - 1, y: value('y') - 1, width: value('width'), height: value('height') };
}

/**
 * Write an area to the inputs, kept within the scene.
 * @param {HTMLElement} tab
 * @param {Scene} scene
 * @param {GridArea} area
 */
export function writeArea(tab, scene, area) {
  const a = clampArea(scene, area);
  const values = { x: a.x + 1, y: a.y + 1, width: a.width, height: a.height };
  for ( const [key, name] of Object.entries(INPUTS) ) tab.querySelector(`[data-nst="${name}"]`).value = values[key];
}

/**
 * Keep an area within the grid spaces of the scene, at least one grid space large.
 * @param {Scene} scene
 * @param {GridArea} area
 * @returns {GridArea}
 */
export function clampArea(scene, { x, y, width, height }) {
  const { columns, rows } = extractGrid(scene);
  width = Math.clamp(width || 1, 1, columns);
  height = Math.clamp(height || 1, 1, rows);
  return { x: Math.clamp(x, 0, columns - width), y: Math.clamp(y, 0, rows - height), width, height };
}

/**
 * A starting area: the middle half of the scene.
 * @param {Scene} scene
 * @returns {GridArea}
 */
export function defaultArea(scene) {
  const { columns, rows } = extractGrid(scene);
  const width = Math.max(1, Math.round(columns / 2));
  const height = Math.max(1, Math.round(rows / 2));
  return { x: Math.floor((columns - width) / 2), y: Math.floor((rows - height) / 2), width, height };
}

/**
 * Set the inputs' limits and attach the pointer and keyboard handlers.
 * @param {HTMLElement} tab
 * @param {Scene} scene
 * @param {() => void} onChange     Called whenever the area changes.
 */
export function wireAreaSelector(tab, scene, onChange) {
  const { columns, rows } = extractGrid(scene);
  const limits = { x: columns, y: rows, width: columns, height: rows };
  for ( const [key, name] of Object.entries(INPUTS) ) {
    const input = tab.querySelector(`[data-nst="${name}"]`);
    input.min = 1;
    input.max = limits[key];
  }
  writeArea(tab, scene, defaultArea(scene));

  const area = tab.querySelector('.nst-preview-area');
  const selection = tab.querySelector('.nst-preview-select');
  const set = next => {
    writeArea(tab, scene, next);
    onChange();
  };

  // Typed values: keep them in range once the input is done
  for ( const name of Object.values(INPUTS) ) {
    tab.querySelector(`[data-nst="${name}"]`).addEventListener('change', () => set(readArea(tab)));
  }

  // Dragging
  let drag = null;
  area.addEventListener('pointerdown', event => {
    if ( !area.classList.contains('nst-selecting') || (event.button !== 0) ) return;
    event.preventDefault();
    const cell = cellAt(event, area, scene);
    const current = readArea(tab);
    const handle = event.target.closest('[data-nst-handle]')?.dataset.nstHandle;
    if ( handle ) drag = { type: 'resize', edges: HANDLES[handle], start: current };
    else if ( event.target.closest('.nst-preview-select') ) drag = { type: 'move', from: cell, start: current };
    else {
      drag = { type: 'draw', from: cell };
      set({ x: cell.x, y: cell.y, width: 1, height: 1 });
    }
    area.setPointerCapture(event.pointerId);
    area.classList.add('nst-dragging');
    selection.focus({ preventScroll: true });
  });
  area.addEventListener('pointermove', event => {
    if ( !drag ) return;
    const cell = cellAt(event, area, scene);
    const next = dragArea(drag, cell);
    const current = readArea(tab);
    if ( ['x', 'y', 'width', 'height'].some(k => next[k] !== current[k]) ) set(next);
  });
  const end = event => {
    if ( !drag ) return;
    drag = null;
    area.classList.remove('nst-dragging');
    if ( area.hasPointerCapture(event.pointerId) ) area.releasePointerCapture(event.pointerId);
  };
  area.addEventListener('pointerup', end);
  area.addEventListener('pointercancel', end);

  // Keyboard: arrows move, Shift + arrows resize
  selection.addEventListener('keydown', event => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if ( !step ) return;
    event.preventDefault();
    event.stopPropagation();
    const a = readArea(tab);
    if ( event.shiftKey ) set({ ...a, width: a.width + step[0], height: a.height + step[1] });
    else set({ ...a, x: a.x + step[0], y: a.y + step[1] });
  });
}

/**
 * The area resulting from a drag that reached a grid space.
 * @param {object} drag
 * @param {{x: number, y: number}} cell
 * @returns {GridArea}
 */
function dragArea(drag, cell) {
  switch ( drag.type ) {
    case 'draw': return {
      x: Math.min(drag.from.x, cell.x), y: Math.min(drag.from.y, cell.y),
      width: Math.abs(cell.x - drag.from.x) + 1, height: Math.abs(cell.y - drag.from.y) + 1,
    };
    case 'move': return { ...drag.start, x: drag.start.x + cell.x - drag.from.x, y: drag.start.y + cell.y - drag.from.y };
    default: {
      // Move the dragged edges to the grid space under the pointer, never past the opposite edge
      const s = drag.start;
      let left = s.x;
      let top = s.y;
      let right = s.x + s.width - 1;
      let bottom = s.y + s.height - 1;
      if ( drag.edges.includes('left') ) left = Math.min(cell.x, right);
      if ( drag.edges.includes('right') ) right = Math.max(cell.x, left);
      if ( drag.edges.includes('top') ) top = Math.min(cell.y, bottom);
      if ( drag.edges.includes('bottom') ) bottom = Math.max(cell.y, top);
      return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
    }
  }
}

/**
 * The grid space under the pointer, kept within the scene.
 * @param {PointerEvent} event
 * @param {HTMLElement} area    The preview area, which shows the scene rectangle.
 * @param {Scene} scene
 * @returns {{x: number, y: number}}
 */
function cellAt(event, area, scene) {
  const g = extractGrid(scene);
  const box = area.getBoundingClientRect();
  const px = g.rect.x + (((event.clientX - box.left) / box.width) * g.rect.width);
  const py = g.rect.y + (((event.clientY - box.top) / box.height) * g.rect.height);
  return {
    x: Math.clamp(Math.floor(px / g.size) - g.column, 0, g.columns - 1),
    y: Math.clamp(Math.floor(py / g.size) - g.row, 0, g.rows - 1),
  };
}

/**
 * Draw the grid and the area in the preview, which shows the scene rectangle at the given scale.
 * @param {HTMLElement} tab
 * @param {Scene} scene
 * @param {GridArea} area
 * @param {number} scale    Preview pixels per scene pixel.
 */
export function renderAreaSelection(tab, scene, area, scale) {
  const g = extractGrid(scene);
  const { rect } = g;
  const grid = tab.querySelector('.nst-preview-grid');
  const cell = g.size * scale;
  // Grid lines closer than this many pixels would only blur the map
  grid.hidden = cell < 6;
  if ( !grid.hidden ) {
    const offsetX = ((g.column * g.size) - rect.x) * scale;
    const offsetY = ((g.row * g.size) - rect.y) * scale;
    grid.style.backgroundSize = `${cell}px ${cell}px`;
    grid.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
  }
  const selection = tab.querySelector('.nst-preview-select');
  Object.assign(selection.style, {
    left: `${((((g.column + area.x) * g.size) - rect.x) / rect.width) * 100}%`,
    top: `${((((g.row + area.y) * g.size) - rect.y) / rect.height) * 100}%`,
    width: `${((area.width * g.size) / rect.width) * 100}%`,
    height: `${((area.height * g.size) / rect.height) * 100}%`,
  });
}
