import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, Zap } from "lucide-react";
import { PLANS, PLAN_ORDER, FREE_DAILY_CREDITS } from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/plans")({
  head: () => ({
    meta: [
      { title: "Plans & Pricing — DanceAI" },
      { name: "description", content: "Choose a DanceAI plan from GHS 40 to GHS 2000. More AI credits, faster feedback, better dance." },
    ],
  }),
  component: Plans,
});

function Plans() {
  const { user } = useAuth();
  const { data: sub } = useQuery({
    queryKey: ["subscription", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("subscriptions").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  return (
    <div className="space-y-8">
      <header className="text-center">
        <h1 className="font-display text-3xl sm:text-4xl font-bold">Choose your plan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Prices in Ghana Cedis · Paid manually via Mobile Money · Activated after admin approval
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Free plan includes {FREE_DAILY_CREDITS} AI credits per day. Each AI analysis costs 10 credits.</p>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="glass border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-display">Free</CardTitle>
              {(!sub || sub.plan === "free") && <Badge variant="secondary">Current</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-bold">GHS 0<span className="text-sm text-muted-foreground">/mo</span></p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> {FREE_DAILY_CREDITS} AI credits per day</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> 2 uploads per week</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Basic AI feedback</li>
            </ul>
          </CardContent>
        </Card>

        {PLAN_ORDER.map((id) => {
          const p = PLANS[id];
          const current = sub?.plan === id;
          return (
            <Card key={id} className={`glass border-border/50 ${p.highlight ? "glow-primary ring-1 ring-primary/40" : ""}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="font-display flex items-center gap-2">
                    {p.name}
                    {p.highlight && <Sparkles className="h-4 w-4 text-primary" />}
                  </CardTitle>
                  {current ? <Badge>Current</Badge> : p.badge ? <Badge variant="secondary">{p.badge}</Badge> : null}
                </div>
              </CardHeader>
              <CardContent>
                <p className="font-display text-3xl font-bold">
                  GHS {p.price.toLocaleString()}<span className="text-sm text-muted-foreground">/mo</span>
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {f}</li>
                  ))}
                </ul>
                <Button asChild className="mt-5 w-full" disabled={current}>
                  <Link to="/payment/$plan" params={{ plan: id }}>
                    {current ? "Active" : `Upgrade to ${p.name}`}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
