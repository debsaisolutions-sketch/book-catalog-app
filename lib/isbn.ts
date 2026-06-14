export function normalizeIsbn(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, "").toUpperCase();
}

export function isValidIsbn(isbn: string): boolean {
  const clean = normalizeIsbn(isbn);
  return clean.length === 10 || clean.length === 13;
}

export interface IsbnBookInfo {
  title: string;
  author: string;
  isbn: string;
}

export async function lookupIsbn(isbn: string): Promise<IsbnBookInfo | null> {
  const clean = normalizeIsbn(isbn);
  if (!isValidIsbn(clean)) return null;

  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ISBN lookup failed (${response.status})`);
  }

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

export type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

export function getBarcodeDetector(): BarcodeDetectorLike | null {
  if (typeof window === "undefined") return null;
  const BD = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
  if (!BD) return null;
  try {
    return new BD({ formats: ["ean_13", "ean_8", "code_128", "upc_a", "upc_e"] });
  } catch {
    return null;
  }
}

export function isbnFromBarcode(raw: string): string | null {
  const digits = raw.replace(/[^0-9Xx]/g, "");
  if (digits.length === 13 || digits.length === 10) return normalizeIsbn(digits);
  if (digits.length === 12 && digits.startsWith("978")) return normalizeIsbn(digits);
  return null;
}
