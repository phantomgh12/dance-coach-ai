import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Film } from "lucide-react";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Upload history — DanceAI" }] }),
  component: History,
});

function History() {
  const { user } = useAuth();
  const { data: videos, isLoading } = useQuery({
    queryKey: ["videos-all", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("videos").select("*")
        .eq("user_id", user!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Upload history</h1>
        <p className="text-sm text-muted-foreground">Every dance you've uploaded.</p>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : videos && videos.length > 0 ? (
        <div className="grid gap-2">
          {videos.map((v) => (
            <Link key={v.id} to="/video/$id" params={{ id: v.id }} className="glass flex items-center gap-3 rounded-xl px-4 py-3 hover:bg-white/5 transition-colors">
              <Film className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{v.title}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(v.created_at).toLocaleString()} · {v.type}
                </p>
              </div>
              <Badge variant="secondary" className="capitalize">{v.status}</Badge>
              {v.score != null && <Badge>{Math.round(Number(v.score))}/100</Badge>}
            </Link>
          ))}
        </div>
      ) : (
        <div className="glass rounded-xl px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing uploaded yet.
        </div>
      )}
    </div>
  );
}
