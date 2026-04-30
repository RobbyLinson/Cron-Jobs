import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export type Classification =
  | "application_confirmation"
  | "rejection"
  | "interview_invite"
  | "offer"
  | "recruiter_outreach"
  | "other";

export interface ClassifyResult {
  messageId: string;
  classification: Classification;
}

export interface ExtractResult {
  company: string;
  role: string | null;
  location: string | null;
  classification: Classification;
  confidence: number;
  reasoning: string;
}

// Pass 1 — cheap batch classification using subject + snippet only
export async function classifyMessages(
  messages: { id: string; subject: string; snippet: string; fromAddress: string }[]
): Promise<ClassifyResult[]> {
  if (messages.length === 0) return [];

  const list = messages
    .map(
      (m, i) =>
        `[${i}] FROM: ${m.fromAddress}\nSUBJECT: ${m.subject}\nSNIPPET: ${m.snippet}`
    )
    .join("\n\n---\n\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system:
      "Classify emails related to job applications. For each email return one label: " +
      "application_confirmation, rejection, interview_invite, offer, recruiter_outreach, or other. " +
      "Only label as job-related when clearly about a specific job application or recruiter contact. " +
      "Return a JSON array of objects with {index, classification}. No explanation.",
    messages: [
      {
        role: "user",
        content: `Classify these ${messages.length} emails:\n\n${list}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "[]";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return messages.map((m) => ({ messageId: m.id, classification: "other" as Classification }));
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { index: number; classification: Classification }[];
    return parsed.map((p) => ({ messageId: messages[p.index].id, classification: p.classification }));
  } catch {
    return messages.map((m) => ({ messageId: m.id, classification: "other" as Classification }));
  }
}

const EXTRACT_SYSTEM =
  "You are a precise data extractor for job application emails. " +
  "Extract structured information and call extract_job_data. " +
  "Be conservative with confidence — only exceed 0.8 when all fields are explicit and unambiguous.";

// Pass 2 — structured extraction with tool use + cached system prompt
export async function extractJobData(message: {
  subject: string;
  fromAddress: string;
  body: string;
  snippet: string;
}): Promise<ExtractResult | null> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: EXTRACT_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: "extract_job_data",
        description: "Extract structured job application data from an email",
        input_schema: {
          type: "object",
          properties: {
            company: { type: "string" },
            role: { type: "string" },
            location: { type: "string" },
            classification: {
              type: "string",
              enum: [
                "application_confirmation",
                "rejection",
                "interview_invite",
                "offer",
                "recruiter_outreach",
                "other",
              ],
            },
            confidence: { type: "number" },
            reasoning: { type: "string" },
          },
          required: ["company", "classification", "confidence", "reasoning"],
        },
      },
    ],
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: `FROM: ${message.fromAddress}\nSUBJECT: ${message.subject}\n\n${message.body.slice(0, 4000)}`,
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return null;

  const input = toolUse.input as {
    company: string;
    role?: string;
    location?: string;
    classification: Classification;
    confidence: number;
    reasoning: string;
  };

  return {
    company: input.company,
    role: input.role ?? null,
    location: input.location ?? null,
    classification: input.classification,
    confidence: input.confidence,
    reasoning: input.reasoning,
  };
}
