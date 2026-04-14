const catalog = {
  finishes: ['White', 'Black'],
  widths: [40, 60, 80],
  spines: [
    { code: 'H42', height: 42, bestFor: 'Small Shelves', price: 700 },
    { code: 'H63', height: 63, bestFor: 'Bedside, entryway', price: 1000 },
    { code: 'H105', height: 105, bestFor: 'Living room, study', price: 1500 },
    { code: 'H147', height: 147, bestFor: 'Full bookshelf', price: 2100 },
    { code: 'H189', height: 189, bestFor: 'Floor to eye-level', price: 2600 },
  ],
  shelves: {
    40: { 15: 1700, 25: 2200, 35: 2700 },
    60: { 15: 2000, 25: 2700, 35: 3300 },
    80: { 15: 2400, 25: 3200, 35: 3900 },
  },
  kits: [
    { id: 'kit-a', label: 'Kit A', width: 40, topDepth: 15, bottomDepth: 15, spineHeight: 42, price: 4400, description: 'Compact bedside or entryway starter.' },
    { id: 'kit-b', label: 'Kit B', width: 60, topDepth: 15, bottomDepth: 15, spineHeight: 63, price: 5500, description: 'Balanced desk, kitchen, or display setup.' },
    { id: 'kit-c', label: 'Kit C', width: 60, topDepth: 15, bottomDepth: 25, spineHeight: 63, price: 6100, description: 'Mix of shallow top and deeper bottom shelf.' },
    { id: 'kit-d', label: 'Kit D', width: 80, topDepth: 15, bottomDepth: 15, spineHeight: 63, price: 6100, description: 'Wide display or bookshelf starter.' },
    { id: 'kit-e', label: 'Kit E', width: 80, topDepth: 15, bottomDepth: 25, spineHeight: 63, price: 6900, description: 'Most versatile wide starter kit in the catalog.' },
  ],
  notes: [
    'Drawers are listed as planned modules in 40, 60, and 80 cm widths with 30 cm depth and soft-close, but pricing is still marked coming soon.',
    'Every custom bay needs two spines, but neighboring bays share one middle spine, so total spines always equal bay count plus one.',
    'The catalog does not include exact hole spacing, pin counts, or installation fixture dimensions, so this shelving system keeps those as informational rather than calculated.',
    'Preview geometry uses a 25 mm spine width, 9 mm pin diameter, 70 mm hole spacing, and a 100 mm shelf profile with a 15 mm folded lip.',
  ],
};

const SPINE_WIDTH_MM = 25;
const PIN_WIDTH_MM = 9;
const HOLE_PITCH_MM = 70;
const FIRST_HOLE_MM = 104;
const SHELF_HEIGHT_MM = 110;
// Visual height used only for rendering/drag-ghost. The shelf mount point is still
// SHELF_HEIGHT_MM (110) from the hole, but the downturned lip adds 16.5 mm below that,
// so the *drawn* shelf is 126.5 mm tall. The top (mount) edge stays aligned to the hole —
// only the bottom extends further down. Slot-occupancy math continues to use SHELF_HEIGHT_MM.
const SHELF_VISUAL_HEIGHT_MM = 126.5;
const SHELF_THICKNESS_MM = 1.5;
const SHELF_LIP_MM = 15;
const DRAWER_HEIGHT_MM = 320; // physical + visual height of a (single or double) drawer
const DEFAULT_TOP_SHELF_MM = 1700;
const DEFAULT_HUMAN_REFERENCE_CM = 178;
const EUR_TO_INR_REFERENCE = 98.91;
const USD_TO_INR_REFERENCE = 85.60;
const FOREIGN_CURRENCY_MARKUP = 1.4;

const state = {
  wallWidth: 180,
  wallHeight: 120,
  displayUnit: 'cm',
  finish: 'White',
  spineHeight: 63,
  topShelfMm: DEFAULT_TOP_SHELF_MM,
  humanReferenceCm: DEFAULT_HUMAN_REFERENCE_CM,
  layoutLeftMm: null,
  editingDimension: null,
  editingDimensionSource: null,
  totalCurrency: 'INR',
  totalCurrencyMenuOpen: false,
  interactionError: '',
  selectedKitId: null,
  selectedBayId: null,
  selectedModuleIndex: null,
  bays: [], // Start empty — user builds from scratch
};

let dragState = null;
let bayDragState = null;
let suppressModuleClickUntil = 0;
let topLineDragState = null;
let wallResizeDragState = null;
let lastAppliedWidth  = null; // set in wireControls, hoisted so auto-expand can sync
let lastAppliedHeight = null;

/* ── UNDO / REDO HISTORY ─────────────────────────────────────────────
   Call pushHistory() at the top of any function that mutates state.
   Keeps the last HISTORY_LIMIT snapshots. Undo restores them in order.
   ──────────────────────────────────────────────────────────────────── */
const HISTORY_LIMIT = 10;
let historyStack = [];   // past snapshots (oldest first)
let futureStack  = [];   // redo snapshots (most recent first)

function snapshotState() {
  // Deep-clone just the parts of state that can be undone
  return JSON.parse(JSON.stringify({
    wallWidth:      state.wallWidth,
    wallHeight:     state.wallHeight,
    finish:         state.finish,
    spineHeight:    state.spineHeight,
    topShelfMm:     state.topShelfMm,
    layoutLeftMm:   state.layoutLeftMm,
    bays:           state.bays,
    selectedKitId:  state.selectedKitId,
    selectedBayId:  state.selectedBayId,
    selectedModuleIndex: state.selectedModuleIndex,
  }));
}

function restoreSnapshot(snapshot) {
  Object.assign(state, snapshot);
}

function pushHistory() {
  historyStack.push(snapshotState());
  if (historyStack.length > HISTORY_LIMIT) historyStack.shift();
  futureStack = []; // new action clears redo stack
}

function undo() {
  if (historyStack.length === 0) return;
  futureStack.push(snapshotState());
  restoreSnapshot(historyStack.pop());
  render();
}

function redo() {
  if (futureStack.length === 0) return;
  historyStack.push(snapshotState());
  restoreSnapshot(futureStack.pop());
  render();
}

function clearDropTargets() {
  document.querySelectorAll('.preview-track.is-drop-target').forEach((track) => {
    track.classList.remove('is-drop-target');
  });
  document.querySelectorAll('.preview-slot-indicator').forEach((indicator) => {
    indicator.hidden = true;
    indicator.style.top = '';
  });
}

function paintDragPreview(track, slot, label, moduleType = 'shelf', moduleVariant = 'single') {
  clearDragPreview();
  if (!track || !Number.isInteger(slot)) return;
  const { slotHeight, holeStart, slotCount } = getTrackSlotMetrics(track);
  if (!Number.isFinite(slotHeight) || slotHeight <= 0) return;
  const trackHeight = track.offsetHeight;
  let previewHeight, bottom;
  if (moduleType === 'drawer') {
    previewHeight = DRAWER_HEIGHT_MM * (slotHeight / HOLE_PITCH_MM);
    bottom = slot * slotHeight; // bottom-anchored: slot 0 = flush with spine bottom
  } else {
    previewHeight = SHELF_VISUAL_HEIGHT_MM * (slotHeight / HOLE_PITCH_MM);
    const rowFromTop = (slotCount - 1) - slot;
    const topAlignedToHole = holeStart + (rowFromTop * slotHeight);
    bottom = Math.max(0, trackHeight - (topAlignedToHole + previewHeight));
  }
  const preview = document.createElement('div');
  preview.className = 'drag-preview-module';
  if (moduleType === 'drawer') {
    preview.dataset.type = 'drawer';
    if (moduleVariant === 'double') preview.classList.add('is-double-drawer');
  }
  preview.innerHTML = `<div class="preview-module-title">${label}</div>`;
  preview.style.bottom = bottom + 'px';
  preview.style.height = previewHeight + 'px';
  track.appendChild(preview);
}

function clearDragPreview() {
  document.querySelectorAll('.drag-preview-module').forEach((el) => el.remove());
}

function clearDragState() {
  if (dragState?.button) {
    dragState.button.style.transform = '';
    dragState.button.classList.remove('is-dragging');
  }
  clearDragPreview();
  clearDropTargets();
  document.documentElement.classList.remove('is-module-dragging');
  dragState = null;
}

function clearBayDragState() {
  if (bayDragState?.element) {
    bayDragState.element.style.transform = '';
    bayDragState.element.classList.remove('is-dragging');
  }
  bayDragState = null;
}

function moveBayToIndex(bayId, targetIndex) {
  pushHistory();
  const fromIndex = state.bays.findIndex((bay) => bay.id === bayId);
  if (fromIndex < 0) return;
  const boundedTarget = Math.max(0, Math.min(state.bays.length - 1, targetIndex));
  if (fromIndex === boundedTarget) return;
  const nextBays = [...state.bays];
  const [movedBay] = nextBays.splice(fromIndex, 1);
  nextBays.splice(boundedTarget, 0, movedBay);
  state.bays = nextBays;
  state.selectedBayId = bayId;
  render();
}

function getTrackSlotMetrics(track) {
  const slotCount = Number(track.dataset.slotCount || 0) || getSlotCount();
  const inlineSlotHeight = parseFloat(track.style.getPropertyValue('--slot-height'));
  const computedSlotHeight = parseFloat(getComputedStyle(track).getPropertyValue('--slot-height'));
  const slotHeight = Number.isFinite(inlineSlotHeight)
    ? inlineSlotHeight
    : computedSlotHeight;
  const inlineHoleStart = parseFloat(track.style.getPropertyValue('--hole-start'));
  const computedHoleStart = parseFloat(getComputedStyle(track).getPropertyValue('--hole-start'));
  const holeStart = Number.isFinite(inlineHoleStart)
    ? inlineHoleStart
    : Number.isFinite(computedHoleStart)
      ? computedHoleStart
      : (slotHeight / 2);

  return {
    slotCount,
    slotHeight,
    holeStart,
    rect: track.getBoundingClientRect(),
  };
}

function getNearestHoleSlot(track, clientY, { strict = false, minSlot = 0, maxSlot = null } = {}) {
  const { rect, slotCount, slotHeight, holeStart } = getTrackSlotMetrics(track);
  if (!Number.isFinite(slotHeight) || slotHeight <= 0) return null;
  const resolvedMaxSlot = Number.isInteger(maxSlot) ? maxSlot : slotCount - 1;
  const resolvedMinSlot = Math.max(0, Math.min(resolvedMaxSlot, minSlot));
  const maxRowFromTop = (slotCount - 1) - resolvedMaxSlot;
  const minRowFromTop = (slotCount - 1) - resolvedMinSlot;
  const topLimitY = rect.top + holeStart + (maxRowFromTop * slotHeight) - (slotHeight / 2);
  const bottomLimitY = rect.top + holeStart + (minRowFromTop * slotHeight) + (slotHeight / 2);
  if (strict && (clientY < topLimitY || clientY > bottomLimitY)) return null;

  const yFromTop = Math.max(0, Math.min(rect.height, clientY - rect.top));
  const rowFromTop = Math.round((yFromTop - holeStart) / slotHeight);
  const clampedRowFromTop = Math.max(maxRowFromTop, Math.min(minRowFromTop, rowFromTop));
  return (slotCount - 1) - clampedRowFromTop;
}

function paintDropTarget(track, slot) {
  clearDropTargets();
  if (!track || !Number.isInteger(slot)) return;

  const { rect, slotHeight, holeStart, slotCount } = getTrackSlotMetrics(track);
  if (!Number.isFinite(slotHeight) || slotHeight <= 0) return;

  track.classList.add('is-drop-target');
  const indicator = track.querySelector('.preview-slot-indicator');
  if (!indicator) return;

  const rowFromTop = (slotCount - 1) - slot;
  const top = holeStart + (rowFromTop * slotHeight);
  indicator.hidden = false;
  indicator.style.top = `${top}px`;
}

function handleDragMove(event) {
  if (bayDragState?.active) {
    const deltaX = event.clientX - bayDragState.startX;
    if (Math.abs(deltaX) > 4) {
      bayDragState.didDrag = true;
    }
    if (bayDragState.element) {
      bayDragState.element.style.transform = `translateX(${deltaX}px)`;
    }
    const bayShells = Array.from(document.querySelectorAll('.preview-bay-shell[data-bay-id]'));
    const otherShells = bayShells.filter((shell) => shell.dataset.bayId !== bayDragState.bayId);
    const draggedCenterX = bayDragState.originCenterX + deltaX;
    const targetIndex = otherShells.findIndex((shell) => {
      const rect = shell.getBoundingClientRect();
      return draggedCenterX < (rect.left + rect.right) / 2;
    });
    const nextTargetIndex = targetIndex === -1 ? otherShells.length : targetIndex;
    bayDragState.targetIndex = nextTargetIndex;
    if (bayDragState.didDrag && Number.isInteger(nextTargetIndex) && bayDragState.currentIndex !== nextTargetIndex) {
      moveBayToIndex(bayDragState.bayId, nextTargetIndex);
      requestAnimationFrame(() => {
        const nextShell = document.querySelector(`.preview-bay-shell[data-bay-id="${bayDragState?.bayId}"]`);
        if (bayDragState && nextShell) {
          bayDragState.element = nextShell;
          bayDragState.currentIndex = nextTargetIndex;
          bayDragState.startX = event.clientX;
          const nextRect = nextShell.getBoundingClientRect();
          bayDragState.originCenterX = (nextRect.left + nextRect.right) / 2;
          nextShell.classList.add('is-dragging');
          nextShell.style.transform = 'translateX(0px)';
        }
      });
    }
    return;
  }

  if (wallResizeDragState?.active) {
    const nextWidth = Math.round(wallResizeDragState.startWidth + (event.clientX - wallResizeDragState.startX) / wallResizeDragState.pxPerCmX);
    const nextHeight = Math.round(wallResizeDragState.startHeight - (event.clientY - wallResizeDragState.startY) / wallResizeDragState.pxPerCmY);
    state.wallWidth = Math.max(40, nextWidth);
    state.wallHeight = Math.max(42, nextHeight);
    state.layoutLeftMm = null;
    state.editingDimension = null;
    state.editingDimensionSource = null;
    setInteractionError('');
    render();
    return;
  }

  if (topLineDragState?.active) {
    const wallPlane = document.querySelector('.preview-wall-plane');
    if (!wallPlane || !Number.isFinite(topLineDragState.pxPerMm) || topLineDragState.pxPerMm <= 0) return;
    const rect = wallPlane.getBoundingClientRect();
    const mmFromBottom = (rect.bottom - event.clientY) / topLineDragState.pxPerMm;
    const minTopMm = getTopShelfBoundsMm().min;
    if (mmFromBottom < minTopMm) {
      setInteractionError(`Top limit cannot be less than spine height of ${formatLengthMm(minTopMm)}.`);
    } else {
      setInteractionError('');
    }
    setTopShelfMm(mmFromBottom, { snap: false });
    render();
    return;
  }

  if (!dragState) return;
  const deltaY = event.clientY - dragState.startY;
  const deltaX = dragState.startX != null ? event.clientX - dragState.startX : 0;
  if (Math.abs(deltaY) > 4 || Math.abs(deltaX) > 4) {
    dragState.didDrag = true;
  }

  const pointerTrack = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.preview-track');
  const activeTrack = pointerTrack || dragState.hoveredTrack || dragState.button?.closest('.preview-track');
  if (!activeTrack) return;
  const movingBay = state.bays.find((bay) => bay.id === dragState.bayId);
  const movingModule = movingBay?.modules[dragState.moduleIndex];
  const isDraggingDrawer = dragState.moduleType === 'drawer';
  const minimumSlot = getMinimumSlot(movingModule || { type: 'shelf', depth: 15 });

  let hoveredSlot;
  if (isDraggingDrawer) {
    const { slotHeight } = getTrackSlotMetrics(activeTrack);
    if (!Number.isFinite(slotHeight) || slotHeight <= 0) return;
    const drawerHeightPx = DRAWER_HEIGHT_MM * (slotHeight / HOLE_PITCH_MM);
    const trackRect = activeTrack.getBoundingClientRect();
    // Cursor is at the drawer top; compute where the drawer bottom would land
    const rawSlot = Math.round((trackRect.bottom - event.clientY - drawerHeightPx) / slotHeight);
    const maxSlot = getModuleMaxSlot({ type: 'drawer' });
    hoveredSlot = Math.max(0, Math.min(maxSlot, rawSlot));
  } else {
    const maximumSlot = getSlotCount() - 1;
    hoveredSlot = getNearestHoleSlot(activeTrack, event.clientY, {
      strict: true,
      minSlot: minimumSlot,
      maxSlot: maximumSlot,
    });
  }
  if (!Number.isInteger(hoveredSlot)) {
    return;
  }
  dragState.hoveredTrack = activeTrack;
  dragState.hoveredSlot = hoveredSlot;
  dragState.hoveredBayId = activeTrack.dataset.trackClick || dragState.bayId;
  paintDropTarget(activeTrack, hoveredSlot);

  const isCrossBay = dragState.hoveredBayId && dragState.hoveredBayId !== dragState.bayId;

  if (!isCrossBay && dragState.button && Number.isInteger(hoveredSlot) && Number.isInteger(dragState.originSlot)) {
    // Same-bay: snap original button to slot position
    const slotHeight = parseFloat(activeTrack.style.getPropertyValue('--slot-height')) || parseFloat(getComputedStyle(activeTrack).getPropertyValue('--slot-height'));
    if (Number.isFinite(slotHeight) && slotHeight > 0) {
      const snappedDelta = (dragState.originSlot - hoveredSlot) * slotHeight;
      dragState.button.style.transform = `translateY(${snappedDelta}px)`;
    }
  } else if (isCrossBay && dragState.button) {
    // Cross-bay: reset original button, show preview on target track
    dragState.button.style.transform = '';
    paintDragPreview(activeTrack, hoveredSlot, dragState.ghostLabel || 'Module', dragState.moduleType || 'shelf', dragState.moduleVariant || 'single');
  }

  // Clear preview if we return to same bay
  if (!isCrossBay && !dragState.isSidebarDrag) {
    clearDragPreview();
  }
}

