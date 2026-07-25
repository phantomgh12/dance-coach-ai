import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { analyzeVocal, submitVocalTraining, type VocalAnalysisResult } from "@/lib/music-ai.functions";
import { computeVocalFeatures, summarizeVocal, type VocalFeatures } from "@/lib/vocal-algo";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Mic, Music, Sparkles, Loader2, Upload, Wind, Zap, Heart, Activity, Trophy, GraduationCap,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/music")({
  head: () => ({
    meta: [
      { title: "Vocal Coach — DanceAI" },
      { name: "description", content: "Upload singing clips and get instant coaching from our audio algorithm." },
      { property: "og:title", content: "Vocal Coach" },
      { property: "og:description", content: "Instant vocal coaching powered by an audio analysis algorithm." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MusicCoach,
});

const SCORE_KEYS = ["pitch", "timing", "breath", "tone", "expression"] as const;
type ScoreKey = typeof SCORE_KEYS[number];

async function loadWeights(): Promise<Record<ScoreKey, number>> {
  const { data } = await supabase.from("algo_weights").select("weights").eq("kind", "vocal").maybeSingle();
  const w = (data?.weights ?? {}) as Partial<Record<ScoreKey, number>>;
  return {
    pitch: w.pitch ?? 0.28, timing: w.timing ?? 0.22, breath: w.breath ?? 0.18,
    tone: w.tone ?? 0.16, expression: w.expression ?? 0.16,
  };
}

function MusicCoach() {
  const run = useServerFn(analyzeVocal);
  const train = useServerFn(submitVocalTraining);
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [notes, setNotes] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VocalAnalysisResult | null>(null);
  const [features, setFeatures] = useState<VocalFeatures | null>(null);
  const [showTrain, setShowTrain] = useState(false);
  const [labels, setLabels] = useState<Record<ScoreKey, number>>({ pitch: 75, timing: 75, breath: 75, tone: 75, expression: 75 });
  const [effort, setEffort] = useState(5);

  const submit = async () => {
    if (!title.trim()) return toast.error("Give your performance a title first");
    if (!audio) return toast.error("Upload an audio clip so the algorithm can analyze it");
    if (audio.size > 20 * 1024 * 1024) return toast.error("Audio must be under 20MB");
    setBusy(true); setResult(null);
    try {
      toast.message("Analyzing audio locally…");
      const feats = await computeVocalFeatures(audio);
      const weights = await loadWeights();
      const analysis = summarizeVocal(feats, weights, { title, genre });
      const res = await run({ data: { title, genre: genre || undefined, analysis } });
      setResult(res.analysis);
      setFeatures(feats);
      toast.success("Analysis complete");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally { setBusy(false); }
  };

  const submitTraining = async () => {
    if (!features) return;
    try {
      const r = await train({ data: { features: features as unknown as Record<string, unknown>, labels, effort } });
      if (r.accepted) toast.success(`Training accepted — +${r.awarded} credits`);
      else toast.error(`Rejected: ${r.rejection.join("; ")}`);
      setShowTrain(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Training failed");
    }
  };

  const scoreCards: Array<{ key: ScoreKey; label: string; icon: typeof Mic }> = [
    { key: "pitch", label: "Pitch", icon: Activity },
    { key: "timing", label: "Timing", icon: Zap },
    { key: "breath", label: "Breath", icon: Wind },
    { key: "tone", label: "Tone", icon: Music },
    { key: "expression", label: "Expression", icon: Heart },
  ];

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <Mic className="h-6 w-6 text-primary" />
          <h1 className="font-display text-3xl font-bold">Vocal Coach</h1>
          <Badge variant="secondary" className="ml-2">Algorithm</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a short singing clip. Our audio algorithm scores pitch, timing, breath, tone, and expression — no AI, all local math. 10 credits per analysis.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Your performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Song / performance title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. My cover of Hello" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Genre (optional)</label>
              <Input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="pop, gospel, afrobeats…" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notes (optional)</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Audio clip (under 20MB)</label>
              <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground hover:bg-muted/40">
                <Upload className="h-4 w-4" />
                {audio ? audio.name : "Choose an audio file (mp3, m4a, wav)"}
                <input type="file" accept="audio/*" className="hidden"
                  onChange={(e) => setAudio(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            <Button onClick={submit} disabled={busy} className="w-full glow-primary">
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing…</>
                : <><Sparkles className="mr-2 h-4 w-4" /> Analyze (10 credits)</>}
            </Button>
          </CardContent>
        </Card>

        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" /> Coaching report
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!result && !busy && (
              <p className="text-sm text-muted-foreground">
                Upload a clip and hit Analyze — scores, strengths, warmups appear here.
              </p>
            )}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" /> Coach is listening…
              </div>
            )}
            {result && (
              <div className="space-y-4">
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                  <p className="font-display text-4xl font-bold">
                    {Math.round(result.scores.overall)}
                    <span className="text-base text-muted-foreground">/100</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{result.summary}</p>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {scoreCards.map(({ key, label, icon: Icon }) => (
                    <div key={key} className="rounded-lg border border-border/50 bg-background/40 p-2 text-center">
                      <Icon className="mx-auto h-4 w-4 text-primary" />
                      <p className="mt-1 text-lg font-bold tabular-nums">{Math.round(result.scores[key])}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold text-primary">Strengths</h3>
                    <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                      {result.strengths.map((s: string, i: number) => <li key={i}>• {s}</li>)}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-primary">Improvements</h3>
                    <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                      {result.improvements.map((s: string, i: number) => <li key={i}>• {s}</li>)}
                    </ul>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Warmups</h3>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    {result.warmups.map((w, i: number) => (
                      <div key={i} className="rounded-lg border border-border/50 bg-background/40 p-2 text-xs">
                        <p className="font-medium">{w.name} <span className="text-muted-foreground">· {w.durationMinutes}min</span></p>
                        <p className="mt-0.5 text-muted-foreground">{w.instruction}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Practice tips</h3>
                  <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                    {result.practiceTips.map((s: string, i: number) => <li key={i}>• {s}</li>)}
                  </ul>
                </div>

                {features && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold flex items-center gap-1"><GraduationCap className="h-4 w-4 text-primary" />Train the algorithm</p>
                      <Button size="sm" variant="ghost" onClick={() => setShowTrain((v) => !v)}>
                        {showTrain ? "Cancel" : "Rate this"}
                      </Button>
                    </div>
                    {showTrain && (
                      <div className="mt-3 space-y-3">
                        {SCORE_KEYS.map((k) => (
                          <div key={k}>
                            <div className="flex justify-between text-xs">
                              <span className="capitalize">{k}</span>
                              <span className="tabular-nums">{labels[k]}</span>
                            </div>
                            <Slider min={0} max={100} step={1} value={[labels[k]]}
                              onValueChange={(v) => setLabels((prev) => ({ ...prev, [k]: v[0] }))} />
                          </div>
                        ))}
                        <div>
                          <div className="flex justify-between text-xs"><span>Effort (1–10)</span><span className="tabular-nums">{effort}</span></div>
                          <Slider min={1} max={10} step={1} value={[effort]} onValueChange={(v) => setEffort(v[0])} />
                        </div>
                        <p className="text-xs text-muted-foreground">You earn up to {effort * 2} credits if accepted. Bad or duplicate trains are rejected.</p>
                        <Button size="sm" onClick={submitTraining} className="w-full glow-primary">Submit training</Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
