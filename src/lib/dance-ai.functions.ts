import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const FramesArray = z.array(z.string().startsWith("data:image/")).min(1).max(24);

const AnalyzeInput = z.object({
  videoId: z.string().uuid(),
  frames: FramesArray,
});

const AnalysisSchema = z.object({
  style: z.string(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  tempo: z.string(),
  summary: z.string(),
  steps: z.array(z.object({
    name: z.string(),
    description: z.string(),
    tip: z.string(),
  })),
  keyMoves: z.array(z.string()),
  practiceTips: z.array(z.string()),
});

const EvaluateInput = z.object({
  practiceVideoId: z.string().uuid(),
  referenceVideoId: z.string().uuid(),
  practiceFrames: FramesArray,
  referenceFrames: FramesArray,
});

const EvaluationSchema = z.object({
  scores: z.object({
    timing: z.number(),
    accuracy: z.number(),
    energy: z.number(),
    posture: z.number(),
    overall: z.number(),
  }),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  summary: z.string(),
});

const AI_COST = 10;

function toImageParts(frames: string[]) {
  return frames.map((url) => ({ type: "image" as const, image: url }));
}

// Plan A → Plan B fallback list. If a call to model[0] fails, we automatically
// retry with model[1], etc. Keeps customers from hitting hard failures when
// one provider hiccups.
const FALLBACK_MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-3.5-flash",
  "openai/gpt-5-mini",
] as const;

function getGateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createLovableAiGatewayProvider(key);
}

export async function runWithFallback<T>(
  fn: (modelId: string) => Promise<T>,
): Promise<{ result: T; modelUsed: string }> {
  let lastError: unknown = null;
  for (const modelId of FALLBACK_MODELS) {
    try {
      const result = await fn(modelId);
      return { result, modelUsed: modelId };
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message.toLowerCase() : "";
      // Don't waste fallbacks on user errors (credits, auth, validation)
      if (msg.includes("402") || msg.includes("credits exhausted") || msg.includes("unauthorized")) {
        throw error;
      }
      // Keep going to next model
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All AI models failed");
}

function humanizeError(error: unknown): Error {
  if (error instanceof Error) {
    const msg = error.message ?? "";
    const lower = msg.toLowerCase();
    // Match "rate limit"/"rate-limit"/"ratelimit" — NOT the substring "rate" inside "generated"
    if (msg.includes("429") || /rate[-\s]?limit|too many requests/i.test(msg)) {
      return new Error("AI is busy right now. Try again in a moment.");
    }
    if (msg.includes("402") || lower.includes("credits exhausted") || lower.includes("payment required")) {
      return new Error("AI credits exhausted. Please upgrade or wait for the next reset.");
    }
    if (NoObjectGeneratedError.isInstance(error)) {
      return new Error("AI response couldn't be parsed. Try again — using clearer frames helps.");
    }
    // Surface the real error so customers/support can act on it
    return new Error(msg || "Something went wrong");
  }
  return new Error("Something went wrong");
}

export const analyzeDance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalyzeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: video, error: vErr } = await supabase
      .from("videos").select("*").eq("id", data.videoId).eq("user_id", userId).maybeSingle();
    if (vErr || !video) throw new Error("Video not found");

    const { error: cErr } = await supabase.rpc("consume_credits", {
      _user_id: userId,
      _amount: AI_COST,
    });
    if (cErr) throw new Error(cErr.message);

    await supabase.from("videos").update({ status: "processing" }).eq("id", video.id);

    const gateway = getGateway();
    try {
      const { result: output, modelUsed } = await runWithFallback(async (modelId) => {
        const { output } = await generateText({
          model: gateway(modelId),
          output: Output.object({ schema: AnalysisSchema }),
          system:
            "You are an expert dance coach. Analyze frames from a dance video and produce a structured beginner-friendly lesson breakdown. Be concise, energetic and specific. Steps should be sequential moves you can see across the frames. Return valid JSON only matching the schema.",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: `Video title: ${video.title}. Analyze these ${data.frames.length} frames (in time order) and return the lesson.` },
                ...toImageParts(data.frames),
              ],
            },
          ],
        });
        return output;
      });

      await supabase.from("videos").update({
        analysis: { ...output, _model: modelUsed },
        status: "analyzed",
      }).eq("id", video.id);

      return { ok: true, analysis: output, modelUsed };
    } catch (error) {
      const fallback = NoObjectGeneratedError.isInstance(error) ? (error as { text?: string }).text ?? null : null;
      await supabase.from("videos").update({
        status: "failed",
        analysis: fallback ? { raw: fallback } : null,
      }).eq("id", video.id);
      throw humanizeError(error);
    }
  });

export const evaluateDance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EvaluateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: practice } = await supabase.from("videos").select("*")
      .eq("id", data.practiceVideoId).eq("user_id", userId).maybeSingle();
    const { data: reference } = await supabase.from("videos").select("*")
      .eq("id", data.referenceVideoId).eq("user_id", userId).maybeSingle();
    if (!practice || !reference) throw new Error("Videos not found");

    const { error: cErr } = await supabase.rpc("consume_credits", {
      _user_id: userId,
      _amount: AI_COST,
    });
    if (cErr) throw new Error(cErr.message);

    await supabase.from("videos").update({ status: "processing" }).eq("id", practice.id);

    const model = getModel();
    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: EvaluationSchema }),
        system:
          "You are a strict but encouraging dance judge. Compare the student's practice against the reference dance. Score each dimension from 0 to 100 (overall is the weighted average). Be specific about what matched and what to fix. Keep feedback concise and actionable. Return valid JSON only matching the schema.",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `Reference dance: ${reference.title}. ${data.referenceFrames.length} frames follow (time order).` },
              ...toImageParts(data.referenceFrames),
              { type: "text", text: `Student's practice: ${practice.title}. ${data.practiceFrames.length} frames follow (time order).` },
              ...toImageParts(data.practiceFrames),
            ],
          },
        ],
      });

      const overall = Math.max(0, Math.min(100, Math.round(output.scores.overall)));

      await supabase.from("videos").update({
        feedback: output,
        score: overall,
        status: "analyzed",
      }).eq("id", practice.id);

      return { ok: true, evaluation: output };
    } catch (error) {
      await supabase.from("videos").update({ status: "failed" }).eq("id", practice.id);
      throw humanizeError(error);
    }
  });