function handleDragEnd(event) {
  if (bayDragState?.active) {
    clearBayDragState();
    suppressModuleClickUntil = Date.now() + 250;
    return;
  }

  if (wallResizeDragState?.active) {
    wallResizeDragState = null;
    return;
  }

  if (topLineDragState?.active) {
    topLineDragState = null;
    return;
  }

  if (!dragState) return;
  const { bayId, moduleIndex, button, didDrag, hoveredTrack, hoveredSlot, hoveredBayId, isSidebarDrag, sidebarComponent } = dragState;
  const track = hoveredTrack
    || document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.preview-track')
    || button?.closest?.('.preview-track');

  if (didDrag && track) {
    const targetBayId = track.dataset.trackClick || hoveredBayId || bayId;
    let slot;
    if (Number.isInteger(hoveredSlot)) {
      slot = hoveredSlot;
    } else if (dragState.moduleType === 'drawer') {
      const { slotHeight } = getTrackSlotMetrics(track);
      if (Number.isFinite(slotHeight) && slotHeight > 0) {
        const drawerHeightPx = DRAWER_HEIGHT_MM * (slotHeight / HOLE_PITCH_MM);
        const trackRect = track.getBoundingClientRect();
        const rawSlot = Math.round((trackRect.bottom - event.clientY - drawerHeightPx) / slotHeight);
        slot = Math.max(0, Math.min(getModuleMaxSlot({ type: 'drawer' }), rawSlot));
      }
    } else {
      slot = getNearestHoleSlot(track, event.clientY);
    }
    if (!Number.isInteger(slot)) {
      clearDragState();
      return;
    }
    suppressModuleClickUntil = Date.now() + 250;
    clearDragState();

    if (isSidebarDrag && sidebarComponent) {
      // Dropping a new component from the sidebar
      addModuleAtBaySlot(targetBayId, sidebarComponent, slot);
    } else if (targetBayId && targetBayId !== bayId) {
      // Cross-bay move
      moveModuleToBay(bayId, moduleIndex, targetBayId, slot);
    } else {
      // Same-bay move
      moveModuleToSlot(bayId, moduleIndex, slot);
    }
    return;
  }

  clearDragState();
}

const wallWidthInput = document.getElementById('wall-width');
const wallHeightInput = document.getElementById('wall-height');
const unitSelect = document.getElementById('unit-select');
const finishButtons = document.querySelectorAll('.finish-btn'); // replaces finish-select dropdown
const spineSelect = document.getElementById('spine-select');
const widthOptions = document.getElementById('width-options');
const bayList = document.getElementById('bay-list');
const kitOptions = document.getElementById('kit-options');
const catalogNotes = document.getElementById('catalog-notes');
const statWidth = document.getElementById('stat-width');
const statSpines = document.getElementById('stat-spines');
const statShelves = document.getElementById('stat-shelves');
const statTotal = document.getElementById('stat-total');
const statTotalBomBtn = document.getElementById('stat-total-bom');
const totalCurrencyMenu = document.getElementById('total-currency-menu');
const stageEstimatorNote = document.getElementById('stage-estimator-note');
const downloadPdfButton = document.getElementById('download-pdf');
const shareDesignButton = document.getElementById('share-design-btn');
const layoutPreview = document.getElementById('layout-preview');
const previewInspector = document.getElementById('preview-inspector');
const bomList = document.getElementById('bom-list');
const recommendations = document.getElementById('recommendations');
const appShell = document.querySelector('.app-shell');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebarReveal = document.getElementById('sidebar-reveal');
const centerLayoutButton = document.getElementById('center-layout');
const topLineInput = document.getElementById('top-line-input');
const wallWidthLabel = document.getElementById('wall-width-label');
const wallHeightLabel = document.getElementById('wall-height-label');
const topLineLabel = document.getElementById('top-line-label');
const interactionError = document.getElementById('interaction-error');
const CONFIG_ID_VERSION = 2;

function formatNumber(value, maximumFractionDigits = 1) {
  const rounded = Number(value.toFixed(maximumFractionDigits));
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(rounded);
}

function formatLengthCm(cm) {
  if (state.displayUnit === 'in') {
    return `${formatNumber(cm / 2.54)} in`;
  }
  return `${formatNumber(cm)} cm`;
}

function formatLengthMm(mm) {
  if (state.displayUnit === 'in') {
    return `${formatNumber(mm / 25.4)} in`;
  }
  return `${formatNumber(mm / 10)} cm`;
}

function formatFeetAndInchesFromCm(cm) {
  const totalInches = Math.max(1, Math.round(cm / 2.54));
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}' ${inches}"`;
}

function wallLengthToDisplay(cm) {
  return state.displayUnit === 'in' ? cm / 2.54 : cm;
}

function displayToWallLength(value) {
  return state.displayUnit === 'in' ? value * 2.54 : value;
}

function topLineToDisplay(mm) {
  return state.displayUnit === 'in' ? mm / 25.4 : mm / 10;
}

function displayToTopLine(value) {
  return state.displayUnit === 'in' ? value * 25.4 : value * 10;
}

function mmToDisplayLength(mm) {
  return topLineToDisplay(mm);
}

function displayLengthToMm(value) {
  return displayToTopLine(value);
}

function getDisplayStepForTopLine() {
  return state.displayUnit === 'in' ? 0.25 : 0.5;
}

function getDisplayStepForSpacing() {
  return state.displayUnit === 'in' ? 0.25 : 1;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function convertInrTotal(value, currency) {
  if (currency === 'USD') {
    return Math.ceil((value * FOREIGN_CURRENCY_MARKUP) / USD_TO_INR_REFERENCE);
  }
  if (currency === 'EUR') {
    return Math.ceil((value * FOREIGN_CURRENCY_MARKUP) / EUR_TO_INR_REFERENCE);
  }
  return Math.ceil(value);
}

function formatConvertedCurrency(value, currency) {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(convertInrTotal(value, currency));
  }
  if (currency === 'EUR') {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(convertInrTotal(value, currency));
  }
  return formatCurrency(value);
}

function formatTotalValue(summary, currency = state.totalCurrency) {
  const value = formatConvertedCurrency(summary.total, currency);
  return summary.hasDrawerPricingGap ? `${value} + drawers` : value;
}

function getShippingDisplay(summary, currency = state.totalCurrency) {
  if (!qualifiesForFreeShipping(summary)) {
    return null;
  }
  if (currency === 'INR') {
    return {
      meta: 'Free shipping • Included above ₹3,500',
      value: 'Free',
    };
  }
  return {
    meta: 'Shipping charged separately for international orders',
    value: 'On actuals',
  };
}

function renderTotalCurrencyMenu(summary) {
  if (!totalCurrencyMenu) return;

  totalCurrencyMenu.innerHTML = ['INR', 'USD', 'EUR']
    .map((currency) => `
      <button
        class="estimator-currency-option ${state.totalCurrency === currency ? 'is-active' : ''}"
        type="button"
        data-total-currency="${currency}"
      >
        <span class="estimator-currency-code">${currency}</span>
        <span class="estimator-currency-value">${formatTotalValue(summary, currency)}</span>
      </button>
    `)
    .join('');

  totalCurrencyMenu.hidden = !state.totalCurrencyMenuOpen;
  if (statTotalBomBtn) statTotalBomBtn.setAttribute('aria-expanded', String(state.totalCurrencyMenuOpen));
}

function sanitizeCustomerName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '');
}

function encodeConfigId(snapshot) {
  return btoa(JSON.stringify(snapshot))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeConfigId(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return JSON.parse(atob(padded));
}

function createConfigSnapshot() {
  return {
    v: CONFIG_ID_VERSION,
    d: state.displayUnit === 'in' ? 1 : 0,
    f: catalog.finishes.indexOf(state.finish),
    w: Math.round(state.wallWidth * 10),
    h: Math.round(state.wallHeight * 10),
    u: Math.round(state.humanReferenceCm * 10),
    s: Math.round(state.spineHeight * 10),
    t: Math.round(state.topShelfMm),
    l: Number.isFinite(state.layoutLeftMm) ? Math.round(state.layoutLeftMm) : null,
    c: state.totalCurrency,
    b: state.bays.map((bay) => [
      bay.width,
      bay.modules.map((module) => [
        module.type === 'drawer' ? 1 : 0,
        module.depth,
        module.slot,
      ]),
    ]),
  };
}

function getCurrentConfigId() {
  return encodeConfigId(createConfigSnapshot());
}

function buildShareLink() {
  return `${location.origin}${location.pathname}#c=${getCurrentConfigId()}`;
}

// Look for `#c=...` in the URL hash on page load and hydrate state from it.
// Returns true if a share link was successfully loaded, false otherwise.
// If the link is malformed or references catalog items that no longer exist,
// alerts the user and falls back to default state. Share links are intended
// to live for days/weeks/maybe a month — no migration logic by design.
function loadFromShareLinkIfPresent() {
  const hash = location.hash || '';
  const match = hash.match(/^#c=(.+)$/);
  if (!match) return false;
  try {
    const snapshot = decodeConfigId(match[1]);
    applyConfigSnapshot(snapshot);
    // Clear the hash so subsequent reloads don't re-apply the shared design
    // after the user has made changes.
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  } catch {
    alert("This share link couldn't be loaded — it may be from an older version of the shelving system or reference items that are no longer available.");
    history.replaceState(null, '', location.pathname + location.search);
    return false;
  }
}

function applyConfigSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Invalid setup ID.');
  }
  if (!snapshot.v || snapshot.v > CONFIG_ID_VERSION) {
    throw new Error('This setup ID version is not supported.');
  }

  if ((snapshot.v === 1 || snapshot.v === 2) && Array.isArray(snapshot.b)) {
    if (!snapshot.b.length) {
      throw new Error('This setup ID does not contain any bays.');
    }

    state.wallWidth = Math.max(70, (Number(snapshot.w) || 1800) / 10);
    state.wallHeight = Math.max(65, (Number(snapshot.h) || 2600) / 10);
    state.humanReferenceCm = Math.max(120, ((Number(snapshot.u) || (DEFAULT_HUMAN_REFERENCE_CM * 10))) / 10);
    state.displayUnit = snapshot.d === 1 ? 'in' : 'cm';
    state.finish = catalog.finishes[Number(snapshot.f)] || catalog.finishes[0];
    state.spineHeight = (Number(snapshot.s) || 1050) / 10;
    state.topShelfMm = Number(snapshot.t) || DEFAULT_TOP_SHELF_MM;
    state.layoutLeftMm = Number.isFinite(snapshot.l) ? snapshot.l : null;
    state.totalCurrency = ['INR', 'USD', 'EUR'].includes(snapshot.c) ? snapshot.c : 'INR';
    state.selectedKitId = null;
    state.editingDimension = null;
    state.editingDimensionSource = null;
    state.selectedBayId = null;
    state.selectedModuleIndex = null;
    state.bays = snapshot.b.map((bay) => ({
      id: crypto.randomUUID(),
      width: catalog.widths.includes(Number(bay[0])) ? Number(bay[0]) : catalog.widths[0],
      modules: Array.isArray(bay[1]) && bay[1].length
        ? bay[1].map((module) => ({
          type: Number(module[0]) === 1 ? 'drawer' : 'shelf',
          depth: Number(module[0]) === 1
            ? 30
            : [15, 25, 35].includes(Number(module[1]))
              ? Number(module[1])
              : 15,
          slot: Number.isInteger(module[2]) ? module[2] : 0,
        }))
        : [{ type: 'shelf', depth: 15, slot: 0 }],
    }));
    setInteractionError('');
    return;
  }

  if (!Array.isArray(snapshot.bays) || !snapshot.bays.length) {
    throw new Error('This setup ID does not contain any bays.');
  }

  state.wallWidth = Math.max(70, Number(snapshot.wallWidth) || 180);
  state.wallHeight = Math.max(65, Number(snapshot.wallHeight) || 260);
  state.humanReferenceCm = Math.max(120, Number(snapshot.humanReferenceCm) || DEFAULT_HUMAN_REFERENCE_CM);
  state.displayUnit = snapshot.displayUnit === 'in' ? 'in' : 'cm';
  state.finish = catalog.finishes.includes(snapshot.finish) ? snapshot.finish : catalog.finishes[0];
  state.spineHeight = Number(snapshot.spineHeight) || 105;
  state.topShelfMm = Number(snapshot.topShelfMm) || DEFAULT_TOP_SHELF_MM;
  state.layoutLeftMm = Number.isFinite(snapshot.layoutLeftMm) ? snapshot.layoutLeftMm : null;
  state.totalCurrency = ['INR', 'USD', 'EUR'].includes(snapshot.totalCurrency) ? snapshot.totalCurrency : 'INR';
  state.selectedKitId = null;
  state.editingDimension = null;
  state.editingDimensionSource = null;
  state.selectedBayId = null;
  state.selectedModuleIndex = null;
  state.bays = snapshot.bays.map((bay) => ({
    id: crypto.randomUUID(),
    width: catalog.widths.includes(Number(bay.width)) ? Number(bay.width) : catalog.widths[0],
    modules: Array.isArray(bay.modules) && bay.modules.length
      ? bay.modules.map((module) => ({
        type: module.type === 'drawer' ? 'drawer' : 'shelf',
        depth: module.type === 'drawer'
          ? 30
          : [15, 25, 35].includes(Number(module.depth))
            ? Number(module.depth)
            : 15,
        slot: Number.isInteger(module.slot) ? module.slot : 0,
      }))
      : [{ type: 'shelf', depth: 15, slot: 0 }],
  }));
  setInteractionError('');
}

function getFirstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'Your';
}

function escapePdfText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function qualifiesForFreeShipping(summary) {
  return summary.total > 3500;
}

