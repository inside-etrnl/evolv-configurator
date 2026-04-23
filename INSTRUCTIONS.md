# ETRNL Evolv Configurator — Build & Replication Guide

This file is a complete reference for replicating, understanding, and rebuilding the configurator from scratch. If you ever need to start over, or copy this into a new project, follow this guide.

---

## 1. What This Project Is

A web-based 2D product configurator for the ETRNL Evolv modular shelving system. Users:

1. Set wall dimensions (width × height in cm).
2. Pick a finish color (White / Black).
3. Pick a spine height (H42, H63, H105, H147, H189).
4. Add bays of three widths (W40, W60, W80) along the wall.
5. Add modules into each bay: shelves (D15, D25, D35) and drawers (single, double).
6. Drag modules around within a bay, between bays, or from the sidebar.
7. Get a live parts list (BOM) and total price in INR (with EUR/USD conversion).
8. Export a PDF of the configuration or share a copy-link URL of the design.

The whole thing is **vanilla JavaScript + HTML + CSS**. No build step. No framework. No bundler. You open `index.html` in a browser and it works.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Markup | Plain HTML (single `index.html`) |
| Styling | Plain CSS (single `configurator.css`, ~2500 lines) |
| Logic | Plain JavaScript (single `configurator.js`, ~3050 lines, no modules) |
| Fonts | Google Fonts — Inter |
| PDF Export | `jspdf` + `html2canvas` (vendored locally, no CDN) |
| Build tools | None |
| Dependencies | None except the two vendored PDF libs |

This is intentional. The user wanted something self-contained and editable without tooling.

---

## 3. Folder Layout

```
Evolv Configurator/
├── ETRNL Configurator — Master/   ← The working/live folder
│   ├── index.html
│   ├── configurator.js
│   ├── configurator.css
│   ├── INSTRUCTIONS.md            ← this file
│   ├── CLAUDE.md                  ← rules for AI agents working on the repo
│   ├── svg/                       ← reference SVG drawings (some unused)
│   │   ├── H63.svg
│   │   ├── Sketch2 v2.svg
│   │   ├── Spine 25mm - 30 Ma_layout.svg
│   │   ├── human-scale.svg
│   │   └── spine-mask.svg
│   └── vendor/
│       ├── html2canvas.min.js
│       └── jspdf.umd.min.js
├── CHANGELOG.md                   ← every change ever made, with date + files
└── Archive/
    └── Backups/                   ← frozen pre-git snapshots (legacy, no new ones)
        ├── ETRNL Configurator - v1
        ├── ETRNL Configurator - v2
        ├── ETRNL Configurator - v3
        ├── ETRNL Configurator - v4
        ├── ETRNL Configurator - v5
        ├── ETRNL Configurator - v6
        ├── ETRNL Configurator - v7
        ├── ETRNL Configurator - v8
        └── ETRNL Configurator - v9
```

**Rule:** Only the `ETRNL Configurator — Master/` folder is live. Backups are read-only references — never edit them.

---

## 4. Real-World Geometry Constants

All physical measurements come from the actual product. These constants live at the top of `configurator.js` and must match the real product:

```js
const SPINE_WIDTH_MM = 25;             // spine vertical bar width
const PIN_WIDTH_MM = 9;                // diameter of the mounting pin
const HOLE_PITCH_MM = 70;             // vertical distance between mounting holes
const FIRST_HOLE_MM = 104;            // distance from spine bottom to first hole
const SHELF_HEIGHT_MM = 110;          // shelf slot-occupancy height (used for conflict maths)
const SHELF_VISUAL_HEIGHT_MM = 126.5; // shelf drawn height incl. lip (rendering only — top stays pinned to hole)
const SHELF_THICKNESS_MM = 1.5;       // shelf material thickness
const SHELF_LIP_MM = 15;              // folded lip height below the flat surface
const DRAWER_HEIGHT_MM = 320;         // drawer physical + visual height (single and double share this)
const DEFAULT_TOP_SHELF_MM = 1700;    // default top shelf height from floor
```

