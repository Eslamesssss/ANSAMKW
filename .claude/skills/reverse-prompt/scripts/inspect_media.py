#!/usr/bin/env python3
"""Pull every embedded trace of how a media file was made, and sample video frames.

Usage: inspect_media.py <file> [--frames-dir DIR] [--max-frames N] [--no-watch]

Prints JSON: file facts, generator metadata (Stable Diffusion / ComfyUI / NovelAI
PNG text chunks, EXIF, XMP, C2PA/JUMBF markers), and for video/audio the ffprobe
tags plus the paths of sampled scene-change frames.

Video "watch" mode (default) covers the whole timeline: dense timestamped frames
packed into contact sheets, per-second camera motion, and an audio map (sound vs
silence, loudness, optional speech transcript when faster-whisper and a model
are already available locally).
"""
import json, os, re, subprocess, sys, argparse

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".heic", ".avif"}
AV_EXT = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".gif", ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}
# Strings that betray an AI generator or editor when found anywhere in the bytes.
FINGERPRINTS = [
    "c2pa", "jumbf", "trainedAlgorithmicMedia", "compositeWithTrainedAlgorithmicMedia",
    "Midjourney", "DALL-E", "DALL·E", "OpenAI", "ChatGPT", "Adobe Firefly", "Firefly",
    "Imagen", "Gemini", "Google AI", "SynthID", "Stable Diffusion", "ComfyUI", "Automatic1111",
    "NovelAI", "Leonardo", "Ideogram", "Flux", "Runway", "Sora", "Kling", "Pika", "Luma",
    "Veo", "Hailuo", "CapCut", "Canva", "Photoshop", "Lightroom", "Premiere", "After Effects",
    "DaVinci", "Final Cut", "Lavf", "Negative prompt", "Steps:", "Sampler:", "CFG scale", "Seed:",
]


def scan_bytes(path, limit=64 * 1024 * 1024):
    with open(path, "rb") as f:
        data = f.read(limit)
    text = data.decode("latin-1")
    hits = sorted({fp for fp in FINGERPRINTS if fp.lower() in text.lower()})
    xmp = None
    m = re.search(r"<x:xmpmeta.*?</x:xmpmeta>", text, re.S)
    if m:
        xmp = m.group(0)[:20000]
    return hits, xmp


def image_meta(path):
    from PIL import Image, ExifTags
    out = {}
    with Image.open(path) as im:
        out["format"], out["mode"], out["size"] = im.format, im.mode, list(im.size)
        # PNG tEXt/iTXt chunks: SD "parameters", ComfyUI "prompt"/"workflow", NovelAI "Comment".
        text = {k: (v if isinstance(v, str) else repr(v))[:20000]
                for k, v in im.info.items() if isinstance(v, (str, bytes)) and k not in ("icc_profile", "exif", "xmp")}
        if text:
            out["text_chunks"] = text
        exif = im.getexif()
        if exif:
            tags = {}
            for k, v in exif.items():
                name = ExifTags.TAGS.get(k, str(k))
                tags[name] = v.decode("utf-8", "replace") if isinstance(v, bytes) else str(v)
            try:
                for k, v in exif.get_ifd(0x8769).items():  # Exif sub-IFD holds UserComment
                    name = ExifTags.TAGS.get(k, str(k))
                    tags[name] = v.decode("utf-8", "replace") if isinstance(v, bytes) else str(v)
            except Exception:
                pass
            out["exif"] = {k: v[:5000] for k, v in tags.items()}
    return out


def ffprobe(path):
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
                           capture_output=True, text=True, timeout=60)
        j = json.loads(r.stdout or "{}")
    except Exception as e:
        return {"error": str(e)}
    fmt = j.get("format", {})
    streams = [{k: s.get(k) for k in ("codec_type", "codec_name", "width", "height", "r_frame_rate",
                                       "duration", "sample_rate", "channels", "tags") if s.get(k) is not None}
               for s in j.get("streams", [])]
    return {"duration": fmt.get("duration"), "format": fmt.get("format_long_name"),
            "bit_rate": fmt.get("bit_rate"), "tags": fmt.get("tags", {}), "streams": streams}


