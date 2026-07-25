import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, CheckCircle2, XCircle, Coins, Sparkles, Film, Mic } from "lucide-react";

export const Route = createFileRoute("/_authenticated/train")({
  head: () => ({
    meta: [
      { title: "Train the algorithm — DanceAI" },
      { name: "description", content: "Rate your uploads to train our dance & vocal algorithm and earn credits." },
    ],
  }),
  component: TrainPage,
});

function TrainPage() {
  const { user } = useAuth();
  const { data: samples } = useQuery({
    queryKey: ["train-samples", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("algo_training_samples")
        .select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  const accepted = samples?.filter((s) => s.accepted).length ?? 0;
  const rejected = (samples?.length ?? 0) - accepted;
  const totalCredits = samples?.reduce((a, b) => a + (b.credits_awarded ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-primary" />
          <h1 className="font-display text-3xl font-bold">Train the algorithm</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          Rate your uploads on the video and vocal pages — your ratings tune the algorithm's weights
          and you earn credits (up to 100/day). Bad or duplicate submissions are automatically filtered.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={CheckCircle2} label="Accepted" value={accepted} tone="text-primary" />
        <StatCard icon={XCircle} label="Rejected" value={rejected} tone="text-destructive" />
        <StatCard icon={Coins} label="Credits earned" value={totalCredits} tone="text-primary" />
      </div>

      <Card className="glass border-border/50">
        <CardHeader><CardTitle className="font-display">How to train</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p className="flex items-start gap-2"><Film className="mt-0.5 h-4 w-4 text-primary" /> Open a <Link to="/history" className="underline">dance video</Link>, run analysis, then hit <b>Rate this</b> to tune dance weights.</p>
          <p className="flex items-start gap-2"><Mic className="mt-0.5 h-4 w-4 text-primary" /> Go to the <Link to="/music" className="underline">Vocal Coach</Link>, analyze a clip, then rate it.</p>
          <p className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 text-primary" /> More effort = more credits. Contradictory or duplicate ratings are rejected.</p>
        </CardContent>
      </Card>

      <Card className="glass border-border/50">
        <CardHeader><CardTitle className="font-display">Recent submissions</CardTitle></CardHeader>
        <CardContent>
          {samples && samples.length > 0 ? (
            <div className="space-y-2">
              {samples.map((s) => (
                <div key={s.id} className="glass rounded-xl px-3 py-2 flex items-center gap-3">
                  <Badge variant={s.accepted ? "default" : "destructive"} className="capitalize">{s.kind}</Badge>
                  {s.accepted
                    ? <span className="text-sm text-primary flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> accepted</span>
                    : <span className="text-sm text-destructive flex items-center gap-1"><XCircle className="h-3.5 w-3.5" /> {s.rejection_reason ?? "rejected"}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</span>
                  {s.credits_awarded > 0 && <Badge variant="secondary">+{s.credits_awarded} cr</Badge>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No training submissions yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <Icon className={`h-4 w-4 ${tone}`} />
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
