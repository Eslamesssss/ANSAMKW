---
name: reverse-prompt
description: Reverse engineer the prompts and build instructions that produced any link, image, video, audio, design, document, website or app the user sends, then hand back ready-to-run prompts that recreate it. Use whenever the user shares media, a file or a URL and asks how it was made, wants its prompt, wants to "reverse" or "extract" it, or wants to recreate something like it (Arabic requests include "هندسة عكسية", "استخرج البرومبت", "اوامر انشاءه", "اعمل زيه").
---

# Reverse prompt

Goal: for whatever the user sends, recover how it was made and return prompts
that would recreate it. Always work in two passes and keep them apart:

1. **Recover**: look for the real prompt or settings left inside the artifact.
   A hit here is the actual original prompt; label it **exact**.
2. **Reconstruct**: when nothing is embedded, infer a prompt from what the
   artifact shows. Label it **reconstructed**. Never present a reconstruction
   as the original prompt, since nobody can recover a prompt that left no trace.

Reply in the user's language. Write the prompts themselves in English, because
generators follow English best, and add a short explanation in the user's
language under each one.

## Step 1: route the input

| Input | Recover with | Then reconstruct |
|---|---|---|
| Image file (png, jpg, webp…) | `scripts/inspect_media.py <file>` | View the image yourself (Read tool) |
| Video / GIF | `scripts/inspect_media.py <file>`: ffprobe tags, scene cuts, sampled frames | Read every sampled frame, build a shot list |
| Audio | `scripts/inspect_media.py <file>` (ffprobe tags) | Describe genre, tempo, instruments, voice, structure |
| Website URL | REA: `list_browser_targets` → `inspect_web_page`, `analyze_web_bundle`, `capture_web_screenshot` (see the `reverse-engineer-anything` skill) | Build prompt for the whole site |
| App (APK, exe, Electron/ASAR, .NET) | REA routing from the `reverse-engineer-anything` skill | Build prompt for the app/feature |
| PDF / deck / design export | `inspect_media.py` for producer metadata; read the pages | Layout + copy + style prompt |
| Code or a repo | Read it directly (no REA needed) | Build prompt that would regenerate it |
| Social post link (Instagram, TikTok, YouTube…) | Usually not downloadable here: ask the user to upload the file itself | as for video/image |

Run the script with `python3 -I`, and pass the file path as an argument. The script
writes frames next to the file (`<name>_frames/`), or to `--frames-dir`.

**Network:** this cloud environment blocks most outside domains. If a URL can't
be reached (proxy 403 / DNS failure), say so in one line: the user either
uploads the file, or adds the domain under Allowed domains in the
environment's network settings. If the site's source is in the repo, serve its
build locally (`python3 -m http.server`, headless Chromium with
`--remote-debugging-port`) and point REA at that. Never invent what an unreachable page contains.

## Step 2: read the recovery output

Exact prompts and settings live in these places:
- `image.text_chunks.parameters`: Stable Diffusion / A1111 / Forge (prompt, `Negative prompt`, Steps, Sampler, CFG, Seed, Model).
- `image.text_chunks.prompt` / `workflow`: ComfyUI graph JSON. Find the CLIPTextEncode node texts and the sampler and model nodes.
- `image.text_chunks.Comment` / `Description`: NovelAI and others.
- `exif.UserComment`, `exif.ImageDescription`, `exif.Software`, and the `xmp` description: Midjourney often stores the prompt and a Job ID here.
- `generator_fingerprints`: `c2pa` / `trainedAlgorithmicMedia` means a Content Credentials manifest says it is AI-made (OpenAI, Adobe Firefly, Google and others sign this way). Name the tool when the bytes name it.
- Video `media.tags` (`comment`, `description`, `encoder`, `title`): may name the generator or editor (Runway, Kling, CapCut…).

Social platforms and messaging apps strip metadata. An empty result only means
the trace is gone. It never shows that the file wasn't AI-made.

## Step 3: reconstruct

Look closely before writing. For images and frames, note the subject, its
action and pose, the setting, the composition and framing, the camera (lens,
angle, depth of field), the lighting (direction, quality, time of day), the
color palette and grade, the texture and medium (photo, 3D render, illustration,
anime, oil paint…), the era or style references, any visible text with its
exact wording, the aspect ratio, and artifacts that point to a specific
generator.

Deliver, depending on the type:

- **Image:** one master description plus tool-tuned versions:
  - Midjourney: a single line, with `--ar W:H --style raw --v 7` and `--no …` where useful.
  - Gemini (Nano Banana) / GPT Image: natural sentences, with any on-image text quoted exactly.
  - Flux / Stable Diffusion: comma-weighted tags, plus a negative prompt and suggested steps, CFG and sampler.
- **Video:** a shot list (timestamp from `scene_cuts_sec` → shot description →
  camera move → transition), then one prompt per shot for Veo / Sora / Kling /
  Runway (subject, action, camera motion, lighting, duration, aspect ratio),
  plus audio/music/voice-over notes and the editing recipe (pacing, captions,
  grade) that ties the shots together.
- **Audio/music:** a Suno/Udio-style prompt (genre, BPM, key, mood,
  instruments, vocal type, structure), with lyrics transcribed if audible.
- **Website / app:** a build prompt for Claude Code / Lovable / AI Studio that
  covers the stack seen in the evidence, the pages and sections, components,
  design tokens (colors, fonts, spacing), copy, interactions, and integrations
  and APIs. Cite the REA evidence IDs behind each claim, and keep observed facts
  apart from your own design guesses.
- **Document / design:** layout grid, type pairings, palette, the copy, and a
  prompt for a design tool or for HTML.

## Step 4: answer format

1. **What it is**: type, size and length, and the tool that made it if the evidence names one.
2. **Exact prompt found**: verbatim, or "none embedded", with the reason when one is known (for example, metadata stripped).
3. **Reconstructed prompts**: in fenced code blocks so they are easy to copy, one per tool.
4. **How to get closer**: settings, seed and reference-image tips, and what stays uncertain.

Delete extracted frames and other temporary files from the repo when done. Never commit them.