def sample_frames(path, out_dir, max_frames, duration):
    os.makedirs(out_dir, exist_ok=True)
    pattern = os.path.join(out_dir, "scene_%03d.jpg")
    # Scene-change frames first: one per cut is what a shot-by-shot prompt needs.
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-vf",
                    "select='eq(n,0)+gt(scene,0.3)',scale='min(1024,iw)':-2", "-vsync", "vfr",
                    "-frames:v", str(max_frames), pattern], timeout=600)
    frames = sorted(f for f in os.listdir(out_dir) if f.startswith("scene_"))
    if len(frames) < 4 and duration:
        # Few or no cuts: fall back to evenly spaced frames.
        n = min(max_frames, 8)
        step = max(float(duration) / n, 0.1)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-vf",
                        f"fps=1/{step},scale='min(1024,iw)':-2", "-frames:v", str(n),
                        os.path.join(out_dir, "even_%03d.jpg")], timeout=600)
        frames = sorted(f for f in os.listdir(out_dir) if f.endswith(".jpg"))
    # Timestamps of each detected cut, for the shot list.
    cuts = []
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", path, "-vf", "select='gt(scene,0.3)',showinfo",
                        "-f", "null", "-"], capture_output=True, text=True, timeout=600)
    for m in re.finditer(r"pts_time:([0-9.]+)", r.stderr):
        cuts.append(round(float(m.group(1)), 2))
    return [os.path.join(out_dir, f) for f in frames], cuts


