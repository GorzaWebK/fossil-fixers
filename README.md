# Fossil Fixers

**Dig up fossil bones, rebuild the skeletons and fill your own museum.**

You're a young palaeontologist with a field journal, a leather tool roll and an empty museum hall. Read the rock, dig carefully, piece the skeletons back together and bring in the visitors.

- A dig-and-rebuild puzzle game: 5 regions, 20 dig sites and 15 made-up creatures, each inspired by a real prehistoric animal (with real, checked fun facts). There's also a new **Daily Dig** every day.
- A static site with plain HTML, CSS and JavaScript modules. No build step, no frameworks and no image or audio files. Everything is drawn and synthesised in code.
- About 360 KB in total, including both fonts. It makes no requests to any other website.
- Works on Chromebooks, Windows, Mac, iPad and phones, with mouse, touch and keyboard.
- School-safe: no chat, no adverts, no outside links except back to Brain Break Lab, and no personal data. Saves stay in the browser.

## How to play

1. **Open the map** and pick a pinned note. The first Desert dig is open from the start.
2. **Dig.** The site is a side-on slice of rock. You dig down from the surface, and you can only work on rock that touches an open space (it has a light edge). Uncover every square of a bone to lift it out with a *clink*. Energy is limited, so plan!
3. **Read the clues** so you know where to dig:
   - **Bumps and pale flecks** appear on rock that hides a bone once you dig within two squares of it. Hard lumps called concretions look bumpy too.
   - The **tap hammer** gives one of three answers: *hollow* means a bone is in that square, an *echo* means a bone is next door, and *solid* means nothing.
   - The **scanner** pencils in every bone within two squares. It only has a few charges.
4. **Choose the right tool.** The brush is safe but slow. The chisel cracks a bone if it hits one with less than 3 rock left on it. The pickaxe is fast, but it cracks any bone right next to where it hits. Cracked bones still count, but they score less.
5. **Rebuild.** Drag the bones onto the faint outline and turn them to fit. They snap into place.
6. **Display.** Finished skeletons go into the museum.
   - Each skeleton earns up to three stars: ★ for half the skeleton, ★ for all of it, and ★ if every bone is pristine.
   - Stars are your visitors. They open new regions (at 4, 10, 16 and 22 stars) and museum decorations (lighting, plaques, banners and floors).
7. Missed or cracked a bone? **Dig again**, because every replay has a fresh layout. The fourth site in each region is a **bonebed** that mixes bones from the whole region and favours the ones you still need.

Each region has its own rocks and a new tool:

| Region | Rocks | New tool | Creatures (inspired by) |
| --- | --- | --- | --- |
| Desert Badlands | sand, sandstone, ironstone | Trowel | Dunehorn (Triceratops), Rattle Runner (Velociraptor), Sunplate (Stegosaurus) |
| Sea Cliffs | shingle, chalk, flint, blue clay | Spray bottle | Gullwing (Pteranodon), Cliff Paddler (Plesiosaurus), Saucer-Eye (an ichthyosaur) |
| Jungle Riverbed | mud, silt, gravel, root tangles | Probe rod | Snapsnout (Spinosaurus), Treetop Titan (Brachiosaurus), Trumpet Crest (Parasaurolophus) |
| Frozen Tundra | snow, permafrost, old ice, frozen gravel | Heat lamp | Snowcrest (Cryolophosaurus), Lantern-Look (Leaellynasaura), Lumpnose (Pachyrhinosaurus) |
| Volcano Ridge | ash, tuff, pumice, basalt | Air blower | Cinder King (Tyrannosaurus), Ashdome (Pachycephalosaurus), Emberclub (Ankylosaurus) |

**Daily Dig:** everyone gets the same site each day (it changes at midnight UTC). Beat the *Curator's mark* and keep your daily streak going. Daily finds are for score only and don't go into the museum.

## Controls

| | Mouse / touch | Keyboard |
| --- | --- | --- |
| Pick a tool | Tap a pocket in the tool roll | `1`–`0`, or letters `B` brush, `C` chisel, `P` pickaxe, `T` tap, `S` scanner, `W` trowel, `Y` spray, `R` probe, `H` lamp, `A` blower |
| Use the tool | Click / tap a square | Arrow keys move the cursor, `Space` or `Enter` uses the tool |
| Rebuild: move a bone | Drag it | `Tab` picks a bone, arrow keys move it, `Enter` drops it |
| Rebuild: turn a bone | **Turn** button, the round handle, double-tap, right-click or the mouse wheel | `R` / `E` clockwise, `Q` the other way |
| Rebuild: hint | **Hint** button | `H` |
| Museum: walk along | Drag, swipe, mouse wheel or the arrows | `←` `→` |
| Back / pack up | Buttons on screen | `Esc` |

