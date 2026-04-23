# ETRNL Evolv Configurator — Change Log

---

## 2026-04-23

### Developer handoff prep: track INSTRUCTIONS.md + CHANGELOG.md in the repo
**Files:** `ETRNL Configurator — Master/.gitignore`, `ETRNL Configurator — Master/INSTRUCTIONS.md`, `ETRNL Configurator — Master/CHANGELOG.md` (moved here from `Evolv Configurator/CHANGELOG.md`)

- **`CHANGELOG.md` moved** from `Evolv Configurator/` up-one-level into the repo folder (`ETRNL Configurator — Master/`) so it travels with the code on `git clone`. The old parent-folder path no longer exists.
- **`INSTRUCTIONS.md` removed from `.gitignore`.** It's the architecture reference — genuinely useful to a new developer. `CLAUDE.md` stays ignored (it's the AI-agent workflow config, not dev documentation).
- **`INSTRUCTIONS.md` reconciled to current state before first push:**
  - Section 16: rewrote the "Backups — every 10 changelog entries" block, which described an obsolete manual-copy workflow. Git commits + Vercel deployment history replace it. The `Archive/Backups/v1..v9` folders stay as frozen pre-git snapshots; no new ones are added.
  - Section 3: folder listing updated to include `v9` (was stuck at `v8`).
  - Section 21 caveat: reconciliation date bumped from `2026-04-14 (v8 backup)` to `2026-04-23 (git tag v1.1)`.
- **Rationale:** onboarding a freelance developer per the next-phase brief. Giving them the repo via GitHub as a collaborator is cleaner than OneDrive-sharing the working folder (no `.git` corruption risk from a third editor, real PR review gate for their scan requirement, branch isolation while `main` stays live). `CHANGELOG.md` and `INSTRUCTIONS.md` need to ship inside the repo for the handoff to be self-contained; the Freelancer Brief goes out separately (not in the public repo).

---

## 2026-04-21

### PDF export: "Double Drawer" label placement + handle pills as real DOM
**Files:** `ETRNL Configurator — Master/configurator.js`

- Label was sitting on the midline divider instead of in the upper face. Root cause: after stripping the `.is-double-drawer` class, the single-drawer CSS rule `top: 36%` started matching the copy, and the scoped-selector override (`[data-double-drawer-pdf]`) wasn't winning in all cases. Fix: set `top: 28% !important` directly on the `.preview-module-copy` child via inline style — no selector math to lose.
- Also replaced the two `::before` / `::after` handle pseudos with real-DOM `<div>` pills at `top: 11%` and `top: 61%`. The previous scoped CSS for the pseudos had the same specificity problem, and real children render identically in html2canvas with zero surprises. Pseudos on the stripped-class drawers are now explicitly nulled out so they can't collide with the injected pills.

---

## 2026-04-21

### PDF export: stronger fix for double-drawer render + selection leak
**Files:** `ETRNL Configurator — Master/configurator.js`

- Previous pass (2026-04-20) only set inline `background: #d6d6d6` on the drawer and removed `.preview-module-ring` children. Both bugs still reproduced in exports because (a) the `.is-double-drawer` class's layered `linear-gradient + #d6d6d6` shorthand beat the inline style under html2canvas's CSSOM snapshot, and (b) the dashed selection rectangle also fires from `.preview-bay-shell.is-selected::after` — stripping the class alone wasn't catching every case.
- **Fix, belt-and-suspenders:**
  - Inject a scoped `<style>` tag into the cloned canvas with `!important` overrides that (i) null out every `::after` selection pseudo on both bay shells and module buttons, (ii) force `display: none` on `.preview-module-ring`, (iii) force `background: #d6d6d6 !important; background-image: none !important` on both single and double drawers.
  - Use `setProperty('background', '#d6d6d6', 'important')` + `setProperty('background-image', 'none', 'important')` on the drawer element itself so the inline style competes at the same specificity as the stylesheet rule.
  - **Strip the `.is-double-drawer` class entirely from the clone.** That kills the gradient background AND the `::after` second handle in one move. Then inject real `<div>` children for the midline divider and the lower handle, and a second scoped `<style>` that nudges the `::before` top handle up and the label into the top half for any drawer tagged `data-double-drawer-pdf`. Result: the PDF double drawer now renders as two equal faces with a clean 2 px midline and two identical handle pills, matching the live canvas and the single-drawer background exactly.

---

## 2026-04-20

### Tall-spine floor clearance rule (H147/H189) + canvas bottom padding trim
**Files:** `ETRNL Configurator — Master/configurator.js`, `ETRNL Configurator — Master/configurator.css`

- **New rule for H147 and H189 spines:** floor clearance has a **30 cm minimum AND 30 cm default** instead of the old 10 cm / centered behavior. Physically driven — wall skirting typically eats ~10 cm, so anything tighter makes the system unusable against a real wall.
- **H42, H63, H105 unchanged** — still 10 cm minimum, still defaults to centered (50/50 split of leftover space between top and bottom).
- **Implementation:** three new constants (`TALL_SPINE_HEIGHTS_CM`, `TALL_SPINE_FLOOR_CLEARANCE_MM`, `DEFAULT_FLOOR_CLEARANCE_MM`, `MIN_TOP_CLEARANCE_MM`) + one helper (`getMinFloorClearanceMm`) that returns 300 mm for tall spines and 100 mm otherwise. `getCenteredTopShelfMm` branches on tall-spine membership — tall spines anchor the spine bottom 30 cm above the floor; short spines keep the centering math. `getTopShelfBoundsMm` uses the same helper for the drag-floor limit, so you physically cannot drag the spine lower than 30 cm once H147 or H189 is active.
- **Wall auto-grow on spine change now accounts for the per-spine floor min.** Previously the spine-change handler hard-coded 10 cm per side; now it uses `spineHeightMm + getMinFloorClearanceMm() + MIN_TOP_CLEARANCE_MM` as the wall floor. `MIN_TOP_CLEARANCE_MM` is 16 cm — enough to prevent bay captions (which sit above the frame) from clipping at the tall-spine auto-grow target. For H189 that means the wall will auto-grow to at least 235 cm (189 spine + 30 floor + 16 top). For H147 it auto-grows to at least 193 cm (147 + 30 + 16). If the user's wall is already taller than the minimum, we leave it alone and only re-anchor the floor — we don't shrink walls, ever.
- **PDF export: double-drawer rendering + selection-ring leak fix.** Two visual bugs in the page-1 elevation:
  - The double drawer was rendering with a darker grey wash (no clean midline) while the single drawer rendered as the correct light grey — even though the live canvas draws them identically. Cause: html2canvas renders layered `linear-gradient + #d6d6d6` backgrounds as a solid darker fill, losing the 2 px divider band. Fix: in the PDF clone, force `background: #d6d6d6` on both drawer variants and inject a real DOM `<div>` as the midline divider on double drawers only. Both drawers now render with the identical base fill and the divider survives the html2canvas pass.
  - The dashed blue selection rectangle was leaking into the PDF. Previous prep code only stripped the `.is-selected` class but the rectangle lives on a real child span (`.preview-module-ring`) that kept rendering regardless. Added a sweep that removes every `.preview-module-ring` child before the html2canvas pass — the PDF is now always "clean state" even if the user had a bay or module selected when they hit Export.
- **PDF parts list: SKU column populated + correct drawer labels.** Two bugs fixed in the page-2 parts table: (1) the SKU column had a header but the cell was empty — `getEstimateParts` never carried an SKU for each part, so the column rendered blank for every row. `addPart` now takes an optional `sku` parameter and each call site passes the right code: `ELV-SP-{height-code}` for spines (e.g. `ELV-SP-H147`), `ELV-SH-W{width}-D{depth}` for shelves (e.g. `ELV-SH-W60-D25`), `ELV-DR-{1D|2D}-W{width}` for drawers (e.g. `ELV-DR-1D-W60`, `ELV-DR-2D-W80`). (2) Single-drawer label was just `"Drawer W60"` because the template used `${isDouble ? 'Double ' : ''}Drawer W${bay.width}` — now explicit as `"Single Drawer W60"` / `"Double Drawer W80"`, matching the on-canvas label and the master price sheet. Also tweaked the spine label to title-case (`"H147 Spine"` instead of `"H147 spine"`) so the table reads uniformly.
- **Wall width auto-grow default raised from 5 cm → 20 cm per side.** Two spots previously used `MIN_CLEARANCE_MM = 50` to size the wall when a bay was added or a bay width changed — that was the same value as the hard minimum enforced by the Apply button, so walls grew flush against their side-clearance limit. Renamed the auto-grow constant to `DEFAULT_SIDE_CLEARANCE_MM = 200` in both spots (`updateBayWidth` at ~line 1396, add-bay handler at ~line 2503). The 5 cm minimum on user-typed wall widths is unchanged (enforced at Apply button validation, `MIN_SIDE_CLEARANCE_CM = 5`) — customers can still tighten the wall down to 5 cm per side manually, but the auto-grow default now gives a generous 20 cm for visual balance.
- **Canvas padding rebalanced** in `.layout-preview` from `24 / 104` (top/bottom) to `72 / 40`. The old distribution centered the wall plane too high visually; simply cutting bottom padding to 40 px exposed a second problem — for tall walls (229 cm at H189), the 24 px top padding was insufficient for bay captions (which sit above the frame via `position: absolute; bottom: 100%`) and they were getting clipped. New split gives captions generous breathing room while still shifting the canvas noticeably down compared to the original layout. Total padding reduced 128 → 112 px, so the wall plane itself also scales a touch larger.

---

