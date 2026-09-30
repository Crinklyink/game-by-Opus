# FLOOR 48

*A quiet life above the city.* A detailed first-person 3D life sim: you're a day trader living on the 48th floor of Meridian Tower.
Watch the skyline and the weather from a floor-to-ceiling window wall, ride the elevator down, grab a burger,
buy groceries, cook at home, and (as a small side hobby) trade a few fictional stocks from your desk.

Everything you see and hear is generated in code - no textures, models or audio files - rendered with custom
WebGL2 shaders (three.js).

## Play (easiest)

**Double-click `dist/floor48.html`** (Chrome or Edge recommended). That's it - it's one self-contained file.

Or run it from source:

```
node serve.mjs          # then open http://localhost:8080
```
(Windows: double-click `play.bat`.  macOS/Linux: `./play.sh`.)

## Using your GPU

The game requests the *high-performance* GPU from the browser and picks a graphics preset from your actual GPU
(Low / Medium / High / Ultra). You can change it in **Esc -> Settings**. A dynamic-resolution scaler keeps ~60 fps.

If you have a laptop with two GPUs and it looks slow: make sure the browser is set to use the **discrete GPU**
(Windows: Settings -> System -> Display -> Graphics -> add Chrome/Edge -> *High performance*), and that
*hardware acceleration* is on (`chrome://settings/system`). Press **F3** in game to see the detected GPU, fps, and render scale.

## Controls

| Key | Action |
|---|---|
| `W A S D` | move |
| Mouse | look (click the game to capture the mouse) |
| `E` | interact / use / sit / stand |
| `Shift` / `C` | sprint / crouch |
| `Esc` | pause, settings, save |
| `M` | mute |
| `F3` | performance overlay |
| `F9` | photo mode (hide HUD) |
| `Tab` | show/hide goals |

## What to do

* Look out the window. Close the curtains, open the balcony door, put on the radio (lo-fi), turn lights on and off.
* Sit at your desk and open the **trading terminal** (8 fictional stocks, news, portfolio, and a home shop for upgrades).
* Ride the elevator down, cross the street with the signals, order at **Big Stack Burgers**, shop at **FreshMart**
  (pay at the register), carry the bags home, stock the fridge and **cook**.
* Sleep to skip to the morning (the market keeps moving while you rest). Weather changes through the days - rain, storms with lightning.
* Settings has a time-of-day slider and weather override if you just want to enjoy the views.

## Building the single file

```
npm install      # once (esbuild + three)
npm run build    # writes dist/floor48.html
```

`vendor/three` holds a pinned copy of three.js r170 so the game works offline.
`tools/` has the headless screenshot harness and a scripted playtest used during development.
