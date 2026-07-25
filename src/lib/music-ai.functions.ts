// Server functions for the vocal algorithm — no LLM. Client computes features
// from the audio buffer, we validate, charge credits, and (optionally) accept
// as training data.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const AI_COST = 10;

const AnalysisSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  scores: z.object({
    pitch: z.number(), timing: z.number(), breath: z.number(),
    tone: z.number(), expression: z.number(), overall: z.number(),
  }),
  warmups: z.array(z.object({
    name: z.string(), instruction: z.string(), durationMinutes: z.number(),
  })),
  practiceTips: z.array(z.string()),
  _algo: z.string(),
  _features: z.any().optional(),
}).passthrough();

export type VocalAnalysisResult = z.infer<typeof AnalysisSchema>;

export const analyzeVocal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    title: z.string().min(1).max(200),
    genre: z.string().max(60).optional(),
    analysis: AnalysisSchema,
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.analysis.warmups.length) throw new Error("Analysis was empty");
    const { error: cErr } = await supabase.rpc("consume_credits", { _user_id: userId, _amount: AI_COST });
    if (cErr) throw new Error(cErr.message);
    return { ok: true, analysis: data.analysis, modelUsed: "algo/v1-audio", title: data.title };
  });

export const submitVocalTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    features: z.record(z.string(), z.any()),
    labels: z.object({
      pitch: z.number().min(0).max(100),
      timing: z.number().min(0).max(100),
      breath: z.number().min(0).max(100),
      tone: z.number().min(0).max(100),
      expression: z.number().min(0).max(100),
    }),
    effort: z.number().int().min(1).max(10),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const f = data.features as { durationSec?: number; avgRms?: number };

    const reasons: string[] = [];
    if (!f.durationSec || (f.durationSec ?? 0) < 3) reasons.push("Clip too short (<3s)");
    if ((f.avgRms ?? 0) < 0.005) reasons.push("Clip is silent or too quiet");

    // Dedup vs recent
    const { data: recent } = await supabase
      .from("algo_training_samples")
      .select("features")
      .eq("user_id", userId).eq("kind", "vocal")
      .order("created_at", { ascending: false }).limit(5);
    if (recent?.some((r) => {
      const rf = r.features as { avgRms?: number; durationSec?: number };
      return Math.abs((rf.avgRms ?? 0) - (f.avgRms ?? 0)) < 0.001
          && Math.abs((rf.durationSec ?? 0) - (f.durationSec ?? 0)) < 0.5;
    })) reasons.push("Too similar to a recent submission");

    const accepted = reasons.length === 0;
    const quality = accepted ? Math.min(1, 0.35 + (data.effort / 10) * 0.5) : 0;

    const { error: insErr } = await supabase.from("algo_training_samples").insert({
      user_id: userId, kind: "vocal",
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
