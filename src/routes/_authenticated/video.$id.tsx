import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { analyzeDance, evaluateDance, submitDanceTraining } from "@/lib/dance-ai.functions";
import { extractFramesFromFile, extractFramesFromUrl } from "@/lib/frames";
import { computeDanceFeatures, summarizeDance, scoreDance, type DanceFeatures } from "@/lib/dance-algo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Sparkles, Loader2, UploadCloud, Trophy, ArrowLeft, Film,
  Scissors, Brain, ScanLine, CheckCircle2, Share2, Copy, Music2,
  Gauge, Flame, Zap, Target, Activity, PersonStanding, GraduationCap,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/video/$id")({
  head: () => ({ meta: [{ title: "Dance analysis — DanceAI" }] }),
  component: VideoDetail,
});

const ACCEPTED = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/avi", "video/mov"];
const MAX_SIZE = 500 * 1024 * 1024;
type AiStep = { key: string; state: "active" | "done" | "error"; label: string };

const DANCE_WEIGHTS_FALLBACK = { timing: 0.28, accuracy: 0.32, energy: 0.2, posture: 0.2 };

async function loadDanceWeights() {
  const { data } = await supabase.from("algo_weights").select("weights").eq("kind", "dance").maybeSingle();
  const w = (data?.weights ?? {}) as Partial<typeof DANCE_WEIGHTS_FALLBACK>;
  return {
    timing: w.timing ?? DANCE_WEIGHTS_FALLBACK.timing,
    accuracy: w.accuracy ?? DANCE_WEIGHTS_FALLBACK.accuracy,
    energy: w.energy ?? DANCE_WEIGHTS_FALLBACK.energy,
    posture: w.posture ?? DANCE_WEIGHTS_FALLBACK.posture,
  };
}

function VideoDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const analyzeFn = useServerFn(analyzeDance);
  const evaluateFn = useServerFn(evaluateDance);
  const trainFn = useServerFn(submitDanceTraining);

  const { data: video, isLoading } = useQuery({
    queryKey: ["video", id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("videos").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => (q.state.data?.status === "processing" ? 2000 : false),
  });

  const { data: signedUrl } = useQuery({
    queryKey: ["video-url", video?.file_path],
    enabled: !!video?.file_path,
    queryFn: async () => {
      const { data } = await supabase.storage.from("dance-videos").createSignedUrl(video!.file_path, 3600);
      return data?.signedUrl ?? null;
    },
  });

  const { data: practices } = useQuery({
    queryKey: ["practices", id],
    enabled: !!user && !!video && video.type === "source",
    queryFn: async () => {
      const { data } = await supabase.from("videos").select("*")
        .eq("user_id", user!.id).eq("reference_video_id", id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const [aiSteps, setAiSteps] = useState<AiStep[]>([]);
  const [features, setFeatures] = useState<DanceFeatures | null>(null);
  const setStep = (key: string, state: "active" | "done" | "error", label: string) =>
    setAiSteps((prev) => {
      const idx = prev.findIndex((s) => s.key === key);
      const next = { key, state, label };
      if (idx >= 0) { const copy = [...prev]; copy[idx] = next; return copy; }
      return [...prev, next];
    });

  const analyzeMut = useMutation({
    mutationFn: async () => {
      if (!signedUrl) throw new Error("Video not ready");
      setAiSteps([]);
      setStep("frames", "active", "Extracting 12 frames");
      const frames = await extractFramesFromUrl(signedUrl, 12);
      setStep("frames", "done", `Extracted ${frames.length} frames`);
      setStep("features", "active", "Computing motion + edge features");
      const feats = await computeDanceFeatures(frames);
      setFeatures(feats);
      setStep("features", "done", "Features extracted");
      setStep("model", "active", "Building your lesson from the signals");
      const analysis = summarizeDance(feats);
      setStep("model", "done", "Lesson ready");
      setStep("save", "active", "Saving");
      const res = await analyzeFn({ data: { videoId: id, analysis } });
      setStep("save", "done", "Saved");
      return res;
    },
    onSuccess: () => { toast.success("Analysis complete"); qc.invalidateQueries({ queryKey: ["video", id] }); },
    onError: (e: Error) => {
      setAiSteps((prev) => prev.map((s) => (s.state === "active" ? { ...s, state: "error" } : s)));
      toast.error(e.message ?? "Analysis failed");
    },
  });

  const analysis = video?.analysis as Analysis | null;
  const feedback = video?.feedback as Evaluation | null;

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!video) return <p className="text-sm text-muted-foreground">Video not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link to="/history"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold sm:text-3xl">{video.title}</h1>
            <p className="text-xs text-muted-foreground">
              {new Date(video.created_at).toLocaleString()} · {video.type} · <span className="capitalize">{video.status}</span>
            </p>
          </div>
          {video.score != null && (
            <Badge className="text-sm"><Trophy className="mr-1 h-3 w-3" />{Math.round(Number(video.score))}/100</Badge>
          )}
        </div>
      </div>

      {signedUrl && (
        <video src={signedUrl} controls className="w-full rounded-2xl border border-border/50 bg-black" />
      )}

      {video.type === "source" && (
        <Card className="glass border-border/50">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="font-display flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Lesson</CardTitle>
            <Button onClick={() => analyzeMut.mutate()}
              disabled={analyzeMut.isPending || !signedUrl}
              size="sm" className="glow-primary">
              {analyzeMut.isPending
                ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Analyzing</>
                : analysis ? "Re-analyze" : "Analyze"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiSteps.length > 0 && (analyzeMut.isPending || aiSteps.some((s) => s.state === "error")) && (
              <AlgoProgress steps={aiSteps} />
            )}
            {analysis ? <AnalysisView a={analysis} /> : !analyzeMut.isPending && (
              <p className="text-sm text-muted-foreground">Run analysis to generate a step-by-step lesson from your video.</p>
            )}
            {features && analysis && (
              <TrainSection kind="dance" features={features} defaults={{
                style: analysis.style, difficulty: analysis.difficulty,
                timing: 75, accuracy: 75, energy: 75, posture: 75,
              }} submit={async (payload) => {
                const r = await trainFn({ data: payload });
                return r;
              }} />
            )}
          </CardContent>
        </Card>
      )}

      {video.type === "source" && (
        <PracticeUpload
          referenceId={video.id}
          onCreated={(newId) => navigate({ to: "/video/$id", params: { id: newId } })}
        />
      )}

      {video.type === "source" && practices && practices.length > 0 && (
        <Card className="glass border-border/50">
          <CardHeader><CardTitle className="font-display">Your practice attempts</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {practices.map((p) => (
              <Link key={p.id} to="/video/$id" params={{ id: p.id }} className="glass flex items-center gap-3 rounded-xl px-4 py-3 hover:bg-white/5">
                <Film className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.title}</p>
                  <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()} · {p.status}</p>
                </div>
                {p.score != null && <Badge>{Math.round(Number(p.score))}/100</Badge>}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {video.type === "practice" && (
        <PracticeEvaluation
          practice={video}
          evaluate={async () => {
            if (!signedUrl) throw new Error("Practice video not ready");
            if (!video.reference_video_id) throw new Error("No reference video linked");
            const refPath = await getRefPath(video.reference_video_id);
            const { data: refData } = await supabase.storage
              .from("dance-videos").createSignedUrl(refPath, 3600);
            if (!refData?.signedUrl) throw new Error("Reference not accessible");
            toast.message("Extracting frames + computing features…");
            const [practiceFrames, referenceFrames] = await Promise.all([
              extractFramesFromUrl(signedUrl, 12),
              extractFramesFromUrl(refData.signedUrl, 12),
            ]);
            const [pFeat, rFeat] = await Promise.all([
              computeDanceFeatures(practiceFrames),
              computeDanceFeatures(referenceFrames),
            ]);
            const weights = await loadDanceWeights();
            const evaluation = scoreDance(pFeat, rFeat, weights);
            const res = await evaluateFn({
              data: { practiceVideoId: video.id, referenceVideoId: video.reference_video_id, evaluation },
            });
            qc.invalidateQueries({ queryKey: ["video", id] });
            return res;
          }}
          feedback={feedback}
          status={video.status}
        />
      )}
    </div>
  );
}

async function getRefPath(refId: string): Promise<string> {
  const { data, error } = await supabase.from("videos").select("file_path").eq("id", refId).maybeSingle();
  if (error || !data) throw new Error("Reference video not found");
  return data.file_path;
}

type Analysis = {
  style: string; difficulty: "beginner" | "intermediate" | "advanced"; tempo: string; summary: string;
  steps: { name: string; description: string; tip: string }[];
  keyMoves: string[]; practiceTips: string[];
};

type Evaluation = {
  scores: { timing: number; accuracy: number; energy: number; posture: number; overall: number };
  strengths: string[]; improvements: string[]; summary: string;
};

function AlgoProgress({ steps }: { steps: AiStep[] }) {
  const done = steps.filter((s) => s.state === "done").length;
  const total = Math.max(steps.length, 4);
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Brain className="h-4 w-4 animate-pulse text-primary" /> Algorithm running…
        </p>
        <span className="text-xs text-muted-foreground">{done}/{total}</span>
      </div>
      <Progress value={(done / total) * 100} className="mb-3 h-1.5" />
      <ol className="space-y-1.5 text-sm">
        {steps.map((s) => {
          const Icon = s.key === "frames" ? Scissors : s.key === "features" ? ScanLine : s.key === "model" ? Brain : CheckCircle2;
          return (
            <li key={s.key} className="flex items-center gap-2">
              {s.state === "active" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> :
                s.state === "done" ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> :
                <Icon className="h-3.5 w-3.5 text-destructive" />}
              <span className={s.state === "error" ? "text-destructive" : s.state === "done" ? "text-foreground" : "text-muted-foreground"}>
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function AnalysisView({ a }: { a: Analysis }) {
  const copyLesson = () => {
    const text = `${a.style} — ${a.difficulty} · ${a.tempo}\n\n${a.summary}\n\nSteps:\n${a.steps.map((s, i) => `${i + 1}. ${s.name} — ${s.description} (Tip: ${s.tip})`).join("\n")}\n\nKey moves: ${a.keyMoves.join(", ")}\n\nTips: ${a.practiceTips.join(" · ")}`;
    navigator.clipboard.writeText(text);
    toast.success("Lesson copied to clipboard");
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "DanceAI lesson", text: a.summary, url: window.location.href });
      else { await navigator.clipboard.writeText(window.location.href); toast.success("Link copied"); }
    } catch {}
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary"><Music2 className="mr-1 h-3 w-3" />{a.style}</Badge>
        <Badge variant="secondary" className="capitalize"><Flame className="mr-1 h-3 w-3" />{a.difficulty}</Badge>
        <Badge variant="secondary"><Gauge className="mr-1 h-3 w-3" />{a.tempo}</Badge>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={copyLesson}><Copy className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" onClick={share}><Share2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      <p className="text-sm">{a.summary}</p>
      <div>
        <h3 className="mb-2 font-display text-sm font-semibold">Steps</h3>
        <ol className="space-y-2">
          {a.steps?.map((s, i) => (
            <li key={i} className="glass rounded-xl p-3">
              <p className="font-medium">{i + 1}. {s.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
              <p className="mt-1 text-xs text-primary">💡 {s.tip}</p>
            </li>
          ))}
        </ol>
      </div>
      {a.keyMoves?.length > 0 && (
        <div>
          <h3 className="mb-1 font-display text-sm font-semibold">Key moves</h3>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">{a.keyMoves.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
      {a.practiceTips?.length > 0 && (
        <div>
          <h3 className="mb-1 font-display text-sm font-semibold">Practice tips</h3>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">{a.practiceTips.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function TrainSection({
  features, defaults, submit,
}: {
  kind: "dance"; features: DanceFeatures;
  defaults: { style: string; difficulty: "beginner"|"intermediate"|"advanced"; timing: number; accuracy: number; energy: number; posture: number };
  submit: (p: { features: Record<string, unknown>; labels: any; effort: number }) => Promise<{ accepted: boolean; awarded: number; rejection: string[] }>;
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState(defaults.style);
  const [difficulty, setDifficulty] = useState(defaults.difficulty);
  const [scores, setScores] = useState({ timing: defaults.timing, accuracy: defaults.accuracy, energy: defaults.energy, posture: defaults.posture });
  const [effort, setEffort] = useState(5);
  const [busy, setBusy] = useState(false);

  const doSubmit = async () => {
    setBusy(true);
    try {
      const r = await submit({
        features: features as unknown as Record<string, unknown>,
        labels: { style, difficulty, ...scores },
        effort,
      });
      if (r.accepted) toast.success(`Training accepted — +${r.awarded} credits`);
      else toast.error(`Rejected: ${r.rejection.join("; ")}`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Training failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-1"><GraduationCap className="h-4 w-4 text-primary" />Train the algorithm</p>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>{open ? "Cancel" : "Rate this"}</Button>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Style</Label>
              <Input value={style} onChange={(e) => setStyle(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Difficulty</Label>
              <select className="glass w-full rounded-md border border-border/50 bg-transparent px-2 py-1 text-sm"
                value={difficulty} onChange={(e) => setDifficulty(e.target.value as any)}>
                <option value="beginner">beginner</option>
                <option value="intermediate">intermediate</option>
                <option value="advanced">advanced</option>
              </select>
            </div>
          </div>
          {(["timing","accuracy","energy","posture"] as const).map((k) => (
            <div key={k}>
              <div className="flex justify-between text-xs"><span className="capitalize">{k}</span><span className="tabular-nums">{scores[k]}</span></div>
              <Slider min={0} max={100} step={1} value={[scores[k]]}
                onValueChange={(v) => setScores((prev) => ({ ...prev, [k]: v[0] }))} />
            </div>
          ))}
          <div>
            <div className="flex justify-between text-xs"><span>Effort (1–10)</span><span className="tabular-nums">{effort}</span></div>
            <Slider min={1} max={10} step={1} value={[effort]} onValueChange={(v) => setEffort(v[0])} />
          </div>
          <p className="text-xs text-muted-foreground">You earn up to {effort * 2} credits if accepted. Bad or duplicate trains are filtered.</p>
          <Button size="sm" onClick={doSubmit} disabled={busy} className="w-full glow-primary">
            {busy ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Submitting</> : "Submit training"}
          </Button>
        </div>
      )}
    </div>
  );
}

function PracticeEvaluation({
  evaluate, feedback, status,
}: { practice: any; evaluate: () => Promise<any>; feedback: Evaluation | null; status: string }) {
  const mut = useMutation({
    mutationFn: evaluate,
    onSuccess: () => toast.success("Evaluated"),
    onError: (e: Error) => toast.error(e.message ?? "Evaluation failed"),
  });
  return (
    <Card className="glass border-border/50">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="font-display flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" /> Performance score</CardTitle>
        <Button size="sm" className="glow-primary" onClick={() => mut.mutate()} disabled={mut.isPending || status === "processing"}>
          {mut.isPending || status === "processing"
            ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Scoring</>
            : feedback ? "Re-score" : "Score"}
        </Button>
      </CardHeader>
      <CardContent>
        {feedback ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(["timing","accuracy","energy","posture","overall"] as const).map((k) => {
                const Icon = k === "timing" ? Activity : k === "accuracy" ? Target : k === "energy" ? Zap : k === "posture" ? PersonStanding : Trophy;
                const score = Math.round(feedback.scores[k]);
                const tone = score >= 80 ? "text-primary" : score >= 60 ? "text-foreground" : "text-destructive";
                return (
                  <div key={k} className="glass rounded-xl p-3 text-center">
                    <Icon className={`mx-auto mb-1 h-4 w-4 ${tone}`} />
                    <p className="text-xs uppercase text-muted-foreground">{k}</p>
                    <p className={`font-display text-2xl font-bold ${tone}`}>{score}</p>
                  </div>
                );
              })}
            </div>
            <p className="text-sm">{feedback.summary}</p>
            {feedback.strengths?.length > 0 && (
              <div>
                <h3 className="mb-1 font-display text-sm font-semibold text-primary">Strengths</h3>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">{feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            )}
            {feedback.improvements?.length > 0 && (
              <div>
                <h3 className="mb-1 font-display text-sm font-semibold">Improve</h3>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">{feedback.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Run scoring to compare your practice against the reference.</p>
        )}
      </CardContent>
    </Card>
  );
}

function PracticeUpload({ referenceId, onCreated }: { referenceId: string; onCreated: (id: string) => void }) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const evaluateFn = useServerFn(evaluateDance);

  const pick = (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_SIZE) return toast.error("File must be under 500MB");
    const ok = ACCEPTED.includes(f.type) || /\.(mp4|mov|avi|m4v)$/i.test(f.name);
    if (!ok) return toast.error("Use MP4, MOV, or AVI");
    setFile(f);
    if (!title) setTitle(`Practice — ${f.name.replace(/\.[^.]+$/, "")}`);
  };

  const submit = useCallback(async () => {
    if (!file || !user) return;
    setBusy(true); setProgress(10);
    try {
      const path = `${user.id}/${Date.now()}-practice-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const tick = setInterval(() => setProgress((p) => Math.min(60, p + 5)), 300);
      const { error: upErr } = await supabase.storage.from("dance-videos").upload(path, file, {
        contentType: file.type, upsert: false,
      });
      clearInterval(tick);
      if (upErr) throw upErr;

      const { data: inserted, error: dbErr } = await supabase.from("videos").insert({
        user_id: user.id, title: title.trim() || "Practice", file_path: path,
        file_size: file.size, mime_type: file.type,
        type: "practice", status: "uploaded", reference_video_id: referenceId,
      }).select("id").single();
      if (dbErr || !inserted) throw dbErr;
      setProgress(70);

      try {
        const { data: refRow } = await supabase.from("videos").select("file_path").eq("id", referenceId).maybeSingle();
        const { data: refUrl } = await supabase.storage.from("dance-videos").createSignedUrl(refRow!.file_path, 3600);
        const [practiceFrames, referenceFrames] = await Promise.all([
          extractFramesFromFile(file, 12),
          extractFramesFromUrl(refUrl!.signedUrl, 12),
        ]);
        const [pFeat, rFeat] = await Promise.all([
          computeDanceFeatures(practiceFrames),
          computeDanceFeatures(referenceFrames),
        ]);
        const weights = await loadDanceWeights();
        const evaluation = scoreDance(pFeat, rFeat, weights);
        await evaluateFn({
          data: { practiceVideoId: inserted.id, referenceVideoId: referenceId, evaluation },
        });
      } catch (e: any) {
        toast.error(e.message ?? "Scoring failed — you can retry on the practice page");
      }

      setProgress(100);
      onCreated(inserted.id);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setBusy(false); setProgress(0);
    }
  }, [file, user, title, referenceId, onCreated, evaluateFn]);

  return (
    <Card className="glass border-border/50">
      <CardHeader><CardTitle className="font-display flex items-center gap-2"><UploadCloud className="h-4 w-4 text-primary" /> Upload your practice</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <button type="button" onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border p-6 text-sm">
          {file ? <span className="font-medium">{file.name}</span> : <span className="text-muted-foreground">Tap to select your practice video</span>}
        </button>
        <input ref={inputRef} type="file" className="hidden"
          accept="video/mp4,video/quicktime,video/x-msvideo,.mp4,.mov,.avi,.m4v"
          onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        <div>
          <Label htmlFor="ptitle">Title</Label>
          <Input id="ptitle" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
        </div>
        {busy && <Progress value={progress} />}
        <Button className="w-full glow-primary" disabled={!file || busy} onClick={submit}>
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading & scoring…</> : "Upload & score practice"}
        </Button>
      </CardContent>
    </Card>
  );
}
