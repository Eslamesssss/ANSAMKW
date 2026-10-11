#!/usr/bin/env python3
"""Pull every embedded trace of how a media file was made, and sample video frames.

Usage: inspect_media.py <file> [--frames-dir DIR] [--max-frames N]

Prints JSON: file facts, generator metadata (Stable Diffusion / ComfyUI / NovelAI
PNG text chunks, EXIF, XMP, C2PA/JUMBF markers), and for video/audio the ffprobe
tags plus the paths of sampled scene-change frames.
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--frames-dir")
    ap.add_argument("--max-frames", type=int, default=24)
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
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