### Drawer pricing live + kit price refresh + generic `hasPricingGap` flag
**Files:** `ETRNL Configurator — Master/configurator.js`

- **Drawers are now priced in the configurator.** Added `catalog.drawers` with the 6 MRP figures from the master price sheet: single 1D at ₹19,400 (W40) / ₹22,400 (W60) / ₹25,400 (W80), double 2D at ₹25,800 / ₹29,100 / ₹32,300. The drawer branch in `buildParts` now reads from `catalog.drawers[variant][bay.width]` instead of hard-coding ₹0 and marking the line as unpriced. Meta tag on drawer parts changes from `"Price TBD"` to `"Soft-close"`.
- **Kit price refresh** per the master sheet: kit-a ₹4,400 → ₹4,500, kit-d ₹6,100 → ₹6,200, kit-e ₹6,900 → ₹7,000. kit-b and kit-c unchanged. Spines and shelves: unchanged (prices in the sheet match the live catalog exactly).
- **Renamed `hasDrawerPricingGap` → `hasPricingGap`** across all 6 usages (calculateSummary, formatPriceWithDrawerNote, PDF header subtitle, getRecommendations text, stage estimator note label). The flag is now a generic "some module in this config is price-on-request" signal, not drawer-specific. Future modules shipped without prices automatically inherit the same UX: line item in the estimate with no amount, "+ price-on-request modules" suffix on the top-bar total, "Price-on-request modules" footnote in the PDF header, and a recommendation banner explaining the exclusion. Today the flag is always `false` because drawers are priced and shelves/kits/spines were already priced — the scaffolding just waits for the next new module type.
- **User-facing copy changes** (all driven by the renamed flag):
  - Top-bar total suffix: `"+ drawers"` → `"+ price-on-request modules"`
  - Stage estimator note: `"Drawers priced separately"` → `"Price-on-request modules"`
  - PDF header subtitle: `"Drawers priced separately"` → `"Price-on-request modules"`
  - Recommendation banner: `"Drawer pricing is still marked coming soon…"` → `"This configuration includes price-on-request modules, so the total shown here excludes those items."`
- **Catalog note updated** — first entry in `catalog.notes` was claiming drawer pricing was coming soon. Rewrote it as a straight description of the drawer offering (widths, variants, depth, soft-close).
- **Fixtures (ELV-FX-W40/60/80) intentionally NOT added.** They are supplementary installation hardware, sold alongside the system but not a configurable module. Excluded from the configurator by design.
- **Calculator safety net:** the new drawer lookup guards against missing entries (`catalog.drawers?.[variantKey]?.[bay.width]`) and falls back to the pricing-gap flag if a width/variant combo is ever absent. Any future non-shelf/non-drawer module type also defaults to the pricing-gap branch, so the UI degrades gracefully until pricing is wired in.

---

## 2026-04-14

### Tag v1.1 — self-hosted fonts, brand mark, rename, laptop gate
**Files:** git tag `v1.1`

- **Tagged `v1.1`** at the end of the day after the batch of changes below was shipped to production: self-hosted fonts (Inter + Dela Gothic One), Dela Gothic One scoped to the brand mark only, "Configurator" → "Shelving System" rename across all customer-visible copy, preview inspector moved inline after Spine Height, drawer labels unified as "Single Drawer" / "Double Drawer" everywhere, and the laptop-only gate (`max-width: 1099px`) set low enough to let 1366×768 Indian budget laptops through even at 125% Windows scaling. Second named rollback target after `v1.0`. Pushed to GitHub via `git push --tags`, Vercel auto-deployed main in ~30s.

---

### Drawer labels: "Double Drawer" / "Single Drawer" everywhere
**Files:** `ETRNL Configurator — Master/configurator.js`

- Three spots in `configurator.js` were labelling drawers as `"Drawer ×2"` / `"Drawer"`: the top-bar inspector (`renderPreviewInspector`), the drag-ghost label when repositioning an existing drawer on the canvas (~line 2391), and the drag-ghost label when dragging a drawer tile from the sidebar into the canvas (~line 2987). Renamed all three to `"Double Drawer"` / `"Single Drawer"` to match the component tile labels on the sidebar and the module labels painted on the canvas. Same copy everywhere — no more "×2" shorthand, no more asymmetric "Drawer" vs "Single Drawer" confusion.

---

### Inline preview inspector — no longer absolutely centered
**Files:** `ETRNL Configurator — Master/index.html`, `ETRNL Configurator — Master/configurator.css`

- **Moved `#preview-inspector` from `.top-bar-center` to inline at the end of `.top-bar-left`**, immediately after the Spine Height select (with a separator in front). The old setup positioned the inspector via `position: absolute; left: calc(50% + 200px); transform: translate(-50%, -50%)`, which collided with the Spine Height dropdown at narrow viewport widths and pushed layout off-screen. Now it flows as a regular flex item after Spine Height and wraps naturally on narrow widths.
- **Removed `.top-bar-center` and the empty wrapper div** — no longer needed since the inspector is inline. Also removed the sidebar-state override that shifted the absolute position.
- **Added `.inspector-sep:has(+ .preview-inspector:empty)` rule** so the separator in front of the inspector disappears cleanly when the inspector has no content (safety net — in practice the JS always renders a placeholder "Select a bay or module" card). JS references the inspector by ID only, so the DOM move is transparent to the rendering logic.

---

### Self-hosted brand fonts + "Shelving System" rename + laptop-only gating
**Files:** `ETRNL Configurator — Master/index.html`, `ETRNL Configurator — Master/configurator.css`, `ETRNL Configurator — Master/configurator.js`, `ETRNL Configurator — Master/fonts/*` (new)

- **Self-hosted fonts.** Removed all Google Fonts CDN requests (preconnect + stylesheet link). Downloaded the latin + latin-ext subsets of **Inter** (variable font, one file covers weights 100–900) and **Dela Gothic One** (weight 400 only) into a new `fonts/` folder as `.woff2`. Added four `@font-face` blocks at the top of `configurator.css` with `font-display: swap` and correct `unicode-range` for each subset. Added `<link rel="preload" href="fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>` to `index.html` so the primary body font has priority. Result: zero third-party font requests, fully offline-safe, better privacy, no FOUT from CDN latency.
- **Dela Gothic One scoped to the brand mark only.** New CSS variable `--font-brand: "Dela Gothic One", "Inter", sans-serif;` applied exclusively to `.top-bar-name` and `.top-bar-sub`. `--font-display` stays as Inter so headings, labels, and everything else keep the clean sans — the heavy display face would be too loud used globally. Set `font-weight: 400` explicitly on both brand classes since Dela Gothic One only ships at 400 (avoids synthetic faux-bold from the browser).
- **Fixed `font: inherit` shadowing `--font-display` on the brand button.** `.top-bar-brand` used the `font` shorthand which resets `font-family` along with everything else, so the brand text was silently inheriting Inter from `<body>`. Added explicit `font-family: var(--font-brand)` on `.top-bar-name` and `.top-bar-sub` to win the cascade.
- **Brand mark sizing without growing header height.** Reduced top-bar vertical padding from `8px 20px` → `4px 16px` on the effective `.top-bar` rule (line ~2331; the earlier rule at line ~2037 is overridden). Bumped brand name from `1.6rem` → `1.9rem` and subtitle from `0.95rem` → `1.25rem`. Header still fits in `min-height: 68px`.
- **Fixed horizontal scroll in the header.** `.top-bar-left` was `overflow-x: auto`, so the bigger brand mark pushed the controls past the viewport edge and triggered a scrollbar. Switched to `flex-wrap: wrap` with `row-gap: 6px`.
- **Rename "Configurator" → "Shelving System" everywhere customer-facing.** Browser tab title: `ETRNL Evolv Shelving System`. Top-bar brand subtitle: "Shelving System" (title case). Share-link error alert: "older version of the shelving system". Catalog notes copy: "this shelving system keeps those as informational…". File paths, internal comments, variable names, and `CLAUDE.md` still say "configurator" — it's only the visible UI text that changed.
- **Laptop-only gating below 1100px viewport width.** Added a `.desktop-required` div in `index.html` after `.app-shell` containing the ETRNL Evolv brand mark, an SVG laptop icon, a headline ("Design your shelving on a laptop"), and a message paragraph asking the user to open the page on a laptop or desktop. The accompanying CSS at the bottom of `configurator.css` hides `.desktop-required` by default, and at `@media (max-width: 1099px)` it hides `.app-shell` with `display: none !important` and shows `.desktop-required` as a centered fixed-position card over the whole viewport. Pure CSS, no JS runtime cost. Rationale: the configurator is built for precise pointer control on larger screens — rather than half-supporting mobile, we gate the experience to laptop / desktop and give smaller viewports a clean "come back on a laptop" message instead of a broken UI. Iterated on the threshold several times: first 900px (too permissive — narrow desktop windows still showed an overflowing canvas), then 1200px and 1300px (too restrictive for our Indian market — a lot of budget 1366×768 laptops on Lenovo IdeaPad / HP 15s / Dell Inspiron / Acer Aspire / Asus VivoBook run at 125% Windows scaling, which collapses the effective viewport to ~1093px and would lock them out entirely). Settled on 1100px as the floor because our primary audience is price-sensitive Indian budget-laptop users who should be able to at least browse the configurator even if the header wraps a little when a bay is selected. In the 1100–1299 band the inspector chip row (`SHELF D15 · BAY 2 · D15 D25 D35 · Flipped`) may wrap under the brand mark when a shelf is selected, which looks slightly off-kilter but doesn't break any functionality — bays remain clickable, canvas renders fully, prices display correctly, PDF export and share-design still work. "Cramped but working" is a better experience than "locked out entirely" for a pre-sales marketing tool. Can revisit with actual analytics later: if the 1100–1299 band gets meaningful traffic, polish the inspector's compact state; if not, it's a non-issue.

