import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { runWithFallback } from "./dance-ai.functions";

const AI_COST = 10;

const AnalyzeInput = z.object({
  title: z.string().min(1).max(200),
  genre: z.string().max(60).optional(),
  lyricsOrNotes: z.string().max(4000).optional(),
  // Optional audio: data URL of a short clip (client should keep under ~4MB)
  audioDataUrl: z.string().startsWith("data:audio/").optional(),
  audioMime: z.string().max(50).optional(),
});

const VocalSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  scores: z.object({
    pitch: z.number(),
    timing: z.number(),
    breath: z.number(),
    tone: z.number(),
    expression: z.number(),
    overall: z.number(),
  }),
  warmups: z.array(z.object({
    name: z.string(),
    instruction: z.string(),
    durationMinutes: z.number(),
  })),
  practiceTips: z.array(z.string()),
});

function humanize(error: unknown): Error {
  if (error instanceof Error) {
    const msg = error.message ?? "";
    if (msg.includes("429") || /rate[-\s]?limit|too many requests/i.test(msg)) {
      return new Error("AI is busy right now. Try again in a moment.");
    }
    if (msg.includes("402") || msg.toLowerCase().includes("credits exhausted")) {
      return new Error("AI credits exhausted. Please upgrade or wait for reset.");
    }
    if (NoObjectGeneratedError.isInstance(error)) {
      return new Error("AI response couldn't be parsed. Try again.");
    }
    return new Error(msg || "Something went wrong");
  }
  return new Error("Something went wrong");
}

function getGateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createLovableAiGatewayProvider(key);
}

export const analyzeVocal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalyzeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { error: cErr } = await supabase.rpc("consume_credits", {
      _user_id: userId,
      _amount: AI_COST,
    });
    if (cErr) throw new Error(cErr.message);

    const gateway = getGateway();

    const userContent: Array<
      | { type: "text"; text: string }
      | { type: "file"; data: string; mediaType: string }
    > = [
      {
        type: "text",
        text: `Song / performance title: ${data.title}${data.genre ? ` (genre: ${data.genre})` : ""}.\n\n${
          data.lyricsOrNotes ? `Notes / lyrics from the singer:\n${data.lyricsOrNotes}\n\n` : ""
        }${
          data.audioDataUrl
            ? "An audio clip of the performance is attached. Analyze pitch, timing, breath support, tone, and expression from what you can hear."
            : "No audio was uploaded. Give general vocal coaching based on the song, notes, and best practices for the genre — clearly state you did not hear the singer."
        }`,
      },
    ];

    if (data.audioDataUrl) {
      // Extract the mime from the data URL header (e.g. data:audio/mpeg;base64,...)
      const headerMatch = /^data:([^;,]+)/.exec(data.audioDataUrl);
      const mime = data.audioMime || headerMatch?.[1] || "audio/mpeg";
      userContent.push({ type: "file", data: data.audioDataUrl, mediaType: mime });
    }

    try {
      const { result: output, modelUsed } = await runWithFallback(async (modelId) => {
        const { output } = await generateText({
          model: gateway(modelId),
          output: Output.object({ schema: VocalSchema }),
          system:
            "You are an encouraging but honest vocal coach. Give structured feedback on the singer's performance covering pitch, timing, breath, tone, and expression. Score each dimension 0-100 (overall is the weighted average). Recommend 3-5 concrete warmups. Return valid JSON only matching the schema.",
          messages: [{ role: "user", content: userContent }],
        });
        return output;
      });

      return { ok: true, analysis: output, modelUsed };
    } catch (error) {
      throw humanize(error);
    }
  });
