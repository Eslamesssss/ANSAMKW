# Brand assets

Source files for the STEP Digital Marketing site. The page itself
(`step-digital-marketing.html`) is deliberately self-contained — fonts and the
brand mark are embedded as data URIs — so these files are the editable
originals, not runtime dependencies.

| File | What it is |
| --- | --- |
| `step-logo-mark.png` | The ribbon mark alone, background removed. Embedded in the page as the header/footer mark. |
| `step-logo-full.png` | The full lockup: mark, STEP wordmark, DIGITAL MARKETING, and the "Your Brand's Next Step" tagline. |
| `boubayan-farm-brand-board.webp` | Boubayan Farm brand guidelines board. |
| `auto-vision-design-system.webp` | Auto Vision design system board. |
| `bukhoor-assam-brand-board.webp` | Bukhoor Assam Al Kuwait brand guidelines board. |

Brand colours taken from the logo artwork: electric blue `#0050F8`,
deep navy `#001838`.

To re-embed the mark after editing `step-logo-mark.png`, replace the base64
payload in the `.logo-mark` rule's `background: url(data:image/png;base64,…)`.
