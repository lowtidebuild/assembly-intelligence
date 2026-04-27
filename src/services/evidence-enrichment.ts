import {
  buildEvidenceMeta,
  cleanEvidenceText,
  type BodyFetchStatus,
  type EvidenceMeta,
} from "@/lib/evidence";
import {
  fetchBillBodyFragment,
  type BillBodyFragment,
} from "@/lib/bill-scraper";
import { errorMessage } from "@/lib/api-base";

export interface ExistingBillBody {
  proposalReason: string | null;
  mainContent: string | null;
}

export interface EvidenceEnrichmentInput {
  billId: string;
  billName: string;
  committee: string | null;
  proposerName: string | null;
  proposerParty?: string | null;
  proposalDate?: string | null;
  mcpBody: ExistingBillBody;
  existingBody?: ExistingBillBody | null;
  fetchBodyFragment?: (billId: string) => Promise<BillBodyFragment | null>;
}

export interface EvidenceEnrichmentResult {
  proposalReason: string | null;
  mainContent: string | null;
  evidence: EvidenceMeta;
  bodyFetchError: string | null;
}

export async function enrichBillEvidence(
  input: EvidenceEnrichmentInput,
): Promise<EvidenceEnrichmentResult> {
  const mcpProposalReason = cleanEvidenceText(input.mcpBody.proposalReason);
  const mcpMainContent = cleanEvidenceText(input.mcpBody.mainContent);
  if (mcpProposalReason || mcpMainContent) {
    return buildResult(input, {
      proposalReason: mcpProposalReason,
      mainContent: mcpMainContent,
      bodyFetchStatus: "from_mcp_detail",
      sourceNotes: ["MCP detail body fields"],
      bodyFetchError: null,
    });
  }

  const existingProposalReason = cleanEvidenceText(input.existingBody?.proposalReason);
  const existingMainContent = cleanEvidenceText(input.existingBody?.mainContent);
  if (existingProposalReason || existingMainContent) {
    return buildResult(input, {
      proposalReason: existingProposalReason,
      mainContent: existingMainContent,
      bodyFetchStatus: "from_existing_db",
      sourceNotes: ["existing database body fields"],
      bodyFetchError: null,
    });
  }

  const fetcher = input.fetchBodyFragment ?? fetchBillBodyFragment;
  try {
    const fragment = await fetcher(input.billId);
    const proposalReason = cleanEvidenceText(fragment?.proposalReason);
    const mainContent = cleanEvidenceText(fragment?.mainContent);
    if (proposalReason || mainContent) {
      return buildResult(input, {
        proposalReason,
        mainContent,
        bodyFetchStatus: "fetched",
        sourceNotes: ["LIKMS billInfo body fragment"],
        bodyFetchError: null,
      });
    }

    return buildResult(input, {
      proposalReason: null,
      mainContent: null,
      bodyFetchStatus: "empty",
      sourceNotes: ["LIKMS body fragment unavailable or empty"],
      bodyFetchError: null,
    });
  } catch (err) {
    return buildResult(input, {
      proposalReason: null,
      mainContent: null,
      bodyFetchStatus: "failed",
      sourceNotes: ["LIKMS body fragment fetch failed"],
      bodyFetchError: errorMessage(err),
    });
  }
}

function buildResult(
  input: EvidenceEnrichmentInput,
  body: {
    proposalReason: string | null;
    mainContent: string | null;
    bodyFetchStatus: BodyFetchStatus;
    sourceNotes: string[];
    bodyFetchError: string | null;
  },
): EvidenceEnrichmentResult {
  return {
    proposalReason: body.proposalReason,
    mainContent: body.mainContent,
    bodyFetchError: body.bodyFetchError,
    evidence: buildEvidenceMeta({
      billName: input.billName,
      committee: input.committee,
      proposerName: input.proposerName,
      proposerParty: input.proposerParty,
      proposalDate: input.proposalDate,
      proposalReason: body.proposalReason,
      mainContent: body.mainContent,
      bodyFetchStatus: body.bodyFetchStatus,
      sourceNotes: body.sourceNotes,
    }),
  };
}
