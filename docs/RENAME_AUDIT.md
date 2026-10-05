# Larper 48 rename and engine fixes

Base: `b8fa8b3bfce298e72a571d20efbd2917270d8db3` (October 2, 2026), default branch
`claude/friendly-clarke-0k1r0l`. That commit changed only the README heading.
No open PRs covered this work at inspection time.

## Names changed

| Surface | Previous | Replacement / files |
| --- | --- | --- |
| npm package and root lockfile entries | `floor-48` | `larper-48` in package.json and package-lock.json |
| Product / description | `Floor 48` | `Larper 48` in package.json |
| HTML title and loading screen | `Floor 48` | `Larper 48` in index.html, build.mjs, src/ui/ui.js |
| Main-menu heading | `FLOOR <span>48</span>` | `LARPER <span>48</span>` in src/ui/ui.js |
| Standalone output | `dist/floor48.html` | `dist/larper48.html`; build also regenerates the compatibility copy below |
| Packaged directory and binary | `release/Floor48-<platform>-<arch>/Floor48` | `release/Larper48-<platform>-<arch>/Larper48` (Windows suffix `.exe`; macOS `Larper48.app`) |
| Windows metadata | Floor 48 product, description, original filename | Larper 48 product and description, `Larper48.exe` |
| Desktop app ID | `com.floor48.game` | `com.larper48.game`; used for AppUserModelId and explicit macOS bundle ID |
| Desktop title, error title, entry path | Floor 48 / floor48.html | Larper 48 / larper48.html in electron/main.cjs |
| Instructions / launchers / server banner | Floor48 / floor48 / Floor 48 | README.md, play-app.bat, play.bat, play.sh, serve.mjs |
| Diagnostics and log filters | `[floor48]` | `[larper48]` in main.js, materials.js, shot.mjs, multishot.mjs, perf.mjs |
| Environment options | `F48_*` | Canonical `L48_*`, with legacy fallback in electron/identity.cjs |

`npm run app` and `app:dev` rebuild before launch so source edits cannot leave a stale bundle.
Packaging prints the selected target platform's executable rather than the host platform's path.
Source and generated distributions are updated together; no hand-edited minified output.

## Compatibility identifiers deliberately retained

| Identifier | Why it remains |
| --- | --- |
| `floor48.save.v1` | Existing player progress; the schema and reader/writer remain compatible. Centralized in src/systems/storage.js. |
| `floor48.settings` | Existing graphics, input and audio preferences. |
| `floor48.continue` | Session-only quality-change restart flag. Both producer and consumer use the same constant. |
| `Floor 48` Chromium profile directory | electron/identity.cjs sets both userData and sessionData under appData before ready/session access or the single-instance lock. No copy/delete/merge of a live Chromium database. |
| `dist/floor48.html` | Byte-identical new game at the old file URL. A redirect would risk losing access to file-scoped browser storage. Retain the original absolute path and browser profile to read the old save. |
| `F48_*` | Existing launch and benchmark scripts; `L48_*` takes precedence, including an explicitly empty value. |
| Floor 48 location text, floor indicators, APT_FLOOR | The apartment is still on the 48th floor. HUD labels, the elevator destination and architectural comments are world content, not the game brand. |

Electron's [documented profile and session paths](https://www.electronjs.org/docs/latest/api/app)
depend on app identity by default. Merely keeping localStorage key strings would not be sufficient.
The new app ID may require users to repin an old Windows taskbar shortcut. No installer/update
channel exists in this repository, and no installer migration is claimed.

Browser migration is explicit: open the regenerated compatibility file at its old location,
export from Settings, then import into the new file/browser. Import validates the envelope before
writing, keeps the previous raw values at `larper48.beforeImport.v1`, and rolls back a partial write
on storage failure. The source data is never removed. For recovery, the value at that key is itself
an importable backup JSON. A browser that cannot access storage cannot save or migrate it.

## Elevator, collision and rendering fixes

- The renderer-independent elevator state machine waits for fully closed doors on both rides
  and remote calls. It rejects out-of-cab rides, invalid floors, repeated requests and occupied
  remote departures. Player controls unlock only when the arrival doors are sufficiently open.
- Elevator motion precedes the player/camera update. Locked players no longer get pulled toward
  a static landing by ground-height smoothing. Cab position, player height and camera stay aligned.
- Saves made during travel record a safe landing position; loading older saves inside a cab
  restores the cab to the same floor. Resetting a trip releases only the elevator's own lock.
  Passing out is deferred until the trip finishes. Pause freezes the elevator.
