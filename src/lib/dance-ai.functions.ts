import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const FramesArray = z.array(z.string().startsWith("data:image/")).min(1).max(10);

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

function toImageParts(frames: string[]) {
  return frames.map((url) => ({ type: "image" as const, image: url }));
}

function getModel() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const gateway = createLovableAiGatewayProvider(key);
  return gateway("google/gemini-2.5-flash");
}

export const analyzeDance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalyzeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: video, error: vErr } = await supabase
      .from("videos").select("*").eq("id", data.videoId).eq("user_id", userId).maybeSingle();
    if (vErr || !video) throw new Error("Video not found");

    await supabase.from("videos").update({ status: "processing" }).eq("id", video.id);

    const model = getModel();
    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: AnalysisSchema }),
        messages: [
          {
            role: "system",
            content:
              "You are an expert dance coach. Analyze the frames from a dance video and produce a structured beginner-friendly lesson breakdown. Be concise, energetic and specific. Steps should be sequential moves you can see across the frames.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Video title: ${video.title}. Analyze these frames and return the lesson.` },
              ...toImageParts(data.frames),
            ],
          },
        ],
      });

      await supabase.from("videos").update({
        analysis: output,
        status: "analyzed",
      }).eq("id", video.id);

      return { ok: true, analysis: output };
    } catch (error) {
      const fallback = NoObjectGeneratedError.isInstance(error) ? error.text : null;
      await supabase.from("videos").update({
        status: "failed",
        analysis: fallback ? { raw: fallback } : null,
      }).eq("id", video.id);
      throw error instanceof Error ? error : new Error("Analysis failed");
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

    await supabase.from("videos").update({ status: "processing" }).eq("id", practice.id);

    const model = getModel();
    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: EvaluationSchema }),
        messages: [
          {
            role: "system",
            content:
              "You are a strict but encouraging dance judge. Compare the student's practice against the reference dance. Score each dimension from 0 to 100 (overall is the weighted average). Be specific about what matched and what to fix. Keep feedback concise and actionable.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Reference dance: ${reference.title}. Frames follow.` },
              ...toImageParts(data.referenceFrames),
              { type: "text", text: `Student's practice: ${practice.title}. Frames follow.` },
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
      throw error instanceof Error ? error : new Error("Evaluation failed");
    }
  });
