export type Recommendation = "SELL" | "DONATE";

export interface Book {
  id: string;
  title: string;
  author: string | null;
  category: string | null;
  estimated_value: string | null;
  estimated_midpoint: number | null;
  condition: string | null;
  condition_note: string | null;
  recommendation: Recommendation;
  rationale: string | null;
  created_at: string;
}

export interface BookIdentification {
  title: string;
  author: string;
  category: string;
  estimated_value: string;
  estimated_midpoint: number;
  recommendation: Recommendation;
  rationale: string;
}

export interface QueueItem {
  id: string;
  imageData: string;
  addedAt: number;
}
