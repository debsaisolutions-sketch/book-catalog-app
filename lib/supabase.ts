import type { Book } from "./types";

async function apiJson<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data as T;
}

export async function fetchBooks(): Promise<Book[]> {
  return apiJson<Book[]>("/api/books");
}

export async function insertBook(
  book: Omit<Book, "id" | "created_at">
): Promise<Book> {
  return apiJson<Book>("/api/books", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(book),
  });
}

export async function updateBookNote(
  id: string,
  condition_note: string
): Promise<void> {
  await apiJson("/api/books", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, condition_note }),
  });
}

export async function deleteBook(id: string): Promise<void> {
  await apiJson(`/api/books?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
