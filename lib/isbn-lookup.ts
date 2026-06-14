import type { IsbnBookInfo } from "./isbn";
import { isValidIsbn, normalizeIsbn } from "./isbn";

export async function lookupIsbnServer(isbn: string): Promise<IsbnBookInfo | null> {
  const clean = normalizeIsbn(isbn);
  if (!isValidIsbn(clean)) return null;

  const google = await lookupGoogleBooks(clean);
  if (google) return google;

  return lookupOpenLibrary(clean);
}

async function lookupGoogleBooks(clean: string): Promise<IsbnBookInfo | null> {
  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const data = await response.json();
    const item = data.items?.[0]?.volumeInfo;
    if (!item?.title) return null;
    return {
      isbn: clean,
      title: item.title,
      author: item.authors?.join(", ") || "Unknown",
    };
  } catch {
    return null;
  }
}

async function lookupOpenLibrary(clean: string): Promise<IsbnBookInfo | null> {
  try {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const data = await response.json();
    const book = data[`ISBN:${clean}`];
    if (!book?.title) return null;
    const authors = book.authors as Array<{ name: string }> | undefined;
    return {
      isbn: clean,
      title: book.title,
      author: authors?.map((a) => a.name).join(", ") || "Unknown",
    };
  } catch {
    return null;
  }
}