function getBottomDimensionAnchorPx(summary, footprintLeftPx, pxPerMm) {
  if (!Array.isArray(state.bays) || !state.bays.length) {
    return footprintLeftPx;
  }

  const totalSpines = state.bays.length + 1;
  const targetSpineIndex = totalSpines % 2 === 1
    ? Math.floor(totalSpines / 2)
    : (totalSpines / 2) - 1;
  let offsetMm = 0;

  for (let index = 0; index < targetSpineIndex; index += 1) {
    offsetMm += SPINE_WIDTH_MM + (state.bays[index].width * 10);
  }

  return footprintLeftPx + ((offsetMm + (SPINE_WIDTH_MM / 2)) * pxPerMm);
}

function getCenteredTopShelfMm() {
  const wallHeightMm = Math.max(1, state.wallHeight * 10);
  const spineHeightMm = Math.max(HOLE_PITCH_MM, state.spineHeight * 10);
  const centeredFloorClearanceMm = Math.max(0, (wallHeightMm - spineHeightMm) / 2);
  return clampTopShelfMm(spineHeightMm + centeredFloorClearanceMm);
}

function getPartSubtitle(part, currency = state.totalCurrency) {
  if (!part.priced) {
    return `${part.meta} • Price pending`;
  }
  const unitPrice = part.quantity > 0 ? part.amount / part.quantity : part.amount;
  return `${part.meta} • ${formatConvertedCurrency(unitPrice, currency)} each`;
}

function getEstimateParts(summary) {
  const parts = new Map();
  const addPart = (key, label, meta, quantity, amount, priced = true) => {
    const existing = parts.get(key);
    if (existing) {
      existing.quantity += quantity;
      existing.amount += amount;
      existing.priced = existing.priced && priced;
      return;
    }
    parts.set(key, {
      label,
      meta,
      quantity,
      amount,
      priced,
    });
  };

  addPart(
    `spine-${summary.selectedSpine.code}-${state.finish}`,
    `${summary.selectedSpine.code} spine`,
    `${state.finish} • ${formatLengthCm(summary.selectedSpine.height)}`,
    summary.totalSpines,
    summary.spineTotal,
  );

  state.bays.forEach((bay) => {
    bay.modules.forEach((module) => {
      if (module.type === 'shelf') {
        addPart(
          `shelf-${bay.width}-${module.depth}`,
          `Shelf W${bay.width} D${module.depth}`,
          `${state.finish} • U shelf`,
          1,
          catalog.shelves[bay.width][module.depth],
        );
      } else {
        // Drawers — price TBD. Single and double tracked separately.
        const isDouble = module.variant === 'double';
        addPart(
          `drawer-${isDouble ? 'double' : 'single'}-${bay.width}`,
          `${isDouble ? 'Double ' : ''}Drawer W${bay.width}`,
          `${state.finish} • Price TBD`,
          1,
          0,
          false, // marks as unpriced → shows "Price TBD" in estimate
        );
      }
    });
  });

  return Array.from(parts.values());
}

function createPdfPreviewPanel() {
  const liveCanvas = layoutPreview.querySelector('.preview-wall-canvas');
  const livePlane = liveCanvas?.querySelector('.preview-wall-plane');
  const previewCanvas = liveCanvas?.cloneNode(true);
  const previewWrap = document.createElement('div');
  previewWrap.style.display = 'grid';
  previewWrap.style.placeItems = 'center';
  previewWrap.style.padding = '16px 8px';
  previewWrap.style.background = '#ffffff';

  if (previewCanvas && liveCanvas && livePlane) {
    // Strip *all* interactive UI overlays. Keep the wall plane background,
    // spines, dimensions, captions and footprints exactly as they look in
    // the live canvas — the export is meant to be the same view minus chrome.
    previewCanvas.querySelectorAll(
      '.preview-add-rail, .preview-add-bay-btn, [data-add-bay], .preview-bay-remove, .preview-module-remove, .preview-module-flip, [data-remove-module-inline], [data-flip-module-inline], .preview-inspector, .preview-top-line-handle, .preview-wall-resize, .preview-wall-resize-badge, .preview-scale, .preview-human',
    ).forEach((node) => node.remove());
    previewCanvas.querySelectorAll('button').forEach((button) => {
      button.style.pointerEvents = 'none';
      button.style.cursor = 'default';
    });
    previewCanvas.querySelectorAll('.preview-bay-width-row').forEach((row) => {
      const active = row.querySelector('.preview-bay-width-option.is-active');
      if (active) {
        row.innerHTML = `<span class="preview-bay-width-option is-active">${active.textContent}</span>`;
      }
    });
    previewCanvas.querySelectorAll('.preview-module-options').forEach((row) => {
      const active = row.querySelector('.preview-module-option.is-active');
      if (active) {
        row.innerHTML = `<span class="preview-module-option is-active">${active.textContent}</span>`;
      }
    });
    previewCanvas.querySelectorAll('.preview-dimension-label').forEach((label) => {
      label.style.whiteSpace = 'nowrap';
    });
    previewCanvas.querySelectorAll('.preview-top-line-label').forEach((label) => {
      label.style.whiteSpace = 'nowrap';
    });
    // Outline spines so they remain visible against the gray wall plane
    // regardless of finish (white spines otherwise vanish into the backdrop).
    previewCanvas.querySelectorAll('.preview-spine').forEach((node) => {
      node.style.border = '1px solid rgba(23,23,23,0.6)';
      node.style.boxSizing = 'border-box';
    });
    // Strip selection state from cloned bays — the dashed selection rectangle
    // (driven by .is-selected ::after) is a dynamic UI element that should
    // never appear in the export.
    previewCanvas.querySelectorAll('.is-selected').forEach((node) => {
      node.classList.remove('is-selected');
    });

    // Measure the LIVE plane and scale the cloned canvas to fill the sheet
    // width as much as possible. No outer wall-dimension annotations — the
    // numbers live in the page 1 dimensions panel instead, leaving the
    // elevation free to use the full available width.
    const liveRect = livePlane.getBoundingClientRect();
    const liveWidth = liveRect.width || 700;
    const liveHeight = liveRect.height || 400;
    const maxBoxWidth = 820;   // sheet is 920px with 54px side padding → 812px content; keep a tiny margin
    const maxBoxHeight = 580;
    const scale = Math.min(1, maxBoxWidth / liveWidth, maxBoxHeight / liveHeight);
    const scaledWidth = Math.round(liveWidth * scale);
    const scaledHeight = Math.round(liveHeight * scale);

    previewCanvas.style.width = `${liveWidth}px`;
    previewCanvas.style.height = `${liveHeight}px`;
    previewCanvas.style.minWidth = '0';
    previewCanvas.style.minHeight = '0';
    previewCanvas.style.margin = '0';
    previewCanvas.style.position = 'absolute';
    previewCanvas.style.top = '0';
    previewCanvas.style.left = '0';
    previewCanvas.style.transform = `scale(${scale})`;
    previewCanvas.style.transformOrigin = 'top left';

    const scaleBox = document.createElement('div');
    scaleBox.style.cssText = `position:relative;width:${scaledWidth}px;height:${scaledHeight}px;`;
    scaleBox.appendChild(previewCanvas);

    previewWrap.appendChild(scaleBox);
  }

  return previewWrap;
}

function escapePdfHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPdfDate(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatPdfShortId(date) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yy}${mm}${dd}-${hh}${min}`;
}

function createPdfSheetBase() {
  const sheet = document.createElement('div');
  sheet.style.position = 'fixed';
  sheet.style.left = '-10000px';
  sheet.style.top = '0';
  sheet.style.width = '920px';
  sheet.style.padding = '54px';
  sheet.style.background = '#ffffff';
  sheet.style.color = '#171717';
  sheet.style.fontFamily = '"Inter", sans-serif';
  sheet.style.zIndex = '9999';
  return sheet;
}

function placePdfImage(pdf, canvas) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxWidth = pageWidth - 48;
  const maxHeight = pageHeight - 48;
  const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
  const renderWidth = canvas.width * scale;
  const renderHeight = canvas.height * scale;
  const offsetX = (pageWidth - renderWidth) / 2;
  const offsetY = 24;
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', offsetX, offsetY, renderWidth, renderHeight, undefined, 'FAST');
}

function createPdfPage1Sheet(customerName, summary, generatedAt) {
  const trimmedName = String(customerName || '').trim();
  const sheet = createPdfSheetBase();

  const previewWrap = createPdfPreviewPanel();

  sheet.innerHTML = `
    <div style="display:grid;grid-template-columns:1.45fr 1fr;gap:36px;align-items:start;">
      <div style="display:grid;gap:14px;">
        <h1 style="margin:0;font-family:'Inter', sans-serif;font-size:46px;letter-spacing:-0.04em;line-height:1.05;font-weight:800;color:#171717;">ETRNL Evolv<br/>Configuration</h1>
        <div style="display:grid;gap:6px;font-size:17px;color:#171717;line-height:1.5;">
          ${trimmedName ? `<div>Customer: ${escapePdfHtml(trimmedName)}</div>` : ''}
          <div>Date: ${formatPdfDate(generatedAt)}</div>
          <div>ID: ${formatPdfShortId(generatedAt)}</div>
        </div>
      </div>
      <div style="padding:24px 26px;border:1px solid rgba(23,23,23,0.18);border-radius:6px;background:#f8f8f8;display:grid;gap:22px;">
        <div>
          <h3 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#171717;">Overall Dimensions</h3>
          <div style="display:grid;gap:6px;font-size:16px;color:#171717;line-height:1.5;">
            <div>Wall Width: ${formatLengthCm(state.wallWidth)}</div>
            <div>Wall Height: ${formatLengthCm(state.wallHeight)}</div>
            <div>Spine Height: ${formatLengthCm(summary.selectedSpine.height)}</div>
            <div>Build Width: ${formatLengthCm(summary.totalWidth)}</div>
          </div>
        </div>
        <div>
          <h3 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#171717;">Color</h3>
          <div style="font-size:16px;color:#171717;">${escapePdfHtml(state.finish)}</div>
        </div>
      </div>
    </div>
    <div style="margin-top:42px;display:flex;justify-content:center;">
      ${previewWrap.outerHTML}
    </div>
  `;

  return sheet;
}

function createPdfPage2Sheet(summary, generatedAt) {
  const sheet = createPdfSheetBase();
  const parts = getEstimateParts(summary);
  const shippingDisplay = getShippingDisplay(summary, state.totalCurrency);

  const cellStyle = 'padding:14px 12px;font-size:15px;color:#171717;border-bottom:1px solid rgba(23,23,23,0.08);';
  const headerCellStyle = 'padding:14px 12px;font-size:15px;font-weight:800;color:#171717;border-bottom:1px solid rgba(23,23,23,0.18);';

  const unitPriceFor = (part) => {
    if (!part.priced || !part.quantity) return 'TBD';
    return formatConvertedCurrency(part.amount / part.quantity, state.totalCurrency);
  };

  const partRowsHtml = parts.map((part) => `
    <tr style="background:#ffffff;">
      <td style="${cellStyle}color:#5f5f5f;width:120px;"></td>
      <td style="${cellStyle}font-weight:700;">${escapePdfHtml(part.label)}</td>
      <td style="${cellStyle}width:70px;">${part.quantity}</td>
      <td style="${cellStyle}text-align:right;width:130px;">${unitPriceFor(part)}</td>
      <td style="${cellStyle}text-align:right;font-weight:700;width:140px;">${part.priced ? formatConvertedCurrency(part.amount, state.totalCurrency) : 'TBD'}</td>
    </tr>
  `).join('');

  const shippingRowHtml = shippingDisplay
    ? `
      <tr style="background:#ffffff;">
        <td style="${cellStyle}color:#5f5f5f;"></td>
        <td style="${cellStyle}font-weight:700;">Shipping</td>
        <td style="${cellStyle}"></td>
        <td style="${cellStyle}"></td>
        <td style="${cellStyle}text-align:right;font-weight:700;">${escapePdfHtml(shippingDisplay.value)}</td>
      </tr>
    `
    : '';

  sheet.innerHTML = `
    <div style="display:grid;gap:28px;">
      <div style="display:grid;gap:8px;">
        <h1 style="margin:0;font-family:'Inter', sans-serif;font-size:42px;letter-spacing:-0.04em;line-height:1.05;font-weight:800;color:#171717;">Parts List</h1>
        <p style="margin:0;color:#5f5f5f;font-size:15px;">ID: ${formatPdfShortId(generatedAt)}${summary.hasDrawerPricingGap ? ' • Drawers priced separately' : ''}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f8f8f8;">
            <th style="${headerCellStyle}text-align:left;">SKU</th>
            <th style="${headerCellStyle}text-align:left;">Product</th>
            <th style="${headerCellStyle}text-align:left;">Quantity</th>
            <th style="${headerCellStyle}text-align:right;">Unit Price</th>
            <th style="${headerCellStyle}text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${partRowsHtml}
          ${shippingRowHtml}
        </tbody>
        <tfoot>
          <tr style="background:#f8f8f8;">
            <td style="padding:18px 12px;border-top:1px solid rgba(23,23,23,0.18);"></td>
            <td style="padding:18px 12px;border-top:1px solid rgba(23,23,23,0.18);"></td>
            <td style="padding:18px 12px;border-top:1px solid rgba(23,23,23,0.18);"></td>
            <td style="padding:18px 12px;text-align:right;font-size:16px;font-weight:800;color:#171717;border-top:1px solid rgba(23,23,23,0.18);">TOTAL:</td>
            <td style="padding:18px 12px;text-align:right;font-size:18px;font-weight:800;color:#171717;border-top:1px solid rgba(23,23,23,0.18);">${formatTotalValue(summary, state.totalCurrency)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  return sheet;
}

async function triggerConfigurationPdfDownload(customerName) {
  const safeName = sanitizeCustomerName(customerName);
  const fileName = safeName ? `${safeName}_EVOLV_Setup.pdf` : 'EVOLV_Setup.pdf';
  const summary = calculateSummary();
  const html2canvasLib = window.html2canvas;
  const jsPDFCtor = window.jspdf?.jsPDF;
  if (!html2canvasLib || !jsPDFCtor) {
    setInteractionError('PDF export is still loading. Please try again.');
    return;
  }

  const generatedAt = new Date();
  const page1 = createPdfPage1Sheet((customerName || '').trim(), summary, generatedAt);
  const page2 = createPdfPage2Sheet(summary, generatedAt);
  document.body.appendChild(page1);
  document.body.appendChild(page2);

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    const renderOptions = { backgroundColor: '#ffffff', scale: 2, useCORS: true };
    const canvas1 = await html2canvasLib(page1, renderOptions);
    const canvas2 = await html2canvasLib(page2, renderOptions);
    const pdf = new jsPDFCtor({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
    });
    placePdfImage(pdf, canvas1);
    pdf.addPage();
    placePdfImage(pdf, canvas2);
    pdf.save(fileName);
    setInteractionError('');
  } finally {
    page1.remove();
    page2.remove();
  }
}

function setInteractionError(message = '') {
  state.interactionError = message;
}

function clampSpineToWall() {
  const viableSpine = catalog.spines
    .filter((spine) => spine.height <= state.wallHeight)
    .at(-1);

  if (viableSpine && state.spineHeight > viableSpine.height) {
    state.spineHeight = viableSpine.height;
  }
}

function getTopShelfBoundsMm() {
  const wallHeightMm = Math.max(1, state.wallHeight * 10);
  const spineHeightMm = Math.max(HOLE_PITCH_MM, state.spineHeight * 10);
  const MIN_FLOOR_CLEARANCE_MM = 100; // 10 cm minimum from spine bottom to floor
  return {
    min: Math.min(spineHeightMm + MIN_FLOOR_CLEARANCE_MM, wallHeightMm),
    max: wallHeightMm,
  };
}

function snapMmToHole(mm) {
  return Math.round(mm / HOLE_PITCH_MM) * HOLE_PITCH_MM;
}

