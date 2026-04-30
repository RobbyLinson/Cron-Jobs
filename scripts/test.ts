import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  // defaults to process.env["ANTHROPIC_API_KEY"]
  apiKey: "I Just Ran This with my key pasted here and it worked",
});

const msg = await anthropic.messages.create({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 20000,
  temperature: 1,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Reply to this message to verify that the account is valid",
        },
      ],
    },
  ],
  thinking: {
    type: "disabled",
  },
});
console.log(msg);