**Derived rules:**
- Slot count for any spine = `floor((spineHeight_mm - FIRST_HOLE_MM) / HOLE_PITCH_MM) + 1`
  - H42 → 5 slots, H63 → 8 slots, H105 → 14 slots, H147 → 20 slots, H189 → 26 slots
- Each shelf occupies `ceil(SHELF_HEIGHT_MM / HOLE_PITCH_MM) = 2` slots
  (so an H63 with 8 slots can fit at most 4 shelves)
- Each drawer occupies `ceil(DRAWER_HEIGHT_MM / HOLE_PITCH_MM) = 5` slots — maximum drawer slot for a given spine = `floor((spineHeight_mm − DRAWER_HEIGHT_MM) / HOLE_PITCH_MM)`
- **Shelves are top-anchored** — slot N means the top edge aligns with hole N (`FIRST_HOLE_MM + N × HOLE_PITCH_MM` from spine bottom)
- **Drawers are bottom-anchored** — slot N means the bottom edge is `N × HOLE_PITCH_MM` from spine bottom; slot 0 = bottom flush with spine bottom
- The first hole is **never** at the very bottom — there is always a 104 mm gap from the floor to the first hole
- The shelf can be **flipped** (reversed) for tabletop use — same hole, mounts to a single pin, flipped vertically (∩ shape instead of U)
- `getModuleYRangeMm(module)` converts both types to `[bottomMm, topMm]` from spine bottom for conflict detection — this is the canonical way to compare any two modules regardless of anchor type

These numbers were measured from Fusion 360 reference drawings the user provided. Do not change them without re-measuring the real product.

---

## 5. Catalog Data

The catalog of available products lives at the very top of `configurator.js` in a `catalog` object. To add or change products, edit this object only:

```js
const catalog = {
  finishes: ['White', 'Black'],
  widths: [40, 60, 80],                            // bay widths in cm
  spines: [
    { code: 'H42',  height: 42,  bestFor: 'Small Shelves',     price: 700 },
    { code: 'H63',  height: 63,  bestFor: 'Bedside, entryway', price: 1000 },
    { code: 'H105', height: 105, bestFor: 'Living room, study', price: 1500 },
    { code: 'H147', height: 147, bestFor: 'Full bookshelf',    price: 2100 },
    { code: 'H189', height: 189, bestFor: 'Floor to eye-level', price: 2600 },
  ],
  shelves: {
    40: { 15: 1700, 25: 2200, 35: 2700 },          // bay-width → depth → INR price
    60: { 15: 2000, 25: 2700, 35: 3300 },
    80: { 15: 2400, 25: 3200, 35: 3900 },
  },
  kits: [ /* starter kits with a fixed bay + modules combo */ ],
  notes: [ /* informational notes shown in the UI */ ],
};
```

All prices are **INR** (₹). Currency conversion to EUR/USD uses fixed reference rates (`EUR_TO_INR_REFERENCE`, `USD_TO_INR_REFERENCE`) with a `FOREIGN_CURRENCY_MARKUP = 1.4` margin.

---

## 6. State Model

A single global `state` object holds everything:

```js
const state = {
  wallWidth: 180,             // cm
  wallHeight: 120,            // cm
  finish: 'White',
  spineHeight: 63,            // matches a catalog spine height
  topShelfMm: 1700,           // distance from floor to top of spine, in mm
  layoutLeftMm: null,         // horizontal offset within wall (null = centered)
  totalCurrency: 'INR',
  selectedBayId: null,
  selectedModuleIndex: null,
  bays: [
    {
      id: '<uuid>',
      width: 60,              // cm — must be 40, 60, or 80
      modules: [
        {
          type: 'shelf',      // 'shelf' or 'drawer'
          depth: 15,          // 15, 25, or 35 (cm) — only for shelves
          slot: 0,            // hole index, 0 = bottom-most usable slot
          reversed: false,    // true = ∩ shape (tabletop use)
        },
        {
          type: 'drawer',
          variant: 'single',  // 'single' or 'double'
          slot: 2,
        },
      ],
    },
  ],
};
```