function clampTopShelfMm(mm) {
  const { min, max } = getTopShelfBoundsMm();
  return Math.max(min, Math.min(max, mm));
}

function setTopShelfMm(mm, { snap = true } = {}) {
  if (!Number.isFinite(mm)) return;
  setInteractionError('');
  const next = clampTopShelfMm(snap ? snapMmToHole(mm) : mm);
  state.topShelfMm = next;
}

function getSlotCount(spineHeight = state.spineHeight) {
  return Math.max(1, Math.floor(((spineHeight * 10) - FIRST_HOLE_MM) / HOLE_PITCH_MM) + 1);
}

function getModuleHeightMm(module) {
  // Drawers (single or double) are same physical height
  return module?.type === 'drawer'
    ? DRAWER_HEIGHT_MM
    : SHELF_HEIGHT_MM;
}

// Returns [bottomMm, topMm] measured from spine bottom (y=0) for conflict maths.
// Shelves are top-anchored to a hole. Drawers are bottom-anchored to a 70 mm grid from spine floor.
function getModuleYRangeMm(module) {
  const slot = Number.isFinite(module?.slot) ? module.slot : 0;
  if (module?.type === 'drawer') {
    const botMm = slot * HOLE_PITCH_MM;
    return [botMm, botMm + DRAWER_HEIGHT_MM];
  }
  const topMm = FIRST_HOLE_MM + (slot * HOLE_PITCH_MM);
  return [topMm - SHELF_HEIGHT_MM, topMm];
}

// Max valid slot for a module on the current spine — prevents drawer top / shelf top overflowing.
function getModuleMaxSlot(module, spineHeightCm = state.spineHeight) {
  if (module?.type === 'drawer') {
    return Math.max(0, Math.floor((spineHeightCm * 10 - DRAWER_HEIGHT_MM) / HOLE_PITCH_MM));
  }
  return getSlotCount(spineHeightCm) - 1;
}

function getModuleSlotSpan(module) {
  return Math.max(1, Math.ceil(getModuleHeightMm(module) / HOLE_PITCH_MM));
}

function getMinimumSlot(module) {
  return 0;
}

function slotsConflict(a, b) {
  const [aBot, aTop] = getModuleYRangeMm(a);
  const [bBot, bTop] = getModuleYRangeMm(b);
  return aBot < bTop && bBot < aTop;
}

function canPlaceModuleAtSlot(modules, candidateModule, ignoredIndex = -1) {
  return !modules.some((module, index) => {
    if (index === ignoredIndex) return false;
    return slotsConflict(module, candidateModule);
  });
}

function getDefaultSlot(modules, slotCount = getSlotCount(), candidateModule = { type: 'shelf', depth: 15 }) {
  if (candidateModule.type === 'drawer') return 0; // drawers default to slot 0 — flush with spine bottom
  const minSlot = getMinimumSlot(candidateModule);
  for (let slot = slotCount - 1; slot >= minSlot; slot -= 1) {
    if (canPlaceModuleAtSlot(modules, { ...candidateModule, slot })) return slot;
  }
  return slotCount - 1;
}

function normalizeStateForGrid() {
  const slotCount = getSlotCount();

  state.bays = state.bays.map((bay) => {
    const resolvedModules = [];
    const modules = [];
    for (let index = 0; index < bay.modules.length; index += 1) {
      const module = bay.modules[index];
      const minimumSlot = getMinimumSlot(module);
      const maximumSlot = getModuleMaxSlot(module);
      let slot = Number.isInteger(module.slot) ? module.slot : Math.min(index + minimumSlot, maximumSlot);
      slot = Math.max(minimumSlot, Math.min(slot, maximumSlot));
      if (!canPlaceModuleAtSlot(resolvedModules, { ...module, slot })) {
        let found = false;
        for (let distance = 1; distance <= maximumSlot; distance += 1) {
          const lower = slot - distance;
          const upper = slot + distance;
          if (lower >= minimumSlot && canPlaceModuleAtSlot(resolvedModules, { ...module, slot: lower })) {
            slot = lower;
            found = true;
            break;
          }
          if (upper <= maximumSlot && canPlaceModuleAtSlot(resolvedModules, { ...module, slot: upper })) {
            slot = upper;
            found = true;
            break;
          }
        }
        if (!found) continue; // drop module that can't fit
      }
      const nextModule = { ...module, slot };
      resolvedModules.push(nextModule);
      modules.push(nextModule);
    }
    return { ...bay, modules };
  });
}

function findNearestOpenSlot(modules, preferredSlot, slotCount = getSlotCount(), candidateModule = { type: 'shelf', depth: 15 }) {
  const minimumSlot = getMinimumSlot(candidateModule);
  const maximumSlot = getModuleMaxSlot(candidateModule);
  const clampedPreferredSlot = Math.max(minimumSlot, Math.min(maximumSlot, preferredSlot));
  const candidate = { ...candidateModule, slot: clampedPreferredSlot };
  if (canPlaceModuleAtSlot(modules, candidate)) return clampedPreferredSlot;

  for (let distance = 1; distance <= maximumSlot; distance += 1) {
    const lower = clampedPreferredSlot - distance;
    const upper = clampedPreferredSlot + distance;

    if (lower >= minimumSlot && canPlaceModuleAtSlot(modules, { ...candidate, slot: lower })) return lower;
    if (upper <= maximumSlot && canPlaceModuleAtSlot(modules, { ...candidate, slot: upper })) return upper;
  }

  return null;
}

function applyStarterKit(kit) {
  pushHistory();
  state.selectedKitId = kit.id;
  state.spineHeight = kit.spineHeight;
  state.bays = [
    {
      id: crypto.randomUUID(),
      width: kit.width,
      modules: [
        { type: 'shelf', depth: kit.topDepth, slot: 1 },
        { type: 'shelf', depth: kit.bottomDepth, slot: 0 },
      ],
    },
  ];
  state.selectedBayId = state.bays[0].id;
  state.selectedModuleIndex = 0;
}

function addBay(width) {
  pushHistory();
  state.selectedKitId = null;
  const bay = {
    id: crypto.randomUUID(),
    width,
    modules: [{ type: 'shelf', depth: 25, slot: 0 }],
  };
  state.bays.push(bay);
  state.selectedBayId = bay.id;
  state.selectedModuleIndex = 0;
  render();
}

function removeBay(bayId) {
  if (state.bays.length === 1) return;
  pushHistory();
  state.selectedKitId = null;
  state.bays = state.bays.filter((bay) => bay.id !== bayId);
  if (state.selectedBayId === bayId) {
    state.selectedBayId = state.bays[0]?.id || null;
    state.selectedModuleIndex = 0;
  }
  render();
}

function updateBayWidth(bayId, width) {
  pushHistory();
  state.selectedKitId = null;
  state.bays = state.bays.map((bay) => bay.id === bayId ? { ...bay, width } : bay);
  // Auto-expand wall width if new layout exceeds current wall
  const MIN_CLEARANCE_MM = 50;
  const newLayoutWidthMm = getLayoutWidthMm(calculateSummary());
  const minWallWidthMm = newLayoutWidthMm + MIN_CLEARANCE_MM * 2;
  if (state.wallWidth * 10 < minWallWidthMm) {
    state.wallWidth = Math.ceil(minWallWidthMm / 10);
    lastAppliedWidth = state.wallWidth;
    const wallWidthInput = document.getElementById('wall-width');
    if (wallWidthInput) wallWidthInput.value = state.wallWidth;
    const applyBtn = document.getElementById('apply-wall-btn');
    if (applyBtn) applyBtn.disabled = true;
  }
  render();
}

function cycleBayWidth(bayId) {
  pushHistory();
  const bay = state.bays.find((item) => item.id === bayId);
  if (!bay) return;
  const currentIndex = catalog.widths.indexOf(bay.width);
  const nextWidth = catalog.widths[(currentIndex + 1) % catalog.widths.length];
  updateBayWidth(bayId, nextWidth);
}

function updateBayModule(bayId, moduleIndex, nextValue) {
  pushHistory();
  state.selectedKitId = null;
  state.bays = state.bays.map((bay) => {
    if (bay.id !== bayId) return bay;
    const modules = bay.modules.map((module, index) => {
      if (index !== moduleIndex) return module;
      if (nextValue === 'drawer') return { type: 'drawer', depth: 30, slot: module.slot };
      return { type: 'shelf', depth: Number(nextValue), slot: module.slot };
    });
    return { ...bay, modules };
  });
  render();
}

function addShelfToBay(bayId) {
  const bay = state.bays.find((b) => b.id === bayId);
  if (!bay) return;
  const slotCount = getSlotCount();
  if (bay.modules.length >= slotCount) return; // bay is full
  const candidateModule = { type: 'shelf', depth: 15 };
  const slot = findNearestOpenSlot(bay.modules, getDefaultSlot(bay.modules), slotCount, candidateModule);
  if (slot === null) return; // no open slot
  pushHistory();
  state.selectedKitId = null;
  state.bays = state.bays.map((b) => {
    if (b.id !== bayId) return b;
    state.selectedBayId = b.id;
    state.selectedModuleIndex = b.modules.length;
    return {
      ...b,
      modules: [...b.modules, { type: 'shelf', depth: 15, slot }],
    };
  });
  render();
}

function removeModuleFromBay(bayId, moduleIndex) {
  pushHistory();
  state.selectedKitId = null;
  state.bays = state.bays.map((bay) => {
    if (bay.id !== bayId) return bay;
    if (state.selectedBayId === bay.id && state.selectedModuleIndex === moduleIndex) {
      state.selectedBayId = bay.id;
      state.selectedModuleIndex = null;
    }
    return {
      ...bay,
      modules: bay.modules.filter((_, index) => index !== moduleIndex),
    };
  });
  render();
}

function selectModule(bayId, moduleIndex) {
  if (state.selectedBayId === bayId && state.selectedModuleIndex === moduleIndex) {
    state.selectedBayId = bayId;
    state.selectedModuleIndex = null;
    render();
    return;
  }
  state.selectedBayId = bayId;
  state.selectedModuleIndex = moduleIndex;
  render();
}

function clearModuleSelection() {
  state.selectedModuleIndex = null;
  render();
}

function normalizeSelection() {
  const selectedBay = state.bays.find((bay) => bay.id === state.selectedBayId) || null;
  if (!selectedBay) {
    state.selectedBayId = null;
    state.selectedModuleIndex = null;
    return;
  }

  if (!Number.isInteger(state.selectedModuleIndex)) {
    state.selectedModuleIndex = null;
    return;
  }

  if (!selectedBay.modules[state.selectedModuleIndex]) {
    state.selectedModuleIndex = null;
  }
}

function moveModuleToSlot(bayId, moduleIndex, targetSlot) {
  pushHistory();
  const slotCount = getSlotCount();
  const bay = state.bays.find((item) => item.id === bayId);
  const movingModule = bay?.modules[moduleIndex];
  const nextSlot = Math.max(
    getMinimumSlot(movingModule || { type: 'shelf', depth: 15 }),
    Math.min(slotCount - 1, targetSlot),
  );

  state.bays = state.bays.map((bay) => {
    if (bay.id !== bayId) return bay;
    const remainingModules = bay.modules.filter((_, index) => index !== moduleIndex);
    const movingModule = bay.modules[moduleIndex];
    const availableSlot = findNearestOpenSlot(remainingModules, nextSlot, slotCount, movingModule);
    if (availableSlot === null) return bay;
    const modules = bay.modules.map((module, index) => {
      if (index === moduleIndex) return { ...module, slot: availableSlot };
      return module;
    });
    return { ...bay, modules };
  });

  state.selectedBayId = bayId;
  state.selectedModuleIndex = moduleIndex;
  render();
}

function moveModuleToBay(sourceBayId, moduleIndex, targetBayId, targetSlot) {
  const sourceBay = state.bays.find((b) => b.id === sourceBayId);
  if (!sourceBay) return;
  const movingModule = sourceBay.modules[moduleIndex];
  if (!movingModule) return;
  const targetBay = state.bays.find((b) => b.id === targetBayId);
  if (!targetBay) return;
  const slotCount = getSlotCount();
  const availableSlot = findNearestOpenSlot(targetBay.modules, targetSlot, slotCount, movingModule);
  if (availableSlot === null) return;
  pushHistory();
  state.selectedKitId = null;
  const movedModule = { ...movingModule, slot: availableSlot };
  state.bays = state.bays.map((bay) => {
    if (bay.id === sourceBayId) {
      return { ...bay, modules: bay.modules.filter((_, i) => i !== moduleIndex) };
    }
    if (bay.id === targetBayId) {
      return { ...bay, modules: [...bay.modules, movedModule] };
    }
    return bay;
  });
  state.selectedBayId = targetBayId;
  state.selectedModuleIndex = targetBay.modules.length; // new last index
  render();
}

function addModuleAtBaySlot(bayId, componentType, targetSlot) {
  const bay = state.bays.find((b) => b.id === bayId);
  if (!bay) return;
  let candidate;
  if (componentType === 'shelf-15') candidate = { type: 'shelf', depth: 15 };
  else if (componentType === 'shelf-25') candidate = { type: 'shelf', depth: 25 };
  else if (componentType === 'shelf-35') candidate = { type: 'shelf', depth: 35 };
  else if (componentType === 'drawer-single') candidate = { type: 'drawer', variant: 'single', depth: 35 };
  else if (componentType === 'drawer-double') candidate = { type: 'drawer', variant: 'double', depth: 35 };
  else return;
  const slotCount = getSlotCount();
  const availableSlot = findNearestOpenSlot(bay.modules, targetSlot, slotCount, candidate);
  if (availableSlot === null) return;
  pushHistory();
  state.selectedKitId = null;
  state.bays = state.bays.map((b) => {
    if (b.id !== bayId) return b;
    state.selectedBayId = b.id;
    state.selectedModuleIndex = b.modules.length;
    return { ...b, modules: [...b.modules, { ...candidate, slot: availableSlot }] };
  });
  render();
}

function addShelfAtSlot(bayId, slot) {
  pushHistory();
  state.selectedKitId = null;
  state.bays = state.bays.map((bay) => {
    if (bay.id !== bayId) return bay;
    const candidateModule = { type: 'shelf', depth: 15 };
    const existingIndex = bay.modules.findIndex((module) => slotsConflict(module, { ...candidateModule, slot }));
    if (existingIndex >= 0) {
      state.selectedBayId = bay.id;
      state.selectedModuleIndex = existingIndex;
      return bay;
    }
    const availableSlot = findNearestOpenSlot(bay.modules, slot, getSlotCount(), candidateModule);
    if (availableSlot === null) return bay;
    const nextIndex = bay.modules.length;
    state.selectedBayId = bay.id;
    state.selectedModuleIndex = nextIndex;
    return {
      ...bay,
      modules: [...bay.modules, { type: 'shelf', depth: 15, slot: availableSlot }],
    };
  });
  render();
}

/* ── ADD COMPONENT FROM SIDEBAR TILE ───────────────────────────────
   Called when a component tile in the sidebar is clicked.
   Adds the module to the currently selected bay at the next open slot.
   ────────────────────────────────────────────────────────────────── */
function addComponentToBay(componentType) {
  const bayId = state.selectedBayId;
  if (!bayId || !state.bays.find(b => b.id === bayId)) {
    setInteractionError('Select a bay on the canvas first.');
    render();
    return;
  }
  pushHistory();
  state.selectedKitId = null;
  const slotCount = getSlotCount();

  state.bays = state.bays.map((bay) => {
    if (bay.id !== bayId) return bay;

    let candidate;
    if (componentType === 'shelf-15') {
      candidate = { type: 'shelf', depth: 15 };
    } else if (componentType === 'shelf-25') {
      candidate = { type: 'shelf', depth: 25 };
    } else if (componentType === 'shelf-35') {
      candidate = { type: 'shelf', depth: 35 };
    } else if (componentType === 'drawer-single') {
      candidate = { type: 'drawer', variant: 'single', depth: 35 };
    } else if (componentType === 'drawer-double') {
      candidate = { type: 'drawer', variant: 'double', depth: 35 };
    } else {
      return bay;
    }

    const preferredSlot = getDefaultSlot(bay.modules, slotCount, candidate) ?? 0;
    const slot = findNearestOpenSlot(bay.modules, preferredSlot, slotCount, candidate);
    if (slot === null) return bay; // bay is full
    const nextIndex = bay.modules.length;
    state.selectedModuleIndex = nextIndex;
    return { ...bay, modules: [...bay.modules, { ...candidate, slot }] };
  });

  normalizeStateForGrid();
  render();
}

