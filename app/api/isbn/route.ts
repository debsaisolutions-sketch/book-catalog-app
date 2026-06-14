import { NextRequest, NextResponse } from "next/server";
import { isValidIsbn, normalizeIsbn } from "@/lib/isbn";
import { lookupIsbnServer } from "@/lib/isbn-lookup";

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
    const result = await lookupIsbnServer(clean);
    if (!result) {
      return NextResponse.json({ error: "ISBN not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "ISBN lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
