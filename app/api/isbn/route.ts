import { NextRequest, NextResponse } from "next/server";
import { isValidIsbn, normalizeIsbn, type IsbnBookInfo } from "@/lib/isbn";

async function lookupGoogleBooks(clean: string): Promise<IsbnBookInfo | null> {
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
}

async function lookupOpenLibrary(clean: string): Promise<IsbnBookInfo | null> {
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
}

export async function GET(request: NextRequest) {
  const isbn = request.nextUrl.searchParams.get("isbn");
  if (!isbn) {
    return NextResponse.json({ error: "ISBN required" }, { status: 400 });
  }

  const clean = normalizeIsbn(isbn);
  if (!isValidIsbn(clean)) {
    return NextResponse.json({ error: "Invalid ISBN" }, { status: 400 });
  }

  try {
    const result =
      (await lookupGoogleBooks(clean)) ?? (await lookupOpenLibrary(clean));

    if (!result) {
      return NextResponse.json({ error: "ISBN not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "ISBN lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