function getSelectedSpine() {
  return catalog.spines.find((spine) => spine.height === state.spineHeight) || catalog.spines[0];
}

function getLayoutWidthMm(summary = calculateSummary()) {
  return (summary.totalWidth * 10) + (summary.totalSpines * SPINE_WIDTH_MM);
}

function getMaxLeftClearanceMm(wallWidthMm, layoutWidthMm) {
  return Math.max(0, wallWidthMm - layoutWidthMm);
}

function getLeftClearanceMm(wallWidthMm, layoutWidthMm) {
  const maxLeftClearanceMm = getMaxLeftClearanceMm(wallWidthMm, layoutWidthMm);
  if (!Number.isFinite(state.layoutLeftMm)) {
    return maxLeftClearanceMm / 2;
  }
  return Math.max(0, Math.min(maxLeftClearanceMm, state.layoutLeftMm));
}

function centerLayoutInWall() {
  state.layoutLeftMm = null;
  state.topShelfMm = getCenteredTopShelfMm();
  state.editingDimension = null;
  state.editingDimensionSource = null;
  setInteractionError('');
}

function setHorizontalClearanceMm(side, mm, wallWidthMm, layoutWidthMm) {
  if (!Number.isFinite(mm)) return;
  const maxLeftClearanceMm = getMaxLeftClearanceMm(wallWidthMm, layoutWidthMm);
  const clamped = Math.max(0, Math.min(maxLeftClearanceMm, mm));
  state.layoutLeftMm = side === 'right'
    ? maxLeftClearanceMm - clamped
    : clamped;
}

function getDimensionInputSize(value) {
  const text = String(value ?? '').trim();
  return Math.max(3, Math.min(6, text.length));
}

function getDimensionInputWidthStyle(value) {
  const text = String(value ?? '').trim();
  const widthCh = Math.max(8.4, Math.min(14, (text.length * 1.44) + 2.7));
  return `width:${widthCh}ch`;
}

function beginDimensionEdit(key, source = null) {
  if (!key) return;
  state.editingDimension = key;
  state.editingDimensionSource = source;
  render();
  requestAnimationFrame(() => {
    const input = layoutPreview.querySelector(`[data-dimension-input="${key}"]`);
    if (input) {
      input.focus();
      input.select();
    }
  });
}

function renderHumanReferenceMarkup() {
  const cmValue = state.humanReferenceCm;
  if (state.editingDimension === 'human') {
    const formattedValue = formatNumber(cmValue, 1);
    return `
      <div class="preview-human-copy is-editing">
        <div class="preview-human-copy-title">Human for scale</div>
        <input
          class="preview-human-input"
          type="number"
          inputmode="decimal"
          step="1"
          min="120"
          max="250"
          value="${formattedValue}"
          size="${getDimensionInputSize(formattedValue)}"
          style="${getDimensionInputWidthStyle(formattedValue)}"
          data-dimension-input="human"
          aria-label="Edit human reference height"
        >
        <div class="preview-human-copy-subtle">cm</div>
      </div>
    `;
  }

  return `
    <div class="preview-human-copy">
      <div class="preview-human-copy-title">Human for scale</div>
      <button class="preview-human-value" type="button" data-edit-dimension="human">${formatFeetAndInchesFromCm(cmValue)}</button>
      <button class="preview-human-value preview-human-value-secondary" type="button" data-edit-dimension="human">~${formatNumber(cmValue, 0)} cm</button>
    </div>
  `;
}

function renderEditableDimension(key, value, { axis = 'horizontal', className = '' } = {}) {
  if (state.editingDimension === key) {
    const classNames = ['preview-dimension-input', className].filter(Boolean).join(' ');
    const precision = key === 'top'
      ? (state.displayUnit === 'in' ? 2 : 0)
      : (state.displayUnit === 'in' ? 2 : 1);
    const formattedValue = formatNumber(value, precision);
    return `<input class="${classNames}" type="number" inputmode="decimal" step="${key === 'top' ? getDisplayStepForTopLine() : getDisplayStepForSpacing()}" value="${formattedValue}" size="${getDimensionInputSize(formattedValue)}" style="${getDimensionInputWidthStyle(formattedValue)}" data-dimension-input="${key}" aria-label="Edit ${key} dimension">`;
  }
  const unitSuffix = state.displayUnit === 'in' ? 'in' : 'cm';
  const classNames = ['preview-dimension-label', className].filter(Boolean).join(' ');
  const text = key === 'top'
    ? `${formatNumber(topLineToDisplay(state.topShelfMm), state.displayUnit === 'in' ? 2 : 0)} ${unitSuffix}`
    : `${formatNumber(value, state.displayUnit === 'in' ? 2 : 1)} ${unitSuffix}`;
  return `<button class="${classNames}" type="button" data-edit-dimension="${key}" data-axis="${axis}">${text}</button>`;
}

function renderEditableWallDimension(key, value, { className = '' } = {}) {
  const classNames = ['preview-wall-dimension', className].filter(Boolean).join(' ');
  const displayValue = wallLengthToDisplay(value);
  const unitSuffix = state.displayUnit === 'in' ? 'in' : 'cm';
  const label = key === 'wallWidth' ? 'Wall Width' : 'Wall Height';
  const groupClassName = key === 'wallHeight'
    ? 'preview-wall-dimension-group is-height'
    : 'preview-wall-dimension-group';
  if (state.editingDimension === key && state.editingDimensionSource === 'wall-measure') {
    const formattedValue = formatNumber(displayValue, state.displayUnit === 'in' ? 2 : 1);
    return `
      <div class="${groupClassName}">
        <span class="preview-wall-dimension-title">${label}</span>
        <input class="preview-dimension-input ${classNames}" type="number" inputmode="decimal" step="${state.displayUnit === 'in' ? 0.5 : 1}" value="${formattedValue}" size="${getDimensionInputSize(formattedValue)}" style="${getDimensionInputWidthStyle(formattedValue)}" data-dimension-input="${key}" aria-label="Edit ${key}">
      </div>
    `;
  }
  return `
    <div class="${groupClassName}">
      <button class="preview-wall-dimension-title preview-wall-dimension-title-btn" type="button" data-edit-dimension="${key}">${label}</button>
      <button class="${classNames}" type="button" data-edit-dimension="${key}">${formatNumber(displayValue, state.displayUnit === 'in' ? 2 : 1)} ${unitSuffix}</button>
    </div>
  `;
}

function renderCornerWallDimension(key, value) {
  const displayValue = wallLengthToDisplay(value);
  const unitSuffix = state.displayUnit === 'in' ? 'in' : 'cm';
  const shortLabel = key === 'wallWidth' ? 'W' : 'H';

  if (state.editingDimension === key && state.editingDimensionSource === 'corner') {
    const formattedValue = formatNumber(displayValue, state.displayUnit === 'in' ? 2 : 1);
    return `
      <div class="preview-wall-resize-chip is-editing">
        <span class="preview-wall-resize-chip-label">${shortLabel}</span>
        <input class="preview-dimension-input preview-wall-resize-input" type="number" inputmode="decimal" step="${state.displayUnit === 'in' ? 0.5 : 1}" value="${formattedValue}" size="${getDimensionInputSize(formattedValue)}" style="${getDimensionInputWidthStyle(formattedValue)}" data-dimension-input="${key}" aria-label="Edit ${key}">
      </div>
    `;
  }

  return `
    <button class="preview-wall-resize-chip" type="button" data-edit-dimension="${key}">
      <span class="preview-wall-resize-chip-label">${shortLabel}</span>
      <span class="preview-wall-resize-chip-value">${formatNumber(displayValue, state.displayUnit === 'in' ? 2 : 1)} ${unitSuffix}</span>
    </button>
  `;
}

function commitDimensionEdit(key, rawValue, wallWidthMm, layoutWidthMm) {
  const numericValue = Number(rawValue);
  state.editingDimension = null;
  state.editingDimensionSource = null;
  if (!Number.isFinite(numericValue)) return;

  if (key === 'top') {
    const nextMm = displayLengthToMm(numericValue);
    const minTopMm = getTopShelfBoundsMm().min;
    if (nextMm < minTopMm) {
      setInteractionError(`Top limit cannot be less than spine height of ${formatLengthMm(minTopMm)}.`);
      state.topShelfMm = minTopMm;
      return;
    }
    setTopShelfMm(nextMm, { snap: false });
    return;
  }

  if (key === 'human') {
    state.humanReferenceCm = Math.max(120, Math.min(250, numericValue));
    setInteractionError('');
    return;
  }

  if (key === 'bottom') {
    const nextBottomMm = Math.max(0, displayLengthToMm(numericValue));
    const nextTopMm = (getSelectedSpine().height * 10) + nextBottomMm;
    const minTopMm = getTopShelfBoundsMm().min;
    if (nextTopMm < minTopMm) {
      setInteractionError(`Bottom clearance would push the top limit below the spine height of ${formatLengthMm(minTopMm)}.`);
      state.topShelfMm = minTopMm;
      return;
    }
    setTopShelfMm(nextTopMm, { snap: false });
    return;
  }

  if (key === 'wallWidth') {
    state.wallWidth = Math.max(40, displayToWallLength(numericValue));
    setInteractionError('');
    return;
  }

  if (key === 'wallHeight') {
    state.wallHeight = Math.max(42, displayToWallLength(numericValue));
    state.topShelfMm = Math.max(state.topShelfMm, getTopShelfBoundsMm().min);
    setInteractionError('');
    return;
  }

  setInteractionError('');
  const MIN_CLEARANCE_MM = 50;
  const requestedMm = Math.max(MIN_CLEARANCE_MM, displayLengthToMm(numericValue));
  // Also ensure the opposite side keeps at least 50mm
  const maxForThisSide = Math.max(0, wallWidthMm - layoutWidthMm - MIN_CLEARANCE_MM);
  setHorizontalClearanceMm(key, Math.min(requestedMm, maxForThisSide), wallWidthMm, layoutWidthMm);
}

function renderPreviewInspector(slotCount) {
  if (!previewInspector) return;

  const selectedBay = state.bays.find((bay) => bay.id === state.selectedBayId) || null;
  const selectedModule = selectedBay?.modules[state.selectedModuleIndex] || null;

  if (!selectedBay) {
    previewInspector.innerHTML = `
      <div class="preview-inspector-head is-empty">
        <div class="preview-inspector-title">Select a bay or module</div>
      </div>
    `;
    return;
  }

  const bayIndex = state.bays.findIndex((bay) => bay.id === state.selectedBayId);
  const bayLabel = `BAY ${bayIndex + 1}`;
  const selectedMountHeightMm = selectedModule ? FIRST_HOLE_MM + (selectedModule.slot * HOLE_PITCH_MM) : null;

  const moduleTitle = selectedModule
    ? (selectedModule.type === 'drawer'
        ? (selectedModule.variant === 'double' ? 'Double Drawer' : 'Single Drawer')
        : `Shelf D${selectedModule.depth}`)
    : `${bayLabel} - W${selectedBay.width}`;

  const moduleSub = selectedModule
    ? bayLabel
    : `${selectedBay.width} cm`;

  previewInspector.innerHTML = `
    <div class="preview-inspector-head">
      <div class="preview-inspector-label">
        <span class="preview-inspector-title">${moduleTitle}</span>
        <span class="preview-inspector-copy">${moduleSub}</span>
      </div>
      <div class="preview-inspector-actions">
        ${!selectedModule ? `
          ${catalog.widths.map((width) => `
            <button
              class="preview-pill ${selectedBay.width === width ? 'is-active' : ''}"
              type="button"
              data-inspector-width="${selectedBay.id}:${width}"
            >${width}</button>
          `).join('')}
          <button class="preview-icon-btn" type="button" data-inspector-remove-bay="${selectedBay.id}">-</button>
        ` : ''}
        ${selectedModule && selectedModule.type === 'shelf' ? `
          <button class="preview-pill ${selectedModule.depth === 15 ? 'is-active' : ''}" type="button" data-inspector-module="${selectedBay.id}:${state.selectedModuleIndex}:15">D15</button>
          <button class="preview-pill ${selectedModule.depth === 25 ? 'is-active' : ''}" type="button" data-inspector-module="${selectedBay.id}:${state.selectedModuleIndex}:25">D25</button>
          <button class="preview-pill ${selectedModule.depth === 35 ? 'is-active' : ''}" type="button" data-inspector-module="${selectedBay.id}:${state.selectedModuleIndex}:35">D35</button>
          <button class="preview-pill ${selectedModule.reversed ? 'is-active' : ''}" type="button" data-inspector-reverse="${selectedBay.id}:${state.selectedModuleIndex}">Flipped</button>
        ` : ''}
      </div>
    </div>
  `;

  previewInspector.querySelectorAll('[data-inspector-width]').forEach((button) => {
    button.addEventListener('click', () => {
      const [bayId, width] = button.dataset.inspectorWidth.split(':');
      updateBayWidth(bayId, Number(width));
    });
  });

  previewInspector.querySelectorAll('[data-inspector-module]').forEach((button) => {
    button.addEventListener('click', () => {
      const [bayId, moduleIndex, value] = button.dataset.inspectorModule.split(':');
      updateBayModule(bayId, Number(moduleIndex), value);
    });
  });

  previewInspector.querySelectorAll('[data-inspector-reverse]').forEach((button) => {
    button.addEventListener('click', () => {
      const [bayId, moduleIndex] = button.dataset.inspectorReverse.split(':');
      pushHistory();
      state.bays = state.bays.map((bay) => {
        if (bay.id !== bayId) return bay;
        return {
          ...bay,
          modules: bay.modules.map((module, index) => {
            if (index !== Number(moduleIndex)) return module;
            return { ...module, reversed: !module.reversed };
          }),
        };
      });
      render();
    });
  });

  previewInspector.querySelectorAll('[data-inspector-top]').forEach((button) => {
    button.addEventListener('click', () => {
      const [bayId, moduleIndex] = button.dataset.inspectorTop.split(':');
      const maxTopShelfSlot = Math.max(
        0,
        Math.min(slotCount - 1, Math.floor(clampTopShelfMm(state.topShelfMm) / HOLE_PITCH_MM)),
      );
      moveModuleToSlot(bayId, Number(moduleIndex), maxTopShelfSlot);
    });
  });

  previewInspector.querySelectorAll('[data-inspector-remove-bay]').forEach((button) => {
    button.addEventListener('click', () => {
      removeBay(button.dataset.inspectorRemoveBay);
    });
  });

  previewInspector.querySelectorAll('[data-inspector-remove-module]').forEach((button) => {
    button.addEventListener('click', () => {
      const [bayId, moduleIndex] = button.dataset.inspectorRemoveModule.split(':');
      removeModuleFromBay(bayId, Number(moduleIndex));
    });
  });
}

function calculateSummary() {
  const totalWidth = state.bays.reduce((sum, bay) => sum + bay.width, 0);
  // No bays = no spines. Spines = bays + 1 only when there are bays.
  const totalSpines = state.bays.length === 0 ? 0 : state.bays.length + 1;
  const selectedSpine = getSelectedSpine();
  const shelfCount = state.bays.reduce(
    (count, bay) => count + bay.modules.filter((module) => module.type === 'shelf').length,
    0,
  );

  let moduleTotal = 0;
  let hasDrawerPricingGap = false;

  state.bays.forEach((bay) => {
    bay.modules.forEach((module) => {
      if (module.type === 'shelf') {
        moduleTotal += catalog.shelves[bay.width][module.depth];
      } else {
        hasDrawerPricingGap = true;
      }
    });
  });

  const spineTotal = totalSpines > 0 ? totalSpines * selectedSpine.price : 0;
  const total = moduleTotal + spineTotal;

  return {
    totalWidth,
    totalSpines,
    shelfCount,
    moduleTotal,
    spineTotal,
    total,
    hasDrawerPricingGap,
    selectedSpine,
  };
}


