import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useState } from "react";
import { Loader2, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — DanceAI" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { user } = useAuth();
  const { data: isAdmin, isLoading: adminLoading } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role")
        .eq("user_id", user!.id).eq("role", "admin").maybeSingle();
      return !!data;
    },
  });

  if (adminLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!isAdmin) return <NoAccess userId={user?.id} />;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold">Admin</h1>
        <p className="text-sm text-muted-foreground">Manage payments and users.</p>
      </header>
      <PaymentsAdmin />
    </div>
  );
}

function NoAccess({ userId }: { userId?: string }) {
  return (
    <Card className="glass border-border/50">
      <CardHeader><CardTitle className="font-display">Admin access required</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>You don't have the admin role.</p>
        {userId && (
          <p className="rounded-lg bg-muted/40 p-3 font-mono text-xs">
            Your user id: <span className="text-foreground">{userId}</span>
          </p>
        )}
        <p>
          To grant admin access, an admin (or a project owner via the backend) must insert your user id into the
          <code className="mx-1 rounded bg-muted px-1">user_roles</code> table with role <code className="mx-1 rounded bg-muted px-1">admin</code>.
        </p>
      </CardContent>
    </Card>
  );
}

function PaymentsAdmin() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const { data: payments, isLoading } = useQuery({
    queryKey: ["admin-payments", filter],
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("*")
        .eq("status", filter).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const decide = async (id: string, status: "approved" | "rejected", plan: string, userId: string, note?: string) => {
    const { data: updated, error } = await supabase.from("payments").update({
      status, admin_note: note ?? null, reviewed_at: new Date().toISOString(),
    }).eq("id", id).select().maybeSingle();
    if (error) return toast.error(error.message);

    if (status === "approved" && updated) {
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      await supabase.from("subscriptions").update({
        plan: plan as any,
        status: "active",
        current_period_end: periodEnd.toISOString(),
      }).eq("user_id", userId);
    }

    await supabase.from("notifications").insert({
      user_id: userId,
      title: status === "approved" ? "Subscription approved" : "Payment rejected",
      body: status === "approved" ? `Your ${plan} plan is now active.` : (note || "Please contact support."),
    });

    toast.success(`Marked as ${status}`);
    qc.invalidateQueries({ queryKey: ["admin-payments"] });
  };

  return (
    <Card className="glass border-border/50">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="font-display">Manual payments</CardTitle>
          <div className="flex gap-1">
            {(["pending", "approved", "rejected"] as const).map((s) => (
              <Button key={s} size="sm" variant={filter === s ? "secondary" : "ghost"} onClick={() => setFilter(s)} className="capitalize">
                {s}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> :
          payments && payments.length > 0 ? (
            <div className="space-y-3">
              {payments.map((p) => (
                <PaymentRow key={p.id} p={p} onDecide={decide} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing here.</p>
          )}
      </CardContent>
    </Card>
  );
}

function PaymentRow({ p, onDecide }: { p: any; onDecide: (id: string, s: "approved" | "rejected", plan: string, userId: string, note?: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const viewScreenshot = async () => {
    if (!p.screenshot_path) return;
    const { data } = await supabase.storage.from("payment-screenshots")
      .createSignedUrl(p.screenshot_path, 300);
    if (data?.signedUrl) { setScreenshotUrl(data.signedUrl); window.open(data.signedUrl, "_blank"); }
  };

  const act = async (s: "approved" | "rejected") => {
    setBusy(s);
    await onDecide(p.id, s, p.plan, p.user_id, s === "rejected" ? note : undefined);
    setBusy(null);
  };

  return (
    <div className="rounded-xl border border-border/60 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 text-sm">
          <p className="font-medium">Plan: <span className="capitalize">{p.plan}</span> · {p.currency} {p.amount}</p>
          <p className="text-xs text-muted-foreground">Ref: {p.reference} · TX: {p.transaction_id}</p>
          <p className="text-xs text-muted-foreground">User: <span className="font-mono">{p.user_id}</span></p>
          <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</p>
        </div>
        <Badge variant="secondary" className="capitalize">{p.status}</Badge>
      </div>
      {p.screenshot_path && (
        <Button size="sm" variant="outline" onClick={viewScreenshot}>
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> View screenshot
        </Button>
      )}
      {p.admin_note && <p className="rounded bg-muted/40 p-2 text-xs">{p.admin_note}</p>}
      {p.status === "pending" && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Rejection reason (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => act("approved")} disabled={!!busy}>
              {busy === "approved" && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Approve
            </Button>
            <Button size="sm" variant="destructive" onClick={() => act("rejected")} disabled={!!busy}>
              {busy === "rejected" && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
