# Fossil Fixers: design notes

## 1. What the other games already use

I cloned every repo on **GorzaWebK** and **GorzaWebA** (the ten you listed, plus Needle Drop, Paper Tides, Felt Links, Stuntrun and the Brain Break Lab site) and read their CSS, HTML and READMEs. The table lists what Fossil Fixers has to stay away from.

| Game | Genre | Art style | Palette (main colours) | Fonts | Menu / HUD layout | Controls |
| --- | --- | --- | --- | --- | --- | --- |
| **Skyhook** | First-person grappling platformer (3D) | Bright sky-city 3D, sunset gradients | Night navy `#0f1a2b`, orange `#ff8a3d`, cyan `#5ff0ff`, gold | Segoe UI / system-ui, monospace numbers | Centred title + stacked `.btn` column; HUD overlays the full screen, timer top-centre | Mouse look, click hook, WASD, Space, R, C |
| **Foundry Arena** | Arena FPS vs bots / online (3D) | Industrial steel yards, hazard stripes | Steel `#0c0f12`, safety orange `#ff6b1a`, hazard yellow `#f2b417` | Barlow, Barlow Condensed, Saira Stencil One, mono | Dark steel panels, top bar, corner HUD with health bar | WASD, mouse, Shift, C, Space |
| **Redline** | Circuit racing with ghosts (3D) | Motorsport, night city | Near-black `#0d0f14`, racing red `#e8322a`, gold/silver/bronze | Barlow Condensed, Segoe UI | Left-aligned menu over a dark gradient; speedo/lap HUD in the corners | W/S/A/D or arrows, Space handbrake, C, R, V |
| **Orb Dash** | Endless lane runner (3D) | Neon synthwave track in a void | Black-violet `#05010f`, neon pink `#ff2bd6`, cyan `#2ef9ff` | Orbitron | Top HUD strip (score, gems, speed), centred home card | A/D or arrows, Space, swipe |
| **Hop Across** | Endless road/river hopper | Voxel 3D | Sky blue `#7fd0f5`, yellow `#ffcf3f`, white, ink `#1d2433` | Arial Rounded / Trebuchet | 3-column top HUD grid, rounded buttons | Arrows/WASD, tap, swipe |
| **Leadlight** | Pinball roguelite | Stained-glass rose window, carved stone | Indigo stone `#211c38`, gilt `#d9b56a`, jewel glass colours | Cormorant Garamond, Spectral | Pointed Gothic-arch panels, stone-tablet buttons, gilt score plaque | Flipper keys, gamepad, touch |
| **Blueprint Heist** | Real-time stealth | Cyanotype blueprint, drafting table | Prussian blue `#0d3866`, line white `#eaf3ff`, highlighter amber `#ffb21e`, stamp red | Architects Daughter, IBM Plex Sans Condensed | Tracing-paper sheets pinned with drafting tape, lettering-box buttons, title-block HUD | Click/tap to move, keys for tools |
| **Idle Island** | Idle base defence (3D) | Low-poly island, longboats | Pale grey-green `#e2e7e6`, sea `#1a4150`, coin gold `#e3b04b`, ochre | Grenze, Barlow | Light card panels, top banner, build tray | Click/tap, drag to orbit, WASD pan |
| **Borderfall** | Real-time world-conquest strategy | Antique map, parchment over dark umber | Umber `#241e19`, parchment `#efe5cf`, brass `#c9a24f`, vermilion `#d65a3c`, verdigris | Alegreya SC, Alegreya Sans, Roboto | Top resource bar + left side panel over a world map | Click, right-click, drag/zoom, number keys, T/P/G |
| **Gravity.io** | .io absorb-and-grow | Deep-space bodies, glow | Space ink `#090b18`, plate navy, ember `#ff7849`, bone `#f1ead9` | Manrope | Full-screen HUD with mass bar + leaderboard | Mouse/touch steer, Esc, M, N, F |
| *Needle Drop* | Rhythm on a spinning record | Risograph poster, halftones | Fluoro pink `#ff48b0`, navy `#1c2373`, lemon `#ffe800` | Bungee, Rubik | Record-crate menus, price-sticker buttons | Keys, gamepad, touch |
| *Paper Tides* | Hex tile-placing village builder | Ink + watercolour on cream paper | Cream `#f4ecd8`, ink `#2b2a33`, sea `#7fa7b5`, meadow, terracotta `#c46a4a` | Fraunces, Caveat | **Field-journal pages**, torn paper cards, **ink-stamp buttons**, compass; logbook strip on the **left** | Click/tap, rotate key |
| *Felt Links* | Side-on crazy golf | Felt and fabric quilt | Oatmeal `#e9dcc3`, mustard, **rust `#b65a3b`**, **sage `#93a67f`**, denim | Fredoka, Gochi Hand | Fabric patches, stitched panels | Drag to aim, keys, gamepad |
| *Stuntrun* | Stunt racing + track editor (3D) | Low-poly desert stunt show | Aubergine `#2a1f33`, marquee yellow `#ffc42e`, red, teal | Alfa Slab One, Barlow Condensed | Marquee sign menus, icon buttons | Keys, touch |
| *Brain Break Lab* (site) | Hub site | Clean, calm cards | Cream `#fbf7f0`, violet `#5b3df5`, ink `#1b1640` | system-ui / ui-rounded | Card grid, iframe player | n/a |

