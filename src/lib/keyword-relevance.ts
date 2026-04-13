export interface KeywordMatchResult {
  matchedIncludeKeywords: string[];
  matchedExcludeKeywords: string[];
  isRelevant: boolean;
}

function normalizeKeywordList(keywords: string[] | null | undefined): string[] {
  if (!keywords) return [];
  return Array.from(
    new Set(
      keywords
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    ),
  );
}

export function evaluateKeywordRelevance(input: {
  text: string | null | undefined;
  includeKeywords: string[] | null | undefined;
  excludeKeywords?: string[] | null | undefined;
  defaultWhenEmpty?: boolean;
}): KeywordMatchResult {
  const text = input.text?.trim() ?? "";
  if (!text) {
    return {
      matchedIncludeKeywords: [],
      matchedExcludeKeywords: [],
      isRelevant: false,
    };
  }

  const includeKeywords = normalizeKeywordList(input.includeKeywords);
  const excludeKeywords = normalizeKeywordList(input.excludeKeywords);
  const haystack = text.toLowerCase();

  const matchedIncludeKeywords = includeKeywords.filter((keyword) =>
    haystack.includes(keyword.toLowerCase()),
  );
  const matchedExcludeKeywords = excludeKeywords.filter((keyword) =>
    haystack.includes(keyword.toLowerCase()),
  );

  const hasInclude =
    includeKeywords.length === 0
      ? (input.defaultWhenEmpty ?? false)
      : matchedIncludeKeywords.length > 0;

  return {
    matchedIncludeKeywords,
    matchedExcludeKeywords,
    isRelevant: hasInclude && matchedExcludeKeywords.length === 0,
  };
}

export function findRelevantIncludeKeywords(
  text: string | null | undefined,
  includeKeywords: string[] | null | undefined,
  excludeKeywords?: string[] | null | undefined,
): string[] {
  const result = evaluateKeywordRelevance({
    text,
    includeKeywords,
    excludeKeywords,
    defaultWhenEmpty: false,
  });

  return result.isRelevant ? result.matchedIncludeKeywords : [];
}
