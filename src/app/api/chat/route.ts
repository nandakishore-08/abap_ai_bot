type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type GroqError = {
  error?: {
    message?: string;
  };
};

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Add GROQ_API_KEY to your .env.local file, then restart the app." },
      { status: 503 },
    );
  }

  let body: { messages?: unknown };
  try {
    body = (await request.json()) as { messages?: unknown };
  } catch {
    return Response.json({ error: "The message request was not valid JSON." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 40) {
    return Response.json(
      { error: "Send between 1 and 40 messages to start a conversation." },
      { status: 400 },
    );
  }

  const messages: ChatMessage[] = [];
  for (const item of body.messages) {
    if (
      !item ||
      typeof item !== "object" ||
      !("role" in item) ||
      !("content" in item) ||
      (item.role !== "user" && item.role !== "assistant" && item.role !== "system") ||
      typeof item.content !== "string" ||
      !item.content.trim() ||
      item.content.length > 30_000
    ) {
      return Response.json({ error: "One of the messages is invalid or too long." }, { status: 400 });
    }

    messages.push({ role: item.role, content: item.content });
  }

  try {
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages,
        stream: true,
        temperature: 0.7,
        max_completion_tokens: 2048,
        reasoning_effort: "medium",
      }),
      cache: "no-store",
      signal: request.signal,
    });

    if (!groqResponse.ok) {
      let message = "Groq could not complete the request. Check your API key and account limits.";
      try {
        const details = (await groqResponse.json()) as GroqError;
        if (details.error?.message) message = details.error.message;
      } catch {
        // Keep the user-facing error useful if Groq does not return JSON.
      }
      return Response.json({ error: message }, { status: groqResponse.status });
    }

    if (!groqResponse.body) {
      return Response.json({ error: "Groq returned an empty response." }, { status: 502 });
    }

    return new Response(groqResponse.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch {
    return Response.json(
      { error: "Could not connect to Groq. Check your connection and try again." },
      { status: 502 },
    );
  }
}