**Account codes.** Foundry Arena's `src/account.js` is the fully client-side one: a player ID like `FA-XXXX-XXXX` (alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, no 0/O/1/I), and an account code `FA1.<payload>.<checksum>`. The payload is `z` + base64url(deflate-raw(JSON)), or `j` + base64url(JSON) when the browser can't compress, and the checksum is an 8-hex FNV-1a of the payload. It has Copy, Download backup file (`.txt`), Paste and Import from file. Importing replaces this browser's saved keys and reloads. Skyhook and Redline use the same 16-character alphabet but store saves online (Firebase), which doesn't fit a static, no-server school game. **Fossil Fixers copies the Foundry Arena format as-is**, with `FF1.` and `FF-XXXX-XXXX` (see `js/account.js`).

## 2. Close calls I changed

| Planned at first | Too close to | Changed to |
| --- | --- | --- |
| Cream journal pages with ink-stamp buttons | **Paper Tides** (field-journal pages, ink-stamp buttons, Caveat handwriting) | Brown **kraft** card and **graph paper**, not cream watercolour paper. Buttons are **manila specimen tags** with a punched eyelet and string, or strips of **masking tape**. Stamps are only used as rewards (the "CATALOGUED" stamp), never as buttons. The menu is the journal's **closed cover** (navy cloth, brass corners, elastic strap), not an open page, and there's no compass. |
| Logbook HUD strip down the left | **Paper Tides** (left logbook strip) | A **clipboard on the right** in landscape. On phones it becomes a short clip bar above the tool roll. |
| Rust `#b65a3b` + sage + oatmeal | **Felt Links** (same three colours) | A more orange, more saturated rust `#c25a1c`, a darker yellow **olive** `#77783f` (not a blue-grey sage), and a deeper **kraft** `#c9a46c` in place of pale oatmeal. Navy ink `#1d2b4a` leads; Felt Links has no navy. |
| Graph-paper grid as a main surface | **Blueprint Heist** (blueprint grid, white lines on blue) | The grid is faint **navy lines on kraft/bone** paper, only as texture, and never a blue background. No title block, no drafting tape (we use torn masking tape and paperclips). |
| Parchment + brass + vermilion map | **Borderfall** (antique parchment world map over dark umber) | The expedition map is a **sketched kraft map with pinned paper notes and string**, in olive/rust/navy, with no dark UI frame, no brass and no Alegreya. |
| "Bone" off-white token | **Gravity.io / Stuntrun** both have a `--bone` token | Ours is a warmer `#f2e8cf`, used only for fossils and card stock, never as a text colour on dark space. |
| Handwriting font (Caveat / Architects Daughter / Gochi Hand) | Paper Tides, Blueprint Heist, Felt Links | **Kalam**, which none of the games use. |
| Monospace body (system mono) | Skyhook and Brain Break Lab numbers | **Courier Prime**, a proper typewriter face, self-hosted. |

## 3. Fossil Fixers' own identity

