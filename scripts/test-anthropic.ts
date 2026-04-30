import Anthropic from "@anthropic-ai/sdk";

async function test() {
  const key = process.env.ANTHRPIC_API_KEY;
  console.log("Key present:", !!key);
  console.log("Key length:", key?.length);
  console.log("Key prefix:", key?.slice(0, 16) + "...");
  console.log("Has \\r:", key?.includes("\r"));
  console.log("Has \\n:", key?.includes("\n"));
  console.log(
    "Char codes (last 3):",
    key
      ?.slice(-3)
      .split("")
      .map((c) => c.charCodeAt(0)),
  );

  // Strip any accidental whitespace and try with explicit key
  const cleanKey = key?.trim();
  const client = new Anthropic({ apiKey: cleanKey });
  console.log("Sending test message...");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 32,
    messages: [{ role: "user", content: "Reply with OK." }],
  });

  console.log(
    "Response:",
    response.content[0].type === "text"
      ? response.content[0].text
      : response.content[0],
  );
  console.log("Anthropic API key is working.");
}

test().catch((err) => {
  console.error("Failed:", err.message ?? err);
  process.exit(1);
});
