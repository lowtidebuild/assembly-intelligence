export type EvidenceLevel =
  | "title_only"
  | "metadata"
  | "body"
  | "body_with_references";

export type BodyFetchStatus =
  | "not_attempted"
  | "from_mcp_detail"
  | "from_existing_db"
  | "fetched"
  | "empty"
  | "failed";

export interface EvidenceMeta {
  level: EvidenceLevel;
  bodyFetchStatus: BodyFetchStatus;
  availableFields: string[];
  missingFields: string[];
  sourceNotes: string[];
}

export interface BuildEvidenceMetaInput {
  billName?: string | null;
  committee?: string | null;
  proposerName?: string | null;
  proposerParty?: string | null;
  proposalDate?: string | null;
  proposalReason?: string | null;
  mainContent?: string | null;
  hasReferences?: boolean;
  bodyFetchStatus?: BodyFetchStatus;
  sourceNotes?: string[];
}

export function cleanEvidenceText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function hasBodyEvidence(evidence: EvidenceMeta): boolean {
  return evidence.level === "body" || evidence.level === "body_with_references";
}

export function withReferenceEvidence(
  evidence: EvidenceMeta,
  referenceCount: number,
): EvidenceMeta {
  if (referenceCount <= 0) return evidence;

  const availableFields = evidence.availableFields.includes("references")
    ? evidence.availableFields
    : [...evidence.availableFields, "references"];
  const missingFields = evidence.missingFields.filter(
    (field) => field !== "references",
  );
  const referenceNote = `mcp references (${referenceCount})`;
  const sourceNotes = evidence.sourceNotes.includes(referenceNote)
    ? evidence.sourceNotes
    : [...evidence.sourceNotes, referenceNote];

  return {
    ...evidence,
    level: hasBodyEvidence(evidence) ? "body_with_references" : evidence.level,
    availableFields,
    missingFields,
    sourceNotes,
  };
}

export function buildEvidenceMeta(input: BuildEvidenceMetaInput): EvidenceMeta {
  const availableFields: string[] = [];
  const missingFields: string[] = [];

  const fields: Array<[string, string | null | undefined]> = [
    ["billName", input.billName],
    ["committee", input.committee],
    ["proposerName", input.proposerName],
    ["proposerParty", input.proposerParty],
    ["proposalDate", input.proposalDate],
    ["proposalReason", input.proposalReason],
    ["mainContent", input.mainContent],
  ];

  for (const [field, value] of fields) {
    if (cleanEvidenceText(value)) {
      availableFields.push(field);
    } else {
      missingFields.push(field);
    }
  }

  const hasBody =
    availableFields.includes("proposalReason") ||
    availableFields.includes("mainContent");
  const hasMetadata =
    availableFields.includes("committee") ||
    availableFields.includes("proposerName") ||
    availableFields.includes("proposerParty") ||
    availableFields.includes("proposalDate");
  const level: EvidenceLevel = hasBody
    ? input.hasReferences
      ? "body_with_references"
      : "body"
    : hasMetadata
      ? "metadata"
      : "title_only";

  return {
    level,
    bodyFetchStatus: input.bodyFetchStatus ?? "not_attempted",
    availableFields,
    missingFields,
    sourceNotes: input.sourceNotes ?? [],
  };
}
