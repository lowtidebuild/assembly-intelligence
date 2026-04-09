import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names intelligently — handles conflicting utilities
 * (e.g. `p-2 p-4` → `p-4`) via tailwind-merge. Used everywhere in UI code.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
