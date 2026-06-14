import { NextRequest, NextResponse } from "next/server";
import type { Book, BookIdentification } from "@/lib/types";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

const IDENTIFY_SYSTEM = `You are a book identification and valuation expert. Analyze the book and return ONLY valid JSON with these fields:
- title (string)
- author (string)
- category (string, e.g. Fiction, Non-Fiction, Textbook, Children's, etc.)
- estimated_value (string, e.g. "$5-$15")
- estimated_midpoint (number, dollar amount midpoint of estimated range)
- recommendation ("SELL" or "DONATE" — books with midpoint $10+ are SELL, under $10 are DONATE)
- rationale (string, brief explanation of value and recommendation)

Return ONLY the JSON object, no markdown.`;

function getApiKey(): string {
  const key =
    process.env.ANTHROPIC_API_KEY ||
    process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;
  if (!key) throw new Error("Anthropic API key is not configured");
  return key;
}

function parseJsonResponse<T>(text: string): T {
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error("Could not parse AI response");
  }
}

function validateIdentification(result: BookIdentification): BookIdentification {
  if (!result.title?.trim()) throw new Error("AI could not identify the book title");
  if (typeof result.estimated_midpoint !== "number" || isNaN(result.estimated_midpoint)) {
    result.estimated_midpoint = 5;
  }
  if (!result.estimated_value) result.estimated_value = "$1-$10";
  if (!result.author) result.author = "Unknown";
  if (!result.category) result.category = "General";
  if (!result.rationale) result.rationale = "Estimated based on typical resale market.";
  result.recommendation = result.estimated_midpoint >= 10 ? "SELL" : "DONATE";
  return result;
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "identify-text") {
      const { title, author, condition } = body;
      const text = await callAnthropic(
        IDENTIFY_SYSTEM,
        `Identify and value this book:
Title: ${title}
Author: ${author}
Condition: ${condition}

If title/author are partial, make your best identification.`
      );
      return NextResponse.json(validateIdentification(parseJsonResponse<BookIdentification>(text)));
    }

    if (action === "identify-isbn") {
      const { isbn, title, author, condition } = body;
      const text = await callAnthropic(
        IDENTIFY_SYSTEM,
        `Identify and value this book by ISBN:
ISBN: ${isbn}
Title: ${title}
Author: ${author}
Condition: ${condition}

Use the ISBN and title/author to determine accurate edition and current resale value.`
      );
      return NextResponse.json(validateIdentification(parseJsonResponse<BookIdentification>(text)));
    }

    if (action === "identify-image") {
      const { imageBase64, mediaType, condition } = body;
      const conditionNote = condition ? ` The book condition is: ${condition}.` : "";
      const text = await callAnthropic(IDENTIFY_SYSTEM, [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType, data: imageBase64 },
        },
        {
          type: "text",
          text: `Identify this book and estimate its resale/donation value.${conditionNote}`,
        },
      ]);
      return NextResponse.json(validateIdentification(parseJsonResponse<BookIdentification>(text)));
    }

    if (action === "generate-listing") {
      const book = body.book as Book;
      const copy = await callAnthropic(
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
      return NextResponse.json({ copy });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
