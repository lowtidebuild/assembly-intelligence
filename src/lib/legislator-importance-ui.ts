export type ImportanceLevel = "S" | "A" | "B" | null;

export function importanceBadgeClass(level: ImportanceLevel): string {
  if (level === "S") return "text-[#eab308]";
  if (level === "A") return "text-[#2563eb]";
  if (level === "B") return "text-[#94a3b8]";
  return "text-[var(--color-text-tertiary)]";
}
