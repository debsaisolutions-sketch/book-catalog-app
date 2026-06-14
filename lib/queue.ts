import type { QueueItem } from "./types";

const QUEUE_KEY = "book-catalog-queue";

export function getQueue(): QueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    return [];
  }
}

export function saveQueue(items: QueueItem[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export function addToQueue(imageData: string): QueueItem {
  const item: QueueItem = {
    id: crypto.randomUUID(),
    imageData,
    addedAt: Date.now(),
  };
  const queue = getQueue();
  queue.unshift(item);
  saveQueue(queue);
  return item;
}

export function removeFromQueue(id: string): void {
  const queue = getQueue().filter((item) => item.id !== id);
  saveQueue(queue);
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function getMediaType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}
