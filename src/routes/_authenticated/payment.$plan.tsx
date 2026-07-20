import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PLANS, PAYMENT_INFO, type PlanId } from "@/lib/plans";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Copy, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/payment/$plan")({
  head: () => ({ meta: [{ title: "Complete payment — DanceAI" }] }),
  component: PaymentPage,
});

const txSchema = z.string().trim().min(4, "Transaction ID is too short").max(64);

function PaymentPage() {
  const { plan } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const planId = plan as PlanId;
  const p = PLANS[planId];
  const reference = useMemo(() => {
    const short = (user?.id ?? "guest").replace(/-/g, "").slice(0, 6).toUpperCase();
    return `DAI-${planId.toUpperCase()}-${short}`;
  }, [user, planId]);

  const [tx, setTx] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  if (!p) {
    return <div className="text-sm text-muted-foreground">Unknown plan. <Link to="/plans" className="underline">Back to plans</Link></div>;
  }

  const copy = async (label: string, val: string) => {
    await navigator.clipboard.writeText(val);
    setCopied(label);
    setTimeout(() => setCopied(null), 1200);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = txSchema.safeParse(tx);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    try {
      let screenshot_path: string | null = null;
      if (file) {
        if (file.size > 10 * 1024 * 1024) throw new Error("Screenshot must be under 10MB");
        const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error } = await supabase.storage.from("payment-screenshots").upload(path, file, {
          contentType: file.type, upsert: false,
        });
        if (error) throw error;
        screenshot_path = path;
      }
      const { error: dbErr } = await supabase.from("payments").insert({
        user_id: user.id,
        plan: planId,
        amount: p.price,
        currency: p.currency,
        reference,
        transaction_id: parsed.data,
        screenshot_path,
        status: "pending",
      });
      if (dbErr) throw dbErr;

      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "Payment submitted",
        body: `Your ${p.name} payment is pending review.`,
      });

      toast.success("Payment submitted for review");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "Submission failed");
    } finally {
      setBusy(false);
    }
  };

  const rows: Array<[string, string]> = [
    ["Mobile Money Number", PAYMENT_INFO.number],
    ["Account Name", PAYMENT_INFO.accountName],
    ["Amount", `${p.currency} ${p.price}`],
    ["Reference", reference],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Pay for {p.name}</h1>
        <p className="text-sm text-muted-foreground">
          Send payment via {PAYMENT_INFO.provider}, then submit the transaction ID below.
        </p>
      </header>

      <Card className="glass border-border/50">
        <CardHeader><CardTitle className="font-display">Payment instructions</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y divide-border/50">
            {rows.map(([label, val]) => (
              <li key={label} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="truncate font-mono text-sm">{val}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => copy(label, val)}>
                  {copied === label ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Include the reference so we can match your payment.
          </p>
        </CardContent>
      </Card>

      <Card className="glass border-border/50">
        <CardHeader><CardTitle className="font-display">Confirm payment</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="tx">Transaction ID</Label>
              <Input id="tx" value={tx} onChange={(e) => setTx(e.target.value)} placeholder="From your MoMo SMS" />
            </div>
            <div>
              <Label htmlFor="screenshot">Screenshot (optional)</Label>
              <Input id="screenshot" type="file" accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <Button type="submit" disabled={busy} className="w-full glow-primary">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit for review
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