def contact_sheets(frames, times, out_dir, cols=4, rows=4, cell_w=384):
    """Pack timestamped frames into grids so the whole video reads in a few images."""
    from PIL import Image, ImageDraw
    sheets, per = [], cols * rows
    for start in range(0, len(frames), per):
        batch = frames[start:start + per]
        ims = [Image.open(f).convert("RGB") for f in batch]
        cell_h = int(cell_w * ims[0].height / ims[0].width)
        sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), "black")
        draw = ImageDraw.Draw(sheet)
        for i, im in enumerate(ims):
            x, y = (i % cols) * cell_w, (i // cols) * cell_h
            sheet.paste(im.resize((cell_w, cell_h)), (x, y))
            label = f"{times[start + i]:.1f}s"
            draw.rectangle([x, y, x + 8 + 8 * len(label), y + 18], fill="black")
            draw.text((x + 4, y + 3), label, fill="yellow")
        path = os.path.join(out_dir, f"sheet_{len(sheets) + 1:02d}.jpg")
        sheet.save(path, quality=85)
        sheets.append(path)
    return sheets


def camera_motion(frames, times):
    """Classify motion between consecutive frames: static, pan, tilt, zoom, or cut/busy."""
    import numpy as np
    from PIL import Image

    def gray(f, size=(160, 90)):
        return np.asarray(Image.open(f).convert("L").resize(size), dtype=np.float32)

    def shift(a, b):
        fa, fb = np.fft.fft2(a - a.mean()), np.fft.fft2(b - b.mean())
        r = fa * np.conj(fb)
        corr = np.fft.ifft2(r / (np.abs(r) + 1e-6)).real
        dy, dx = np.unravel_index(np.argmax(corr), corr.shape)
        h, w = a.shape
        dy = dy - h if dy > h // 2 else dy
        dx = dx - w if dx > w // 2 else dx
        return dx, dy, corr.max()

    def zoom_score(a, b):
        # Compare b against a centre crop of a scaled up (zoom in) and a padded copy (zoom out).
        h, w = a.shape
        img = Image.fromarray(a.astype("uint8"))
        cw, ch = int(w / 1.06), int(h / 1.06)
        zin = np.asarray(img.crop(((w - cw) // 2, (h - ch) // 2, (w + cw) // 2, (h + ch) // 2)).resize((w, h)), dtype=np.float32)
        zout = np.asarray(Image.fromarray(b.astype("uint8")).crop(((w - cw) // 2, (h - ch) // 2, (w + cw) // 2, (h + ch) // 2)).resize((w, h)), dtype=np.float32)
        base = np.abs(a - b).mean()
        return base - np.abs(zin - b).mean(), base - np.abs(a - zout).mean()

    out = []
    prev = gray(frames[0])
    for i in range(1, len(frames)):
        cur = gray(frames[i])
        diff = float(np.abs(cur - prev).mean())
        dx, dy, peak = shift(prev, cur)
        zi, zo = zoom_score(prev, cur)
        # Residual after undoing the detected shift: small means the whole frame slid (pan/tilt), not a cut.
        h, w = cur.shape
        my, mx = min(abs(dy) + 2, h // 3), min(abs(dx) + 2, w // 3)
        aligned = np.roll(cur, (dy, dx), axis=(0, 1))
        resid = float(np.abs(aligned - prev)[my:h - my, mx:w - mx].mean())
        panned = (abs(dx) >= 2 or abs(dy) >= 2) and resid < diff * 0.5
        if diff > 40 and not panned:
            kind = "cut_or_fast_change"
        elif diff < 2.5:
            kind = "static"
        elif panned:
            kind = ("pan_right" if dx > 0 else "pan_left") if abs(dx) >= abs(dy) else ("tilt_down" if dy > 0 else "tilt_up")
        elif max(zi, zo) > 1.0 and max(zi, zo) > diff * 0.15:
            kind = "zoom_in" if zi > zo else "zoom_out"
        else:
            kind = "subject_motion"
        out.append({"from": times[i - 1], "to": times[i], "motion": kind, "change": round(diff, 1)})
        prev = cur
    # Merge runs of the same motion into segments.
    segs = []
    for m in out:
        if segs and segs[-1]["motion"] == m["motion"]:
            segs[-1]["to"] = m["to"]
        else:
            segs.append({"from": m["from"], "to": m["to"], "motion": m["motion"]})
    return segs


def audio_map(path, duration):
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
                            "-of", "csv=p=0", path], capture_output=True, text=True)
    if not probe.stdout.strip():
        return {"has_audio": False}
    res = {"has_audio": True}
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", path, "-vn", "-af",
                        "silencedetect=noise=-35dB:d=0.4,ebur128", "-f", "null", "-"],
                       capture_output=True, text=True, timeout=900)
    silences, start = [], None
    for line in r.stderr.splitlines():
        m = re.search(r"silence_start: ([0-9.]+)", line)
        if m:
            start = float(m.group(1))
        m = re.search(r"silence_end: ([0-9.]+)", line)
        if m and start is not None:
            silences.append([round(start, 2), round(float(m.group(1)), 2)])
            start = None
    if start is not None:
        silences.append([round(start, 2), round(float(duration or start), 2)])
    res["silences_sec"] = silences
    m = re.findall(r"I:\s+(-?[0-9.]+) LUFS", r.stderr)
    if m:
        res["integrated_loudness_lufs"] = float(m[-1])
    # Speech transcript only when a local model is already usable; never downloads.
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), device="cpu", compute_type="int8",
                             local_files_only=True)
        segments, info = model.transcribe(path)
        res["transcript"] = {"language": info.language,
                             "segments": [{"start": round(s.start, 1), "end": round(s.end, 1), "text": s.text.strip()}
                                          for s in segments]}
    except Exception as e:
        res["transcript"] = None
        res["transcript_unavailable"] = f"{type(e).__name__}: no local speech model; listen-based details must come from the user"
    return res


def watch_video(path, out_dir, duration):
    """Dense pass over the full timeline: frames every 0.5-2s (max ~96), sheets, motion, audio."""
    os.makedirs(out_dir, exist_ok=True)
    dur = float(duration or 0) or 10.0
    step = min(max(dur / 96, 0.5), 2.0) if dur <= 192 else dur / 96
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-vf", f"fps=1/{step},scale=640:-2",
                    os.path.join(out_dir, "watch_%04d.jpg")], timeout=900)
    frames = sorted(os.path.join(out_dir, f) for f in os.listdir(out_dir) if f.startswith("watch_"))
    times = [round(i * step, 2) for i in range(len(frames))]
    res = {"frame_interval_sec": round(step, 2), "frames_watched": len(frames)}
    if frames:
        res["contact_sheets"] = contact_sheets(frames, times, out_dir)
        try:
            res["camera_motion"] = camera_motion(frames, times)
        except Exception as e:
            res["camera_motion_error"] = str(e)
    res["audio"] = audio_map(path, duration)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--frames-dir")
    ap.add_argument("--max-frames", type=int, default=24)
    ap.add_argument("--no-watch", action="store_true", help="skip the dense full-timeline pass")
    a = ap.parse_args()
    path = os.path.abspath(a.file)
    ext = os.path.splitext(path)[1].lower()
    res = {"file": path, "bytes": os.path.getsize(path), "extension": ext}
    hits, xmp = scan_bytes(path)
    res["generator_fingerprints"] = hits
    if xmp:
        res["xmp"] = xmp
    if ext in IMAGE_EXT:
        try:
            res["image"] = image_meta(path)
        except Exception as e:
            res["image_error"] = str(e)
    if ext in AV_EXT or ext not in IMAGE_EXT:
        probe = ffprobe(path)
        res["media"] = probe
        has_video = any(s.get("codec_type") == "video" for s in probe.get("streams", []))
        if has_video and ext not in IMAGE_EXT - {".gif"}:
            out_dir = a.frames_dir or os.path.splitext(path)[0] + "_frames"
            res["frames"], res["scene_cuts_sec"] = sample_frames(path, out_dir, a.max_frames, probe.get("duration"))
            if not a.no_watch:
                res["watch"] = watch_video(path, out_dir, probe.get("duration"))
        elif any(s.get("codec_type") == "audio" for s in probe.get("streams", [])):
            res["audio"] = audio_map(path, probe.get("duration"))
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
