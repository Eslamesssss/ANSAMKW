# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10", "numpy", "scipy", "soundfile"]
# ///
"""STEP — Make Brands Move: a seamless-loop score.

    MOTION_REEL_SKILL=<skill> uv run step-momentum/audio/score.py

120 BPM, 4/4, 20 beats = 10.0 s exactly (5 bars), D minor. A tight, minimal electronic pulse:
soft four-on-the-floor kick, offbeat hats, a pumping sub, a filtered pad and a sparse pluck motif.
The arrangement is rendered over three identical cycles and the middle one is kept, so reverb and
release tails from the end of the loop already sit under its start: the file loops with no seam.

Writes step-momentum/audio/music.wav and step-momentum/beats.json (offset 0, period 0.5).
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf


def _skill_dir():
    if os.environ.get("MOTION_REEL_SKILL"):
        return Path(os.environ["MOTION_REEL_SKILL"])
    raise SystemExit("set MOTION_REEL_SKILL to the motion-reel skill folder")


sys.path.insert(0, str(_skill_dir() / "scripts"))
import dsp  # noqa: E402
from dsp import SR, Bus, bass_note, clap, hat, kick, pad_chord, pluck, reverb, sidechain  # noqa: E402

FILM = Path(__file__).resolve().parent.parent
BPM, BEATS, CYCLES = 120, 20, 3
BEAT = 60 / BPM
DUR = BEATS * BEAT

dsp.seed(20261017)
# one chord per bar: Dm9 | Bbmaj7 | Fadd9 | C | Dm9   (bar 5 resolves into bar 1 of the next loop)
CHORDS = [
    (["D3", "A3", "C4", "F4", "E4"], "D2"),
    (["Bb2", "F3", "A3", "D4"], "Bb1"),
    (["F3", "C4", "G4", "A4"], "F2"),
    (["C3", "G3", "E4", "G4"], "C2"),
    (["D3", "A3", "C4", "F4", "E4"], "D2"),
]
# the pluck motif answers the picture: rising on the slider, stepping down the cards, four notes on S-T-E-P
MOTIF = {6: "A4", 7: "F4", 8: "D4", 10: "D5", 11: "E5", 12: "F5", 13: "A5", 16: "D5"}

total = DUR * CYCLES
drums, bass, pad, keys_ = (Bus(total, BPM) for _ in range(4))
kick_t = []
K, KS, CL, HC, HO = kick(), kick(soft=True), clap(tight=True), hat(), hat(open_=True)
for c in range(CYCLES):
    b0 = c * BEATS
    for b in range(BEATS):
        drums.add(K if b % 4 == 0 else KS, b0 + b, 0.9 if b % 4 == 0 else 0.75)
        kick_t.append((b0 + b) * BEAT)
        if b % 2 == 1:
            drums.add(CL, b0 + b, 0.32, pan=0.05)
        drums.add(HC, b0 + b + 0.5, 0.22, pan=0.25)
        drums.add(HC, b0 + b + 0.25, 0.08, pan=-0.2)
        drums.add(HC, b0 + b + 0.75, 0.08, pan=-0.2)
        if b % 4 == 3:
            drums.add(HO, b0 + b + 0.5, 0.12, pan=0.3)
    for bar, (notes, root) in enumerate(CHORDS):
        pad.add(pad_chord(notes, 4 * BEAT + 0.3, (700, 1900), attack=0.25, release=0.3), b0 + bar * 4, 0.55)
        for s in range(8):   # eighth-note sub pulse, offbeat accents
            bass.add(bass_note(root, BEAT * 0.45, cutoff=420 + 240 * (s % 2)), b0 + bar * 4 + s * 0.5, 0.42 if s % 2 else 0.3)
    for b, note in MOTIF.items():
        keys_.add(pluck([note], length=0.3, cutoff=2600), b0 + b, 0.3, pan=-0.15 if b % 2 else 0.15)

n = drums.x.shape[1]
duck = sidechain(kick_t, n, depth=0.55, release=0.12)
pad.x *= duck
bass.x *= sidechain(kick_t, n, depth=0.35, release=0.08)
mixb = drums.x + bass.x + reverb(pad.x, wet=0.35, length=2.0, decay=0.5) + reverb(keys_.x, wet=0.4, length=1.4, decay=0.35)

# keep the middle cycle: everything before and after it has already fed its tails into it
a = int(round(DUR * SR))
y = mixb[:, a:2 * a]
y = y / (np.abs(y).max() + 1e-9) * 10 ** (-3 / 20)
out = FILM / "audio" / "music.wav"
sf.write(out, y.T, SR, subtype="PCM_24")

beats = [round(i * BEAT, 5) for i in range(BEATS + 1)]
grid = {
    "bpm": BPM, "period": BEAT, "offset": 0.0, "beats": beats,
    "downbeats": [beats[i] for i in range(0, BEATS + 1, 4)],
    "sections": [{"name": "toggle", "beat": 0}, {"name": "slider", "beat": 3}, {"name": "cards", "beat": 5},
                 {"name": "reply", "beat": 9}, {"name": "keys", "beat": 10}, {"name": "reveal", "beat": 15},
                 {"name": "return", "beat": 17.5}],
    "loop": True,
}
(FILM / "beats.json").write_text(json.dumps(grid, indent=1))
print(f"music.wav {DUR:.2f}s @ {BPM} BPM, seamless loop; beats.json {len(beats)} beats")
