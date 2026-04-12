import Link from "next/link";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { industryCommittee, industryProfile, legislator } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { LegislatorImportanceStar } from "@/components/legislator-importance-star";
import {
  computeImportance,
  type ImportanceRecord,
} from "@/lib/legislator-importance";
import { type ImportanceLevel } from "@/lib/legislator-importance-ui";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  party?: string;
  committee?: string;
  importance?: string;
  sort?: string;
}

export default async function LegislatorsPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await props.searchParams;
  const q = sp.q?.trim() ?? "";
  const partyFilter = sp.party?.trim() ?? "";
  const committeeFilter = sp.committee?.trim() ?? "";
  const importanceFilter = normalizeImportance(sp.importance);
  const sort = normalizeSort(sp.sort);

  const [profile] = await db.select().from(industryProfile).limit(1);
  const industryCommittees = profile
    ? await db
        .select({ committeeCode: industryCommittee.committeeCode })
        .from(industryCommittee)
        .where(eq(industryCommittee.industryProfileId, profile.id))
    : [];

  const searchConditions = [eq(legislator.isActive, true)];
  if (q) {
    searchConditions.push(
      or(
        ilike(legislator.name, `%${q}%`),
        ilike(legislator.district, `%${q}%`),
        ilike(legislator.nameHanja, `%${q}%`),
      )!,
    );
  }
  if (partyFilter) {
    searchConditions.push(eq(legislator.party, partyFilter));
  }
  if (committeeFilter) {
    searchConditions.push(sql`${legislator.committees} ? ${committeeFilter}`);
  }

  const [rows, optionRows, totalActiveRow, importanceById] = await Promise.all([
    db
      .select({
        id: legislator.id,
        memberId: legislator.memberId,
        name: legislator.name,
        nameHanja: legislator.nameHanja,
        party: legislator.party,
        district: legislator.district,
        electionType: legislator.electionType,
        committees: legislator.committees,
        committeeRole: legislator.committeeRole,
      })
      .from(legislator)
      .where(and(...searchConditions))
      .orderBy(asc(legislator.name)),
    db
      .select({
        party: legislator.party,
        committees: legislator.committees,
      })
      .from(legislator)
      .where(eq(legislator.isActive, true)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(legislator)
      .where(eq(legislator.isActive, true)),
    profile
      ? computeImportance({
          profileId: profile.id,
          committeeCodes: industryCommittees.map((c) => c.committeeCode),
        })
      : Promise.resolve(new Map<number, ImportanceRecord>()),
  ]);

  const filteredRows = rows
    .filter((row) => {
      if (!importanceFilter) return true;
      return importanceById.get(row.id)?.level === importanceFilter;
    })
    .sort((left, right) =>
      compareRows(left, right, importanceById.get(left.id), importanceById.get(right.id), sort),
    );

  const parties = [...new Set(optionRows.map((row) => row.party))].sort((a, b) =>
    a.localeCompare(b, "ko"),
  );
  const committees = [...new Set(optionRows.flatMap((row) => row.committees ?? []))].sort(
    (a, b) => a.localeCompare(b, "ko"),
  );
  const totalActive = totalActiveRow[0]?.count ?? 0;

  return (
    <>
      <PageHeader
        title="의원 프로필"
        subtitle={`${totalActive}명 전체${profile ? ` · ${profile.name} 산업` : ""}`}
      />

      <div className="p-6">
        <FilterPanel
          q={q}
          party={partyFilter}
          committee={committeeFilter}
          importance={importanceFilter}
          sort={sort}
          parties={parties}
          committees={committees}
        />

        <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-[var(--color-surface-2)]">
                <tr className="border-b border-[var(--color-border)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  <th className="px-4 py-3">이름</th>
                  <th className="px-4 py-3">정당</th>
                  <th className="px-4 py-3">지역구</th>
                  <th className="px-4 py-3">위원회</th>
                  <th className="px-4 py-3">중요도</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-[13px] text-[var(--color-text-tertiary)]"
                    >
                      조건에 맞는 의원이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const importance = importanceById.get(row.id) ?? null;
                    const href = `/legislators/${row.id}`;
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-[var(--color-border)] transition-colors last:border-b-0 hover:bg-[var(--color-surface-2)]"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={href}
                            className="block text-[14px] font-semibold text-[var(--color-text)] hover:text-[var(--color-primary)]"
                          >
                            <span className="inline-flex items-center gap-2">
                              <span>{row.name}</span>
                              <LegislatorImportanceStar
                                level={importance?.level ?? null}
                                size={14}
                                reasons={importance?.reasons}
                              />
                            </span>
                            {row.nameHanja && (
                              <span className="mt-0.5 block text-[11px] font-normal text-[var(--color-text-tertiary)]">
                                {row.nameHanja}
                              </span>
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-[var(--color-text-secondary)]">
                          <Link href={href} className="block">
                            {row.party}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-[var(--color-text-secondary)]">
                          <Link href={href} className="block">
                            {row.district ?? "비례대표"}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-[var(--color-text-secondary)]">
                          <Link href={href} className="block">
                            {formatCommitteeSummary(row.committees ?? [], row.committeeRole) || "—"}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={href} className="block">
                            {importance?.level ? (
                              <div className="space-y-0.5">
                                <div className="text-[12px] font-semibold text-[var(--color-text)]">
                                  {importance.level}
                                </div>
                                <div className="text-[10px] text-[var(--color-text-tertiary)]">
                                  대표발의 {importance.sponsoredBillCount}건
                                </div>
                              </div>
                            ) : (
                              <span className="text-[11px] text-[var(--color-text-tertiary)]">
                                —
                              </span>
                            )}
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function FilterPanel({
  q,
  party,
  committee,
  importance,
  sort,
  parties,
  committees,
}: {
  q: string;
  party: string;
  committee: string;
  importance: ImportanceLevel;
  sort: SortKey;
  parties: string[];
  committees: string[];
}) {
  return (
    <form
      action="/legislators"
      method="GET"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]"
    >
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder="이름/지역구 검색"
        className="w-[220px] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      />

      <select
        name="party"
        defaultValue={party}
        className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      >
        <option value="">정당 전체</option>
        {parties.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>

      <select
        name="committee"
        defaultValue={committee}
        className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      >
        <option value="">위원회 전체</option>
        {committees.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          중요도
        </span>
        {[
          { value: "", label: "전체" },
          { value: "S", label: "S" },
          { value: "A", label: "A" },
          { value: "B", label: "B" },
        ].map((item) => (
          <label
            key={item.label}
            className={cn(
              "cursor-pointer rounded-[12px] px-3 py-[3px] text-[11px] font-semibold transition-colors",
              (importance ?? "") === item.value
                ? "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                : "bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]",
            )}
          >
            <input
              type="radio"
              name="importance"
              value={item.value}
              defaultChecked={(importance ?? "") === item.value}
              className="sr-only"
            />
            {item.label}
          </label>
        ))}
      </div>

      <select
        name="sort"
        defaultValue={sort}
        className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      >
        <option value="name">이름순</option>
        <option value="importance">중요도순</option>
        <option value="sponsored">대표발의순</option>
      </select>

      <button
        type="submit"
        className="rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-2 text-[12px] font-semibold text-white"
      >
        적용
      </button>
    </form>
  );
}

type SortKey = "name" | "importance" | "sponsored";

function normalizeImportance(raw?: string): ImportanceLevel {
  if (raw === "S" || raw === "A" || raw === "B") return raw;
  return null;
}

function normalizeSort(raw?: string): SortKey {
  if (raw === "importance" || raw === "sponsored") return raw;
  return "name";
}

function compareRows(
  left: { name: string },
  right: { name: string },
  leftImportance: ImportanceRecord | undefined,
  rightImportance: ImportanceRecord | undefined,
  sort: SortKey,
) {
  if (sort === "importance") {
    const byLevel = importanceRank(leftImportance?.level) - importanceRank(rightImportance?.level);
    if (byLevel !== 0) return byLevel;
  }

  if (sort === "sponsored") {
    const bySponsored =
      (rightImportance?.sponsoredBillCount ?? 0) - (leftImportance?.sponsoredBillCount ?? 0);
    if (bySponsored !== 0) return bySponsored;
  }

  return left.name.localeCompare(right.name, "ko");
}

function importanceRank(level: ImportanceLevel | undefined) {
  if (level === "S") return 0;
  if (level === "A") return 1;
  if (level === "B") return 2;
  return 3;
}

function formatCommitteeSummary(
  committees: string[],
  committeeRole: string | null,
): string {
  if (committees.length === 0) return "";
  if (!committeeRole || committeeRole === "위원") {
    return committees.join(", ");
  }
  const [first, ...rest] = committees;
  return [`${first} (${committeeRole})`, ...rest].join(", ");
}
