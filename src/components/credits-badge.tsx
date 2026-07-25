import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Zap } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { FREE_DAILY_CREDITS } from "@/lib/plans";

export function CreditsBadge() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["credits", user?.id],
    enabled: !!user,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("credits, credits_reset_on")
        .eq("id", user!.id)
        .maybeSingle();
      const today = new Date().toISOString().slice(0, 10);
      if (data && data.credits_reset_on < today) {
        return { credits: FREE_DAILY_CREDITS, stale: true };
      }
      return { credits: data?.credits ?? FREE_DAILY_CREDITS, stale: false };
    },
  });

  const credits = data?.credits ?? FREE_DAILY_CREDITS;
  const low = credits < 20;

  return (
    <Link
      to="/plans"
      className={`glass inline-flex items-center gap-1 rounded-full border border-border/50 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-white/5 ${low ? "text-primary" : ""}`}
      title="Credits · tap to upgrade"
    >
      <Zap className={`h-3.5 w-3.5 ${low ? "text-primary" : ""}`} />
      <span className="tabular-nums">{credits}</span>
      <span className="hidden sm:inline text-muted-foreground">credits</span>
    </Link>
  );
}
