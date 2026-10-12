import OpenAI from "openai";
import { Router, type IRouter } from "express";
import { SendChatMessageBody } from "@workspace/api-zod";

const router: IRouter = Router();
let openai: OpenAI | undefined;

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) return null;

  openai ??= new OpenAI({ apiKey });
  return openai;
}

router.post("/openai/chat", async (req, res): Promise<void> => {
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please send a valid chat message." });
    return;
  }

  const latestMessage = parsed.data.messages.at(-1);
  if (latestMessage?.role !== "user") {
    res.status(400).json({ error: "The latest message must be from you." });
    return;
  }

  const client = getOpenAIClient();
  if (!client) {
    res.status(503).json({ error: "The AI service is not configured." });
    return;
  }

  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    const stream = await client.chat.completions.create(
      {
        model: "gpt-5-mini",
        max_completion_tokens: 8192,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful, thoughtful AI assistant. Give clear, accurate answers. Be concise by default, and explain details when they are useful.",
          },
          ...parsed.data.messages,
        ],
        stream: true,
      },
      { signal: controller.signal },
    );

    res.status(200);
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (typeof content === "string" && content.length > 0) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    if (!res.destroyed) {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    }
  } catch (error) {
    if (controller.signal.aborted || res.destroyed) return;

    req.log.error(
      {
        message:
          error instanceof Error ? error.message : "Unknown AI service error",
      },
      "AI chat request failed",
    );

    if (
      error instanceof Error &&
      /no credits remaining/i.test(error.message)
    ) {
      res.status(402).json({
        error:
          "The OpenAI API account has no credits remaining. Add API credits in OpenAI billing, then try again.",
      });
      return;
    }

    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({ error: "The assistant could not finish replying. Please try again." })}\n\n`,
      );
      res.end();
      return;
    }

    res.status(502).json({
      error: "The assistant could not reply right now. Please try again.",
    });
  }
});

export default router;
