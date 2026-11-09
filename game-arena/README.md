# Game Arena

A multi-game arena for Nigeria (18+). Football comes first: real people train a Virtual-Pro-style player in a position, get signed to clubs, and play 5-a-side friendlies, a league and a Champions League while spectators watch in 3D and bet in-app points. Car racing comes later.

This repo holds the **football training ground** prototype: a browser game built on three.js.

## What's in it

- **Match play**: 3 v 2 attacks with AI teammates. Call for the ball to your feet or into space, follow the positioning marker, beat the offside line, play one-twos and finish.
- **Finishing**, **Goalkeeping**, **Defending** and **Passing** drills, each with technique feedback.
- **Beginner** and **Pro** modes (Beginner earns 70% of rewards).
- **Three control schemes**: FIFA layout (arrows + A/S/D/W), Mouse aim (WASD + mouse), Player cam (WASD + J/K/L). Gamepad and touch also work.
- Shot aim reticle on the goal, a deformable net, ball physics with spin, posts and netting, and a keeper that reads shots.
- Profile, ratings, points wallet, starting grant, a Grants Officer agent and an admin panel (exchange rate and grant amounts are editable). Points only for now: buying points and real money are "coming soon".
- Progress is saved in the browser (`localStorage` key `gameArena.training.v1`).

## Run it

The game loads model and animation files with `fetch`, so it must be served over HTTP (opening `index.html` straight from disk will not load the players).

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static host works: GitHub Pages, Netlify, Vercel, Cloudflare Pages.

### GitHub Pages

The included workflow (`.github/workflows/pages.yml`) builds and publishes the game on every push to `main`. In the repo go to **Settings → Pages → Source: GitHub Actions**.

## Project layout

```
index.html            built, playable game (generated, but committed so Pages works)
src/
  template.html       page shell: HTML, CSS, HUD, menus
  players.js          player models: loading, kit painting, poses, animation blending
  game.js             everything else: pitch, ball physics, net, keeper, drills, controls, UI, storage
assets/               player models (.gltf.json), textures, animation clips (anims.json)
lib/                  three.js r128 GLTFLoader and SkeletonUtils (three.js itself loads from cdnjs)
tools/
  build.py            builds index.html from src/
  legacy/             early character viewer experiments (not used by the game)
docs/ROADMAP.md       what's next
```

## Develop

1. Edit files in `src/`.
2. Run `python3 tools/build.py` to regenerate `index.html`.
3. Serve and reload.

Notes for developers:

- **three.js r128** is used on purpose (the UMD build plus the `examples/js` loaders). Moving to a newer version means switching to ES modules and checking skinned material and quaternion API changes.
- Models are stored as `.gltf.json` with the binary buffer as base64 in a custom `b64` field. `players.js` rebuilds a GLB in memory and calls `GLTFLoader.parse`. This was done because the original host blocked `.glb` and `data:` URIs; on normal hosting you can switch back to plain `.glb` files.
- `window.GameArena` exposes debug hooks (`startDrill`, `sim`, `step`, `drill`, `ball`, `user`, `keeper`, …) used for automated bot testing with Playwright.
- Pitch constants live at the top of `game.js`: `HL` (half length 20 m), `HW` (half width 12 m), goal `GW` 5 m × `GH` 2 m.

## Credits and licences

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Player models and motion capture: Microsoft Rocketbox (MIT). Engine: three.js (MIT).