## Settings

Music volume, sound effects volume, **colourblind-friendly clue markers** (shapes and letters on bumps and tap marks, so you never have to rely on colour), **reduced motion** (no shake or camera flash, fewer particles; it follows the device's reduced-motion setting on first visit) and **text size** (three sizes).

## Accounts (account codes)

This uses the same account-code system as Foundry Arena, so it works the same way across your games:

- Each browser gets an explorer ID like `FF-7KQ2-M9XD`. There's no sign-up and no email.
- **Account code** → *Copy account code* or *Download backup file* gives a code like `FF1.z…….1a2b3c4d`. It holds the museum, every bone, stars, unlocks, decorations, Daily Dig scores, the nickname and the settings. It's compressed JSON with a checksum, so a half-copied code is caught.
- Paste the code (or load the file) in any browser to carry on there. The code is the whole save: there's no server.
- The nickname box on the cover says **"Don't use your real name."** Nicknames are limited to letters, numbers, spaces and `_ . ' -`, up to 16 characters, and are never sent anywhere.

The code is in `js/account.js`. To save something new, add its `localStorage` key to `DATA_KEYS` there.

## Running it locally

Any static web server will do. Opening `index.html` straight from the disk won't work, because browsers block loading the JSON files that way. Either of these works:

```bash
npm start
```

```bash
python3 -m http.server 8080
```

`npm start` runs `node tools/serve.mjs` and needs no installs. With either one, open <http://localhost:8080/>.

## Tests

```bash
npm test
```

These are logic tests in plain Node with no installs. They prove that:

- Every dig site (and 6 replays of each) and a whole year of Daily Digs can be dug out completely, without cracking a bone, within its own energy.
- Every skeleton can be assembled.
- Account codes round-trip, and broken codes are refused.
- The JSON data hangs together.

A **clue-reading bot** (`tools/cluebot.mjs`) that uses only what a player can see also has to find at least 90% of bones and crack none. That's the check that reading the clues matters more than luck. Run `npm run balance` to see its table.

```bash
npm run e2e
```

This browser test needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`). It plays the whole game in headless Chromium:

- every dig in all five regions, with every skeleton rebuilt, one of them by real mouse dragging;
- the museum, decorations, the Daily Dig and settings;
- an account code downloaded, the browser wiped and the code loaded again;
- iPhone, iPad and Pixel layouts.

It fails on any console error or any request to another website.

## Deploying to GitHub Pages

The game is live at **https://gorzawebk.github.io/fossil-fixers/**.

`.github/workflows/deploy.yml` runs on every push to `main`. It runs the logic tests, then copies the static files (`index.html`, `css/`, `js/`, `data/`, `fonts/`) to the **`gh-pages`** branch, which GitHub Pages serves. Updates appear a minute or two after the push. The browser test runs alongside it as a separate check, so a slow CI browser can't hold up a release.

Pages settings (already set up): **Settings → Pages → Source: Deploy from a branch → `gh-pages` / root**.

**Brain Break Lab:** the game works inside an iframe. The *Back to Brain Break Lab* links use `target="_top"` so they leave the frame. There's an empty `<div class="ad-safe">` on the cover and the map: it's space kept free and holds no ad code. Add `debug-ads` to `<body>` to see it outlined.

## Adding a new dig site

Sites live in `data/regions.json`, inside each region's `sites` list:

```json
{ "id": "desert-5", "name": "Fossil Flats", "creature": "rattlerunner",
  "cols": 14, "rows": 11, "slack": 1.6, "concretions": 3, "scanner": 2,
  "map": { "x": 30, "y": 70 },
  "note": "Another raptor was spotted out on the flats." }
```

| Field | What it means |
| --- | --- |
| `creature` | A creature id, or `"bonebed"` for a mixed site. Add `"bonesPerCreature": 4` to a bonebed. |
| `cols` / `rows` | Grid size. Keep it about 12–16 × 10–12 so it fits on phones. |
| `slack` | Spare energy. The game works out the cheapest perfect dig and multiplies it by this: 1.8 is relaxed and 1.4 is tight. |
| `concretions` | How many fake bumpy lumps to hide. |
| `scanner` | Scanner charges. |
| `map` | Where the pinned note goes on the map, 0–100 across and down. |

Sites in a region open one after another, and a bonebed opens after the region's other sites. Then run `npm test`: it checks that the new site can always be finished. The data test expects 4 digs per region, so change that number in `tests/data.test.mjs` if you add more.

**A new region** needs:

- `layers`: rock bands from the surface down, each with a `weight` for how thick it is.
- `bedrock`: an unbreakable rock (`"hp": null`).
- optional `inclusions`, for example `{ "rock": "flint", "in": "chalk", "chance": 0.08 }`.
- a `gadget` tool id, a `stars` value that unlocks it, `creatures`, a map position and `sites`.

**New rocks** go in `data/rocks.json`:

- `hp` is how many hits of damage it takes.
- `pattern` is one of `dots lines waves hatch cross bubbles flecks blocks`.
- `tags` let tools target it: `soft`, `ice`, `ash` and `loose` are used by the trowel, spray, lamp and blower.

**New tools** go in `data/tools.json`:

| Field | Values |
| --- | --- |
| `kind` | `dig`, `tap`, `scan` or `probe` |
| `pattern` | `single`, `plus`, `row3` or `square3` |
| `damage` / `sideDamage` | how much the centre square and the other squares lose |
| `affects` | rock tags it works on |
| `cracks` | `none`, `overshoot` or `area` |

Give it an icon by adding `<symbol id="i-yourtool">` to the SVG block at the top of `index.html`.

## Adding a new creature

Creatures live in `data/creatures.json`. Each one has an `id`, a `name`, a `region` (it must also be listed in that region's `creatures`), `inspired` (the real animal) and a fact `card` with `period`, `place`, `size`, `diet`, `fact` and an optional `fact2`. Please keep the facts real and checked: these get read in classrooms.

The skeleton is a list of `bones`. Each bone is drawn in code from a **type**, so there's no art to make:

```json
{ "id": "skull", "name": "Skull", "type": "skull", "x": 163, "y": 27, "len": 30, "w": 17, "rot": 4,
  "p": { "snout": 0.5, "teeth": true, "crest": "fan", "eye": 0.13 } }
```

- `x`, `y`: the centre of the bone in a **200 × 120** frame. The creature faces right and the ground is at `y = 112`.
- `len`, `w`: length and width. The length also sets how many grid squares the bone takes up when buried (up to 18 is 1 square, up to 32 is 2, longer is 3).
- `rot`: the angle in degrees.
- `type` is one of the following, with these options in `p`:

  | Type | Options |
  | --- | --- |
  | `skull` | `snout` 0–1, `teeth`, `beak`, `eye`, `window: false`, `crest`: `tube` `dome` `fan` `blade` `frill` `horns` `boss` `spikes` |
  | `jaw` | `teeth` |
  | `neck` | `bend` |
  | `spine` | `sail` 0–1 |
  | `ribs` | `n` |
  | `tail` | `thin`, `droop` |
  | `foot` | `toes` |
  | `hand` | `fingers` |
  | `spikes` | `n` |
  | `hip`, `shoulder`, `limb`, `plate`, `club`, `flipper`, `wing` | none |

Keep it to 6–16 bones.

To see your creature, run the game locally and open **`/tools/skeletons.html`**, which draws every skeleton (tick *show bone ids*). Then add a site for it and run `npm test`: the tests check the skeleton can be assembled and the site can be dug.

## Project layout

```
index.html          all screens + SVG tool icons
css/style.css       the journal look (kraft, graph paper, tags, tape, clipboard, tool roll)
fonts/              Kalam + Courier Prime (OFL), self-hosted, Latin only
data/*.json         rocks, tools, regions + sites, creatures + facts, museum upgrades
js/main.js          start-up and screen glue
js/dig.js           dig rules (pure logic)       js/digview.js      dig screen
js/solver.js        perfect digger (sets energy, Daily par, tests)
js/sites.js         builds sites and Daily Digs from the data
js/rebuild.js       snap logic (pure)            js/rebuildview.js  workbench screen
js/museum.js        museum hall                  js/map.js          expedition map (SVG)
js/bones.js         draws bones from their type  js/art.js          rock textures, clue marks
js/save.js          save data, stars, unlocks    js/account.js      account codes
js/audio.js         Web Audio sound effects + generated music
js/fx.js            dust, chunks, sparkles       js/rng.js          seeded randomness
tools/              local server, clue-reading bot, skeleton preview
tests/              Node tests + Playwright browser test
DESIGN_NOTES.md     how this differs from the other Gorza games
```

## Credits

The game, art and sound were all made in code for this project. The fonts are [Kalam](https://fonts.google.com/specimen/Kalam) (Indian Type Foundry) and [Courier Prime](https://fonts.google.com/specimen/Courier+Prime) (Alan Dague-Greene), both under the SIL Open Font License (see `fonts/`).