---

### Tag v1.0 — first production release + CLAUDE.md operational rewrite
**Files:** `ETRNL Configurator — Master/CLAUDE.md` (not in git), git tag `v1.0`

- **Tagged `v1.0`** on commit `e338263` with message "First production release: live on Shopify via Vercel iframe". Pushed to GitHub via `git push --tags`. This is the first named rollback target — future `git reset --hard v1.0` or `git checkout v1.0 -- .` will restore the configurator to this exact known-good state.
- **Rewrote CLAUDE.md as the operational reference doc.** Added: TL;DR quick reference, full deployment stack table (GitHub → Vercel → Shopify), explicit "push only on user request" policy, a 6-scenario rollback cheat sheet (Vercel instant rollback, `git revert`, per-file restore, uncommitted undo, tag reset, Vercel history), Windows setup instructions (Git for Windows + Credential Manager, PAT fallback, GitHub Desktop alt), and the OneDrive + `.git` cross-machine sync gotchas. Marked the old "manual backup every 10 changelog entries" rule as obsolete — git commits + Vercel deployments replace it.
- **New rule:** Claude must never run `git push`, `git commit`, `git tag`, or any operation that writes to GitHub unless the user explicitly says "push to Git" (or equivalent). Local file edits and changelog updates still happen automatically. Rationale: user iterates freely without every change going to production.

---

### Git integration: local repo connected to GitHub + Vercel auto-deploy
**Files:** `ETRNL Configurator — Master/.gitignore`, `ETRNL Configurator — Master/svg/*`, `ETRNL Configurator — Master/CLAUDE.md`

