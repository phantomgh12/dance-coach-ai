// Client-side dance analysis algorithm — replaces the LLM.
// Given N ordered frame data-URLs, we extract per-frame stats then derive
// a lesson (style/difficulty/tempo/steps) and a score vs. a reference.
// Everything runs in the browser via <canvas>.

export type FrameStats = {
  brightness: number;      // 0..1
  motion: number;          // 0..1 (diff from previous)
  edgeDensity: number;     // 0..1 (Sobel-ish approximation)
  hueHist: number[];       // 12 bins normalized
};

export type DanceFeatures = {
  frameCount: number;
  avgMotion: number;
  motionVariance: number;
  motionPeaks: number;      // rough tempo indicator
  avgBrightness: number;
  avgEdge: number;
  hueSignature: number[];   // averaged 12-bin hue hist
  motionSeries: number[];   // per-frame motion for comparisons
};

export type DanceAnalysis = {
  style: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  tempo: string;
  summary: string;
  steps: { name: string; description: string; tip: string }[];
  keyMoves: string[];
  practiceTips: string[];
  _features: DanceFeatures;
  _algo: "v1-motion";
};

export type DanceEvaluation = {
  scores: { timing: number; accuracy: number; energy: number; posture: number; overall: number };
  strengths: string[];
  improvements: string[];
  summary: string;
  _algo: "v1-motion";
};

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("frame load failed"));
    img.src = url;
  });
}

function toGrayAndHue(data: Uint8ClampedArray) {
  const n = data.length / 4;
  const gray = new Float32Array(n);
  const hueHist = new Array(12).fill(0);
  let brightSum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const y = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    gray[p] = y;
    brightSum += y;
    // hue bin (rough)
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    if (d > 12) {
      let h = 0;
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = ((h * 60) + 360) % 360;
      hueHist[Math.min(11, Math.floor(h / 30))]++;
    }
  }
  const total = hueHist.reduce((a, b) => a + b, 0) || 1;
  return { gray, brightness: brightSum / n, hueHist: hueHist.map((c) => c / total) };
}

function edgeDensity(gray: Float32Array, w: number, h: number): number {
  // Simple Sobel |Gx|+|Gy| threshold
  let hits = 0, count = 0;
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      const i = y * w + x;
      const gx = -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1]
               + gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
      const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1]
               + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      if (Math.abs(gx) + Math.abs(gy) > 0.35) hits++;
      count++;
    }
  }
  return hits / count;
}

export async function computeDanceFeatures(frames: string[]): Promise<DanceFeatures> {
  if (!frames.length) throw new Error("no frames");
  const W = 96, H = 96;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  const stats: FrameStats[] = [];
  let prevGray: Float32Array | null = null;
  const motionSeries: number[] = [];

  for (const url of frames) {
    const img = await loadImage(url);
    ctx.drawImage(img, 0, 0, W, H);
    const { data } = ctx.getImageData(0, 0, W, H);
    const { gray, brightness, hueHist } = toGrayAndHue(data);
    const ed = edgeDensity(gray, W, H);
    let motion = 0;
    if (prevGray) {
      let s = 0;
      for (let i = 0; i < gray.length; i++) s += Math.abs(gray[i] - prevGray[i]);
      motion = Math.min(1, s / gray.length * 4);
    }
    motionSeries.push(motion);
    stats.push({ brightness, motion, edgeDensity: ed, hueHist });
    prevGray = gray;
  }

  const n = stats.length;
  const avgMotion = motionSeries.reduce((a, b) => a + b, 0) / n;
  const motionVariance = motionSeries.reduce((a, b) => a + (b - avgMotion) ** 2, 0) / n;
  const avgBrightness = stats.reduce((a, b) => a + b.brightness, 0) / n;
  const avgEdge = stats.reduce((a, b) => a + b.edgeDensity, 0) / n;
  const hueSignature = new Array(12).fill(0);
  for (const s of stats) for (let i = 0; i < 12; i++) hueSignature[i] += s.hueHist[i] / n;

  // peak count: local maxima in motion series with prominence
  let peaks = 0;
  for (let i = 1; i < motionSeries.length - 1; i++) {
    if (motionSeries[i] > motionSeries[i - 1] && motionSeries[i] > motionSeries[i + 1]
        && motionSeries[i] > avgMotion * 1.1) peaks++;
  }

  return {
    frameCount: n,
    avgMotion, motionVariance, motionPeaks: peaks,
    avgBrightness, avgEdge,
    hueSignature, motionSeries,
  };
}

