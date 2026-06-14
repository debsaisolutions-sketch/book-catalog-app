import { createClient } from "@supabase/supabase-js";
import type { Book } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function fetchBooks(): Promise<Book[]> {
  const { data, error } = await supabase
    .from("book_catalog")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Book[];
}

export async function insertBook(
  book: Omit<Book, "id" | "created_at">
): Promise<Book> {
  const { data, error } = await supabase
    .from("book_catalog")
    .insert(book)
    .select()
    .single();

  if (error) throw error;
  return data as Book;
}

export async function updateBookNote(
  id: string,
  condition_note: string
): Promise<void> {
  const { error } = await supabase
    .from("book_catalog")
    .update({ condition_note })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteBook(id: string): Promise<void> {
  const { error } = await supabase.from("book_catalog").delete().eq("id", id);
  if (error) throw error;
}