- **Initialized git** in the master folder and connected it to `https://github.com/inside-etrnl/evolv-configurator.git` (the deployment repo that feeds Vercel).
- **Created `.gitignore`** excluding `.DS_Store`, `CLAUDE.md`, `INSTRUCTIONS.md`. Private working docs stay in OneDrive only — public code pushes to GitHub.
- **Added `svg/` folder to the repo** so `human-scale.svg` is actually reachable in production (previously the CSS path was fixed but the file itself wasn't deployed, so the 404 persisted on Vercel). Commit `e338263`.
- **Stored GitHub Personal Access Token in macOS keychain** via `git credential-osxkeychain store` so future `git push` commands authenticate silently. Remote URL is clean (no embedded token).
- **Documented the full deploy stack in CLAUDE.md**: GitHub repo, Vercel URL, Shopify store/theme/page, `.gitignore` policy, first-time setup on a new machine, and the edit → commit → push workflow that triggers auto-deploy.
- **Workflow from here on:** edit files → update changelog → `git add && commit && push`. Vercel redeploys in ~30s. No manual deploy step.

---

### Fix broken human-scale.svg background path (latent 404)
**Files:** `ETRNL Configurator — Master/configurator.css`

- `.preview-human::before` referenced `url("human-scale.svg")` but the file only exists at `svg/human-scale.svg`. It's been silently 404-ing because the background is rendered at opacity 0.045 (almost invisible), so nobody noticed. Updated path to `url("svg/human-scale.svg")`. Pre-deployment cleanup.

---

### Drawer label: percentage positioning + remove width subtitle
**Files:** `ETRNL Configurator — Master/configurator.js`, `ETRNL Configurator — Master/configurator.css`

- **Label position changed from `calc(X% + 25px)` to pure percentages.** The fixed 25px offset caused the label to drift toward or past the 50% midline divider on double drawers when the overall layout was large and the preview scale was compressed. Single drawer label: `top: 36%`. Double drawer label: `top: 24%` (well clear of the 50% midline at any scale). The `.preview-module-subtitle` CSS block was also removed since the subtitle is gone.
- **Removed W40/W60/W80 width subtitle** from both single and double drawer labels in `renderPreview`. The `<div class="preview-module-subtitle">` element is no longer rendered.

---

### Fix double-drawer selection ring drawing around the bottom handle
**Files:** `ETRNL Configurator — Master/configurator.js`, `ETRNL Configurator — Master/configurator.css`

- **Bug:** selecting a double drawer drew the dashed selection ring around the bottom handle pill (a tiny rectangle in the middle of the lower half) instead of around the whole drawer face.
- **Root cause:** the selection ring was a `::after` pseudo-element on `.preview-module-btn.is-selected`, but the double drawer's bottom handle was *also* a `::after` pseudo on `.preview-module[data-type='drawer'].is-double-drawer`. Both selectors target the same DOM node, and each element only has one `::after` slot. The handle selector had higher specificity, so its `top/left/width/height` (a small pill at 61%) won the cascade, while the selection ring's `border` and `border-radius` were layered on top — producing a dashed border around the bottom handle's box.
- **Fix:** the selection ring is now a real child element (`<span class="preview-module-ring">`) rendered inside the button only when that module is selected. The CSS rule moved from `.preview-module-btn.is-selected::after` to `.preview-module-ring`. Same `top/bottom/left/right: -7px` extents, same dashed blue border — but now it can never collide with handle pseudos. Single drawers and shelves are unaffected (single drawer's only handle is `::before`).

---

### Fix click-to-deselect freeze (listener leak in renderPreview)
**Files:** `ETRNL Configurator — Master/configurator.js`

- **Bug:** clicking outside the canvas (or anywhere inside `layoutPreview` that wasn't a bay) to deselect would freeze the page after enough interactions had elapsed. The page got progressively slower over a session before catastrophically locking up.
- **Root cause:** the click-on-canvas-background deselect handler was attached via `layoutPreview.addEventListener('click', …)` from inside `renderPreview()`. `layoutPreview` is the persistent parent element (queried once at module load) — it is **not** rebuilt by `renderPreview` (only its `innerHTML` is). So every render added another listener to the same element. One click then fired N synchronous handlers, each calling `render()`, each adding another listener → the listener count doubled per click → exponential freeze.
- **Fix:** removed the `addEventListener` from `renderPreview` and bound it once inside `wireControls()` (which runs a single time at startup). Added an early-return when nothing is selected so we don't trigger redundant renders. Left a comment in `renderPreview` at the original location explaining why nothing is bound there.
- All other listeners attached inside `renderPreview` use `layoutPreview.querySelectorAll(...)` against children that are recreated on every `innerHTML` rebuild, so those die with the old DOM and do not leak. Audited: this was the only persistent-element listener leaking from inside the render path.

---

### Hide drag drop-target indicator (black line + dots)
**Files:** `ETRNL Configurator — Master/configurator.css`

- `.preview-slot-indicator` (the black 2px horizontal bar with two circular end-dots that appeared during module drag) is now `display: none`. The slot-line background highlight on `.preview-track.is-drop-target` remains so the target bay is still visually indicated.

---

### Drawer face: padding, label gap, width subtitle (W40/W60/W80)
**Files:** `ETRNL Configurator — Master/configurator.js`, `ETRNL Configurator — Master/configurator.css`

- **Increased internal padding around the handles.** Single drawer handle moved from `top: 14%` → `top: 20%` so it isn't crammed against the top edge. Double drawer top handle moved from `7%` → `11%`, bottom handle from `57%` → `61%`. Handle pill width tightened from `34%` → `30%` to give a touch more side breathing room.
- **Label positions follow the handles.** Single drawer label `top: 22%` → `top: 30%`. Double drawer label `top: 14%` → `top: 21%`.
- **Width subtitle added beneath the drawer name.** New `.preview-module-subtitle` rendered in `renderPreview` for both single and double drawers as `W${bay.width}` (so a 60 cm bay shows `W60`, an 80 cm bay shows `W80`, etc.). Styled small (0.62 rem), medium grey, with `letter-spacing: 0.04em`.

---

### Drawer labels: rename + reposition under the first handle
**Files:** `ETRNL Configurator — Master/configurator.js`, `ETRNL Configurator — Master/configurator.css`

- **Renamed canvas labels:** single drawer now reads "Single Drawer" (was "Drawer"); double drawer now reads "Double Drawer" (was "Drawer ×2"). Inspector header copy is unchanged.
- **Label positioned absolutely just below the first handle** instead of flex-centered in the middle of the face. New CSS rule `.preview-module[data-type='drawer'] .preview-module-copy { position: absolute; top: 22%; ... }` for single drawers (handle sits at 14%, label sits at 22%). Double drawers override to `top: 14%` since the top-half handle is at 7%.

---

### Double drawer face + drawer drag-ghost styling
**Files:** `ETRNL Configurator — Master/configurator.css`, `ETRNL Configurator — Master/configurator.js`

- **Double drawer visual redesigned** to match the approved mockup (`double-drawer-mockup.svg`): the placed module now renders as two stacked 160 mm faces with their own handles and a dark divider line at the midline, instead of a single rectangle with a thin divider. Implemented purely in CSS via `.preview-module[data-type='drawer'].is-double-drawer`: `background` is a `linear-gradient` that paints a 2 px `--line-strong` line at `calc(50% ± 1px)` over the base `#d6d6d6` fill; the existing `::before` handle is repositioned to `top: 7%` (top half), and a new `::after` handle is added at `top: 57%` (bottom half) using the same pill geometry as the single drawer (34 % wide, 11 px tall, 1 px corner radius, no screw dots).
- **Old `.preview-module.is-double-drawer::after` thin divider removed** — replaced by the gradient + second handle approach above.
- **Drawer drag ghost now mirrors the placed drawer face.** Previously `.drag-preview-module` was hard-coded as a shelf-style U-shape (no top border, U-shape rounded bottom) — so dragging a drawer showed a shelf-shaped ghost. New rules `.drag-preview-module[data-type='drawer']` give it a filled grey background (`rgba(214,214,214,0.55)`), all 4 borders (`2px solid rgba(23,23,23,0.65)`), `border-radius: 4px`, and a `::before` handle pill matching the placed drawer. `.drag-preview-module[data-type='drawer'].is-double-drawer` adds the same midline divider gradient and second `::after` handle.
- **`paintDragPreview` updated** to accept a `moduleVariant` arg (default `'single'`) and stamp `data-type="drawer"` + the `is-double-drawer` class on the ghost element when appropriate.
- **`moduleVariant` threaded through dragState** for both canvas drags (`module?.variant || 'single'`) and sidebar drags (`componentType === 'drawer-double' ? 'double' : 'single'`); both `paintDragPreview` callers now pass `dragState.moduleVariant`.

---

### Drawer visual + bottom-anchored placement
**Files:** `ETRNL Configurator — Master/configurator.js`, `ETRNL Configurator — Master/configurator.css`

- **Visual (CSS):** Drawer now renders as a proper closed rectangle — `.preview-module-btn[data-type='drawer']` restores the top border that the base `.preview-module-btn` rule strips. `.preview-module[data-type='drawer']` gets `border-radius: 4px` on all corners (overriding the base `0 0 8px 8px`). A `::before` pseudo-element adds the handle: a centred dark pill (`width: 34%`, `height: 11px`, `border-radius: 1px`, `top: 14%`) with no screw dots.
- **Bottom-anchored positioning.** Drawers were previously rendered the same way as shelves (top anchored to a hole), causing the 320 mm body to overflow far below the spine bottom. New rule: `slot N` for a drawer means its **bottom** is `N × HOLE_PITCH_MM` above the spine bottom. Slot 0 = bottom flush with spine bottom. `renderPreview` now branches on `module.type === 'drawer'` and sets `bottom = module.slot * slotHeight` instead of the shelf `topAlignedToHole` calculation.
- **New helpers:** `getModuleYRangeMm(module)` returns `[bottomMm, topMm]` from spine bottom (shelves top-anchored to hole, drawers bottom-anchored to grid); `getModuleMaxSlot(module)` returns the highest valid slot (for drawers: `floor((spineHeight×10 − DRAWER_HEIGHT_MM) / HOLE_PITCH_MM)`).
- **`slotsConflict` rewritten** to use range overlap (`aBot < bTop && bBot < aTop`) via `getModuleYRangeMm` — the old distance check was wrong for mixed shelf/drawer stacks.
- **`normalizeStateForGrid` and `findNearestOpenSlot`** use `getModuleMaxSlot` as the upper slot bound (previously hard-coded `slotCount − 1` which is wrong for drawers).
- **`getDefaultSlot`** now accepts the candidate module; drawers default to slot 0.
- **`paintDragPreview`** accepts a `moduleType` param: drawer ghosts appear at the bottom-anchored position with `DRAWER_HEIGHT_MM` height.
- **Drag snap updated** for drawers in canvas drag, sidebar drag, and drop: cursor-at-drawer-top → compute drawer-bottom slot as `round((trackBottom − cursorY − drawerHeightPx) / slotHeight)`, clamped to `[0, maxDrawerSlot]`. `moduleType` field added to both dragState initialisations.

---

### Drawer dimensions: 320 mm tall, full bay-width with shelf-style overhang
**Files:** `ETRNL Configurator — Master/configurator.js`

- **New `DRAWER_HEIGHT_MM = 320` constant** added next to `SHELF_HEIGHT_MM`. Single and double drawers share the same physical height (per the existing `getModuleHeightMm` comment), so this single constant covers both.
- **`getModuleHeightMm` now returns `DRAWER_HEIGHT_MM` for drawers** instead of the old `Math.round(SHELF_HEIGHT_MM * 0.86) = 95 mm`. Slot-occupancy math (`getModuleSlotSpan`, `slotsConflict`, `canPlaceModuleAtSlot`) recomputes automatically — drawers now claim `ceil(320 / 70) = 5` slots of vertical span instead of 2, so two drawers must sit at least 5 holes apart and a drawer + shelf must too. This matches reality: a 32 cm drawer body physically takes that much room on the spine.
- **`renderPreview` drawer pixel height** switched from `SHELF_HEIGHT_MM * pxPerMm * 0.86` → `DRAWER_HEIGHT_MM * pxPerMm`. Drawer top still anchors to the slot's hole; the box just extends 320 mm down instead of 95 mm.
- **Drawer width now matches the shelf overhang.** The per-module `style` template previously gave shelves `width: calc(100% + ${shelfOverhang * 2}px); margin-left: -${shelfOverhang}px` and drawers only `height`. Drawers now get the same width treatment so the drawer face spans the bay edges identically to the shelves above/below it. The shelf-only `--shelf-lip` and `--shelf-thickness` CSS vars are still scoped to shelves.
- **Knock-on effects to flag:** with the new 5-slot drawer footprint, an H42 spine (5 slots total) can fit exactly one drawer and nothing else. H63 (8 slots) fits one drawer + at most 1 shelf above or below. Existing configs with closely-packed drawers may snap apart on next render via `normalizeStateForGrid`.

---

### Revert W60 shelf SVG experiment (keep the 126.5 mm height bump)
**Files:** `ETRNL Configurator — Master/configurator.js`, `ETRNL Configurator — Master/configurator.css`

- Rolled back entries 51 and 53 (the Fusion-exported SVG rendering) — making the Fusion paths render convincingly inside the scaled shelf box turned out to be more fiddly than the visual was worth. Shelves are back to the original CSS-border U-shape.
- Removed the `SHELF_W60_SVG_MARKUP` constant, the `useShelfSvg` / `shelfSvgMarkup` / `has-shelf-svg` plumbing in `renderPreview`, and the `.preview-module.has-shelf-svg` / `.preview-module-shelf-svg` CSS rules.
- **Kept** the `SHELF_VISUAL_HEIGHT_MM = 126.5` constant (entry 52) and the `shelfHeight` / `drawerHeight` split in `renderPreview` / `paintDragPreview`. So the shelf box is still drawn 126.5 mm tall (lip-inclusive) with the top anchored to the hole — the CSS U-shape now renders at that taller size. Drawers still compute off the physical 110 mm.

---

### W60 shelf SVG: fill the paths so the shelf renders as a solid object
**Files:** `ETRNL Configurator — Master/configurator.js`

- The Fusion-exported SVG ships with `fill="none"` on every path (it's a laser-cut drawing — stroke lines only). That's why the shelf in the preview showed up as hollow outlines with the gray wall visible through them, while the Fusion reference shows a solid filled profile.
- Flipped the `<g>` wrapper in `SHELF_W60_SVG_MARKUP` from `fill="none"` → `fill="currentColor"` and added `fill-rule="evenodd"` as a safety against any nested subpaths. The stroke stays on for a crisp outer edge. `color: rgba(23,23,23,0.85)` on `.preview-module-shelf-svg` (set previously) drives both the fill and the stroke, so the shelf renders as a dark charcoal solid against the gray wall.

---

### Shelf visual height bumped to 126.5 mm (lip-inclusive), top stays anchored to the hole
**Files:** `ETRNL Configurator — Master/configurator.js`

- **New `SHELF_VISUAL_HEIGHT_MM = 126.5` constant** added next to `SHELF_HEIGHT_MM = 110`. The physical shelf body is still 110 mm — that's the distance from the mounting pin/hole to the bottom of the flat shelf surface. The downturned lip adds another 16.5 mm below that, so the *drawn* shelf is 126.5 mm tall. Slot-occupancy math (`getModuleHeightMm`, `getModuleSlotSpan`, drawer sizing) stays on `SHELF_HEIGHT_MM` so only the visual changes.
- **Top edge stays anchored to the hole.** The existing `topAlignedToHole = holeStart + (rowFromTop * slotHeight)` formula is untouched; `bottom = trackHeight - (topAlignedToHole + moduleHeight)` naturally extends the module downward when `moduleHeight` grows, so every shelf from slot 1 upward keeps its top at the pin and just hangs 16.5 mm lower. This matches the real product: the mount point doesn't move, the lip drops below it.
- **Drawers unaffected.** Previously `moduleHeight = type === 'shelf' ? shelfHeight : shelfHeight * 0.86` — so drawers were derived from the same `shelfHeight` variable and would have grown with it. Split into two locals: `shelfHeight = SHELF_VISUAL_HEIGHT_MM * pxPerMm` and `drawerHeight = SHELF_HEIGHT_MM * pxPerMm * 0.86`, then `moduleHeight = type === 'shelf' ? shelfHeight : drawerHeight`. Drawers still compute off the physical 110 mm.
- **Drag ghost updated too.** `paintDragPreview` now uses `SHELF_VISUAL_HEIGHT_MM` so the translucent target-slot preview matches what the shelf will actually look like when dropped.
- **Known edge case at the very bottom slot (slot 0).** The pre-existing `Math.max(0, ...)` clamp on `bottom` prevents any module from hanging below the track floor. Under the old 110 mm shelf, the clamp already shifted the bottom-slot shelf up by 6 mm (since the lowest hole is 104 mm from track bottom and the shelf wants 110 mm). With 126.5 mm it shifts up by 22.5 mm instead. Left the clamp intact for now — removing it would be a behavior change beyond what was asked, and the overflow would render below the spine bottom which may or may not be desired. Flag for follow-up if visible.

---

### W60 shelves: swap CSS borders for inlined Fusion SVG profile
**Files:** `ETRNL Configurator — Master/configurator.js`, `ETRNL Configurator — Master/configurator.css`

- **New `SHELF_W60_SVG_MARKUP` constant** at the top of `configurator.js`, just under the geometry constants. It's the two paths from `svg/Shelf W60.svg` (Fusion 360 / Shaper Origin export) wrapped in a fresh `<svg viewBox="0 0 60 12.65" preserveAspectRatio="none">` with the original `matrix(1,0,0,-1,170,-56.1762695)` transform kept intact, so no coordinate math was needed. `stroke="currentColor"`, `vector-effect="non-scaling-stroke"`, `stroke-width="1.2"` so the line stays a crisp 1.2 px regardless of how the shelf box stretches.
- **`renderPreview` injects the SVG for W60 shelves only.** Added `useShelfSvg = module.type === 'shelf' && bay.width === 60`; the button gets a `has-shelf-svg` class and the SVG is prepended inside the button before the label. W40 and W80 shelves fall back to the existing CSS-border rendering (no equivalent SVGs yet). Drawers are untouched.
- **CSS hides the CSS borders when the SVG is present.** `.preview-module.has-shelf-svg { border: none; border-radius: 0; }` (covers both upright and `.is-reversed` variants). `.preview-module-shelf-svg` is absolutely positioned to fill the button (`inset: 0`, `pointer-events: none`, `color: rgba(23,23,23,0.85)` so `currentColor` resolves dark against the gray wall). `.is-reversed` applies `transform: scaleY(-1)` to the SVG so flipped shelves show the inverted profile. `.preview-module-copy` is `position: relative; z-index: 1` so the label stays on top of the SVG.
- **Known aspect-ratio mismatch:** the SVG is 60 cm × 12.65 cm (AR ≈ 4.74) while the rendered shelf box is `60 cm × SHELF_HEIGHT_MM` = 60 × 11 cm (AR ≈ 5.45). `preserveAspectRatio="none"` stretches the SVG ~15 % taller than its true geometry to fit the existing box. If this looks wrong we'll either bump `SHELF_HEIGHT_MM` to 126.5 or switch to `preserveAspectRatio` meet.

---

### Share Design: replace Export/Import Config with one-click share link
**Files:** `ETRNL Configurator — Master/index.html`, `ETRNL Configurator — Master/configurator.js`, `ETRNL Configurator — Master/configurator.css`

- **New "Share Design" button** sits next to "Export PDF" in the sidebar Actions section (50/50 row). Click → builds a `${origin}${pathname}#c=${configId}` URL, copies to clipboard via `navigator.clipboard.writeText()`, and swaps the button label to "Copied!" for 1.5s before reverting.
- **`buildShareLink()` and `loadFromShareLinkIfPresent()` helpers** added next to `getCurrentConfigId()` in `configurator.js`. Reuses the existing `encodeConfigId` / `decodeConfigId` / `createConfigSnapshot` / `applyConfigSnapshot` infrastructure — share link is just the existing config ID dropped into a URL hash.
- **Page-load hash check.** Bottom-of-file init now runs `loadFromShareLinkIfPresent()` before the default-bay bootstrapping. If a `#c=...` is present, decodes and applies the snapshot, then `history.replaceState`s the hash away so subsequent reloads don't re-overwrite user edits. The post-init `topShelfMm = getCenteredTopShelfMm()` line is now skipped when a share link loaded (link carries its own topShelfMm).
- **Bad-link handling is dumb by design.** If `decodeConfigId` throws or `applyConfigSnapshot` rejects (version too new, references a removed catalog item, etc.), shows a single `alert()` ("This share link couldn't be loaded — it may be from an older version…") and falls back to defaults. No migration logic, no graceful snapping. Share links are intended to live for days/weeks/maybe a month, not years.
- **Currency added to the snapshot.** `state.totalCurrency` is now serialized as field `c` in `createConfigSnapshot` and read back in both apply paths (validated against `['INR','USD','EUR']`). Additive field — no `CONFIG_ID_VERSION` bump needed since missing `c` falls back to `'INR'`.
- **Removed Export Config / Import Config plumbing.** Both buttons (`#copy-config-id`, `#load-config-id-btn`), the hidden `#config-id` textarea, the hidden `#load-config-id` button, the `configIdInput`/`copyConfigIdButton`/`loadConfigIdButton` DOM lookups, both click handlers, the `configIdInput` sync inside `render()`, and the now-dead `.config-id-input` CSS rule are all gone. Net code goes down.

---

### PDF export: widen elevation canvas further
**Files:** `ETRNL Configurator — Master/configurator.js`

- Bumped `maxBoxWidth` from 780 → 820 and `maxBoxHeight` from 540 → 580.
- Tightened `previewWrap` padding from `24px 16px` → `16px 8px` to squeeze more canvas into the sheet.

---

### PDF export: drop wall-dimension arrow bars, scale elevation to full page width
**Files:** `ETRNL Configurator — Master/configurator.js`

- **Removed wall outer-dimension arrow bars** (width below + height to the right) from `createPdfPreviewPanel`. The wall width and height numbers already live in the page 1 "Overall Dimensions" panel — duplicating them around the elevation just stole space and made the canvas feel small.
- **Elevation now fills the full page width.** Bumped `maxBoxWidth` from `580` → `780` (sheet content area is ~812px, leaving a small breathing margin) and `maxBoxHeight` from `460` → `540`. Reduced `previewWrap` padding from `60px 110px 90px` → `24px 16px` since there's no longer anything to clear on the sides. Dropped the `minHeight: 720px` floor so the wrap collapses to whatever the scaled canvas needs.

---

### PDF export: scale-to-fit canvas, strip module buttons, lighter gray #f8f8f8
**Files:** `ETRNL Configurator — Master/configurator.js`

- **Root cause of the missing height arrow found.** The wall plane width is set dynamically by `renderPreview()` based on the live browser viewport (capped at `pxPerMm = 0.5`), so on a wide screen the cloned plane could be ~900px and overflow the 920px sheet — html2canvas clipped the height bar at the sheet edge. The previous "move heightBar to canvas" patch was insufficient because the canvas itself sized to the oversized plane.
- **Canvas now scaled-to-fit a fixed target box.** `createPdfPreviewPanel` measures the live `.preview-wall-plane` via `getBoundingClientRect()`, computes a scale factor against `maxBoxWidth = 580` / `maxBoxHeight = 460`, and applies `transform: scale()` to the cloned canvas. The clone is locked to its measured dimensions (`min-width:0`, explicit width/height) so it doesn't reflow inside the off-screen sheet.
- **`scaleBox` wrapper added.** A `position:relative` div with `width/height = scaledWidth/scaledHeight` reserves the correct layout footprint and acts as the positioning context for the arrow bars. Both width and height arrow bars are now siblings of the scaled canvas (children of `scaleBox`), so they stay at full readable size — the labels and arrowheads are no longer scaled down.
- **Module flip and remove buttons stripped.** `.preview-module-flip`, `.preview-module-remove`, `[data-flip-module-inline]`, and `[data-remove-module-inline]` were leaking onto the shelves in the export. Added to the strip selector in `createPdfPreviewPanel`.
- **Gray lightened from `#d9d9d9` to `#f8f8f8`** across all PDF surfaces (page 1 dimensions panel, page 2 header row, page 2 TOTAL footer row). Both prior shades were reading too dark.

---

### PDF export: fix wall-height bar clipped at sheet edge
**Files:** `ETRNL Configurator — Master/configurator.js`

- The height arrow bar was appended to `.preview-wall-plane` and positioned at `left:100%` relative to it, causing it to overflow the 920px sheet boundary and be clipped by html2canvas. Fixed by appending the heightBar to `previewCanvas` (`.preview-wall-canvas`, `position:relative`) instead. Since the canvas sizes to the plane width, `left:100%` lands at the same visual position, but the bar now falls within `previewWrap`'s 110px right padding rather than outside the sheet.

---

### PDF export: dimension arrows, wall-height annotation, drop selection rectangle
**Files:** `ETRNL Configurator — Master/configurator.js`

- **Width annotation now an arrow bar.** Replaced the lone width pill with a full-width horizontal line spanning under the plane, arrowheads on both ends, and the `180 cm` pill centered on top.
- **Wall height annotation added (was missing).** New full-height vertical arrow bar on the right side of the plane — vertical line, arrowheads at top and bottom, height pill centered. Reads `state.wallHeight` via `formatLengthCm`.
- **Selection rectangle stripped from the export.** The dashed light-blue selection border (driven by `.is-selected ::after` on `.preview-bay-shell`) was leaking into the PDF as a "dynamic UI" artifact. `createPdfPreviewPanel` now removes the `is-selected` class from every cloned node, killing the pseudo-element entirely.
- **Wrapper padding bumped to `60px 110px 90px`** so the new arrow bars (right side + bottom) aren't clipped by `previewWrap`.

---

### PDF export: unify gray to #d9d9d9, drop parts-table row stripes
**Files:** `ETRNL Configurator — Master/configurator.js`

- **Single gray everywhere.** All gray fills in the PDF are now `#d9d9d9` (the user's chosen "Light grey" hex). Page 1 dimensions panel, page 2 table header row, and page 2 TOTAL footer row all use it.
- **Parts table row stripes removed.** Body rows (parts + shipping) now render plain white — only the header row and the TOTAL footer row carry the gray fill, matching the KittaParts reference. Removed the `rowStripe` helper since it's no longer needed.

---

### PDF export: cool grays, "Color" label, strip add-bay buttons from elevation
**Files:** `ETRNL Configurator — Master/configurator.js`

- **Add-bay plus buttons stripped from the cloned elevation.** The `+` buttons flanking each bay (`.preview-add-bay-btn`, also matched via `[data-add-bay]`) were leaking into the export — they're now removed alongside the other interactive overlays in `createPdfPreviewPanel`.
- **Page 1 "Material Finish" label renamed to "Color."** Same `state.finish` value, just a friendlier header.
- **Banner palette pushed cool.** The previous `#ededed` / `#f1f1f1` / `#e8e8e8` neutral grays were still reading warm. Switched to slightly blue-tinted cool grays so they render unambiguously gray: page 1 dimensions panel `#e5e7eb`, page 2 stripe `#eef0f3`, page 2 header + TOTAL footer `#dde1e6`.

---

### PDF export: spine outlines, neutral grays, reordered parts table with unit price
**Files:** `ETRNL Configurator — Master/configurator.js`

- **Spine outlines added.** White (and other light-finish) spines were vanishing into the gray wall plane. `createPdfPreviewPanel` now sets `border: 1px solid rgba(23,23,23,0.6); box-sizing: border-box;` on every cloned `.preview-spine`, so the system reads clearly against the backdrop regardless of finish.
- **Banner/stripe palette switched from warm to neutral grays.** The earlier `#fafafa` / `#f0f0f0` panels read as faintly orange on color-managed displays. Page 1 dimensions panel is now `#ededed`; page 2 striped rows use `#f1f1f1`; page 2 header and TOTAL footer rows use `#e8e8e8`.
- **Page 2 table columns reordered to `SKU | Product | Quantity | Unit Price | Total`** (5 columns, up from 4). SKU column leads, Product is second, Quantity is its own column, and the new Unit Price column sits between Quantity and Total. SKU values still render blank (placeholder until SKUs are wired in).
- **Unit Price column added.** Computed as `formatConvertedCurrency(part.amount / part.quantity, state.totalCurrency)` per row; falls back to `'TBD'` when `!part.priced` (drawers). Shipping row leaves Quantity and Unit Price blank.
- **Header font sized up to match data rows.** Table header was `13px` while the body cells were `15px` — the inversion looked wrong. Headers are now `15px` (extracted into a shared `headerCellStyle` so any future tweak stays consistent).
- TOTAL footer colspan adjusted to span the new 5-column layout.

---

### PDF export: faithful canvas view, SKU column, cm dims, wall annotations
**Files:** `ETRNL Configurator — Master/configurator.js`

- **Elevation view now matches the live canvas 1:1.** Removed the white-background and box-shadow overrides on `.preview-wall-plane` and the wall-measure repositioning hacks in `createPdfPreviewPanel`. The cloned plane keeps its native gray gradient, dark border, and shadow, so white spines stay visible against the tinted backdrop instead of vanishing on white. Stripped the previously-tried `.preview-spine` gray-out hack — no longer needed.
- **Wall outer dimensions annotated on the cloned plane.** The live canvas no longer renders wall outer dims (only inner spacing measurements). For the export, two pill-style labels are appended to the cloned `.preview-wall-plane`: width below the plane (centered), height to the left of the plane (vertically centered), both reading from `state.wallWidth/wallHeight` via `formatLengthCm`. Wrapper padding bumped to `60px 80px` so the annotations and wall-measure overflow don't get clipped.
- **Page 1 dimensions panel switched from mm to cm** (`Wall Width: 180 cm` etc.) via `formatLengthCm` so units stay consistent with the rest of the configurator UI.
- **Page 2 table columns reworked.** Replaced the `Description` column with an empty `SKU` column (cells render blank for now — placeholder until real SKUs are wired in). Final layout: `Qty | Product Name | SKU | Total`, matching the KittaParts reference exactly.
- **Setup ID block removed from page 2.** The long base64 ID was clunky and visually heavy; the short `YYMMDD-HHMM` ID on page 1 is enough for human reference. `getCurrentConfigId()` is still used by the sidebar Export Config button.
- Removed the now-dead `previewWrap.style.minHeight` / `borderRadius` overrides from `createPdfPage1Sheet` since `createPdfPreviewPanel` owns those styles now.

---

### PDF export: KittaParts-style two-page layout
**Files:** `ETRNL Configurator — Master/configurator.js`

- Replaced single-page `createPdfExportSheet` with two new sheets: `createPdfPage1Sheet` (overview) and `createPdfPage2Sheet` (parts list), rendered to separate `pdf.addPage()` slots. Inspired by the KittaParts builder PDF reference.
- **Page 1** — title block top-left ("ETRNL Evolv Configuration", optional Customer line, Date `DD/MM/YYYY`, short ID `YYMMDD-HHMM`) paired with a bordered top-right "Overall Dimensions" / "Material Finish" panel showing Wall Width / Wall Height / Spine Height / Build Width in mm and the current finish. Large elevation view occupies the rest of the page (`previewWrap.minHeight = 720px`).
- **Page 2** — "Parts List" header followed by a striped Qty / Product Name / Description / Total table, optional Shipping row, and a TOTAL footer row. Setup ID printed at the bottom in small mono-style text.
- Added helpers `escapePdfHtml`, `formatPdfDate`, `formatPdfShortId`, `createPdfSheetBase`, `placePdfImage` to keep the two sheet builders lean and share scaling/layout boilerplate.
- Removed now-unused `buildPdfOverview` (only consumer was the old single-sheet layout).
- `triggerConfigurationPdfDownload` now appends both sheets, renders each with html2canvas, and stitches them together via `pdf.addPage()` between the two `placePdfImage` calls.

---

### PDF export: replaced custom modal with native browser prompt
**Files:** `ETRNL Configurator — Master/index.html`, `ETRNL Configurator — Master/configurator.js`, `ETRNL Configurator — Master/configurator.css`

- Export PDF now uses native `window.prompt('Enter your name for the PDF (optional):')` instead of the inline `#pdf-modal` panel — single-step flow, no extra UI to maintain.
- Name is now optional: empty input proceeds with default filename `EVOLV_Setup.pdf` and PDF title "Your Evolv Setup". When a name is supplied, filename uses `${name}_EVOLV_Setup.pdf` and title becomes `${FirstName}'s Evolv Setup`.
- Cancel (prompt returns `null`) aborts cleanly with no side effects.
- Removed obsolete `#pdf-modal` HTML, `openPdfModal`/`closePdfModal` helpers, all `pdf-*` DOM lookups, modal event handlers (close, cancel, confirm, Enter/Escape keydown), and `Escape` keydown branch that closed the modal.
- Removed `.pdf-dropdown`, `.pdf-dropdown-head`, `.pdf-dropdown-actions`, `.modal-button-secondary`, `.modal-button-primary` CSS rules.
- Inspired by `builder.likebutter.com.au` which uses the same native-prompt pattern for naming PDF exports.

---

## 2026-04-13

### Inspector label: bay subtitle stacked centered below title
**Files:** `ETRNL Configurator — Master/configurator.js`, `ETRNL Configurator — Master/configurator.css`

- Changed `.preview-inspector-label` from inline row to column with `align-items: center` — bay label now appears centered below the title instead of inline to the right.
- Removed `·` separator between title and bay label.

---

### Inspector empty-state text changed to "Select a bay or module"
**Files:** `ETRNL Configurator — Master/configurator.js`

- Changed placeholder text from "Selection" to "Select a bay or module" — clearer instruction for what the user should do.

---

### Inspector polish: bigger title, inline label, empty-state, canvas-centered
**Files:** `ETRNL Configurator — Master/configurator.js`, `ETRNL Configurator — Master/configurator.css`

- Inspector title bumped to 0.92rem, copy to 0.85rem with `line-height: 1` so the text vertically center-aligns with the pill row at the same height.
- Title and bay subtitle are now inline on a single line (e.g. `SHELF D35 · BAY 1`) inside a new `.preview-inspector-label` flex container — replacing the previous stacked two-line layout.
- Empty-state placeholder added: when nothing is selected, the inspector shows the muted text "Selection" instead of disappearing. Uses `.preview-inspector-head.is-empty` modifier with softer color/weight.
- `.top-bar-center` repositioned from window-center (`left: 50%`) to canvas-center (`left: calc(50% + 200px)`) so the inspector aligns with the visible canvas area when the sidebar is open. Falls back to `left: 50%` when the sidebar is closed (`[data-sidebar-state='closed']`).

---

### Move inspector into top bar header, centered
**Files:** `ETRNL Configurator — Master/index.html`, `ETRNL Configurator — Master/configurator.css`

- Inspector moved from floating canvas panel into the top bar as a `.top-bar-center` block, centered via `position: absolute; left: 50%; transform: translate(-50%, -50%)` so it doesn't disturb the left/right groups.
- Removed the floating panel wrapper from the canvas entirely.
- Stripped card styling (border, background, shadow, padding) from `.preview-inspector` — it now sits flush inline in the header.
- Reduced inspector font sizes to match header scale (title 0.75rem, copy 0.72rem).
- Added `white-space: nowrap` to title and copy so they don't wrap inside the header.

---

### Shelf inspector collapsed to single row
**Files:** `ETRNL Configurator — Master/configurator.js`

- Moved D15/D25/D35/Flipped pills into the inspector head row alongside the title, matching the single-row layout used for the bay inspector. Removed the separate second actions row.

---

### Hide width pills (40/60/80) in inspector when a module is selected
**Files:** `ETRNL Configurator — Master/configurator.js`

- Width pills and bay remove button are now only shown in the inspector when a bay is selected with no module. When a shelf or drawer is selected, the inspector head shows only the title/subtitle with no action buttons.

---

### Move inspector to top-center of canvas
**Files:** `ETRNL Configurator — Master/index.html`, `ETRNL Configurator — Master/configurator.css`

- Inspector panel moved from bottom-right to top-center of the canvas.
- Replaced `floating-panel-bottom` class with `floating-panel-top-center`: positions with `top: 16px`, `left: 50%`, `transform: translateX(-50%)`, `width: max-content` so it auto-sizes to its content and stays centered.
- Removed unused `floating-panel-top` and `floating-panel-bottom` CSS rules.
- Cleaned up `floating-panel` base rule (removed stale `left/right/transform-origin` that no longer apply).

---

### Hide bay remove (-) button in inspector when a module is selected
**Files:** `ETRNL Configurator — Master/configurator.js`

- The `-` (remove bay) button in the inspector header is now hidden when a shelf or drawer module is selected. It still appears when only a bay is selected. Shelf removal is handled by the `-` button on the module itself on the canvas.

---

### Export PDF button styled like other actions, divider added
**Files:** `ETRNL Configurator — Master/index.html`, `ETRNL Configurator — Master/configurator.css`

- Export PDF button changed from `action-btn-primary` (dark/inverted) to `action-btn-secondary` so it visually matches Clear, Undo, Redo, Export Config, Import Config.
- Added a thin horizontal `.action-divider` between the Undo/Redo row and the Export PDF button to visually separate history actions from export actions.

---

### Redo button label changed to ⌘Y
**Files:** `ETRNL Configurator — Master/index.html`

- Changed Redo button label from `Redo ⌘⇧Z` to `Redo ⌘Y`. The Cmd+Y keyboard shortcut was already wired up; only the displayed shortcut hint changed.

---

### Rework Actions sidebar layout — Clear full-width, add Redo
**Files:** `ETRNL Configurator — Master/index.html`, `ETRNL Configurator — Master/configurator.js`

- Clear button promoted to a full-width row above Undo/Redo (matching the Export PDF button width).
- Replaced the Clear button in the Undo row with a new Redo button (`#redo-btn`, label `Redo ⌘⇧Z`).
- Wired `#redo-btn` click to the existing `redo()` function (was previously only reachable via keyboard shortcut).

---

### Remove Starter Kits section from sidebar
**Files:** `ETRNL Configurator — Master/index.html`

- Removed the visible "Starter Kits" section from the sidebar (was Section 2). Components is now followed directly by Actions.
- Moved `#kit-options` into the hidden compatibility block alongside `#recommendations` and `#catalog-notes` so `renderKitOptions()` keeps working without a crash. The JS function is left untouched.

---

### Add INSTRUCTIONS.md and tie it to the backup workflow
**Files:** `ETRNL Configurator — Master/INSTRUCTIONS.md` (new), `ETRNL Configurator — Master/CLAUDE.md`

- Created `INSTRUCTIONS.md` — a complete replication and reference guide covering tech stack, folder layout, geometry constants, catalog data, state model, rendering pipeline, drag-and-drop architecture, selection model, undo/redo, PDF export, config sharing, workflow rules, replication steps, known quirks, file map, and a function-to-line index for `configurator.js`.
- Updated `CLAUDE.md` backup rule: every backup (every 10 changelog entries) now requires updating `INSTRUCTIONS.md` first, so each backup is a self-contained documented snapshot.
- Mirrored the same rule in `INSTRUCTIONS.md` itself (section 16).

---

### Drag preview styling, grabbing cursor, cleanup ghost CSS
**Files:** `configurator.js`, `configurator.css`

- Added `.drag-preview-module` CSS: black-bordered U-shape preview rendered on target track during cross-bay and sidebar drags — matches the shelf style at reduced opacity, consistent with same-bay drag visuals.
- Added global `cursor: grabbing` during all module drags via `html.is-module-dragging` class on `<html>`. Prevents cursor flickering between pointer/grab/default.
- Module buttons (`.preview-module-btn`) now show `cursor: grab` at rest.
- Sidebar component tiles changed from `cursor: pointer` to `cursor: grab`.
- Removed unused `.drag-ghost` and `.drag-ghost-new` CSS (replaced by on-track preview system).

---

### Drag-and-drop: sidebar to canvas + cross-bay module moves
**Files:** `configurator.js`

- Sidebar component tiles now support drag-to-canvas: pointerdown starts drag after 6px threshold, shows drop indicator on hovered bay track, drops component at target slot.
- Cross-bay module drag: dragging a module from one bay and dropping it on another bay's track moves the module between bays.
- New `moveModuleToBay()` function removes module from source bay and adds to target bay at the nearest open slot.
- New `addModuleAtBaySlot()` function for sidebar drag drops — creates the component at the target bay and slot.
- `handleDragEnd()` now detects target bay from `data-track-click` attribute and routes to same-bay move, cross-bay move, or sidebar drop accordingly.
- `addShelfToBay()` and `addComponentToBay()` now check `findNearestOpenSlot()` before adding — prevents overfilling bays.
- `normalizeStateForGrid()` now drops modules that can't find a valid slot instead of placing them at conflicting positions (fixes freeze bug).

---

### Reversible shelves: toggle in inspector, ∩ shape when reversed
**Files:** `configurator.js`, `configurator.css`

- Shelves now support `reversed` boolean property (default `false`).
- Inspector shows "Reverse" toggle pill when a shelf is selected — highlighted when active.
- Reversed shelf renders as ∩ shape (borders on left, right, top; rounded top corners; open bottom).
- Normal shelf remains U-shape (borders on left, right, bottom; rounded bottom corners; open top).
- Reversed shelves can be used as tabletop surfaces — combining multiple creates a continuous flat surface.

---

### Shelf visual updated to match real product
**Files:** `configurator.css`

- Shelf now renders as a solid filled rectangle (`#a8a89a`) matching the real aluminum/steel color.
- Thin lighter strip (`#bdbdaf`) along the top 18% of the shelf simulates the front lip edge detail.
- Removed heavy black border and rounded bottom corners from shelf.
- Label text changed to white/light and font-weight reduced to 600.
- `.preview-module-btn` border removed; selected state keeps outline only.

---

### Drag grid aligned to actual hole positions using DOM slot lines
**Files:** `configurator.js`, `configurator.css`

- Replaced `repeating-linear-gradient` background approach with per-slot `<div class="preview-slot-line">` elements rendered at exact hole positions.
- Each slot line is positioned at `holeStart + rowFromTop * slotHeight`, matching the real hole geometry precisely.
- Slot lines are hidden by default, shown only when track has `is-drop-target` class.
- Grid now covers exactly the 8 hole positions with correct top and bottom gaps — no overflow.

---

### Accurate hole geometry: FIRST_HOLE_MM = 104, SHELF_HEIGHT_MM = 110, slot count recalculated
**Files:** `configurator.js`

- Added `FIRST_HOLE_MM = 104` constant — first mounting hole is 104 mm from spine bottom (same for all spine heights).
- `SHELF_HEIGHT_MM` changed from 100 to 110 (11 cm, matching real product).
- `getSlotCount()` now uses `Math.floor(((spineHeight * 10) - FIRST_HOLE_MM) / HOLE_PITCH_MM) + 1` — H63 gets 8 slots (was 10), H105 gets 14, H135 gets 18.
- `getMinimumSlot()` simplified to always return 0 — shelf can be placed at the lowest hole.
- Rendering `holeStart` now accounts for top gap (`spineHeightMm - FIRST_HOLE_MM - (slotCount-1) * 70`) — shelves no longer sit flush with spine top, matching real product geometry.
- Inspector mount height display uses `FIRST_HOLE_MM + slot * HOLE_PITCH_MM` for accurate mm value.

---

### Shelf placement: default to top, flush bottom alignment when dragged
**Files:** `configurator.js`

- `getDefaultSlot()` searches top-down — new shelves appear at the top of the spine.
- `getMinimumSlot()` uses `Math.floor` instead of `Math.ceil` — shelves can now be dragged to slot 1 (closer to spine bottom).
- Module rendering `bottom` clamp changed from `Math.max(2, ...)` to `Math.max(0, ...)` — shelves at the lowest slot sit flush with the spine's bottom edge.

---

### Fix freeze bug: render guard, resize check
**Files:** `configurator.js`

- Added `isRendering` guard flag to `render()` — prevents re-entrant renders from cascading.
- Resize handler now checks `window.innerWidth/innerHeight` against cached values — skips render if window size unchanged (prevents DOM-layout-triggered false resize events from looping).
- Removed redundant `state.topShelfMm` clamping inside `renderPreview()` — already done at top of `render()`.
- `getDefaultSlot()` now searches top-down (highest slot first) instead of bottom-up — new shelves align to the top of the spine instead of the bottom.

---

### Gray wall background; solid white/black spine
**Files:** `configurator.js`, `configurator.css`

- Wall background changed from white gradient to gray (`#d8d8d8` → `#cccccc`).
- Spine is now solid white (`#ffffff`) for White finish, solid black (`#111111`) for Black finish.
- Removed SVG img overlay from spine — clean solid color, SVG files kept in `svg/` for future use.

---

### Spine rendered from clean SVG (no holes) with finish color
**Files:** `configurator.js`, `configurator.css`

- Reverted mask-image approach; replaced with simple img overlay on colored background.
- Uses `svg/Sketch2 v2.svg` (clean spine outline, no holes, from Shaper Origin export).
- White finish: `#d4d4d4` background + gray SVG outlines at 60% opacity.
- Black finish: `#1e1e1e` background + inverted SVG outlines via `filter: invert(1)`.

---

### Spine holes cut out via CSS mask
**Files:** `configurator.css`, `svg/spine-mask.svg`

- Created `svg/spine-mask.svg` — white-filled spine rectangle with 4 oval holes cut out using `fill-rule="evenodd"`.
- Applied `mask-image: url('svg/spine-mask.svg')` to `.preview-spine` so holes are fully transparent (wall shows through).
- Holes positioned at visual y≈0.70, 14.70, 35.70, 56.70 cm matching H63.svg geometry.

---

### Spine rendered from SVG file with finish-based color switching
**Files:** `configurator.js`, `configurator.css`

- Replaced CSS gradient + hole-dot spine rendering with `svg/H63.svg` (Shaper Origin export, 2.5cm × 62.8cm).
- Spine div now has `finish-white` or `finish-black` class based on `state.finish`.
- White finish: light gray (`#d9d9d9`) background + SVG at 55% opacity.
- Black finish: dark (`#222222`) background + SVG inverted via `filter: invert(1)`.
- Removed `border-radius: 999px` (pill shape) from spine; replaced with `border-radius: 3px`.
- `human-scale.svg` moved from master folder into `svg/` folder.
- `svg/` folder created for all SVG assets.

---

### Remove wall grid and corner bracket decorations
**Files:** `configurator.css`

- Removed `repeating-linear-gradient` grid pattern from `.preview-wall-plane` background.
- Removed `.preview-wall-plane::after` block that rendered four corner bracket marks.
- Wall now shows a plain white-to-off-white gradient with border only.

---

### Inspector bay title: combined W-label format
**Files:** `configurator.js`

- When a bay (no module) is selected, inspector title is now `BAY 1 - W60` and subtitle is `60 cm`.
- Previously title was just `BAY 1` and subtitle was `60 cm` with no W-prefix.

---

### Bay selection, inspector rework, spine options, math inputs, clearance enforcement
**Files:** `configurator.js`, `configurator.css`

- Bay selection: `is-selected` class added to `.preview-bay-shell`; dashed selection rectangle rendered via `::after`, light blue (`rgba(59,130,246,0.6)`).
- Non-first bays extend selection rectangle left by shared spine width via `--shared-spine` CSS variable.
- Inspector title now shows actual item name ("Shelf D25", "Drawer ×2", "Bay 1") instead of "Selected Module/Bay".
- Inspector subtitle shows "Bay 1 · Mount 28 cm" for modules, "W60 cm" for bay-only. "Top" and "Drawer" buttons removed.
- Spine dropdown: removed `disabled` attribute from options that exceeded wall height — wall now auto-expands instead.
- `clampSpineToWall()` removed from `render()`; replaced with auto-expand logic (spine + 10 cm top + 10 cm bottom).
- Wall dimension inputs changed from `type="number"` to `type="text"` to allow arithmetic expressions.
- `evalSimpleMath()` added — evaluates simple expressions (e.g. `190+50`) in wall width/height fields on Apply.
- Invalid input restores last applied values instead of defaulting to 70/65 cm minimum.
- Minimum 5 cm clearance enforced in `applyWallDimensions()` based on current layout width.
- Canvas dimension annotation (left/right clearance) also enforces 50 mm minimum per side.
- Separator added after Color toggle in top bar.
- Default wall size changed to 180 × 120 cm.
- Brand name stacked: "ETRNL Evolv" on top, "Configurator" below (column flex layout).
- Brand name font size increased to 1.05rem.

---

## 2026-04-13

### Spine height centering, auto-expand wall, floor clearance minimum
**Files:** `configurator.js`

- Spine height dropdown added to top bar (un-hidden existing `#spine-select`, wrapped in `top-bar-field` label with separator).
- Default spine height changed from 105 to 63 cm.
- Spine re-centers vertically on the wall whenever spine height changes (`getCenteredTopShelfMm()`), on startup, and on brand reset.
- Minimum floor clearance of 10 cm enforced in `getTopShelfBoundsMm()` — spine can never sit at the floor.
- Wall height auto-expands when spine height requires it (spine + 10 cm top + 10 cm bottom).
- Wall width auto-expands when adding a bay or changing bay width, maintaining 5 cm minimum clearance each side.
- `lastAppliedWidth` / `lastAppliedHeight` hoisted to module scope so auto-expand can sync the Apply button state.
- Brand reset now also resets `spineHeight` to 63 and re-centers `topShelfMm`.

---

## 2026-04-13

### Bay width options always visible, remove bay button circular, UI polish
**Files:** `index.html`, `configurator.js`, `configurator.css`

- Bay captions now show all three width options (W40, W60, W80) as clickable buttons; active width is bold, others grayed out. No bay selection needed to change width.
- Remove bay (`-`) button changed from rounded rectangle to circle (`border-radius: 50%`) to match `+` button style.
- Default state: no bay pre-selected on load (`selectedBayId = null`).
- Track border (rectangle outline between spines) removed.
- Top bar: Color label moved above White/Black buttons (column layout). All field labels set to title case and bumped to 0.75rem. Header height increased from 52px to 68px. Separator height increased to 28px. All inputs and selects center-aligned. JS label strings fixed to title case.

---

## 2026-04-13

### + add-bay buttons moved to caption row
**Files:** `configurator.js`, `configurator.css`

- Removed the old side-rail add-bay buttons (`renderAddRail` was already deleted; stale calls removed).
- New `+` buttons are rendered inside `.preview-group` as absolutely-positioned elements at `bottom: 100%` (same level as bay captions), one outside each end of the bay group.
- Left button: `left: 0; transform: translateX(-150%)`. Right button: `right: 0; transform: translateX(150%)`.
- Updated canvas deselect handler to ignore clicks on `.preview-add-bay-btn` (was referencing deleted `.preview-add-rail` class).

---

## 2026-04-13

### Bay labels moved to top, hide 170 cm top-line label, Starter Kits collapsed by default
**Files:** `index.html`, `configurator.js`, `configurator.css`

- Bay captions (Bay 1 / W40·60·80 / remove button) moved from below the bay frame to above it.
- Hidden the "170 cm" top shelf line label and its drag handle from the canvas. The dashed top-line guide is also hidden.
- Starter Kits `<details>` section in sidebar now starts collapsed (removed `open` attribute).
- Apply button CSS: added `align-self: flex-end` so it aligns with the input fields, not their labels.

---

## 2026-04-13

### Top bar: Apply button, remove spine/top-shelf, hide Units
**Files:** `index.html`, `configurator.js`, `configurator.css`

- Added **Apply** button next to wall dimension inputs. Button is disabled (gray) when input values match the last applied state; turns black/clickable when either value changes. Apply is triggered by button click or Enter key.
- Removed spine height dropdown and top shelf line input from the top bar. Elements kept as hidden in HTML so JS compatibility is preserved.
- Hidden the Units dropdown from the UI (`display:none`). Unit conversion logic in JS remains intact for future use.

---

## 2026-04-13

### Sidebar restructure + component tiles + top bar redesign
**Files:** `index.html`, `configurator.js`, `configurator.css`

- Replaced sidebar with three collapsible `<details>` sections: **Components**, **Starter Kits**, **Actions**.
- Components section: shelf tiles (D15, D25, D35) and drawer tiles (Single, Double). Clicking a tile adds the component to the selected bay.
- Actions section: Undo/Clear row, Export PDF button, Export Config/Import Config row.
- Top bar restructured to left (controls) / right (total price) layout. "Finish" renamed to "Color".
- Spine height and top shelf line moved to top bar (subsequently removed in next iteration).
- Double drawer: renders same height as single drawer with a horizontal CSS divider line at 50%. BOM shows "Price TBD".

---

## 2026-04-13

### Canvas cleanup: remove wall annotations, human figure, simplify shelf labels, add undo/redo
**Files:** `configurator.js`

- Removed wall width/height dimension labels, corner badge, and resize handle from canvas. Wall dimensions controlled from top bar only.
- Removed human scale figure (SVG + label) from canvas.
- Shelf labels simplified from inline depth-switcher (`15 | 25 | 35`) to clean static label: `Shelf D15`, `Shelf D25`, `Shelf D35`. Depth editing moved to bottom inspector panel.
- Added undo/redo history stack (10 steps). `pushHistory()` called at the top of all 11 state-mutating functions. Keyboard: `Cmd/Ctrl+Z` = undo, `Cmd/Ctrl+Shift+Z` / `Ctrl+Y` = redo.

---

## 2026-04-13

### Default empty state, wall input debounce, min dimensions
**Files:** `configurator.js`

- Default state changed to empty bays (`bays: []`). Configurator starts with a blank wall.
- Empty canvas shows a scaled wall outline with "Add a bay from the sidebar to start building" hint.
- Wall dimension inputs changed from live `input` to `change` + `blur` + `Enter` only — prevents preview flickering mid-type.
- Min wall width: 70 cm. Min wall height: 65 cm.
- `calculateSummary()` returns 0 spines/cost when bays are empty.

---

## 2026-04-13

### Layout restructure — 3-column layout, top bar, right panel
**Files:** `index.html`, `configurator.js`, `configurator.css`

- Forked from Yash's prototype. Restructured to 3-column layout: left sidebar | center canvas | right stats panel.
- Added top bar with brand, finish toggle, wall inputs, unit toggle, total price.
- Moved stats + BOM to right panel. Sidebar holds controls, kits, PDF export, setup ID.
- `finish-select` dropdown replaced with toggle buttons. JS updated accordingly.
- All Yash's core logic preserved: drag-and-drop, slot system, pricing engine, PDF export, setup ID encode/decode.

---

## 2026-04-13

### Initial build — Step 1: pricing engine
**Files:** `configurator.html`

- First standalone pricing engine. Spine height selector, bay count stepper, bay width selectors, click-to-add modal for shelves/drawers, real-time parts estimate table.
- Single `PRODUCTS` config object at top of file. Kit framework stubbed for later.