**Critical rules:**
- Slots are indexed from the bottom (0 = bottom-most usable hole)
- Two modules cannot occupy overlapping slots — `slotsConflict()` enforces this
- Every state-mutating function MUST call `pushHistory()` first (for undo) and `render()` last
- After any state change, `normalizeStateForGrid()` re-snaps all modules to legal positions and drops anything that no longer fits

---

## 7. The Rendering Pipeline

There is exactly one entry point: `render()` (around line 2543). It runs every time state changes. It calls these in order:

1. `clampSpineToWall()` — make sure spine fits inside wall
2. `normalizeSelection()` — drop selection if the selected bay/module no longer exists
3. `normalizeStateForGrid()` — re-fit every module into a legal slot
4. `calculateSummary()` — compute BOM, totals, dimensions
5. `renderSpineOptions()` / `renderWidthOptions()` / `renderKitOptions()` / `renderNotes()` — repopulate sidebar dropdowns
6. `renderBays()` — render the bay strip in the sidebar (currently hidden — bays are managed on-canvas)
7. `renderPreview(summary)` — paint the entire canvas (the wall + bays + modules + dimensions + drag overlays)
8. `renderPreviewInspector(slotCount)` — paint the bottom inspector (selected bay/module details)
9. `renderSummary(summary)` — paint the top-bar price dropdown + BOM list

`renderPreview()` is the heaviest function (~440 lines). It writes a full HTML string into `#layout-preview`, then re-attaches all event listeners by re-querying the freshly painted DOM. There is **no virtual DOM** — every render rebuilds the canvas from scratch.

---

## 8. The Canvas Coordinate System

The canvas is a flexbox container (`.preview-wall-plane`) sized to match the wall in pixels at a computed `pxPerMm` ratio. Within it:

- `.preview-bay-shell` — one per bay, sized to the bay width
- `.preview-bay-frame` — the bay's spine + track + spine layout
- `.preview-spine` — the vertical 25 mm spine bars (left + right)
- `.preview-track` — the empty area between spines where modules mount
- `.preview-module` / `.preview-module-btn` — a single shelf or drawer button

Each `.preview-track` carries CSS custom properties as inline styles:

```
--slot-height:48px     ← computed from pxPerMm * HOLE_PITCH_MM
--hole-start:36px      ← top gap above the first hole, from the top edge
--hole-end:104px       ← bottom gap below the last hole (= FIRST_HOLE_MM * pxPerMm)
```

These let the JS drag layer and the CSS slot-line overlay align perfectly with the modules.

Slot lines (the faint gray rows shown when a track is in `.is-drop-target` state) are **DOM divs**, not a CSS gradient. We tried gradients and they could not be clipped exactly — DOM divs are pixel-perfect.

---

## 9. Drag-and-Drop Architecture

There are four kinds of drag, all routed through a single global `dragState` object and the `pointerdown`/`pointermove`/`pointerup` handlers (`handleDragMove`, `handleDragEnd`):

| Drag | Source | Behavior | Visual |
|---|---|---|---|
| **Same-bay module move** | Click+drag on `.preview-module-btn` | The original button is `transform: translateY()`-snapped to the nearest hole row | Original element moves with the cursor, snapping to slots |
| **Cross-bay module move** | Drag a module from one bay onto another bay's track | Original stays in place; target track shows a `.drag-preview-module` ghost at the snapped slot | Faded shelf-style preview on the target track |
| **Sidebar → canvas drop** | Drag a `.component-tile` onto a bay track | Same as cross-bay, but creates a new module instead of moving | Faded shelf-style preview on the target track |
| **Bay reorder** | Click+drag the spine area of a bay | The bay shell translates horizontally; reorder happens when the dragged center crosses a sibling's center | Bay slides left/right |

**Cursor:** the `<html>` element gets a `is-module-dragging` class during any module drag, which forces `cursor: grabbing !important` everywhere via CSS. This stops cursor flickering between pointer/grab/default during a drag.

