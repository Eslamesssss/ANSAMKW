# STEP — Make Brands Move · beat map

10.00 s · 120 BPM · 20 beats (5 bars of 4/4) · 1920×1080 · 60 fps · one continuous camera, no cuts.
Beat `u` = 0.5 s. Frame = `u × 30`. The film is periodic: frame 600 is frame 0.

## World (one 2-D canvas, world px)

| Component | Position | Notes |
|---|---|---|
| BRAND MODE toggle | card x −270…90, y −56…56; track centre (0,0) | Knob = the ball (r 14) |
| MOMENTUM slider | card x 560…1240, y −40…150; track y 95, 0 % at x 640 → 100 % at x 1160 | Fill and % come from the ball's x |
| Notification stair | 440×104 cards stepping +140 x / +130 y from (1180, 230) | STRATEGY · CREATIVE · PERFORMANCE |
| Message card | x 1300…2020, y 650…900 | "WHAT'S NEXT?" + Reply pill → input field |
| Keyboard | x 1300…2020, y 930…1250, emerges from under the message card | QWERTY, return key |
| STEP wordmark | Montserrat 800 330 px, baseline (140, 820); tagline under it | Lime STEP Shift marker after the wordmark |

The ball's path runs clockwise round the world: right (slider), down the stair (cards), down again (reply,
keyboard), left (wordmark), then up into the toggle it started from.

## Beat map

| Beat | Time | Picture | Ball | Camera | Sound |
|---|---|---|---|---|---|
| 0 | 0.00 | Opening: BRAND MODE toggle off, cursor gliding in | Rests in the toggle as its knob | Tight on the toggle, z 2.0 | bed |
| 1 | 0.50 | **Cursor clicks.** Track turns cobalt, knob slides on | Slides to the on position | holds | tick + click |
| 2 | 1.00 | **Knob springs free** | Launches up-right | Starts following, widens | pop |
| 3 | 1.50 | **Lands on MOMENTUM** at 0 % | Lands behind the slider knob, starts pushing | Frames the slider, z 1.35 | thud |
| 4 | 2.00 | Bubble climbing, cobalt fill following | Pushing, accelerating | drifts right | blip |
| 5 | 2.50 | **100 %.** Bubble turns cobalt | Released over the knob | Tracks down-right | bell + pop |
| 6 | 3.00 | **STRATEGY** card arrives ("Set the direction.") | Steps onto it | Frames the stair, z 1.2 | thud + blip A5 |
| 7 | 3.50 | **CREATIVE** card arrives ("Build the impact.") | Steps down | tracks down | thud + blip F5 |
| 8 | 4.00 | **PERFORMANCE** card arrives ("Drive growth.") | Steps down | tracks down | thud + blip D5 |
| 9 | 4.50 | **Lands on Reply.** Pill stretches into the input field; keyboard slides out from under the card | Strikes the pill | Frames message + keys, z 1.1 | pop + whoosh |
| 10 | 5.00 | **S** typed | Strikes S | holds | key tap |
| 11 | 5.50 | **T** typed | Strikes T | holds | key tap |
| 12 | 6.00 | **E** typed | Strikes E | holds | key tap |
| 13 | 6.50 | **P** typed | Strikes P | holds | key tap |
| 14 | 7.00 | **Return.** Send button turns cobalt, field contracts into a blue "STEP" bubble | Strikes return, lifts off | Pull-back begins | click + bell |
| 15 | 7.50 | STEP wordmark letters rise in place; tagline wipes in | In flight across the world | Wide on the whole interface, z 0.74 | whoosh |
| 16 | 8.00 | **Brand reveal: "STEP" / "MAKE BRANDS MOVE."** Lime marker | Lands on the P of STEP | holds wide | thud + bell |
| 17.5 | 8.75 | Brand still on screen | Launches back toward the toggle | Returns to the opening, z 2.0 | pop |
| 18.5 | 9.25 | Cursor clicks the empty toggle off | In flight | arriving | tick |
| 19.5 | 9.75 | Toggle off, ready again | Drops into the knob slot | = opening frame | click |
| 20 | 10.00 | = frame 0 | | | loop |

## Loop contract
- Camera, cursor and every spring are evaluated over a periodic key list, so position and velocity at
  t = 10 s equal t = 0 to well under a pixel.
- The ball settles in the toggle from beat 19.5. At the wrap it is resting there (velocity 0) on both sides.
- Slider, cards, field, keyboard and wordmark reset at beat 19.9, when the camera is back on the toggle and all of
  them are out of frame.
- The score is rendered over three cycles and the middle one is kept, so its tails cross the wrap.
  End-of-loop SFX are also placed one loop earlier so their tails carry into the start.

## Brand rules applied
- Deep Navy #0B0F1A canvas, subtle dot grid, charcoal controls, white type, Cobalt #0047FF for every interaction.
- Acid Lime #C7FF00 appears only on the tiny STEP Shift marker beside the wordmark.
- Faces: Montserrat (display: wordmark, tagline) and Inter (UI). These are the STEP site's own fonts.
- No logo asset was supplied, so the wordmark is plain typography: "STEP" in Montserrat ExtraBold. No new logo was invented.
- The 100 % slider value is visual momentum, not a metric. There are no other numbers.
