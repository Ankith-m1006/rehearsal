# Final cut: each scene fitted to its voice part (speed up the waits, hold the rest), captions, voice mixed in.
# Inputs: raw/take.mp4 (from record.mjs + frames.txt), voice/<id>.wav (Kokoro am_michael), voice/timing.json
# Run: python build.py  -> rehearsal-demo.mp4
import json, os, subprocess

os.chdir(os.path.dirname(os.path.abspath(__file__)))
TAKE = "raw/take.mp4"
F = ["-r", "30", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-an"]
GAP = 0.6  # silence after each voice part
voice = {v["id"]: v["seconds"] for v in json.load(open("voice/timing.json"))}
order = ["problem", "what", "compile", "run", "diagnose", "catch", "close"]

# (take start, take end, output seconds); None output = take the rest of the scene's time
cuts = {
    "problem":  [(6.12, 20.01, None)],
    "what":     [(20.01, 36.0, None)],
    "compile":  [(36.0, 44.0, 8.0), (44.0, 89.5, 2.0), (89.5, 99.37, None)],
    "run":      [(99.37, 103.0, 3.0), (103.0, 123.63, 3.5), (123.63, 135.47, None)],
    "diagnose": [(135.47, 145.1, None)],
    "catch":    [(145.1, 166.0, 11.0), (166.0, 213.15, 4.5), (213.15, 217.7, None)],
    "close":    [(217.7, 233.2, None)],
}
caps = {
    "problem": "Payment bugs are found by customers",
    "what": "Real PayPal sandbox · real signed webhooks · app state checked after every step",
    "compile": "Plain English → Gemini → a validated test plan",
    "run": "Buggy shop: PayPal webhook delivered twice → shipped twice",
    "diagnose": "AI diagnosis: cause, fix, patch, evidence",
    "catch": "Caught on its first live run: a bug in our own fixed shop",
    "close": "8 PayPal scenarios · buggy vs fixed · real sandbox payments",
}
END_HOLD = 1.5

parts, t, starts = [], 0.0, {}
for sc in order:
    target = voice[sc] + GAP + (END_HOLD if sc == order[-1] else 0)
    fixed = sum(d for _, _, d in cuts[sc] if d)
    starts[sc] = t
    for a, b, d in cuts[sc]:
        dur = round(d if d else target - fixed, 3)
        speed = max(1.0, (b - a) / dur)
        out = f"seg{len(parts):02d}.mp4"
        vf = f"fps=30,setpts=(PTS-STARTPTS)/{speed:.4f},tpad=stop_mode=clone:stop_duration=30,trim=duration={dur},setpts=PTS-STARTPTS"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(a), "-to", str(b), "-i", TAKE, "-vf", vf, *F, out], check=True)
        parts.append(out)
    t += target
total = t
open("list.txt", "w").write("".join(f"file '{p}'\n" for p in parts))
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "joined.mp4"], check=True)

# captions (lower third), one per scene
os.makedirs("caps", exist_ok=True)
filters = []
for i, sc in enumerate(order):
    open(f"caps/{sc}.txt", "w", encoding="utf-8").write(caps[sc])
    a = starts[sc] + 0.3
    b = (starts[order[i + 1]] if i + 1 < len(order) else total) - 0.2
    filters.append(f"drawtext=fontfile='C\\:/Windows/Fonts/segoeuib.ttf':textfile=caps/{sc}.txt:fontsize=34:fontcolor=white:box=1:boxcolor=0x001C64@0.92:boxborderw=16:x=(w-text_w)/2:y=h-96:enable='between(t,{a:.2f},{b:.2f})'")

# voice: each part placed at its scene start + 0.15 s
inputs, mix = [], []
for i, sc in enumerate(order):
    inputs += ["-i", f"voice/{sc}.wav"]
    ms = int((starts[sc] + 0.15) * 1000)
    mix.append(f"[{i + 1}:a]adelay={ms}|{ms},aresample=48000[a{i}]")
amix = "".join(f"[a{i}]" for i in range(len(order))) + f"amix=inputs={len(order)}:normalize=0,loudnorm=I=-16:TP=-1.5,apad=whole_dur={total:.2f}[aout]"
fc = f"[0:v]{','.join(filters)}[vout];" + ";".join(mix) + ";" + amix
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", "joined.mp4", *inputs, "-filter_complex", fc, "-map", "[vout]", "-map", "[aout]",
                "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
                "-t", f"{total:.2f}", "-movflags", "+faststart", "rehearsal-demo.mp4"], check=True)
for p in parts: os.remove(p)
print("total", round(total, 2), "s;", "scene starts", {k: round(v, 2) for k, v in starts.items()})
