export type ImportanceLevel = "S" | "A" | "B" | null;

export function importanceBadgeClass(level: ImportanceLevel): string {
  if (level === "S") return "text-[var(--color-warning)]";
  if (level === "A") return "text-[var(--color-info)]";
  if (level === "B") return "text-[var(--color-text-tertiary)]";
  return "text-[var(--color-text-tertiary)]";
}
