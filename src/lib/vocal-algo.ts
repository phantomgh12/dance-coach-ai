// Client-side vocal analysis via Web Audio — no LLM.
// Extracts pitch (autocorrelation), RMS energy, energy variance,
// zero-crossing rate, and tempo/onset density. Produces a structured
// coaching report with scores + tips.

export type VocalFeatures = {
  durationSec: number;
  avgPitchHz: number;        // 0 if unvoiced
  pitchStabilityCents: number; // lower = steadier
  vibratoRateHz: number;
  avgRms: number;
  rmsVariance: number;
  breathPauses: number;      // silence gaps
  onsetsPerSec: number;
  zcr: number;
};

export type VocalAnalysis = {
  summary: string;
  strengths: string[];
  improvements: string[];
  scores: { pitch: number; timing: number; breath: number; tone: number; expression: number; overall: number };
  warmups: { name: string; instruction: string; durationMinutes: number }[];
  practiceTips: string[];
  _features: VocalFeatures;
  _algo: "v1-audio";
};

async function decodeAudio(file: File): Promise<AudioBuffer> {
  const arr = await file.arrayBuffer();
  const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  try { return await ctx.decodeAudioData(arr); } finally { ctx.close(); }
}

function autocorrPitch(buf: Float32Array, sr: number): number {
  // YIN-lite. Search 70–500 Hz range.
  const minLag = Math.floor(sr / 500);
  const maxLag = Math.floor(sr / 70);
  const N = Math.min(buf.length, 2048);
  let bestLag = -1, bestScore = Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < N - lag; i++) {
      const d = buf[i] - buf[i + lag];
      sum += d * d;
    }
    if (sum < bestScore) { bestScore = sum; bestLag = lag; }
  }
  if (bestLag < 0) return 0;
  return sr / bestLag;
}

export async function computeVocalFeatures(file: File): Promise<VocalFeatures> {
  const audio = await decodeAudio(file);
  const sr = audio.sampleRate;
  const ch = audio.getChannelData(0);
  const durationSec = audio.duration;

  const win = Math.floor(sr * 0.05);       // 50ms frames
  const hop = Math.floor(sr * 0.025);      // 25ms hop
  const rms: number[] = [];
  const zcrs: number[] = [];
  const pitches: number[] = [];

  for (let i = 0; i + win < ch.length; i += hop) {
    let s = 0, z = 0;
    for (let j = 0; j < win; j++) {
      const v = ch[i + j];
      s += v * v;
      if (j > 0 && (ch[i + j - 1] >= 0) !== (v >= 0)) z++;
    }
    const r = Math.sqrt(s / win);
    rms.push(r);
    zcrs.push(z / win);
    if (r > 0.02) {
      pitches.push(autocorrPitch(ch.subarray(i, i + win), sr));
    } else {
      pitches.push(0);
    }
  }

  const voiced = pitches.filter((p) => p >= 70 && p <= 500);
  const avgPitchHz = voiced.length ? voiced.reduce((a, b) => a + b, 0) / voiced.length : 0;

  // Stability: convert to cents, std dev
  let pitchStabilityCents = 0;
  if (voiced.length > 4 && avgPitchHz > 0) {
    const cents = voiced.map((p) => 1200 * Math.log2(p / avgPitchHz));
    const m = cents.reduce((a, b) => a + b, 0) / cents.length;
    pitchStabilityCents = Math.sqrt(cents.reduce((a, b) => a + (b - m) ** 2, 0) / cents.length);
  }

  // Vibrato rate: count zero-crossings of centered pitch series per second
  let vibratoRateHz = 0;
  if (voiced.length > 8 && avgPitchHz > 0) {
    let crosses = 0;
    for (let i = 1; i < voiced.length; i++) {
      if ((voiced[i - 1] - avgPitchHz) * (voiced[i] - avgPitchHz) < 0) crosses++;
    }
    vibratoRateHz = crosses / (voiced.length * (hop / sr) * 2);
  }

  const avgRms = rms.reduce((a, b) => a + b, 0) / rms.length;
  const rmsVariance = rms.reduce((a, b) => a + (b - avgRms) ** 2, 0) / rms.length;

  // Breath pauses = runs of low-RMS frames > 250ms
  const silenceThreshold = Math.max(0.01, avgRms * 0.25);
  let breathPauses = 0, run = 0;
  const framesForPause = Math.ceil(0.25 / (hop / sr));
  for (const r of rms) {
    if (r < silenceThreshold) { run++; if (run === framesForPause) breathPauses++; }
    else run = 0;
  }

  // Onsets: rms jumps
  let onsets = 0;
  for (let i = 1; i < rms.length; i++) {
    if (rms[i] > rms[i - 1] * 1.6 && rms[i] > avgRms * 0.9) onsets++;
  }
  const onsetsPerSec = onsets / Math.max(1, durationSec);

  const zcr = zcrs.reduce((a, b) => a + b, 0) / zcrs.length;

  return { durationSec, avgPitchHz, pitchStabilityCents, vibratoRateHz,
    avgRms, rmsVariance, breathPauses, onsetsPerSec, zcr };
}