function getRecommendations(summary) {
  const items = [];
  const exactKit = catalog.kits.find((kit) => {
    if (state.bays.length !== 1) return false;
    const [bay] = state.bays;
    if (bay.width !== kit.width || state.spineHeight !== kit.spineHeight || bay.modules.length !== 2) return false;
    const [top, bottom] = bay.modules;
    return top.type === 'shelf'
      && bottom.type === 'shelf'
      && top.depth === kit.topDepth
      && bottom.depth === kit.bottomDepth;
  });

  if (exactKit) {
    items.push(`${exactKit.label} exactly matches this single-bay build, so the starter kit is the simplest way to buy it.`);
  }

  if (state.bays.length > 1) {
    items.push('Because the bays sit side by side, the middle supports are shared automatically. Your spine count already reflects that catalog rule.');
  }

  const deepShelves = state.bays.some((bay) => bay.modules.some((module) => module.type === 'shelf' && module.depth === 35));
  if (deepShelves) {
    items.push('You are using D35 shelves, which the catalog positions for plants, appliances, art books, and record players.');
  }

  if (summary.hasDrawerPricingGap) {
    items.push('Drawer pricing is still marked coming soon, so the total shown here excludes any drawer modules.');
  }

  if (!items.length) {
    items.push('This is a solid base layout. Add another bay later if you want more storage without changing the overall system language.');
  }

  return items;
}

function renderSelectOptions() {
  // Finish is now toggle buttons in the top bar (static HTML), not a dropdown.
  // Nothing to populate here — buttons are already rendered in index.html.
}

function renderSpineOptions() {
  spineSelect.innerHTML = catalog.spines
    .map((spine) => `
      <option value="${spine.height}">
        ${formatNumber(spine.height, 0)} cm
      </option>
    `)
    .join('');
}

function renderWidthOptions() {
  if (typeof widthOptions === 'undefined' || !widthOptions) return;
  widthOptions.innerHTML = catalog.widths
    .map((width) => `<button class="chip-btn" type="button" data-width="${width}">Add ${width} cm bay</button>`)
    .join('');

  widthOptions.querySelectorAll('[data-width]').forEach((button) => {
    button.addEventListener('click', () => {
      addBay(Number(button.dataset.width));
    });
  });
}

function renderKitOptions() {
  kitOptions.innerHTML = catalog.kits
    .map((kit) => `
      <button class="kit-btn ${state.selectedKitId === kit.id ? 'active' : ''}" type="button" data-kit-id="${kit.id}">
        <strong>${kit.label} · W${kit.width}</strong>
        <span>D${kit.topDepth} + D${kit.bottomDepth} · H${kit.spineHeight} · ${formatCurrency(kit.price)}</span>
        <span>${kit.description}</span>
      </button>
    `)
    .join('');

  kitOptions.querySelectorAll('[data-kit-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const kit = catalog.kits.find((item) => item.id === button.dataset.kitId);
      if (!kit) return;
      applyStarterKit(kit);
      render();
    });
  });
}

function renderNotes() {
  catalogNotes.innerHTML = catalog.notes
    .map((note) => `<article class="note-card">${note}</article>`)
    .join('');
}

function renderBays() {
  if (typeof bayList === 'undefined' || !bayList) return;
  bayList.innerHTML = state.bays
    .map((bay, bayIndex) => `
      <article class="bay-card" data-bay-id="${bay.id}">
        <div class="bay-head">
          <div>
            <strong>Bay ${bayIndex + 1}</strong>
            <div>${bay.width} cm span</div>
          </div>
          <div class="bay-actions">
            <select class="module-select" data-role="bay-width">
              ${catalog.widths.map((width) => `<option value="${width}" ${width === bay.width ? 'selected' : ''}>${width} cm width</option>`).join('')}
            </select>
            <button class="bay-remove" type="button" data-role="remove-bay">Remove</button>
          </div>
        </div>
        <div class="bay-body">
          ${bay.modules.map((module, moduleIndex) => `
            <div class="module-row">
              <div class="module-meta">
                <strong>${module.type === 'shelf' ? `Shelf D${module.depth}` : 'Drawer D30'}</strong>
                <small>${module.type === 'shelf'
                  ? `${formatCurrency(catalog.shelves[bay.width][module.depth])} at W${bay.width}`
                  : 'Price excluded until catalog release'}</small>
              </div>
              <div class="module-controls">
                <select class="module-select" data-role="module-type" data-module-index="${moduleIndex}">
                  <option value="15" ${module.type === 'shelf' && module.depth === 15 ? 'selected' : ''}>Shelf D15</option>
                  <option value="25" ${module.type === 'shelf' && module.depth === 25 ? 'selected' : ''}>Shelf D25</option>
                  <option value="35" ${module.type === 'shelf' && module.depth === 35 ? 'selected' : ''}>Shelf D35</option>
                  <option value="drawer" ${module.type === 'drawer' ? 'selected' : ''}>Drawer D30</option>
                </select>
                <button class="module-remove" type="button" data-role="remove-module" data-module-index="${moduleIndex}">Remove</button>
              </div>
            </div>
          `).join('')}
          <button class="chip-btn" type="button" data-role="add-shelf">Add shelf</button>
        </div>
      </article>
    `)
    .join('');

  bayList.querySelectorAll('[data-bay-id]').forEach((card) => {
    const bayId = card.dataset.bayId;
    const widthControl = card.querySelector('[data-role="bay-width"]');
    const removeButton = card.querySelector('[data-role="remove-bay"]');
    const addShelfButton = card.querySelector('[data-role="add-shelf"]');
    const moduleControls = Array.from(card.querySelectorAll('[data-role="module-type"]'));
    const removeModuleButtons = Array.from(card.querySelectorAll('[data-role="remove-module"]'));

    widthControl?.addEventListener('change', (event) => {
      updateBayWidth(bayId, Number(event.target.value));
    });

    removeButton?.addEventListener('click', () => {
      removeBay(bayId);
    });

    addShelfButton?.addEventListener('click', () => {
      addShelfToBay(bayId);
    });

    moduleControls.forEach((control) => {
      control.addEventListener('change', (event) => {
        updateBayModule(bayId, Number(control.dataset.moduleIndex), event.target.value);
      });
    });

    removeModuleButtons.forEach((button) => {
      button.addEventListener('click', () => {
        removeModuleFromBay(bayId, Number(button.dataset.moduleIndex));
      });
    });
  });
}

