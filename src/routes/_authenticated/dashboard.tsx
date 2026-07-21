import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload as UploadIcon, Trophy, Flame, Film, Crown, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — DanceAI" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: videos } = useQuery({
    queryKey: ["videos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("videos").select("*")
        .eq("user_id", user!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: subscription } = useQuery({
    queryKey: ["subscription", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("subscriptions").select("*")
        .eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const learned = videos?.filter((v) => v.type === "source").length ?? 0;
  const practices = videos?.filter((v) => v.type === "practice") ?? [];
  const bestScore = practices.reduce((m, v) => Math.max(m, Number(v.score ?? 0)), 0);
  const streak = calcStreak(practices.map((v) => new Date(v.created_at)));

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">Welcome back{profile?.display_name ? "," : ""}</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold">
          {profile?.display_name ?? "Dancer"} <span className="gradient-text">✦</span>
        </h1>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Film} label="Dances learned" value={learned} />
        <StatCard icon={Trophy} label="Best score" value={bestScore ? `${Math.round(bestScore)}` : "—"} suffix={bestScore ? "/100" : undefined} />
        <StatCard icon={Flame} label="Streak" value={streak} suffix="days" />
        <StatCard
          icon={Crown}
          label="Plan"
          value={(subscription?.plan ?? "free").toUpperCase()}
          badge={subscription?.status === "active" ? "active" : undefined}
        />
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle className="font-display">Upload a dance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Drop a video and DanceAI will start analyzing the choreography.
            </p>
            <Button asChild className="glow-primary">
              <Link to="/upload"><UploadIcon className="mr-1.5 h-4 w-4" /> Upload video</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle className="font-display">Go Pro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Unlock unlimited uploads, advanced AI coaching, and detailed analytics.
            </p>
            <Button asChild variant="secondary">
              <Link to="/plans">View plans <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-xl font-semibold">Recent uploads</h2>
          <Button asChild variant="ghost" size="sm"><Link to="/history">See all</Link></Button>
        </div>
        {videos && videos.length > 0 ? (
          <div className="grid gap-2">
            {videos.slice(0, 5).map((v) => (
              <Link key={v.id} to="/video/$id" params={{ id: v.id }} className="glass flex items-center justify-between rounded-xl px-4 py-3 hover:bg-white/5 transition-colors">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{v.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(v.created_at).toLocaleString()} · {v.type} · {v.status}
                  </p>
                </div>
                {v.score != null && <Badge variant="secondary">{Math.round(Number(v.score))}/100</Badge>}
              </Link>
            ))}
          </div>
        ) : (
          <div className="glass rounded-xl px-4 py-8 text-center text-sm text-muted-foreground">
            No uploads yet. Start with your first dance.
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, suffix, badge,
}: { icon: any; label: string; value: string | number; suffix?: string; badge?: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 text-primary" />
        {badge && <Badge variant="secondary" className="capitalize">{badge}</Badge>}
      </div>
      <p className="mt-3 font-display text-2xl font-bold">
        {value}<span className="ml-1 text-sm font-normal text-muted-foreground">{suffix}</span>
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function calcStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;
  const days = new Set(dates.map((d) => d.toISOString().slice(0, 10)));
  let n = 0;
  const cur = new Date();
  while (days.has(cur.toISOString().slice(0, 10))) { n++; cur.setDate(cur.getDate() - 1); }
  return n;
}
