// Server functions: save + charge credits for the client-side dance algorithm.
// No LLM calls — analysis is computed in the browser and submitted here.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const AI_COST = 10;

const AnalysisPayload = z.object({
  style: z.string(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  tempo: z.string(),
  summary: z.string(),
  steps: z.array(z.object({ name: z.string(), description: z.string(), tip: z.string() })),
  keyMoves: z.array(z.string()),
  practiceTips: z.array(z.string()),
  _algo: z.string(),
  _features: z.any().optional(),
});

const EvaluationPayload = z.object({
  scores: z.object({
    timing: z.number(), accuracy: z.number(), energy: z.number(),
    posture: z.number(), overall: z.number(),
  }),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  summary: z.string(),
  _algo: z.string(),
});

type Json = Record<string, unknown>;

export const analyzeDance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ videoId: z.string().uuid(), analysis: AnalysisPayload }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: video, error } = await supabase
      .from("videos").select("*").eq("id", data.videoId).eq("user_id", userId).maybeSingle();
    if (error || !video) throw new Error("Video not found");

    // Sanity filter — reject empty analyses
    if (!data.analysis.steps.length) throw new Error("Analysis was empty — try re-uploading a clearer clip.");

    const { error: cErr } = await supabase.rpc("consume_credits", { _user_id: userId, _amount: AI_COST });
    if (cErr) throw new Error(cErr.message);

    await supabase.from("videos").update({
      analysis: data.analysis, status: "analyzed",
    }).eq("id", video.id);

    return { ok: true, analysis: data.analysis, modelUsed: "algo/v1-motion" };
  });

export const evaluateDance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      practiceVideoId: z.string().uuid(),
      referenceVideoId: z.string().uuid(),
      evaluation: EvaluationPayload,
    }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: practice } = await supabase.from("videos").select("*")
      .eq("id", data.practiceVideoId).eq("user_id", userId).maybeSingle();
    if (!practice) throw new Error("Practice not found");

    const { error: cErr } = await supabase.rpc("consume_credits", { _user_id: userId, _amount: AI_COST });
    if (cErr) throw new Error(cErr.message);

    const overall = Math.max(0, Math.min(100, Math.round(data.evaluation.scores.overall)));
    await supabase.from("videos").update({
      feedback: data.evaluation, score: overall, status: "analyzed",
    }).eq("id", practice.id);

    return { ok: true, evaluation: data.evaluation, modelUsed: "algo/v1-motion" };
  });

// Training submission — user labels a clip with their own ratings; we validate
// against the algorithm's features and award proportional credits.
export const submitDanceTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    features: z.record(z.string(), z.any()),
    labels: z.object({
      style: z.string().min(2).max(40),
      difficulty: z.enum(["beginner", "intermediate", "advanced"]),
      timing: z.number().min(0).max(100),
      accuracy: z.number().min(0).max(100),
      energy: z.number().min(0).max(100),
      posture: z.number().min(0).max(100),
    }),
    effort: z.number().int().min(1).max(10),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const f = data.features as { avgMotion?: number; motionVariance?: number; frameCount?: number };

    // Filter bad trains
    const reasons: string[] = [];
    if (!f.frameCount || (f.frameCount ?? 0) < 6) reasons.push("Not enough frames");
    if ((f.avgMotion ?? 0) < 0.01) reasons.push("No detectable motion in the clip");

    // Reject if labels contradict features (obvious outliers)
    if ((f.avgMotion ?? 0) > 0.35 && data.labels.energy < 30) reasons.push("Label 'low energy' contradicts high motion");
    if ((f.avgMotion ?? 0) < 0.05 && data.labels.energy > 80) reasons.push("Label 'high energy' contradicts near-still clip");

    // Cross-check against recent submissions (dedup)
    const { data: recent } = await supabase
      .from("algo_training_samples")
      .select("features, labels")
      .eq("user_id", userId).eq("kind", "dance")
      .order("created_at", { ascending: false })
      .limit(5);
    if (recent?.some((r) => {
      const rf = r.features as { avgMotion?: number };
      return Math.abs((rf.avgMotion ?? 0) - (f.avgMotion ?? 0)) < 0.005;
    })) reasons.push("Too similar to a recent submission");

    const accepted = reasons.length === 0;

    // Simple quality score
    const quality = accepted
      ? Math.min(1, 0.4 + (data.effort / 10) * 0.4 + Math.min(0.2, (f.motionVariance ?? 0) * 5))
      : 0;

    // Insert sample
    const { error: insErr } = await supabase.from("algo_training_samples").insert({
      user_id: userId, kind: "dance",
      features: data.features, labels: data.labels,
      quality, accepted, rejection_reason: reasons.join("; ") || null,
      effort: data.effort, credits_awarded: 0,
    });
    if (insErr) throw new Error(insErr.message);

    let awarded = 0;
    if (accepted) {
      const request = Math.max(1, Math.round(data.effort * 2 * quality));
      const { data: rewarded } = await supabase.rpc("award_training_credits", {
        _user_id: userId, _amount: request,
      });
      awarded = Number(rewarded ?? 0);
    }

    return { accepted, awarded, quality: Math.round(quality * 100), rejection: reasons };
  });