- Cab geometry and sliding doors are excluded from the baked static occluders, preventing
  phantom cab/closed-door shadows after those objects move.
- The lobby rear mass is split around the elevator shaft; it no longer overlaps the ground-floor cab and ejects arriving riders.
- Movement collision uses short substeps to prevent sprint tunnelling through thin walls.
  Repeated keyboard events no longer toggle crouch/use multiple times. Drag-look Escape no
  longer calls a nonexistent UI method or immediately reopens a closed menu.
- Cube-probe cameras are initialized with r170's coordinate system (previously all six faced
  the same way). Mipmaps generate after the sixth face, and the PMREM target is reused.
- The glass pass reuses the opaque shadow map instead of regenerating it for the glass-only
  layer. Mirror/planar passes restore state in finally blocks and update inverse clipping matrices.
- Unchanged resolution settings no longer dispose/reallocate render targets. Exposure history
  survives actual resolution changes, preventing adaptation flashes. Mirror MSAA respects the
  selected sample count.
- Default visuals use gentler saturation, vignette, contrast and grain; chromatic aberration is
  off. Depth of field is opt-in in Settings so normal play stays sharp and skips the blur pass.
  Existing lighting, contact shadows, materials, mirrors and quality presets remain available.
- Changing quality from the title no longer overwrites an existing saved game with the demo state.

These are targeted corrections to the procedural renderer. They do not turn code-generated
geometry into scanned photorealistic assets or establish that every possible 3D glitch is fixed.

## Tests and release checks

| Test | Coverage / update |
| --- | --- |
| tests/regression.test.mjs (`npm test`) | Stable legacy keys, backup transfer/rollback, profile pinning, option aliases, title restart data protection, elevator guards and both directions, remote call closure, mid-trip save normalization, camera height, thin-wall collision, six distinct cube faces/mipmap cadence, render-target/exposure reuse, output branding and identical compatibility bundle |
| tools/regression.mjs (`npm run test:browser`) | Standalone branding, rendered apartment/mirror/wet street/night scenes, camera-to-cab error throughout a round trip, closed-door movement, October-format save/settings load, ground-floor cab restoration, drag-look pause, zero page/shader errors |
| tools/disttest.mjs | Canonical Larper 48 filename/title and nonzero failure on errors; creates its screenshot folder |
| tools/playtest.mjs | Waits for doors before boarding and now exits nonzero on failures instead of logging a false pass |
| tools/savetest.mjs | Existing round trip now also fails on console errors |
| tools/shot.mjs, multishot.mjs, perf.mjs | New diagnostic prefix retained in capture filters |
| tools/browser.mjs | Explicit browser path and platform-appropriate hardware launcher; preserves SOFT=1 |

Before a desktop release, validate a copied real profile in the packaged Windows app, including
Continue, volume/sensitivity, quality restart, both elevator directions, old taskbar shortcuts,
and the renamed binary. Check Linux/macOS bundles on their target OS. Measure frame times on
the target GPU at fixed preset/resolution/camera/time/weather; this patch does not claim a
measured hardware FPS gain. Check all four quality presets and long play sessions.

### Results from this patch

- `npm run build`: passed; both HTML outputs match and contain Larper 48 branding.
- `npm test`: 12/12 passed.
- `npm run test:browser`: passed, including the round trip with camera/cab height error below
  `1e-6` metres, the October-format save/settings fixture, and all four rendered scenes.
- `npm run test:save`: passed; cash, holdings, hunger, pantry and position survived reload.
- `npm run test:play`: passed, including lobby entrance/exit and side-wall collision, elevator,
  market trade, burger order, groceries, cooking, sleep and title screen; no console problems.
- `tools/disttest.mjs`: standalone boot and render passed with no console errors.
- `L48_PLATFORM=win32 L48_ARCH=x64 npm run package`: passed. ASAR inspection confirmed
  `larper-48`, `Larper 48`, both HTML files and identity.cjs, with sources/tests excluded.
- Browser checks used Chromium 134 / SwiftShader on Linux, via `SOFT=1` and `BROWSER_PATH`.
  Screenshots were inspected for the apartment, cab mirror and wet street. These are functional
  and visual checks, not representative frame-rate measurements on a discrete GPU.
- `git diff --cached --check`: passed. Generated bundles are marked as generated in
  .gitattributes; upstream vendor shader whitespace is excluded from trailing-space checks.

The packaged `.exe` was built and inspected, not launched on Windows. Native Windows profile
and shortcut validation, Linux/macOS packaging, all-preset GPU testing and a long play session
remain release checks.
