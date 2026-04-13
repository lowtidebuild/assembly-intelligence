"use client";

import { useEffect, useState } from "react";
import type {
  McpCapabilityResult,
  McpLatestSnapshot,
} from "@/lib/mcp-latest";

interface ErrorPayload {
  ok?: false;
  error?: string;
}

function isErrorPayload(value: unknown): value is ErrorPayload {
  return typeof value === "object" && value !== null && "error" in value;
}

interface Props {
  sampleKeyword: string;
}

export function McpCapabilityPanel({ sampleKeyword }: Props) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; error: string }
    | { status: "ready"; snapshot: McpLatestSnapshot }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(
          `/api/mcp/capabilities?keyword=${encodeURIComponent(sampleKeyword)}`,
          { cache: "no-store" },
        );
        const json = (await response.json()) as McpLatestSnapshot | ErrorPayload;

        if (!response.ok || isErrorPayload(json)) {
          const errorMessage = isErrorPayload(json)
            ? json.error ?? `HTTP ${response.status}`
            : `HTTP ${response.status}`;
          throw new Error(errorMessage);
        }

        if (!cancelled) {
          setState({ status: "ready", snapshot: json as McpLatestSnapshot });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sampleKeyword]);

  if (state.status === "loading") {
    return (
      <p className="text-[12px] text-[var(--color-text-tertiary)]">
        최신 MCP capability를 확인하는 중입니다. 공개 upstream 인스턴스는
        cold start 때문에 20~60초 정도 걸릴 수 있습니다.
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <p className="text-[12px] text-[var(--color-error)]">
        최신 MCP capability probe 실패: {state.error}
      </p>
    );
  }

  const latestMcp = state.snapshot;

  return (
    <div className="space-y-4 text-[12px]">
      <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[var(--color-text)]">
            {latestMcp.runtime.host}
          </span>
          <span className="inline-block rounded-[999px] bg-[var(--color-primary-light)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]">
            profile={latestMcp.runtime.defaultProfile}
          </span>
          <span className="inline-block rounded-[999px] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-secondary)]">
            lite {latestMcp.tools.lite.length}개
          </span>
          <span className="inline-block rounded-[999px] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-secondary)]">
            full {latestMcp.tools.full.length}개
          </span>
        </div>
        <div className="mt-2 text-[11px] text-[var(--color-text-secondary)]">
          샘플 키워드: <span className="font-semibold">{latestMcp.sampleKeyword}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {latestMcp.tools.fullOnly.map((tool) => (
            <span
              key={tool}
              className="inline-block rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-text-secondary)]"
            >
              {tool}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <CapabilityBlock
          label="research_data"
          description="Full 전용 연구자료 통합"
          result={latestMcp.features.research}
        />
        <CapabilityBlock
          label="assembly_org(type=lawmaking)"
          description="국민참여입법센터 입법 전 단계"
          result={latestMcp.features.lawmaking}
        />
        <CapabilityBlock
          label="get_nabo"
          description="국회예산정책처 보고서/정기간행물/채용"
          result={latestMcp.features.nabo}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href="/api/mcp/lawmaking?category=legislation"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)]"
        >
          lawmaking API
        </a>
        <a
          href="/api/mcp/nabo?type=report"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)]"
        >
          NABO API
        </a>
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--color-text-tertiary)]">
        `lawmaking` 과 `NABO`는 이 앱이 아니라 <strong>대상 MCP 서버</strong>
        에 `LAWMKING_OC`, `NABO_API_KEY` 가 준비되어 있어야 활성화됩니다.
        지금은 공개 upstream 인스턴스의 실제 준비 상태를 그대로 보여줍니다.
      </p>
    </div>
  );
}

function CapabilityBlock({
  label,
  description,
  result,
}: {
  label: string;
  description: string;
  result: McpCapabilityResult;
}) {
  const color =
    result.status === "available"
      ? "bg-[var(--color-success)]"
      : result.status === "unconfigured"
        ? "bg-[var(--color-warning)]"
        : "bg-[var(--color-error)]";

  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        <span className="font-mono text-[11px] font-semibold text-[var(--color-text)]">
          {label}
        </span>
        <span className="text-[11px] text-[var(--color-text-tertiary)]">
          {description}
        </span>
      </div>
      <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">
        {result.detail}
      </p>
      {result.previewItems.length > 0 && (
        <ul className="mt-3 space-y-1 text-[11px] text-[var(--color-text-secondary)]">
          {result.previewItems.map((item) => (
            <li
              key={`${label}-${item.title}`}
              className="rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-2 py-1.5"
            >
              <div className="font-medium text-[var(--color-text)]">
                {item.title}
              </div>
              {item.subtitle && <div className="mt-0.5">{item.subtitle}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
