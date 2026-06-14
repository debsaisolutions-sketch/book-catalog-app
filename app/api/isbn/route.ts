import { NextRequest, NextResponse } from "next/server";
import { isValidIsbn, normalizeIsbn, type IsbnBookInfo } from "@/lib/isbn";

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
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`;
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Open Library error (${response.status})` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const book = data[`ISBN:${clean}`];
    if (!book?.title) {
      return NextResponse.json({ error: "ISBN not found" }, { status: 404 });
    }

    const authors = book.authors as Array<{ name: string }> | undefined;
    const result: IsbnBookInfo = {
      isbn: clean,
      title: book.title,
      author: authors?.map((a) => a.name).join(", ") || "Unknown",
    };

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "ISBN lookup failed" }, { status: 500 });
  }
}
