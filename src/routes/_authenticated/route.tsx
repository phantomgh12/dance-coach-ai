import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Upload as UploadIcon, Crown, History, Shield, LogOut, Menu,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CreditsBadge } from "@/components/credits-badge";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => setMobileOpen(false), [pathname]);

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles").select("role").eq("user_id", user!.id).eq("role", "admin").maybeSingle();
      return !!data;
    },
  });

  const nav = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/upload", label: "Upload", icon: UploadIcon },
    { to: "/history", label: "History", icon: History },
    { to: "/plans", label: "Plans", icon: Crown },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10" style={{ background: "var(--gradient-glow)" }} />

      <header className="sticky top-0 z-40 border-b border-border/50 glass">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2 font-display font-bold">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary glow-primary" />
            DanceAI
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {nav.map((n) => (
              <Button key={n.to} asChild size="sm" variant={pathname === n.to ? "secondary" : "ghost"}>
                <Link to={n.to}><n.icon className="mr-1.5 h-4 w-4" />{n.label}</Link>
              </Button>
            ))}
            {isAdmin && (
              <Button asChild size="sm" variant={pathname === "/admin" ? "secondary" : "ghost"}>
                <Link to="/admin"><Shield className="mr-1.5 h-4 w-4" />Admin</Link>
              </Button>
            )}
          </nav>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Sign out</span>
            </Button>
            <Button size="sm" variant="outline" className="md:hidden" onClick={() => setMobileOpen((v) => !v)}>
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {mobileOpen && (
          <div className="md:hidden border-t border-border/50 px-4 py-2 grid grid-cols-2 gap-2">
            {nav.map((n) => (
              <Button key={n.to} asChild size="sm" variant={pathname === n.to ? "secondary" : "ghost"} className="justify-start">
                <Link to={n.to}><n.icon className="mr-1.5 h-4 w-4" />{n.label}</Link>
              </Button>
            ))}
            {isAdmin && (
              <Button asChild size="sm" variant="ghost" className="justify-start">
                <Link to="/admin"><Shield className="mr-1.5 h-4 w-4" />Admin</Link>
              </Button>
            )}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
