import type { Book, BookIdentification } from "./types";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

function getApiKey(): string {
  const key = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_ANTHROPIC_API_KEY is not set");
  return key;
}

async function callAnthropic(
  system: string,
  userContent: string | Array<{ type: string; [key: string]: unknown }>
): Promise<string> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("No response from Anthropic");
  return text;
}

function parseJsonResponse<T>(text: string): T {
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(cleaned) as T;
}

function applyRecommendation(midpoint: number): "SELL" | "DONATE" {
  return midpoint >= 10 ? "SELL" : "DONATE";
}

const IDENTIFY_SYSTEM = `You are a book identification and valuation expert. Analyze the book and return ONLY valid JSON with these fields:
- title (string)
- author (string)
- category (string, e.g. Fiction, Non-Fiction, Textbook, Children's, etc.)
- estimated_value (string, e.g. "$5-$15")
- estimated_midpoint (number, dollar amount midpoint of estimated range)
- recommendation ("SELL" or "DONATE" — books with midpoint $10+ are SELL, under $10 are DONATE)
- rationale (string, brief explanation of value and recommendation)

Return ONLY the JSON object, no markdown.`;

export async function identifyBookFromImage(
  imageBase64: string,
  mediaType: string,
  condition?: string
): Promise<BookIdentification> {
  const conditionNote = condition ? ` The book condition is: ${condition}.` : "";
  const text = await callAnthropic(IDENTIFY_SYSTEM, [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: imageBase64,
      },
    },
    {
      type: "text",
      text: `Identify this book and estimate its resale/donation value.${conditionNote}`,
    },
  ]);

  const result = parseJsonResponse<BookIdentification>(text);
  result.recommendation = applyRecommendation(result.estimated_midpoint);
  return result;
}

export async function identifyBookFromText(
  title: string,
  author: string,
  condition: string
): Promise<BookIdentification> {
  const text = await callAnthropic(
    IDENTIFY_SYSTEM,
    `Identify and value this book:
Title: ${title}
Author: ${author}
Condition: ${condition}

If title/author are partial, make your best identification.`
  );

  const result = parseJsonResponse<BookIdentification>(text);
  result.recommendation = applyRecommendation(result.estimated_midpoint);
  return result;
}

export async function generateListingCopy(book: Book): Promise<string> {
  return callAnthropic(
    `You generate listing copy for used books. Create polished copy for eBay, Facebook Marketplace, AbeBooks (if valuable/rare), and a donation receipt note (if donating). Format with clear section headers.`,
    `Generate listing copy for this book:
Title: ${book.title}
Author: ${book.author ?? "Unknown"}
Category: ${book.category ?? "General"}
Condition: ${book.condition ?? "Unknown"}
Estimated Value: ${book.estimated_value ?? "N/A"}
Recommendation: ${book.recommendation}
Rationale: ${book.rationale ?? ""}`
  );
}
