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

  const response = await fetch(`/api/isbn?isbn=${encodeURIComponent(clean)}`);
  const data = await response.json();

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(data.error || `ISBN lookup failed (${response.status})`);
  }

  return data as IsbnBookInfo;
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
