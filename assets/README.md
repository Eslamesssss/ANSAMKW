# Brand assets

Source files for the STEP Digital Marketing site.

The page embeds small, must-never-break artwork (the brand mark, plus the web
fonts) as data URIs so the HTML stays self-contained. Larger photographs and
brand boards are referenced as ordinary files from this folder instead, to keep
the HTML a reasonable size.

| File | What it is | Used by the page |
| --- | --- | --- |
| `step-logo-mark.png` | The ribbon mark alone, background removed. | Yes — embedded as a data URI in the `.logo-mark` rule. |
| `step-logo-full.png` | Full lockup: mark, STEP wordmark, DIGITAL MARKETING, and the "Your Brand's Next Step" tagline. | No — kept as the editable original. |
| `case-boubayan-farm.webp` | Palm grove at sunrise, cropped from the Boubayan board. | Yes — Boubayan Farm case-study header. |
| `boubayan-farm-brand-board.webp` | Boubayan Farm brand guidelines board. | Source for the crop above. |
| `auto-vision-design-system.webp` | Auto Vision design system board. | Yes — Brand & Identity gallery. |
| `bukhoor-assam-brand-board.webp` | Bukhoor Assam Al Kuwait brand guidelines board. | Yes — Brand & Identity gallery. |

Brand colours sampled from the logo artwork: electric blue `#0050F8`,
deep navy `#001838`.

## Deploying

GitHub Pages publishes `dist/`, so anything the page references by path must be
copied there as well:

    cp assets/*.webp dist/assets/

## Re-embedding the mark

After editing `step-logo-mark.png`, replace the base64 payload inside the
`.logo-mark` rule's `background: url(data:image/png;base64,…)` in both
`step-digital-marketing.html` and `dist/step-digital-marketing.html`. It is
stored at 176px tall for a 48px display size, so it stays sharp on 3x screens.
