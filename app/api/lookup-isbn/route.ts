import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isValidIsbn, normalizeIsbn } from "@/lib/isbn";
import { lookupIsbnServer } from "@/lib/isbn-lookup";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

const IDENTIFY_SYSTEM = `You are a book identification and valuation expert. Return ONLY valid JSON with: title, author, category, estimated_value, estimated_midpoint (number), recommendation ("SELL" or "DONATE"), rationale. Books $10+ midpoint = SELL, under $10 = DONATE. No markdown.`;

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase server credentials are not configured");
  }
  return createClient(url, key);
}

function getAnthropicKey() {
  const key =
    process.env.ANTHROPIC_API_KEY ||
    process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;
  if (!key) throw new Error("Anthropic API key not configured");
  return key;
}

async function callAnthropic(prompt: string) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getAnthropicKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: IDENTIFY_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    throw new Error(`AI valuation failed (${response.status})`);
  }
  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("No AI response");
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match ? match[0] : cleaned);
  if (!parsed.estimated_midpoint) parsed.estimated_midpoint = 5;
  parsed.recommendation =
    parsed.estimated_midpoint >= 10 ? "SELL" : "DONATE";
  return parsed;
}

export async function POST(request: NextRequest) {
  try {
    const { isbn, condition = "Good" } = await request.json();
    const clean = normalizeIsbn(isbn);
    if (!isValidIsbn(clean)) {
      return NextResponse.json({ error: "Invalid ISBN" }, { status: 400 });
    }

    const info = await lookupIsbnServer(clean);
    if (!info) {
      return NextResponse.json({ error: "ISBN not found" }, { status: 404 });
    }

    const identification = await callAnthropic(
      `Value this book by ISBN:
ISBN: ${info.isbn}
Title: ${info.title}
Author: ${info.author}
Condition: ${condition}`
    );

    const { data, error } = await getSupabase()
      .from("book_catalog")
      .insert({
        title: identification.title || info.title,
        author: identification.author || info.author,
        category: identification.category || "General",
        estimated_value: identification.estimated_value || "$1-$10",
        estimated_midpoint: identification.estimated_midpoint,
        condition,
        condition_note: null,
        recommendation: identification.recommendation,
        rationale: identification.rationale || "",
      })
      .select()
      .single();

    if (error) throw new Error(`Database save failed: ${error.message}`);
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