const STYLE_TABLE: { name: string; motion: [number, number]; edge: [number, number] }[] = [
  { name: "Afrobeats",   motion: [0.15, 0.45], edge: [0.10, 0.45] },
  { name: "Hip-hop",     motion: [0.20, 0.60], edge: [0.15, 0.55] },
  { name: "Contemporary",motion: [0.06, 0.22], edge: [0.05, 0.30] },
  { name: "Salsa/Latin", motion: [0.18, 0.55], edge: [0.10, 0.40] },
  { name: "K-pop/Pop",   motion: [0.22, 0.65], edge: [0.20, 0.60] },
  { name: "Ballet",      motion: [0.04, 0.18], edge: [0.04, 0.25] },
];

function pickStyle(f: DanceFeatures): string {
  const scored = STYLE_TABLE.map((s) => {
    const dm = Math.max(0, Math.min(f.avgMotion, s.motion[1]) - Math.max(f.avgMotion, s.motion[0]));
    const inMotion = f.avgMotion >= s.motion[0] && f.avgMotion <= s.motion[1] ? 1 : 0;
    const inEdge = f.avgEdge >= s.edge[0] && f.avgEdge <= s.edge[1] ? 1 : 0;
    return { name: s.name, score: inMotion + inEdge + dm };
  }).sort((a, b) => b.score - a.score);
  return scored[0].name;
}

export function summarizeDance(features: DanceFeatures): DanceAnalysis {
  const style = pickStyle(features);
  const difficulty: DanceAnalysis["difficulty"] =
    features.avgMotion < 0.12 ? "beginner"
    : features.avgMotion < 0.30 ? "intermediate"
    : "advanced";
  const bpm = Math.round(60 + Math.min(180, features.motionPeaks * 40 / Math.max(1, features.frameCount / 8)));
  const tempo = `${bpm} BPM`;

  const steps = [
    {
      name: "Warm-up & posture",
      description: features.avgBrightness > 0.55
        ? "Bright stage — keep your torso lifted and shoulders relaxed."
        : "Low-light clip — focus on silhouette: strong core, aligned spine.",
      tip: "Film yourself from head-to-toe so we can score posture accurately.",
    },
    {
      name: "Groove / basic step",
      description: `Match the base pulse (~${bpm} BPM). Bounce on the beat before adding arms.`,
      tip: "Count 1-2-3-4 out loud on your first few reps.",
    },
    {
      name: "Signature move",
      description: features.motionVariance > 0.02
        ? "There's a big dynamic swing — isolate the biggest movement and drill it 10x."
        : "Movement is smooth and steady — sharpen the accents to add personality.",
      tip: "Slow the video to 0.5x and mirror the arms first, then legs.",
    },
    {
      name: "Full run-through",
      description: "Chain the moves back-to-back at full tempo.",
      tip: "Record a practice take right after — we'll score it against this reference.",
    },
  ];

  const summary =
    `Looks like ${style.toLowerCase()} at a ${difficulty} level, around ${bpm} BPM. ` +
    (features.motionVariance > 0.03
      ? "Big energy swings — great for practicing accents."
      : "Steady flow — great for locking in timing.");

  const keyMoves = [
    features.avgMotion > 0.3 ? "Sharp accents on the beat" : "Smooth weight shifts",
    features.avgEdge > 0.3 ? "Defined arm shapes" : "Loose, flowing arms",
    features.motionPeaks > 4 ? "Multiple direction changes" : "One or two direction changes",
  ];

  const practiceTips = [
    "Warm up 3 minutes before filming your practice.",
    "Use good lighting — front-facing, no backlight.",
    `Aim for ~${bpm} BPM; use a metronome app if needed.`,
    "Film full-body, no zoom, phone in landscape.",
  ];

  return {
    style, difficulty, tempo, summary, steps, keyMoves, practiceTips,
    _features: features, _algo: "v1-motion",
  };
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Dynamic Time Warping distance (small window) — used for timing similarity.
function dtw(a: number[], b: number[]): number {
  const n = a.length, m = b.length;
  const w = Math.max(3, Math.floor(Math.max(n, m) * 0.3));
  const INF = 1e9;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF));
  dp[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = Math.max(1, i - w); j <= Math.min(m, i + w); j++) {
      const cost = Math.abs(a[i - 1] - b[j - 1]);
      dp[i][j] = cost + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[n][m] / Math.max(n, m);
}

