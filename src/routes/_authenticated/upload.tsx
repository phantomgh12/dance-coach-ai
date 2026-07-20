import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { UploadCloud, Film, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({ meta: [{ title: "Upload — DanceAI" }] }),
  component: UploadPage,
});

const ACCEPTED = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/avi", "video/mov"];
const MAX_SIZE = 500 * 1024 * 1024; // 500MB

function UploadPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_SIZE) return toast.error("File must be under 500MB");
    const okType = ACCEPTED.includes(f.type) || /\.(mp4|mov|avi|m4v)$/i.test(f.name);
    if (!okType) return toast.error("Use MP4, MOV, or AVI");
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    pickFile(e.dataTransfer.files[0]);
  }, []);

  const upload = async () => {
    if (!file || !user) return;
    const t = title.trim() || "Untitled dance";
    setBusy(true); setProgress(5);
    try {
      const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      // simulate progress since supabase-js upload doesn't stream progress by default
      const tick = setInterval(() => setProgress((p) => Math.min(90, p + 5)), 400);
      const { error: upErr } = await supabase.storage.from("dance-videos").upload(path, file, {
        cacheControl: "3600", upsert: false, contentType: file.type,
      });
      clearInterval(tick);
      if (upErr) throw upErr;
      setProgress(95);

      const { error: dbErr } = await supabase.from("videos").insert({
        user_id: user.id,
        title: t,
        file_path: path,
        file_size: file.size,
        mime_type: file.type,
        type: "source",
        status: "uploaded",
      });
      if (dbErr) throw dbErr;

      await supabase.from("notifications").insert({
        user_id: user.id, title: "Upload complete", body: `${t} is ready for analysis.`,
      });

      setProgress(100);
      toast.success("Video uploaded");
      navigate({ to: "/dashboard" });
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setBusy(false); setProgress(0);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Upload a dance</h1>
        <p className="text-sm text-muted-foreground">MP4, MOV, or AVI · up to 500MB</p>
      </header>

      <Card className="glass border-border/50">
        <CardHeader><CardTitle className="font-display">Video file</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={`flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 transition-colors ${drag ? "border-primary bg-primary/5" : "border-border"}`}
          >
            {file ? (
              <>
                <Film className="h-8 w-8 text-primary" />
                <p className="mt-3 font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </>
            ) : (
              <>
                <UploadCloud className="h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">Tap to select or drop a file</p>
                <p className="text-xs text-muted-foreground">MP4 · MOV · AVI</p>
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/x-msvideo,.mp4,.mov,.avi,.m4v"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />

          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="e.g. Amapiano intro" />
          </div>

          {busy && <Progress value={progress} />}

          <Button onClick={upload} disabled={!file || busy} className="w-full glow-primary">
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</> : "Upload video"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