function renderPreview(summary) {
  // Empty state: show hint and a bare wall, skip all bay rendering
  if (state.bays.length === 0) {
    const wallHeightMm = Math.max(1, state.wallHeight * 10);
    const wallWidthMm = Math.max(1, state.wallWidth * 10);
    const previewRect = layoutPreview.parentElement?.getBoundingClientRect() || layoutPreview.getBoundingClientRect();
    const availableWidth = Math.max(220, (previewRect.width || window.innerWidth - 520) * 0.88);
    const availableHeight = Math.max(260, (previewRect.height || window.innerHeight - 260) - 100);
    const pxPerMm = Math.max(0.04, Math.min(0.5, availableWidth / wallWidthMm, availableHeight / wallHeightMm));
    const wallPxWidth = Math.round(wallWidthMm * pxPerMm);
    const wallPxHeight = Math.round(wallHeightMm * pxPerMm);
    layoutPreview.innerHTML = `
      <div class="layout-preview-inner" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;">
        <div style="position:relative;">
          <div class="preview-wall-canvas" style="width:${wallPxWidth}px;height:${wallPxHeight}px;border:2px solid var(--line-strong);background:var(--bg-stage);position:relative;border-radius:2px;">
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;pointer-events:none;">
              <div style="font-size:0.78rem;font-weight:600;color:var(--text-soft);letter-spacing:0.05em;text-transform:uppercase;">Empty wall</div>
              <div style="font-size:0.72rem;color:var(--text-soft);opacity:0.7;">Add a bay from the sidebar to start building</div>
            </div>
          </div>
          <div style="text-align:center;margin-top:8px;font-size:0.72rem;color:var(--text-soft);">
            ${formatLengthCm(state.wallWidth)} × ${formatLengthCm(state.wallHeight)}
          </div>
        </div>
      </div>
    `;
    renderPreviewInspector(getSlotCount());
    return;
  }

  const slotCount = getSlotCount();
  const wallHeightMm = Math.max(1, state.wallHeight * 10);
  const wallWidthMm = Math.max(1, state.wallWidth * 10);
  const spineHeightMm = summary.selectedSpine.height * 10;
  const previewRect = layoutPreview.parentElement?.getBoundingClientRect() || layoutPreview.getBoundingClientRect();
  const sidebarIsClosed = appShell?.dataset.sidebarState === 'closed';
  const fallbackWidth = sidebarIsClosed ? window.innerWidth - 120 : window.innerWidth - 520;
  const fallbackHeight = window.innerHeight - 260;
  const availableWidth = Math.max(220, (previewRect.width || fallbackWidth) * 0.88);
  const availableHeight = Math.max(260, (previewRect.height || fallbackHeight) - 100);
  const pxPerMm = Math.max(
    0.04,
    Math.min(
      0.5,
      availableWidth / wallWidthMm,
      availableHeight / wallHeightMm,
    ),
  );
  const wallPxWidth = Math.round(wallWidthMm * pxPerMm);
  const wallPxHeight = Math.round(wallHeightMm * pxPerMm);
  const trackHeight = Math.max(120, Math.round(spineHeightMm * pxPerMm));
  const slotHeight = HOLE_PITCH_MM * pxPerMm;
  const spineWidth = Math.max(8, Math.round(SPINE_WIDTH_MM * pxPerMm));
  const holeSize = Math.max(4, PIN_WIDTH_MM * pxPerMm);
  const shelfHeight = Math.max(22, SHELF_VISUAL_HEIGHT_MM * pxPerMm);
  const drawerHeight = Math.max(22, DRAWER_HEIGHT_MM * pxPerMm);
  const shelfLip = Math.max(4, SHELF_LIP_MM * pxPerMm);
  const shelfThickness = Math.max(1, SHELF_THICKNESS_MM * pxPerMm);
  const shelfOverhang = Math.max(4, 2 * pxPerMm) + 1;
  const gridStep = 300 * pxPerMm;
  const humanReferenceCm = state.humanReferenceCm;
  const humanHeight = (humanReferenceCm * 10) * pxPerMm;
  const rawTopLineFromTop = wallPxHeight - (state.topShelfMm * pxPerMm);
  const topLineFromTop = Math.max(0, Math.min(wallPxHeight - trackHeight, rawTopLineFromTop));
  const layoutWidthMm = getLayoutWidthMm(summary);
  const leftClearanceMm = getLeftClearanceMm(wallWidthMm, layoutWidthMm);
  const rightClearanceMm = Math.max(0, wallWidthMm - layoutWidthMm - leftClearanceMm);
  const floorClearanceMm = Math.max(0, state.topShelfMm - spineHeightMm);
  const footprintLeftPx = leftClearanceMm * pxPerMm;
  const footprintBottomPx = Math.max(0, wallPxHeight - topLineFromTop - trackHeight);
  const footprintWidthPx = layoutWidthMm * pxPerMm;
  const rightClearancePx = Math.max(0, wallPxWidth - (footprintLeftPx + footprintWidthPx));
  const bottomDimensionX = getBottomDimensionAnchorPx(summary, footprintLeftPx, pxPerMm);
  renderPreviewInspector(slotCount);


  const baysMarkup = state.bays
    .map((bay, bayIndex) => {
      const bayWidthPixels = Math.max(56, bay.width * 10 * pxPerMm);
      const isSelectedBay = state.selectedBayId === bay.id;
      const topGapMm = spineHeightMm - FIRST_HOLE_MM - ((slotCount - 1) * HOLE_PITCH_MM);
      const holeStart = topGapMm * pxPerMm;
      const slotLines = Array.from({ length: slotCount }, (_, rowFromTop) => {
        const top = holeStart + (rowFromTop * slotHeight);
        return `<div class="preview-slot-line" style="top:${top}px"></div>`;
      }).join('');
      const modules = bay.modules
        .map((module, moduleIndex) => {
          const moduleHeight = module.type === 'shelf' ? shelfHeight : drawerHeight;
          const isSelectedModule = state.selectedBayId === bay.id && state.selectedModuleIndex === moduleIndex;
          let bottom;
          if (module.type === 'drawer') {
            // Bottom-anchored: slot 0 = flush with spine bottom, slot N = N×HOLE_PITCH above spine bottom
            bottom = module.slot * slotHeight;
          } else {
            const rowFromTop = (slotCount - 1) - module.slot;
            const topAlignedToHole = holeStart + (rowFromTop * slotHeight);
            bottom = Math.max(0, trackHeight - (topAlignedToHole + moduleHeight));
          }
          // Clean label only — depth editing is in the bottom inspector panel
          const isDoubleDrawer = module.type === 'drawer' && module.variant === 'double';
          const moduleLabel = module.type === 'shelf'
            ? `<div class="preview-module-copy"><div class="preview-module-title">Shelf D${module.depth}${module.reversed ? ' · Flipped' : ''}</div></div>`
            : isDoubleDrawer
              ? `<div class="preview-module-copy preview-module-double-drawer"><div class="preview-module-title">Double Drawer</div></div>`
              : `<div class="preview-module-copy"><div class="preview-module-title">Single Drawer</div></div>`;
          return `
            <div class="preview-module-wrap" style="bottom:${bottom}px">
              <button
                class="preview-module preview-module-btn ${isSelectedModule ? 'is-selected' : ''} ${isDoubleDrawer ? 'is-double-drawer' : ''} ${module.reversed ? 'is-reversed' : ''}"
                type="button"
                data-type="${module.type}"
                data-select-module="${bay.id}:${moduleIndex}"
                style="${module.type === 'shelf'
                  ? `height:${moduleHeight}px;width:calc(100% + ${shelfOverhang * 2}px);margin-left:-${shelfOverhang}px;--shelf-lip:${shelfLip}px;--shelf-thickness:${shelfThickness}px`
                  : `height:${moduleHeight}px;width:calc(100% + ${shelfOverhang * 2}px);margin-left:-${shelfOverhang}px`}"
              >${moduleLabel}${isSelectedModule ? '<span class="preview-module-ring" aria-hidden="true"></span>' : ''}</button>
              ${isSelectedModule ? `
                <button
                  class="preview-module-remove"
                  type="button"
                  data-remove-module-inline="${bay.id}:${moduleIndex}"
                  aria-label="Remove ${module.type}"
                >-</button>
                ${module.type === 'shelf' ? `
                  <button
                    class="preview-module-flip"
                    type="button"
                    data-flip-module-inline="${bay.id}:${moduleIndex}"
                    aria-label="Flip shelf"
                  >&#x21C5;</button>
                ` : ''}
              ` : ''}
            </div>
          `;
        })
        .join('');

      return `
        <div class="preview-bay-shell ${isSelectedBay ? 'is-selected' : ''}" data-bay-id="${bay.id}" style="${bayIndex > 0 ? `--shared-spine:${spineWidth}px` : ''}">
          <div class="preview-bay-caption ${isSelectedBay ? 'is-selected' : ''}">
            <div class="preview-bay-caption-label">Bay ${bayIndex + 1}</div>
            <div class="preview-bay-width-row">
              ${catalog.widths.map(w => `
                <button class="preview-bay-width-option ${bay.width === w ? 'is-active' : ''}" type="button" data-bay-width-select="${bay.id}:${w}">W${w}</button>
              `).join('')}
            </div>
            <button class="preview-bay-remove" type="button" data-remove-bay-inline="${bay.id}" ${state.bays.length === 1 ? 'disabled' : ''}>-</button>
          </div>
          <div class="preview-bay-frame">
            ${bayIndex === 0 ? `<div class="preview-spine finish-${state.finish.toLowerCase()}" style="width:${spineWidth}px;height:${trackHeight}px"></div>` : ''}
            <div
              class="preview-track"
              data-track-click="${bay.id}"
              data-slot-count="${slotCount}"
              style="width:${bayWidthPixels}px;height:${trackHeight}px;--slot-height:${slotHeight}px;--hole-start:${holeStart}px;--hole-end:${FIRST_HOLE_MM * pxPerMm}px"
            >
              <div class="preview-slot-indicator" hidden></div>
              ${slotLines}
              ${modules}
            </div>
            <div class="preview-spine finish-${state.finish.toLowerCase()}" style="width:${spineWidth}px;height:${trackHeight}px"></div>
          </div>
        </div>
      `;
    })
    .join('');

  layoutPreview.innerHTML = `
    <div class="preview-wall-canvas" style="--grid-step:${gridStep}px;--wall-width:${wallPxWidth}px;--wall-height:${wallPxHeight}px;--footprint-left:${footprintLeftPx}px;--footprint-width:${footprintWidthPx}px">
      <div class="preview-wall-plane">
        <!-- Wall dimension annotations, resize handle, and top-line label removed -->
        <div class="preview-top-line" style="top:${topLineFromTop}px;border-top:none">
          <button class="preview-top-line-handle" type="button" data-top-line-handle aria-label="Drag top shelf line" style="display:none"></button>
        </div>
        <div class="preview-wall">
          <!-- Footprint bounding box hidden -->
          <div class="preview-footprint" style="display:none"></div>
          <div class="preview-dimension horizontal" style="left:0;top:${topLineFromTop + (trackHeight / 2)}px;width:${footprintLeftPx}px;height:1px">
            <div class="preview-dimension-line horizontal"></div>
            ${renderEditableDimension('left', mmToDisplayLength(leftClearanceMm))}
          </div>
          <div class="preview-dimension horizontal" style="left:${footprintLeftPx + footprintWidthPx}px;top:${topLineFromTop + (trackHeight / 2)}px;width:${rightClearancePx}px;height:1px">
            <div class="preview-dimension-line horizontal"></div>
            ${renderEditableDimension('right', mmToDisplayLength(rightClearanceMm))}
          </div>
          <div class="preview-dimension vertical" style="left:${bottomDimensionX}px;top:${topLineFromTop + trackHeight}px;width:1px;height:${footprintBottomPx}px">
            <div class="preview-dimension-line vertical"></div>
            ${renderEditableDimension('bottom', mmToDisplayLength(floorClearanceMm))}
          </div>
          <div class="preview-group" style="top:${topLineFromTop}px;left:${footprintLeftPx}px;transform:none">
            <button class="preview-add-bay-btn" type="button" data-add-bay="left" aria-label="Add bay to the left">+</button>
            ${baysMarkup}
            <button class="preview-add-bay-btn" type="button" data-add-bay="right" aria-label="Add bay to the right">+</button>
          </div>
        </div>
      </div>
    </div>
  `;

  layoutPreview.querySelectorAll('[data-select-module]').forEach((button) => {
    button.addEventListener('click', (event) => {
      if (Date.now() < suppressModuleClickUntil) {
        event.preventDefault();
        return;
      }
      const [bayId, moduleIndex] = button.dataset.selectModule.split(':');
      selectModule(bayId, Number(moduleIndex));
    });
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const [bayId, moduleIndex] = button.dataset.selectModule.split(':');
      const bay = state.bays.find((b) => b.id === bayId);
      const module = bay?.modules[Number(moduleIndex)];
      const label = module?.type === 'shelf'
        ? `Shelf D${module.depth}${module.reversed ? ' · Flipped' : ''}`
        : module?.type === 'drawer'
          ? (module.variant === 'double' ? 'Double Drawer' : 'Single Drawer')
          : 'Module';
      dragState = {
        bayId,
        moduleIndex: Number(moduleIndex),
        startY: event.clientY,
        startX: event.clientX,
        didDrag: false,
        button,
        hoveredTrack: button.closest('.preview-track'),
        hoveredSlot: Number(moduleIndex) >= 0
          ? bay?.modules[Number(moduleIndex)]?.slot ?? null
          : null,
        originSlot: bay?.modules[Number(moduleIndex)]?.slot ?? null,
        ghost: null,
        ghostLabel: label,
        ghostWidth: button.offsetWidth,
        moduleType: module?.type || 'shelf',
        moduleVariant: module?.variant || 'single',
      };
      button.classList.add('is-dragging');
      document.documentElement.classList.add('is-module-dragging');
      if (dragState.hoveredTrack && Number.isInteger(dragState.originSlot)) {
        paintDropTarget(dragState.hoveredTrack, dragState.originSlot);
      }
    });
  });

  layoutPreview.querySelectorAll('.preview-bay-shell[data-bay-id]').forEach((shell) => {
    shell.addEventListener('pointerdown', (event) => {
      if (event.target.closest('[data-select-module], button, input, select')) return;
      const bayId = shell.dataset.bayId;
      if (!bayId) return;
      event.preventDefault();
      state.selectedBayId = bayId;
      state.selectedModuleIndex = null;
      const rect = shell.getBoundingClientRect();
      const originIndex = state.bays.findIndex((bay) => bay.id === bayId);
      bayDragState = {
        active: true,
        bayId,
        startX: event.clientX,
        didDrag: false,
        element: shell,
        originIndex,
        currentIndex: originIndex,
        targetIndex: originIndex,
        originCenterX: (rect.left + rect.right) / 2,
      };
      shell.classList.add('is-dragging');
    });
  });

  layoutPreview.querySelectorAll('.preview-wall').forEach((wall) => {
    wall.addEventListener('click', (event) => {
      const clickedModule = event.target.closest('[data-select-module]');
      const clickedControl = event.target.closest('button, input, select');
      const clickedTrack = event.target.closest('.preview-track');
      if (clickedModule || clickedControl || clickedTrack) return;
      clearModuleSelection();
    });
  });

  layoutPreview.querySelectorAll('[data-add-bay]').forEach((button) => {
    button.addEventListener('click', () => {
      const position = button.dataset.addBay;
      const bay = {
        id: crypto.randomUUID(),
        width: 60,
        modules: [],
      };
      state.selectedKitId = null;
      if (position === 'left') {
        state.bays = [bay, ...state.bays];
      } else {
        state.bays = [...state.bays, bay];
      }
      state.selectedBayId = bay.id;
      state.selectedModuleIndex = null;
      // Auto-expand wall width to fit all bays with minimum 50mm clearance each side
      const MIN_CLEARANCE_MM = 50;
      const newLayoutWidthMm = getLayoutWidthMm(calculateSummary());
      const minWallWidthMm = newLayoutWidthMm + MIN_CLEARANCE_MM * 2;
      if (state.wallWidth * 10 < minWallWidthMm) {
        state.wallWidth = Math.ceil(minWallWidthMm / 10);
        lastAppliedWidth = state.wallWidth;
        const wallWidthInput = document.getElementById('wall-width');
        if (wallWidthInput) wallWidthInput.value = state.wallWidth;
        const applyBtn = document.getElementById('apply-wall-btn');
        if (applyBtn) applyBtn.disabled = true;
      }
      render();
    });
  });

  layoutPreview.querySelectorAll('[data-track-click]').forEach((track) => {
    track.addEventListener('click', (event) => {
      if (event.target !== track) return;
      state.selectedBayId = track.dataset.trackClick;
      state.selectedModuleIndex = null;
      render();
    });
  });

  // NOTE: the click-on-canvas-background deselect handler used to live here, but
  // attaching it inside renderPreview meant a fresh listener was added to the
  // persistent layoutPreview element on every render — listeners accumulated
  // exponentially and eventually froze the page on click. It now lives in
  // wireControls() as a one-time bind.

  layoutPreview.querySelectorAll('[data-top-line-handle]').forEach((handle) => {
    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      topLineDragState = {
        active: true,
        pxPerMm,
      };
    });
  });

  layoutPreview.querySelectorAll('[data-wall-resize-handle]').forEach((handle) => {
    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      wallResizeDragState = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: state.wallWidth,
        startHeight: state.wallHeight,
        pxPerCmX: pxPerMm * 10,
        pxPerCmY: pxPerMm * 10,
      };
    });
  });

  layoutPreview.querySelectorAll('[data-bay-width-select]').forEach((button) => {
    button.addEventListener('click', () => {
      const [bayId, width] = button.dataset.bayWidthSelect.split(':');
      updateBayWidth(bayId, Number(width));
    });
  });

  layoutPreview.querySelectorAll('[data-module-depth-select]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const [bayId, moduleIndex, depth] = button.dataset.moduleDepthSelect.split(':');
      updateBayModule(bayId, Number(moduleIndex), depth);
    });
  });

  layoutPreview.querySelectorAll('[data-remove-bay-inline]').forEach((button) => {
    button.addEventListener('click', () => {
      removeBay(button.dataset.removeBayInline);
    });
  });

  layoutPreview.querySelectorAll('[data-remove-module-inline]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const [bayId, moduleIndex] = button.dataset.removeModuleInline.split(':');
      removeModuleFromBay(bayId, Number(moduleIndex));
    });
  });

  layoutPreview.querySelectorAll('[data-flip-module-inline]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const [bayId, moduleIndex] = button.dataset.flipModuleInline.split(':');
      pushHistory();
      state.bays = state.bays.map((bay) => {
        if (bay.id !== bayId) return bay;
        return {
          ...bay,
          modules: bay.modules.map((module, index) => {
            if (index !== Number(moduleIndex)) return module;
            return { ...module, reversed: !module.reversed };
          }),
        };
      });
      render();
    });
  });

  layoutPreview.querySelectorAll('[data-edit-dimension]').forEach((button) => {
    const beginEdit = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const source = button.closest('.preview-wall-resize-badge')
        ? 'corner'
        : button.closest('.preview-wall-measure')
          ? 'wall-measure'
          : 'annotation';
      beginDimensionEdit(button.dataset.editDimension, source);
    };
    button.addEventListener('click', beginEdit);
  });

  layoutPreview.querySelectorAll('[data-wall-measure-edit]').forEach((measure) => {
    const beginMeasureEdit = (event) => {
      if (event.target.closest('[data-dimension-input]')) return;
      event.preventDefault();
      event.stopPropagation();
      beginDimensionEdit(measure.dataset.wallMeasureEdit, 'wall-measure');
    };
    measure.addEventListener('click', beginMeasureEdit);
  });

  layoutPreview.querySelectorAll('[data-dimension-input]').forEach((input) => {
    const key = input.dataset.dimensionInput;

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        commitDimensionEdit(key, input.value, wallWidthMm, layoutWidthMm);
        render();
      } else if (event.key === 'Escape') {
        state.editingDimension = null;
        state.editingDimensionSource = null;
        render();
      }
    });

    input.addEventListener('blur', () => {
      commitDimensionEdit(key, input.value, wallWidthMm, layoutWidthMm);
      render();
    });
  });

}

function renderSummary(summary) {
  if (interactionError) {
    interactionError.hidden = !state.interactionError;
    interactionError.textContent = state.interactionError;
  }

  statWidth.textContent = formatLengthCm(summary.totalWidth);
  statSpines.textContent = String(summary.totalSpines);
  statShelves.textContent = String(summary.shelfCount);
  statTotal.textContent = formatTotalValue(summary, state.totalCurrency);
  if (statTotalBomBtn) statTotalBomBtn.textContent = formatTotalValue(summary, state.totalCurrency);
  renderTotalCurrencyMenu(summary);

  const estimatorRows = getEstimateParts(summary)
    .map((part) => `
      <div class="estimator-row">
        <div class="estimator-copy">
          <div class="estimator-label">${part.label}</div>
          <div class="estimator-meta">${getPartSubtitle(part, state.totalCurrency)}</div>
        </div>
        <div class="estimator-qty">x ${part.quantity}</div>
        <div class="estimator-value">${part.priced ? formatConvertedCurrency(part.amount, state.totalCurrency) : 'TBD'}</div>
      </div>
    `);

  const shippingDisplay = getShippingDisplay(summary, state.totalCurrency);
  if (shippingDisplay) {
    estimatorRows.push(`
      <div class="estimator-row estimator-row-shipping">
        <div class="estimator-copy">
          <div class="estimator-label">Shipping</div>
          <div class="estimator-meta">${shippingDisplay.meta}</div>
        </div>
        <div class="estimator-qty"></div>
        <div class="estimator-value">${shippingDisplay.value}</div>
      </div>
    `);
  }

  bomList.innerHTML = estimatorRows.join('');
  if (stageEstimatorNote) {
    stageEstimatorNote.textContent = summary.hasDrawerPricingGap
      ? 'Drawers priced separately'
      : 'Live parts list';
  }

  recommendations.innerHTML = getRecommendations(summary)
    .map((line) => `<div class="summary-line">${line}</div>`)
    .join('');
}

function render() {
  if (isRendering) return;
  isRendering = true;
  try {
  try {
  if (!Number.isFinite(state.topShelfMm)) {
    setTopShelfMm(DEFAULT_TOP_SHELF_MM, { snap: false });
  } else {
    state.topShelfMm = clampTopShelfMm(state.topShelfMm);
  }
  normalizeStateForGrid();
  normalizeSelection();
  renderSpineOptions();
  if (wallWidthLabel) {
    wallWidthLabel.textContent = `Wall Width (${state.displayUnit})`;
  }
  if (wallHeightLabel) {
    wallHeightLabel.textContent = `Wall Height (${state.displayUnit})`;
  }
  if (topLineLabel) {
    topLineLabel.textContent = `Top shelf line (${state.displayUnit})`;
  }
  wallWidthInput.min = String(state.displayUnit === 'in' ? 27.56 : 70); // min 70cm
  wallWidthInput.step = String(state.displayUnit === 'in' ? 0.5 : 1);
  wallWidthInput.value = formatNumber(wallLengthToDisplay(state.wallWidth), state.displayUnit === 'in' ? 2 : 1);
  wallHeightInput.min = String(state.displayUnit === 'in' ? 25.59 : 65); // min 65cm
  wallHeightInput.step = String(state.displayUnit === 'in' ? 0.5 : 1);
  wallHeightInput.value = formatNumber(wallLengthToDisplay(state.wallHeight), state.displayUnit === 'in' ? 2 : 1);
  if (unitSelect) {
    unitSelect.value = state.displayUnit;
  }
  // Sync finish button active state with current state
  finishButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.finish === state.finish);
  });
  spineSelect.value = String(state.spineHeight);
  if (topLineInput) {
    const { min, max } = getTopShelfBoundsMm();
    topLineInput.min = String(topLineToDisplay(min));
    topLineInput.max = String(topLineToDisplay(max));
    topLineInput.step = String(getDisplayStepForTopLine());
    topLineInput.value = formatNumber(topLineToDisplay(state.topShelfMm), state.displayUnit === 'in' ? 2 : 0);
  }

  renderKitOptions();
  renderBays();

  const summary = calculateSummary();
  renderPreview(summary);
  renderSummary(summary);
  } catch (err) {
    // Defensive: surface the exception so the user can report it instead of a frozen page.
    console.error('[render] crashed:', err);
    if (typeof interactionError !== 'undefined' && interactionError) {
      interactionError.hidden = false;
      interactionError.textContent = `Render error: ${err?.message || err}`;
    }
  }
  } finally {
    isRendering = false;
  }
}