export function scoreDance(
  practice: DanceFeatures,
  reference: DanceFeatures,
  weights: { timing: number; accuracy: number; energy: number; posture: number },
): DanceEvaluation {
  // Timing: DTW on normalized motion series (lower = better)
  const normP = normalize(practice.motionSeries);
  const normR = normalize(reference.motionSeries);
  const timingDist = dtw(normP, normR);
  const timing = clamp(100 - timingDist * 220, 0, 100);

  // Accuracy: cosine similarity of hue signature + motion-variance closeness
  const hueSim = Math.max(0, cosine(practice.hueSignature, reference.hueSignature));
  const varClose = 1 - Math.min(1, Math.abs(practice.motionVariance - reference.motionVariance) * 12);
  const accuracy = clamp(hueSim * 60 + varClose * 40, 0, 100);

  // Energy: how close average motion is to the reference
  const energy = clamp(100 - Math.abs(practice.avgMotion - reference.avgMotion) * 220, 0, 100);

  // Posture: penalize very high edge density mismatch (proxy for silhouette clarity)
  const posture = clamp(100 - Math.abs(practice.avgEdge - reference.avgEdge) * 250, 0, 100);

  const overall = clamp(
    timing * weights.timing +
    accuracy * weights.accuracy +
    energy * weights.energy +
    posture * weights.posture,
    0, 100,
  );

  const strengths: string[] = [];
  const improvements: string[] = [];
  const push = (score: number, name: string, good: string, bad: string) => {
    (score >= 75 ? strengths : improvements).push(score >= 75 ? good : bad);
  };
  push(timing,   "timing",   "Your timing tracks the reference well.", "Work on hitting the beats — practice with a metronome.");
  push(accuracy, "accuracy", "Shapes and colors of motion match closely.", "Focus on matching the specific moves rather than freestyling.");
  push(energy,   "energy",   "Great energy level — matches the reference intensity.", "Push harder — the reference is more (or less) intense.");
  push(posture,  "posture",  "Strong, clean silhouette.", "Frame yourself better and keep your body squared to camera.");

  const summary = overall >= 80
    ? "Great run — you're locked in with the reference."
    : overall >= 60
      ? "Solid attempt. A couple of areas to tighten up."
      : "Good effort — keep drilling the basics and record another take.";

  return {
    scores: {
      timing: Math.round(timing),
      accuracy: Math.round(accuracy),
      energy: Math.round(energy),
      posture: Math.round(posture),
      overall: Math.round(overall),
    },
    strengths, improvements, summary,
    _algo: "v1-motion",
  };
}

function normalize(x: number[]): number[] {
  const max = Math.max(1e-6, ...x);
  return x.map((v) => v / max);
}
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