**Slot detection:** `getNearestHoleSlot(track, clientY)` converts the cursor's Y coordinate to a slot index relative to the target track, using the track's `--slot-height` and `--hole-start` CSS variables. This is used only for **shelf** drags (top-anchored). For **drawer** drags the slot is computed directly: `round((trackRect.bottom − cursorY − drawerHeightPx) / slotHeight)`, treating the cursor as the drawer's top and snapping its bottom to the 70 mm grid.

**`dragState` carries `moduleType` and `moduleVariant`** (both set on pointerdown for canvas drags and sidebar drags). These drive drawer-aware slot snapping in `handleDragMove`/`handleDragEnd` and the ghost appearance in `paintDragPreview`.

**Preview painting:** `paintDragPreview(track, slot, label, moduleType, moduleVariant)` creates a `.drag-preview-module` div. For shelves it uses the top-anchored `bottom` formula and `SHELF_VISUAL_HEIGHT_MM` height. For drawers it uses bottom-anchored `bottom = slot × slotHeight` and `DRAWER_HEIGHT_MM` height. The ghost element gets `data-type="drawer"` (and `.is-double-drawer` when `moduleVariant === 'double'`) so the same CSS rules that style placed drawers also style the ghost — filled grey face, handle pill, midline divider for doubles. `clearDragPreview()` removes any existing preview before painting a new one.

**Drop-target indicator (`.preview-slot-indicator`)** — the black horizontal bar with circular end-dots — is permanently hidden via `display: none` in CSS. The slot-line background highlight on `.is-drop-target` tracks remains.

---

## 10. Selection Model

Only **one** thing can be selected at a time:

- A **bay** (clicking its spine or empty area) — `state.selectedBayId` set, `state.selectedModuleIndex = null`
- A **module** (clicking a shelf or drawer button) — `state.selectedBayId` AND `state.selectedModuleIndex` set

Selection visuals are intentionally identical: a **light blue dashed rectangle** rendered via a `::after` pseudo-element on the selected element, with 7 px outward padding so it never clips into the shelf's curved corners.

When a module is selected, the bottom **inspector** shows controls for that module:
- Depth toggle (D15 / D25 / D35)
- Flipped pill (toggles `module.reversed`)
- Remove (×) button — works on all modules including the last one in a bay

When a bay is selected (no module), the inspector shows bay-level controls (width cycler, add buttons, remove bay).

---

## 11. Inspector Layout (`renderPreviewInspector`)

The inspector lives **inside the top bar** as `.top-bar-center` (not on the canvas). It is **rebuilt from scratch** on every `render()` call. Single row only — title and pills sit on one horizontal line.

**Positioning:** centered on the visible canvas, not the window. CSS uses `left: calc(50% + 200px)` to offset for the open sidebar; falls back to `left: 50%` when `[data-sidebar-state='closed']`.

**Label structure:** title plus an optional bay subtitle stacked centered **below** the title (column flex inside `.preview-inspector-label`, `align-items: center`).

| Selection | Title | Subtitle | Pills shown |
|---|---|---|---|
| Nothing | "Select a bay or module" (muted, `.is-empty`) | — | none |
| A bay | bay name (e.g. "BAY 1") | width cycler shown as title? no — title is the bay name | width pills (40 / 60 / 80), `−` remove-bay button |
| A module (shelf) | shelf label (e.g. "SHELF D25") | the bay name (e.g. "BAY 2") stacked below | depth pills (D15 / D25 / D35), Flipped pill |
| A module (drawer) | drawer label | bay name | variant pills (single / double) |

**Hidden when a module is selected:** the bay-level width pills (40/60/80) and the bay remove (`−`) button. Module deletion uses the keyboard (Backspace/Delete), not an inspector button — that minus was removed because it duplicated the keyboard shortcut.

Title font sizes are intentionally large (`0.92rem` title / `0.85rem` subtitle, `line-height: 1`) so the text vertically center-aligns with the pill row at the same height — the previous fix tried shrinking the pills, which felt off.

---

## 12. Undo / Redo