function setSidebarState(nextState) {
  if (!appShell) return;
  appShell.dataset.sidebarState = nextState;
  if (sidebarToggle) {
    sidebarToggle.textContent = nextState === 'closed' ? 'Open' : 'Close';
    sidebarToggle.setAttribute('aria-expanded', String(nextState !== 'closed'));
  }
  if (sidebarReveal) {
    sidebarReveal.style.display = nextState === 'closed' ? 'inline-flex' : 'none';
    sidebarReveal.setAttribute('aria-expanded', String(nextState !== 'closed'));
  }
  requestAnimationFrame(() => {
    render();
  });
}

// Evaluate simple arithmetic in input fields: e.g. "190+50" → 240, "230-10" → 220
function evalSimpleMath(str) {
  const trimmed = String(str).trim();
  // Match a number followed by any number of +/- number pairs
  if (/^[\d.]+([+\-*/][\d.]+)*$/.test(trimmed)) {
    try {
      const result = Function('"use strict"; return (' + trimmed + ')')();
      if (Number.isFinite(result)) return result;
    } catch (e) { /* fall through */ }
  }
  return Number(trimmed) || 0;
}

function wireControls() {
  // ── WALL DIMENSION INPUTS + APPLY BUTTON ────────────────────────
  // Track the last applied values to know when Apply should be enabled.
  lastAppliedWidth  = state.wallWidth;
  lastAppliedHeight = state.wallHeight;

  const applyWallBtn = document.getElementById('apply-wall-btn');

  function syncApplyBtn() {
    const currentWidth  = Math.max(70, displayToWallLength(evalSimpleMath(wallWidthInput.value) || 70));
    const currentHeight = Math.max(65, displayToWallLength(evalSimpleMath(wallHeightInput.value) || 65));
    const changed = currentWidth !== lastAppliedWidth || currentHeight !== lastAppliedHeight;
    if (applyWallBtn) {
      applyWallBtn.disabled = !changed;
    }
  }

  function applyWallDimensions() {
    const parsedWidth  = evalSimpleMath(wallWidthInput.value);
    const parsedHeight = evalSimpleMath(wallHeightInput.value);
    // If either input is invalid (0 or NaN), restore previous values and bail
    if (!parsedWidth || !parsedHeight) {
      wallWidthInput.value  = lastAppliedWidth;
      wallHeightInput.value = lastAppliedHeight;
      if (applyWallBtn) applyWallBtn.disabled = true;
      return;
    }
    pushHistory();
    const MIN_SIDE_CLEARANCE_CM = 5;
    const layoutWidthCm = getLayoutWidthMm() / 10;
    const spineHeightCm = state.spineHeight;
    const minWidth  = Math.max(70, layoutWidthCm + MIN_SIDE_CLEARANCE_CM * 2);
    const minHeight = Math.max(65, spineHeightCm + MIN_SIDE_CLEARANCE_CM * 2);
    const nextWidth  = Math.max(minWidth,  displayToWallLength(parsedWidth));
    const nextHeight = Math.max(minHeight, displayToWallLength(parsedHeight));
    // Replace input with computed value so the field shows the result
    wallWidthInput.value = nextWidth;
    wallHeightInput.value = nextHeight;
    state.wallWidth  = nextWidth;
    state.wallHeight = nextHeight;
    state.topShelfMm = Math.max(state.topShelfMm, getTopShelfBoundsMm().min);
    lastAppliedWidth  = nextWidth;
    lastAppliedHeight = nextHeight;
    setInteractionError('');
    if (applyWallBtn) applyWallBtn.disabled = true; // back to gray after apply
    render();
  }

  // Enable Apply button when either input changes
  wallWidthInput.addEventListener('input', syncApplyBtn);
  wallHeightInput.addEventListener('input', syncApplyBtn);

  // Enter key in either input → apply immediately
  wallWidthInput.addEventListener('keydown',  (e) => { if (e.key === 'Enter') applyWallDimensions(); });
  wallHeightInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyWallDimensions(); });

  // Apply button click
  applyWallBtn?.addEventListener('click', applyWallDimensions);

  unitSelect?.addEventListener('change', (event) => {
    state.displayUnit = event.target.value === 'in' ? 'in' : 'cm';
    render();
  });

  // Finish toggle buttons (replaces finish-select dropdown)
  finishButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      state.finish = btn.dataset.finish;
      setInteractionError('');
      render();
    });
  });

  spineSelect.addEventListener('change', (event) => {
    state.selectedKitId = null;
    state.spineHeight = Number(event.target.value);
    setInteractionError('');
    // Auto-expand wall height so floor clearance stays at least 10 cm each side
    const MIN_SIDE_CLEARANCE_MM = 100;
    const spineHeightMm = state.spineHeight * 10;
    const minWallHeightMm = spineHeightMm + MIN_SIDE_CLEARANCE_MM * 2;
    if (state.wallHeight * 10 < minWallHeightMm) {
      state.wallHeight = Math.ceil(minWallHeightMm / 10);
      lastAppliedHeight = state.wallHeight;
      const wallHeightInput = document.getElementById('wall-height');
      if (wallHeightInput) wallHeightInput.value = state.wallHeight;
      const applyBtn = document.getElementById('apply-wall-btn');
      if (applyBtn) applyBtn.disabled = true;
    }
    // Re-center spine vertically on the wall
    state.topShelfMm = getCenteredTopShelfMm();
    render();
  });

  topLineInput?.addEventListener('change', (event) => {
    const nextMm = displayToTopLine(Number(event.target.value));
    const minTopMm = getTopShelfBoundsMm().min;
    if (nextMm < minTopMm) {
      setInteractionError(`Top limit cannot be less than spine height of ${formatLengthMm(minTopMm)}.`);
      state.topShelfMm = minTopMm;
    } else {
      setTopShelfMm(nextMm, { snap: false });
    }
    render();
  });

  topLineInput?.addEventListener('blur', (event) => {
    const nextMm = displayToTopLine(Number(event.target.value));
    const minTopMm = getTopShelfBoundsMm().min;
    if (nextMm < minTopMm) {
      setInteractionError(`Top limit cannot be less than spine height of ${formatLengthMm(minTopMm)}.`);
      state.topShelfMm = minTopMm;
    } else {
      setTopShelfMm(nextMm, { snap: false });
    }
    render();
  });

  centerLayoutButton?.addEventListener('click', () => {
    centerLayoutInWall();
    render();
  });

  sidebarToggle?.addEventListener('click', () => {
    setSidebarState(appShell?.dataset.sidebarState === 'closed' ? 'open' : 'closed');
  });

  sidebarReveal?.addEventListener('click', () => {
    setSidebarState('open');
  });

  downloadPdfButton?.addEventListener('click', () => {
    const input = window.prompt('Enter your name for the PDF (optional):', '');
    if (input === null) return; // Cancel pressed
    triggerConfigurationPdfDownload(input);
  });

  statTotalBomBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    state.totalCurrencyMenuOpen = !state.totalCurrencyMenuOpen;
    render();
  });

  // Click on canvas background (outside any bay) — deselect.
  // Bound ONCE here (not inside renderPreview) because layoutPreview is a
  // persistent element; binding inside render leaks listeners every render.
  layoutPreview.addEventListener('click', (event) => {
    const insideBay = event.target.closest('.preview-bay-shell, .preview-add-bay-btn, [data-add-bay]');
    if (insideBay) return;
    if (state.selectedBayId === null && state.selectedModuleIndex === null) return;
    state.selectedBayId = null;
    state.selectedModuleIndex = null;
    render();
  });

  shareDesignButton?.addEventListener('click', async () => {
    const link = buildShareLink();
    const originalLabel = shareDesignButton.dataset.originalLabel || shareDesignButton.textContent;
    shareDesignButton.dataset.originalLabel = originalLabel;
    try {
      await navigator.clipboard.writeText(link);
      shareDesignButton.textContent = 'Copied!';
      setInteractionError('');
    } catch {
      shareDesignButton.textContent = 'Copy failed';
      setInteractionError('Could not copy the share link. Please try again.');
    }
    setTimeout(() => {
      shareDesignButton.textContent = originalLabel;
    }, 1500);
  });

  document.addEventListener('keydown', (event) => {
    if ((event.key === 'Backspace' || event.key === 'Delete')) {
      const target = event.target;
      const isTypingTarget = target instanceof HTMLElement
        && (target.closest('input, textarea, select') || target.isContentEditable);
      if (isTypingTarget) return;

      const selectedBay = state.bays.find((bay) => bay.id === state.selectedBayId);
      const selectedModule = Number.isInteger(state.selectedModuleIndex)
        ? selectedBay?.modules[state.selectedModuleIndex]
        : null;
      if (!selectedBay || !selectedModule) return;

      event.preventDefault();
      removeModuleFromBay(selectedBay.id, state.selectedModuleIndex);
    }
  });

  document.addEventListener('click', (event) => {
    const option = event.target.closest('[data-total-currency]');
    if (option) {
      state.totalCurrency = option.dataset.totalCurrency || 'INR';
      state.totalCurrencyMenuOpen = false;
      render();
      return;
    }

    if (!state.totalCurrencyMenuOpen) return;
    if (event.target.closest('.estimator-total-wrap')) return;
    state.totalCurrencyMenuOpen = false;
    render();
  });

  // ── Component library tiles (click + drag-to-canvas) ─────────────
  document.querySelectorAll('[data-add-component]').forEach((tile) => {
    let sidebarDragStarted = false;
    tile.addEventListener('click', () => {
      if (sidebarDragStarted) return;
      addComponentToBay(tile.dataset.addComponent);
    });
    tile.addEventListener('pointerdown', (event) => {
      sidebarDragStarted = false;
      const startX = event.clientX;
      const startY = event.clientY;
      const componentType = tile.dataset.addComponent;
      const onMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (!sidebarDragStarted && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
          sidebarDragStarted = true;
          const sidebarLabel = componentType.startsWith('shelf-')
            ? `Shelf D${componentType.split('-')[1]}`
            : componentType === 'drawer-single' ? 'Single Drawer' : 'Double Drawer';
          dragState = {
            bayId: null,
            moduleIndex: null,
            startY: startY,
            didDrag: true,
            button: null,
            hoveredTrack: null,
            hoveredSlot: null,
            hoveredBayId: null,
            originSlot: null,
            isSidebarDrag: true,
            sidebarComponent: componentType,
            ghostLabel: sidebarLabel,
            moduleType: componentType.includes('drawer') ? 'drawer' : 'shelf',
            moduleVariant: componentType === 'drawer-double' ? 'double' : 'single',
          };
          document.documentElement.classList.add('is-module-dragging');
        }
        if (sidebarDragStarted && dragState) {
          const pointerTrack = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest?.('.preview-track');
          if (pointerTrack) {
            const targetBayId = pointerTrack.dataset.trackClick;
            let hoveredSlot;
            if (dragState.moduleType === 'drawer') {
              const { slotHeight } = getTrackSlotMetrics(pointerTrack);
              if (Number.isFinite(slotHeight) && slotHeight > 0) {
                const drawerHeightPx = DRAWER_HEIGHT_MM * (slotHeight / HOLE_PITCH_MM);
                const trackRect = pointerTrack.getBoundingClientRect();
                const rawSlot = Math.round((trackRect.bottom - moveEvent.clientY - drawerHeightPx) / slotHeight);
                hoveredSlot = Math.max(0, Math.min(getModuleMaxSlot({ type: 'drawer' }), rawSlot));
              }
            } else {
              hoveredSlot = getNearestHoleSlot(pointerTrack, moveEvent.clientY, {
                strict: false, minSlot: 0, maxSlot: getSlotCount() - 1,
              });
            }
            if (Number.isInteger(hoveredSlot)) {
              dragState.hoveredTrack = pointerTrack;
              dragState.hoveredSlot = hoveredSlot;
              dragState.hoveredBayId = targetBayId;
              paintDropTarget(pointerTrack, hoveredSlot);
              paintDragPreview(pointerTrack, hoveredSlot, dragState.ghostLabel, dragState.moduleType || 'shelf', dragState.moduleVariant || 'single');
            }
          } else {
            clearDropTargets();
            clearDragPreview();
          }
        }
      };
      const onUp = (upEvent) => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        if (sidebarDragStarted && dragState) {
          handleDragEnd(upEvent);
          sidebarDragStarted = false;
        }
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });

  // ── Undo / Redo buttons in sidebar ───────────────────────────────
  document.getElementById('undo-btn')?.addEventListener('click', () => undo());
  document.getElementById('redo-btn')?.addEventListener('click', () => redo());

  // ── Clear button — remove all bays ──────────────────────────────
  document.getElementById('clear-btn')?.addEventListener('click', () => {
    pushHistory();
    const defaultBay = { id: crypto.randomUUID(), width: 60, modules: [] };
    state.bays = [defaultBay];
    state.selectedBayId = defaultBay.id;
    state.selectedModuleIndex = null;
    setInteractionError('');
    render();
  });

}

// Undo: Cmd+Z (Mac) / Ctrl+Z (Win) — Redo: Cmd+Shift+Z / Ctrl+Shift+Z
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  // Don't fire when typing inside an input or textarea
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); redo(); }
});

document.addEventListener('pointermove', handleDragMove);
document.addEventListener('pointerup', handleDragEnd);
document.addEventListener('pointercancel', handleDragEnd);
let resizeTimer = null;
let lastWinW = window.innerWidth;
let lastWinH = window.innerHeight;
let isRendering = false;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastWinW && window.innerHeight === lastWinH) return;
  lastWinW = window.innerWidth;
  lastWinH = window.innerHeight;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 120);
});

renderSelectOptions();
renderNotes();
wireControls();
setSidebarState('open');

// ── BRAND RESET BUTTON ─────────────────────────────────────────
document.getElementById('brand-reset')?.addEventListener('click', () => {
  pushHistory();
  const defaultBay = { id: crypto.randomUUID(), width: 60, modules: [] };
  state.bays = [defaultBay];
  state.selectedBayId = defaultBay.id;
  state.selectedModuleIndex = null;
  state.wallWidth = 180;
  state.wallHeight = 120;
  state.spineHeight = 63;
  state.finish = 'White';
  state.selectedKitId = null;
  state.layoutLeftMm = null;
  state.topShelfMm = getCenteredTopShelfMm();
  setInteractionError('');
  // Sync top bar inputs
  const wwInput = document.getElementById('wall-width');
  const whInput = document.getElementById('wall-height');
  if (wwInput) wwInput.value = 180;
  if (whInput) whInput.value = 120;
  document.getElementById('apply-wall-btn')?.setAttribute('disabled', '');
  document.querySelectorAll('.finish-btn').forEach(b => b.classList.toggle('active', b.dataset.finish === 'White'));
  render();
});

// ── PRICE DROPDOWN TOGGLE ──────────────────────────────────────
const priceDropdownToggle = document.getElementById('price-dropdown-toggle');
const priceDropdownPanel = document.getElementById('price-dropdown');

if (priceDropdownToggle && priceDropdownPanel) {
  priceDropdownToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !priceDropdownPanel.hidden;
    priceDropdownPanel.hidden = isOpen;
    priceDropdownToggle.setAttribute('aria-expanded', String(!isOpen));
  });

  document.addEventListener('click', (e) => {
    if (!priceDropdownPanel.hidden && !priceDropdownToggle.contains(e.target) && !priceDropdownPanel.contains(e.target)) {
      priceDropdownPanel.hidden = true;
      priceDropdownToggle.setAttribute('aria-expanded', 'false');
    }
  });
}

// If there's a `#c=...` share link in the URL, hydrate state from it before
// the default-bay bootstrapping. Falls back to defaults if the link is bad.
const loadedFromShareLink = loadFromShareLinkIfPresent();

// Start with one default 60 cm bay so the canvas is never empty on load
if (state.bays.length === 0) {
  state.bays = [{
    id: crypto.randomUUID(),
    width: 60,
    modules: [],
  }];
  state.selectedBayId = null;
}

// Center spine on the wall at startup — but only if we didn't just load
// a share link (the link carries its own topShelfMm).
if (!loadedFromShareLink) {
  state.topShelfMm = getCenteredTopShelfMm();
}

render();
