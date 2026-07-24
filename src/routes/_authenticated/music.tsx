import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { analyzeVocal } from "@/lib/music-ai.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Mic, Music, Sparkles, Loader2, Upload, Wind, Zap, Heart, Activity, Trophy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/music")({
  head: () => ({
    meta: [
      { title: "AI Vocal Coach — DanceAI Music" },
      { name: "description", content: "Upload your singing and get pitch, timing, breath, and expression feedback from AI." },
      { property: "og:title", content: "AI Vocal Coach" },
      { property: "og:description", content: "Personalized vocal coaching powered by AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MusicCoach,
});

type Analysis = Awaited<ReturnType<typeof analyzeVocal>>["analysis"];

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function MusicCoach() {
  const run = useServerFn(analyzeVocal);
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [notes, setNotes] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Analysis | null>(null);

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Give your performance a title first");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      let audioDataUrl: string | undefined;
      let audioMime: string | undefined;
      if (audio) {
        if (audio.size > 5 * 1024 * 1024) {
          toast.error("Audio must be under 5MB. Trim your clip and try again.");
          setBusy(false);
          return;
        }
        audioDataUrl = await fileToDataUrl(audio);
        audioMime = audio.type || "audio/mpeg";
      }
      const res = await run({
        data: { title, genre: genre || undefined, lyricsOrNotes: notes || undefined, audioDataUrl, audioMime },
      });
      setResult(res.analysis);
      toast.success(`Analysis complete (${res.modelUsed.split("/")[1] ?? "AI"})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const scoreCards: Array<{ key: keyof Analysis["scores"]; label: string; icon: typeof Mic }> = [
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
          <h1 className="font-display text-3xl font-bold">AI Vocal Coach</h1>
          <Badge variant="secondary" className="ml-2">New</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a short clip of your singing (or describe it) and get structured coaching feedback. 10 credits per analysis.
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
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. My cover of Adele — Hello" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Genre (optional)</label>
              <Input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="pop, gospel, afrobeats, RnB…" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notes or lyrics (optional)</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="What did you struggle with? What key? Anything for the coach to know…"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Audio clip (optional, under 5MB)</label>
              <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground hover:bg-muted/40">
                <Upload className="h-4 w-4" />
                {audio ? audio.name : "Choose an audio file (mp3, m4a, wav)"}
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <Button onClick={submit} disabled={busy} className="w-full glow-primary">
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Coaching…</> : <><Sparkles className="mr-2 h-4 w-4" /> Analyze (10 credits)</>}
            </Button>
            <p className="text-xs text-muted-foreground">
              Plan B active: if the primary AI model is unavailable, we automatically retry with a backup.
            </p>
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
                Fill in the form and click Analyze — your report will appear here with scores, strengths, improvements, and warmups.
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
                      {result.strengths.map((s, i) => <li key={i}>• {s}</li>)}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-primary">Improvements</h3>
                    <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                      {result.improvements.map((s, i) => <li key={i}>• {s}</li>)}
                    </ul>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Warmups</h3>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    {result.warmups.map((w, i) => (
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
                    {result.practiceTips.map((s, i) => <li key={i}>• {s}</li>)}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