- **Genre:** dig-and-rebuild puzzle (none of the others are puzzle-excavation games).
- **Look:** a palaeontologist's field journal. Kraft card, graph paper, coffee rings, torn masking tape, paperclips, string, rubber-stamped labels and navy ink sketches, all drawn in code (CSS gradients, inline SVG and canvas). There are no image files at all.
- **Palette:**

  | Token | Hex | Use |
  | --- | --- | --- |
  | `--kraft` | `#c9a46c` | Sandstone/kraft surfaces |
  | `--kraft-deep` | `#a9834d` | Shadows, card edges |
  | `--rust` | `#c25a1c` | Primary tags, energy |
  | `--olive` | `#77783f` | Secondary, map land |
  | `--navy` | `#1d2b4a` | Ink, text, cloth cover |
  | `--bone` | `#f2e8cf` | Fossils, card stock |

- **Type:** Kalam 700 (handwritten headings) + Courier Prime 400/700 (typewriter body). Both are OFL and self-hosted from `fonts/` (Latin subset only, about 90 KB in total), so nothing loads from a font CDN. That also suits school networks that block Google.
- **Menu:** a closed journal cover. **Map:** a hand-drawn expedition map with pinned notes. **Tools:** a worn leather tool roll with stitched pockets. **HUD:** a clipboard. **Buttons:** manila tags and masking-tape labels.
- **Juice:** dust puffs, falling rock chunks, a glassy "clink" and sparkle when a bone comes free, and a camera-flash + "CATALOGUED" rubber stamp when a skeleton is finished. Reduced motion turns off the shake and flash and cuts the particles.

## 4. Plan

1. **Prototype:** one Desert dig, rebuild and museum. Data in JSON, pure logic modules (`dig.js`, `rebuild.js`) that Node can test, and canvas views.
2. **Accounts and settings:** the `FF1.` account code (copy/download/paste/file), nickname with the "Don't use your real name." warning, volume, colourblind markers, reduced motion and text size.
3. **Content:** 5 regions × 4 digs, 15 creatures, region rocks and gadgets, fact cards.
4. **Museum upgrades, Daily Dig, Web Audio music and SFX.**
5. **Tests:** a perfect-knowledge solver proves every site (and 365 days of Daily Digs) can be fully dug pristine within its energy. Every skeleton snaps together. Account codes round-trip. Playwright checks for console errors on phone and desktop.
6. **GitHub Pages workflow, README.**

## 5. Game rules (as built)

- **Grid:** side-on rock, top row at the surface. You can only work a cell that touches open air (you dig down from the top). Bedrock can't be broken.
- **Tools** (`data/tools.json`). Damage is taken off a cell's hardness.
  - Brush: 2 energy, 1 damage, never cracks anything.
  - Chisel: 3 energy, 3 damage. It cracks a bone if it **overshoots**, that is, if it hits a bone cell with less than 3 rock left.
  - Pickaxe: 5 energy, 6 damage plus 3 to each side. It cracks **any bone in the 3×3 around the hit**.
  - The brush is the safest but costs the most per point of rock, and the pickaxe is the opposite, so working out where the bones are pays off.
- **Clues:**
  - Bone cells show **bumps** (raised nodules, pale flecks) when they're within two cells of open air.
  - Hard **concretions** look like bumps but aren't bones.
  - **Tap** (1 energy) tells you *hollow* (bone here), *echo* (bone next door) or *solid*.
  - The **scanner** has limited charges and pencils in the bone cells within 2 cells.
  - Colourblind mode swaps the tints for shapes.
- **Energy** for each site is set from the solver's cost × the site's `slack` (1.25 to 1.7), plus a small tap allowance. That way a dig can always be finished pristine, but brushing everything won't get you there.
- **Quality:** pristine 100, cracked 60.
  - Stars for a mounted skeleton: ★ for at least half its bones placed, ★ for all of them, ★ for all of them pristine.
  - Stars unlock regions (0 / 4 / 10 / 16 / 22) and museum cosmetics.
- **Replays** use a new seed. Pristine finds replace cracked ones. The fourth site in each region is a **bonebed** that favours the bones you're missing.
- **Daily Dig:** seeded from the UTC date (`FF-daily-YYYY-MM-DD`), so everyone gets the same site. The "Curator's mark" to beat is 80% of the solver's perfect score. Your best and your daily streak are saved.