Implemented via two stacks (`historyStack`, `futureStack`) that hold deep-cloned snapshots of the relevant state slice:

```js
function snapshotState() {
  return JSON.parse(JSON.stringify({
    wallWidth, wallHeight, finish, spineHeight, topShelfMm,
    layoutLeftMm, bays, selectedKitId, selectedBayId, selectedModuleIndex,
  }));
}
```

- `pushHistory()` is called at the **top** of every state-mutating function
- Undo limit: 10 snapshots (`HISTORY_LIMIT`)
- `Cmd/Ctrl+Z` → `undo()` (sidebar Undo button calls the same function)
- `Cmd/Ctrl+Y` → `redo()` (sidebar Redo button calls the same function)

---

## 13. Wall + Spine Geometry

- **Wall** is rendered as a rectangle (`.preview-wall-plane`) at the configured `wallWidth × wallHeight` cm
- **Spine** is centered horizontally by default (`layoutLeftMm = null`), or pinned to a specific offset
- `topShelfMm` is the distance from the **floor** to the **top of the spine** — that anchors the entire bay strip vertically
- Resizing the wall horizontally re-centers the spine; resizing vertically clamps `topShelfMm` so the spine still fits
- A **human silhouette** SVG (`renderHumanReferenceMarkup()`) is shown at the wall's left edge for scale, sized to `humanReferenceCm = 178`
- Wall **dimensions** (width / height / spine height) are editable directly on the canvas — clicking a number turns it into an input

---

## 14. PDF Export

Triggered by the sidebar **Export PDF** button. Flow:

