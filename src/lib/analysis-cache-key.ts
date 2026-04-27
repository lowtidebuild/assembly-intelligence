export const QUICK_ANALYSIS_PROMPT_VERSION = "quick-analysis-v1";
export const DEEP_ANALYSIS_PROMPT_VERSION = "deep-analysis-v1";

export interface AnalysisCacheKeyInput {
  billId: string;
  bodyHash: string | null;
  activeProfileUpdatedAt: Date | string | null;
  promptVersion: string;
}

export function buildAnalysisCacheKey(input: AnalysisCacheKeyInput): string {
  return [
    input.promptVersion.trim() || "unknown-prompt",
    input.billId.trim() || "unknown-bill",
    input.bodyHash?.trim() || "no-body",
    normalizeUpdatedAt(input.activeProfileUpdatedAt),
  ].join(":");
}

function normalizeUpdatedAt(value: Date | string | null): string {
  if (!value) return "unknown-profile";
  if (value instanceof Date) return value.toISOString();
  const trimmed = value.trim();
  if (!trimmed) return "unknown-profile";
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
}
