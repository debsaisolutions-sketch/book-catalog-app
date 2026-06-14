import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Book } from "@/lib/types";

function getSupabase() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase server credentials are not configured");
  }
  return createClient(url, key);
}

export async function GET() {
  try {
    const { data, error } = await getSupabase()
      .from("book_catalog")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load books";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const book = (await request.json()) as Omit<Book, "id" | "created_at">;
    const { data, error } = await getSupabase()
      .from("book_catalog")
      .insert(book)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save book";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, condition_note } = await request.json();
    const { error } = await getSupabase()
      .from("book_catalog")
      .update({ condition_note })
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update note";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    const { error } = await getSupabase()
      .from("book_catalog")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete book";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