1. Click → native `window.prompt('Enter your name for the PDF (optional):')` — no custom modal. Cancel returns `null` and aborts; empty string is allowed.
2. `triggerConfigurationPdfDownload(name)` builds **two** off-screen DOM sheets via `createPdfPage1Sheet` and `createPdfPage2Sheet`, both based on `createPdfSheetBase()` (920 px wide, white background, Inter font, positioned `left: -10000px` so they don't flicker on screen).
3. `html2canvas` rasterizes each sheet at `scale: 2`.
4. `jspdf` builds an A4 portrait document, places `canvas1` on page 1, calls `pdf.addPage()`, places `canvas2` on page 2 — both via the shared `placePdfImage(pdf, canvas)` helper that scales each canvas to fit inside a 24 pt margin.
5. The PDF is saved as `${SafeName}_EVOLV_Setup.pdf` when a name is given, or `EVOLV_Setup.pdf` when empty.

**Page 1 (Overview)** — title block top-left ("ETRNL Evolv Configuration", optional Customer line, Date `DD/MM/YYYY`, short ID `YYMMDD-HHMM`) paired with a bordered top-right "Overall Dimensions" / **"Color"** panel showing Wall Width / Wall Height / Spine Height / Build Width — all in **cm** (via `formatLengthCm`) — and the current finish. The elevation view (`createPdfPreviewPanel()`) fills the rest of the page. Inspired by the KittaParts builder PDF.

**Page 2 (Parts List)** — `Parts List` header with the short ID + drawer-pricing note, then a 5-column table: **`SKU | Product | Quantity | Unit Price | Total`**. Header row uses the shared `headerCellStyle` (15 px, matching body cells). Body rows are plain white. SKU cells render blank (placeholder until real SKUs are wired in). Unit Price = `formatConvertedCurrency(part.amount / part.quantity, state.totalCurrency)`, falling back to `'TBD'` when `!part.priced` (drawers). Optional Shipping row from `getShippingDisplay()` leaves Quantity and Unit Price blank. A `TOTAL:` footer row spans the 5-column layout. The long base64 setup ID is **no longer** printed at the bottom — the short ID on page 1 is enough.

**`createPdfPreviewPanel` (elevation clone)** — non-trivial. It clones the live `.preview-wall-canvas`, then:
- **Strips interactive overlays** from the clone: `.preview-add-rail`, `.preview-add-bay-btn`, `[data-add-bay]`, `.preview-bay-remove`, `.preview-module-remove`, `.preview-module-flip`, `[data-remove-module-inline]`, `[data-flip-module-inline]`, `.preview-inspector`, `.preview-top-line-handle`, `.preview-wall-resize`, `.preview-wall-resize-badge`, `.preview-scale`, `.preview-human`.
- **Outlines spines** — adds `border: 1px solid rgba(23,23,23,0.6); box-sizing: border-box;` on every cloned `.preview-spine` so White (or other light-finish) spines stay visible against the gray wall plane.
- **Removes the selection rectangle** — strips the `is-selected` class from every cloned node so the dashed light-blue `::after` border doesn't leak into the export.
- **Scales the canvas to fit a fixed target box.** The live `.preview-wall-plane` width depends on viewport (capped at `pxPerMm = 0.5`), so on a wide screen the cloned plane could overflow the 920 px sheet — html2canvas would clip it. Fix: measure the live plane via `getBoundingClientRect()`, compute `scale = min(1, maxBoxWidth / liveWidth, maxBoxHeight / liveHeight)` against `maxBoxWidth = 820` and `maxBoxHeight = 580`, then apply `transform: scale(...)` with `transform-origin: top left` to the cloned canvas. The clone is locked to its measured `width`/`height` (`min-width: 0`, `min-height: 0`) so it doesn't reflow inside the off-screen sheet.
- **`scaleBox` wrapper** — a `position: relative` div with `width/height = scaledWidth/scaledHeight` reserves the correct layout footprint and acts as the positioning context for the scaled canvas (which is `position: absolute; top: 0; left: 0`).
- **Wall outer-dimension arrow bars are gone.** The wall width and height already live in the page 1 dimensions panel — duplicating them around the elevation just stole space. `previewWrap` padding is `16px 8px`, no `minHeight` floor.

**Gray palette** — every gray surface in the PDF (page 1 dimensions panel background, page 2 header row, page 2 TOTAL footer row) is `#f8f8f8`. Earlier rounds tried `#fafafa` / `#ededed` / `#dde1e6` / `#d9d9d9` and they all read either too warm or too dark on color-managed displays.

Helpers: `escapePdfHtml`, `formatPdfDate`, `formatPdfShortId`, `createPdfSheetBase`, `placePdfImage`. Both libraries are still vendored in `vendor/` so the configurator works offline.

---

## 15. Share Design (copy-link)

A single sidebar button — **Share Design** — replaces the old Export Config / Import Config pair. Click → builds a `${origin}${pathname}#c=${configId}` URL, copies it to the clipboard via `navigator.clipboard.writeText()`, swaps the button label to **"Copied!"** for 1.5 s, then reverts. On clipboard failure the label flips to "Copy failed" and `setInteractionError(...)` shows a message.

The link payload is just the existing config ID dropped into a URL hash — no new encoding logic. Configurations are serialized via:

```js
function encodeConfigId(snapshot) → base64url(JSON.stringify({ v: 2, ...snapshot }))
function decodeConfigId(value)    → JSON.parse(atob(value))
```

`CONFIG_ID_VERSION = 2` is bumped any time the schema changes. `createConfigSnapshot()` emits compact field names (`v`, `d`, `f`, `w`, `h`, `u`, `s`, `t`, `l`, `c`, `b`). Field `c` carries `state.totalCurrency` (added in entry 50; missing `c` falls back to `'INR'` so no version bump was needed).

**Two helpers do the share-link work**, sitting next to `getCurrentConfigId()`:

```js
function buildShareLink()              // returns location.origin + pathname + '#c=' + getCurrentConfigId()
function loadFromShareLinkIfPresent()  // checks location.hash for '#c=...', decodes, applies, replaceState
```

**Page-load hash check.** The bottom-of-file init runs `loadFromShareLinkIfPresent()` *before* the default-bay bootstrap. If a `#c=...` is present, it decodes and applies the snapshot, then `history.replaceState`s the hash away so subsequent reloads don't re-overwrite user edits. The post-init `state.topShelfMm = getCenteredTopShelfMm()` line is **skipped** when a share link loaded (the link carries its own `topShelfMm`).

**Bad-link handling is dumb by design.** If `decodeConfigId` throws or `applyConfigSnapshot` rejects (version too new, references a removed catalog item, etc.), it shows a single `alert()` ("This share link couldn't be loaded — it may be from an older version…") and falls back to defaults. No migration logic, no graceful snapping. Share links are intended to live for days/weeks/maybe a month, not years.

---

## 16. Workflow Rules (for editing this project)

These rules live in `CLAUDE.md` and apply to anyone (human or AI) editing the project:

### Changelog — every single change
Update `CHANGELOG.md` after every change, no matter how small. Each entry must include:
- Date (top of section)
- Short title (`### ...`)
- `**Files:**` list
- Bullet points of what was done and why

### Version control = rollback points
Every git commit is an automatic rollback point. The old "copy the master folder into `Archive/Backups/vN` every 10 changelog entries" rule is **obsolete** — git history + Vercel's unlimited deployment history replace it. The existing `Archive/Backups/v1..v9` folders are frozen pre-git snapshots kept as a legacy safety net; do not add new ones.

**Tag major releases** so they're easy to roll back to:
```bash
git tag -a v1.2 -m "Short description of what's in this release"
git push --tags
```

**Keep `INSTRUCTIONS.md` in sync with reality.** When a change makes a section of this file wrong (new function, renamed constant, restructured flow), patch the affected section in the same commit. Don't batch it for later — the file drifts fast otherwise.

### Coding conventions
- All prices in **INR (₹)**
- Dimensions in **cm for display**, **mm internally**
- `pushHistory()` at the top of every state-mutating function
- `render()` at the end of every state change
- Minimum wall clearance: 5 cm per side (width), 10 cm per side (height)
- Spine re-centers on wall after height change via `getCenteredTopShelfMm()`

### Things to never do
- Never open the live preview panel — the user checks changes in Chrome
- Never output full file contents in chat — use the Edit tool for targeted changes
- Never add docstrings, comments, or type annotations to unchanged code
- Never add features beyond what was asked

---

## 17. How to Replicate / Rebuild From Scratch

If you ever need to start over with a fresh project that does the same thing:

1. **Create the folder structure** as shown in section 3
2. **Copy `index.html`** from the master folder — it is the structural skeleton
3. **Copy `configurator.css`** and `configurator.js` — the entire app is in these two files
4. **Vendor the PDF libraries** locally:
   - `html2canvas.min.js` (from html2canvas.hertzen.com)
   - `jspdf.umd.min.js` (from github.com/parallax/jsPDF)
5. **Open `index.html` in Chrome** — there is no build step, no install step. It just runs.
6. **Initialize git** (optional but recommended):
   ```bash
   cd "Evolv Configurator"
   git init && git add . && git commit -m "Initial commit"
   ```
7. **Set up the changelog + backup workflow** by copying `CLAUDE.md` and `CHANGELOG.md`

To verify the configurator still works after any change:
- Open `index.html` in Chrome with DevTools open
- Check the Console for errors
- Test: change wall size, change spine height, add a bay, add a shelf, drag a shelf within a bay, drag a shelf to another bay, drag from sidebar, undo, export PDF, export+re-import config

---

## 18. Known Quirks & Gotchas

- **`renderPreview()` writes raw HTML strings** and re-binds events after each render. If you add a new interactive element, you must also add its event binding inside the `forEach` blocks at the bottom of `renderPreview()`.
- **`normalizeStateForGrid()` will silently drop modules** that no longer fit (e.g. after resizing the spine smaller). This is intentional — the alternative was a freeze bug from infinite slot-search loops.
- **Two duplicate `.component-tile` blocks** exist in `configurator.css` (line ~2154 and ~2316). The second one wins. This is leftover from when the sidebar was redesigned — feel free to clean up.
- **The `svg/` folder** has reference drawings that are mostly unused. Only `human-scale.svg` is actively rendered; the rest are kept for measurement reference.
- **No spine SVG overlay yet** — the spine is drawn as plain divs with the hole pattern computed in code. The user has offered to provide per-spine SVGs in the future to replace this.
- **Bay reorder logic** lives separately in `bayDragState` (not `dragState`) because the geometry is completely different — bays slide horizontally, modules snap vertically.
- **The right panel is gone** — all stats and BOM are in the top-bar price dropdown now. The HTML still has hidden divs (`#recommendations`, `#catalog-notes`, `#kit-options`) so the JS doesn't crash trying to populate them.
- **Starter Kits section was removed from the sidebar** but `renderKitOptions()` is still called every render. The element it writes to (`#kit-options`) is hidden — if you want to fully remove the kit feature, also strip the function call from `render()` and the `kitOptions` const.

---

## 19. File Map (quick reference)

| File | Purpose | Approximate size |
|---|---|---|
| `index.html` | DOM skeleton, top bar, sidebar, canvas mount point | ~260 lines |
| `configurator.js` | All logic, state, rendering, drag, PDF, BOM | ~3050 lines |
| `configurator.css` | All styles (top bar, sidebar, canvas, drag previews, modals) | ~2500 lines |
| `CLAUDE.md` | Workflow rules for AI editors (changelog, backups) | ~60 lines |
| `INSTRUCTIONS.md` | This file | — |
| `vendor/html2canvas.min.js` | DOM → canvas rasterizer | external |
| `vendor/jspdf.umd.min.js` | Canvas → PDF | external |

---

## 20. Where Each Feature Lives in `configurator.js`

| Feature | Function | Approx. line |
|---|---|---|
| Catalog data | `catalog` const | 1 |
| Geometry constants | `SPINE_WIDTH_MM` etc. | 31 |
| State object | `state` | 44 |
| Undo/redo | `pushHistory`, `undo`, `redo` | 100 |
| Drag preview | `paintDragPreview`, `clearDragPreview` | 130 |
| Slot detection | `getNearestHoleSlot`, `getTrackSlotMetrics` | 185 |
| Drag handlers | `handleDragMove`, `handleDragEnd` | 241 |
| Currency formatting | `formatCurrency`, `convertInrTotal` | 500 |
| Config snapshot + encode | `createConfigSnapshot`, `encodeConfigId` | 584 |
| Share link helpers | `buildShareLink`, `loadFromShareLinkIfPresent` | 627 |
| PDF preview panel (cloned canvas) | `createPdfPreviewPanel` | 839 |
| PDF export — page 1 (overview) | `createPdfPage1Sheet` | 976 |
| PDF export — page 2 (parts list) | `createPdfPage2Sheet` | 1016 |
| PDF export — orchestration | `triggerConfigurationPdfDownload` | 1087 |
| Module height + y-range | `getModuleHeightMm`, `getModuleYRangeMm`, `getModuleMaxSlot` | 1207 |
| Slot count + module fit | `getSlotCount`, `slotsConflict`, `canPlaceModuleAtSlot` | 1233 |
| Normalize grid | `normalizeStateForGrid` | 1263 |
| Add/remove bay | `addBay`, `removeBay`, `cycleBayWidth` | 1279 |
| Add/remove module | `addShelfToBay`, `removeModuleFromBay`, `addComponentToBay` | 1348 |
| Move module | `moveModuleToSlot`, `moveModuleToBay`, `addModuleAtBaySlot` | 1422 |
| Inspector | `renderPreviewInspector` | 1790 |
| BOM + totals | `calculateSummary` | 1903 |
| Canvas painter | `renderPreview` | 2111 |
| Top-bar price dropdown | `renderSummary` | 2552 |
| Main render entry point | `render` | 2603 |
| All event wiring | `wireControls` | 2686 |
| Boot | `loadFromShareLinkIfPresent() ... if (state.bays.length === 0) ... render()` | ~3050 |

---

## 21. Caveat

This file was last reconciled against the codebase on 2026-04-23 (git tag `v1.1`). Line numbers and function names may shift as the code evolves. The architecture and conventions described here should remain stable, but if something does not match what you see in the code, **trust the code, not this file**, and update this file accordingly.
