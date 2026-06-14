import type { Book, BookIdentification } from "./types";

async function apiCall<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/anthropic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data as T;
}

export async function identifyBookFromImage(
  imageBase64: string,
  mediaType: string,
  condition?: string
): Promise<BookIdentification> {
  return apiCall<BookIdentification>({
    action: "identify-image",
    imageBase64,
    mediaType,
    condition,
  });
}

export async function identifyBookFromText(
  title: string,
  author: string,
  condition: string
): Promise<BookIdentification> {
  return apiCall<BookIdentification>({
    action: "identify-text",
    title,
    author,
    condition,
  });
}

export async function identifyBookFromIsbn(
  isbn: string,
  title: string,
  author: string,
  condition: string
): Promise<BookIdentification> {
  return apiCall<BookIdentification>({
    action: "identify-isbn",
    isbn,
    title,
    author,
    condition,
  });
}

export async function generateListingCopy(book: Book): Promise<string> {
  const data = await apiCall<{ copy: string }>({
    action: "generate-listing",
    book,
  });
  return data.copy;
}
