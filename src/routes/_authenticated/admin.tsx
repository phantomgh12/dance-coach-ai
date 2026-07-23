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
        <p className="text-sm text-muted-foreground">Manage payments, users, and platform stats.</p>
      </header>
      <AdminStats />
      <PaymentsAdmin />
      <AdminUsers />
    </div>
  );
}

function AdminStats() {
  const { data } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [users, videos, pending, active] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("videos").select("id", { count: "exact", head: true }),
        supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).neq("plan", "free"),
      ]);
      return {
        users: users.count ?? 0,
        videos: videos.count ?? 0,
        pending: pending.count ?? 0,
        active: active.count ?? 0,
      };
    },
  });
  const stats = [
    { label: "Users", value: data?.users ?? "—" },
    { label: "Videos", value: data?.videos ?? "—" },
    { label: "Pending payments", value: data?.pending ?? "—" },
    { label: "Paid subs", value: data?.active ?? "—" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className="glass border-border/50">
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">{s.label}</p>
            <p className="font-display text-2xl font-bold">{s.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AdminUsers() {
  const qc = useQueryClient();
  const { data: users } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, display_name, credits, credits_reset_on").order("credits_reset_on", { ascending: false }).limit(50);
      return data ?? [];
    },
  });
  const { data: admins } = useQuery({
    queryKey: ["admin-list"],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      return new Set((data ?? []).map((r) => r.user_id));
    },
  });

  const toggleAdmin = async (userId: string, makeAdmin: boolean) => {
    if (makeAdmin) {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" as any });
      if (error) return toast.error(error.message);
      toast.success("Granted admin");
    } else {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
      if (error) return toast.error(error.message);
      toast.success("Revoked admin");
    }
    qc.invalidateQueries({ queryKey: ["admin-list"] });
  };

  const setCredits = async (userId: string, credits: number) => {
    const { error } = await supabase.from("profiles").update({ credits }).eq("id", userId);
    if (error) return toast.error(error.message);
    toast.success("Credits updated");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  return (
    <Card className="glass border-border/50">
      <CardHeader><CardTitle className="font-display">Users</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {users?.map((u) => {
          const isAdm = admins?.has(u.id);
          return (
            <div key={u.id} className="glass flex flex-wrap items-center gap-3 rounded-xl p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{u.display_name || "Unnamed"}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{u.id}</p>
              </div>
              <Badge variant="secondary">{u.credits ?? 0} credits</Badge>
              {isAdm && <Badge>admin</Badge>}
              <Button size="sm" variant="ghost" onClick={() => {
                const n = prompt(`Set credits for ${u.display_name || u.id}`, String(u.credits ?? 0));
                if (n && !isNaN(Number(n))) setCredits(u.id, Number(n));
              }}>Set credits</Button>
              <Button size="sm" variant={isAdm ? "destructive" : "outline"} onClick={() => toggleAdmin(u.id, !isAdm)}>
                {isAdm ? "Revoke" : "Make admin"}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
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

  const decide = async (id: string, status: "approved" | "rejected", plan: string, userId: string, note?: string): Promise<void> => {
    const { data: updated, error } = await supabase.from("payments").update({
      status, admin_note: note ?? null, reviewed_at: new Date().toISOString(),
    }).eq("id", id).select().maybeSingle();
    if (error) { toast.error(error.message); return; }

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
