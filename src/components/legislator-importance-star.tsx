import { Star } from "lucide-react";
import {
  importanceBadgeClass,
  type ImportanceLevel,
} from "@/lib/legislator-importance-ui";

const STAR_COLOR: Record<Exclude<ImportanceLevel, null>, string> = {
  S: "#eab308",
  A: "#2563eb",
  B: "#94a3b8",
};

export function LegislatorImportanceStar({
  level,
  size = 14,
  reasons,
}: {
  level: ImportanceLevel;
  size?: number;
  reasons?: string[];
}) {
  if (!level) return null;
  const color = STAR_COLOR[level];
  const title = reasons?.join(" · ") ?? `중요도 ${level}`;
  return (
    <span
      className="inline-flex shrink-0"
      aria-label={title}
      title={title}
    >
      <Star
        size={size}
        fill={color}
        stroke={color}
        className={importanceBadgeClass(level)}
      />
    </span>
  );
}
