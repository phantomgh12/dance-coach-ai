import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — DanceAI" }] }),
  component: ResetPassword,
});

const pw = z.string().min(6, "At least 6 characters").max(72);

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = pw.safeParse(password);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <form onSubmit={submit} className="glass w-full max-w-sm rounded-2xl p-6 space-y-4">
        <h1 className="font-display text-xl font-bold">Set a new password</h1>
        <div>
          <Label htmlFor="new-pw">New password</Label>
          <Input id="new-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update password
        </Button>
      </form>
    </div>
  );
}