export function summarizeVocal(
  f: VocalFeatures,
  weights: { pitch: number; timing: number; breath: number; tone: number; expression: number },
  meta: { title: string; genre?: string },
): VocalAnalysis {
  // Convert to scores
  const pitch = clamp(100 - f.pitchStabilityCents * 1.2, 20, 100); // <20c ≈ 100
  const timing = clamp(60 + (0.6 - Math.abs(f.onsetsPerSec - 2.5) / 4) * 60, 20, 100);
  const breath = clamp(100 - f.breathPauses * 4 - (f.durationSec < 5 ? 20 : 0), 20, 100);
  const tone = clamp(100 - Math.abs(f.zcr - 0.08) * 400, 20, 100);
  const expression = clamp(50 + f.rmsVariance * 900 + (f.vibratoRateHz > 3 && f.vibratoRateHz < 8 ? 15 : 0), 20, 100);

  const overall = clamp(
    pitch * weights.pitch + timing * weights.timing + breath * weights.breath +
    tone * weights.tone + expression * weights.expression, 0, 100,
  );

  const strengths: string[] = [];
  const improvements: string[] = [];
  const put = (s: number, good: string, bad: string) => (s >= 75 ? strengths : improvements).push(s >= 75 ? good : bad);
  put(pitch,      "Clean, steady pitch.", `Pitch drifts ~${Math.round(f.pitchStabilityCents)} cents — hum scales daily.`);
  put(timing,     "Great phrasing rhythm.", "Phrasing is uneven — practice with a metronome or backing track.");
  put(breath,     "Strong breath support.", "Too many mid-phrase breaths — mark breath points in the lyric sheet.");
  put(tone,       "Balanced tone.", "Tone is thin or harsh — try warming up with lip trills.");
  put(expression, "Expressive dynamics.", "Dynamics are flat — vary volume and add a subtle vibrato on held notes.");

  const summary =
    `${meta.title}${meta.genre ? ` (${meta.genre})` : ""}: ${Math.round(f.durationSec)}s clip, ` +
    (f.avgPitchHz ? `avg pitch ${Math.round(f.avgPitchHz)}Hz. ` : "mostly unvoiced. ") +
    (overall >= 80 ? "Nice performance — polish the details." :
     overall >= 60 ? "Solid foundations — a few things to sharpen." :
     "Good effort — focus on the basics below.");

  const warmups = [
    { name: "Lip trills", instruction: "Slide from your lowest to highest comfortable note on a lip trill.", durationMinutes: 3 },
    { name: "5-note scales", instruction: "Sing 'ma-me-mi-mo-mu' up and down a 5-note scale in every key.", durationMinutes: 5 },
    { name: "Breath ladder", instruction: "Inhale 4s, hiss out 8s, then 12s, then 16s. Repeat 3 times.", durationMinutes: 3 },
    { name: "Straw phonation", instruction: "Sing your song's chorus through a thin straw for one minute.", durationMinutes: 2 },
  ];

  const practiceTips = [
    "Record in a quiet room, phone 15cm from your mouth.",
    "Track the song at 80% volume in your ears — don't over-sing.",
    "Slow the song to 0.75x and match phrasing before full tempo.",
    f.breathPauses > 3 ? "Mark breath points in the lyrics with a slash." : "Try tougher passages in one breath.",
  ];

  return {
    summary, strengths, improvements,
    scores: {
      pitch: Math.round(pitch), timing: Math.round(timing), breath: Math.round(breath),
      tone: Math.round(tone), expression: Math.round(expression), overall: Math.round(overall),
    },
    warmups, practiceTips,
    _features: f, _algo: "v1-audio",
  };
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
