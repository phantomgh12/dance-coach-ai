import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sparkles, Activity, Trophy, Play, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10" style={{ background: "var(--gradient-glow)" }} />

      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold">
          <span className="inline-block h-3 w-3 rounded-full bg-primary glow-primary" />
          DanceAI
        </Link>
        <nav className="flex items-center gap-2">
          {user ? (
            <Button asChild size="sm"><Link to="/dashboard">Dashboard</Link></Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm"><Link to="/auth">Sign in</Link></Button>
              <Button asChild size="sm"><Link to="/auth">Get started</Link></Button>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-5 pt-16 pb-24 text-center sm:pt-24">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI pose analysis · Skeleton coaching · Practice scoring
        </div>
        <h1 className="font-display text-5xl font-bold leading-[1.05] sm:text-7xl">
          Learn any dance <br />
          <span className="gradient-text">from a single video.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
          Upload a clip. Our AI maps the moves into a skeleton, breaks the choreography into lessons, and grades your practice frame by frame.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="glow-primary">
            <Link to={user ? "/dashboard" : "/auth"}>
              Start learning <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/plans"><Play className="mr-1 h-4 w-4" /> View plans</Link>
          </Button>
        </div>
      </section>

      {/* Feature strip */}
      <section className="mx-auto grid max-w-5xl grid-cols-1 gap-4 px-5 pb-24 sm:grid-cols-3">
        {[
          { icon: Activity, title: "Pose skeleton", body: "MediaPipe + MoveNet extract 33 landmarks per frame." },
          { icon: Sparkles, title: "AI dance teacher", body: "Steps broken down: footwork, arms, timing, rhythm." },
          { icon: Trophy, title: "Practice scoring", body: "Compare your run against the source — get graded." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="glass rounded-2xl p-6">
            <Icon className="h-6 w-6 text-primary" />
            <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border/50 px-5 py-6 text-center text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <span>© {new Date().getFullYear()} DanceAI</span>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
        </div>
      </footer>
    </div>
  );
}
