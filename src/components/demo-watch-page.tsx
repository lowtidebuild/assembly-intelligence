"use client";

import { useMemo } from "react";
import { Plus, Sparkles, Users } from "lucide-react";
import { SearchCommand } from "@/components/search-command";
import { ThemeToggle } from "@/components/theme-toggle";
import { Hemicycle, type HemicycleMember } from "@/components/hemicycle";
import { LegislatorImportanceStar } from "@/components/legislator-importance-star";
import { LegislatorAvatar } from "@/components/legislator-avatar";
import { type ImportanceRecord } from "@/lib/legislator-importance";
import { type ImportanceLevel } from "@/lib/legislator-importance-ui";
import { type DemoWatchEntry, useDemoWatchlist } from "@/lib/demo-watchlist";

interface DemoWatchMember {
  id: number;
  memberId: string;
  name: string;
  nameHanja: string | null;
  party: string;
  district: string | null;
  electionType: string | null;
  committees: string[] | null;
  termNumber: number | null;
  committeeRole: string | null;
  photoUrl?: string | null;
}

interface DemoImportanceEntry {
  legislatorId: number;
  importance: ImportanceRecord;
}

export function DemoWatchPage({
  members,
  importanceEntries,
  initialEntries,
}: {
  members: DemoWatchMember[];
  importanceEntries: DemoImportanceEntry[];
  initialEntries: DemoWatchEntry[];
}) {
  const { entries, watchedIds, addEntry } = useDemoWatchlist(initialEntries);

  const importanceById = useMemo(
    () => new Map(importanceEntries.map((entry) => [entry.legislatorId, entry.importance])),
    [importanceEntries],
  );

  const watchedMembers = useMemo(
    () =>
      entries
        .map((entry) => {
          const member = members.find((candidate) => candidate.id === entry.legislatorId);
          if (!member) return null;
          return {
            member,
            reason: entry.reason,
          };
        })
        .filter(
          (
            entry,
          ): entry is {
            member: DemoWatchMember;
            reason: string;
          } => Boolean(entry),
        ),
    [entries, members],
  );

  const recommendations = useMemo(
    () =>
      members
        .filter((member) => {
          const importance = importanceById.get(member.id);
          return (
            !watchedIds.has(member.id) &&
            (importance?.level === "S" || importance?.level === "A")
          );
        })
        .sort((a, b) =>
          compareImportance(importanceById.get(a.id), importanceById.get(b.id)),
        )
        .slice(0, 12),
    [importanceById, members, watchedIds],
  );

  const hemicycleMembers: HemicycleMember[] = useMemo(
    () =>
      members.map((member) => ({
        ...member,
        committees: member.committees ?? [],
        importance: importanceById.get(member.id)?.level ?? null,
        importanceReasons: importanceById.get(member.id)?.reasons ?? [],
        highlighted: watchedIds.has(member.id),
      })),
    [importanceById, members, watchedIds],
  );

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-[18px] font-bold tracking-[-0.01em] text-[var(--color-text)]">
            의원 워치
          </h1>
          <span className="border-l border-[var(--color-border)] pl-3 text-[13px] text-[var(--color-text-secondary)]">
            {watchedMembers.length}명 모니터링 중 · 브라우저 데모 저장
          </span>
        </div>
        <div className="flex w-full items-center gap-[10px] md:w-auto">
          <ThemeToggle />
          <SearchCommand />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 p-6 lg:grid-cols-[1fr_480px]">
        <section>
          <DemoRecommendationSection
            members={recommendations}
            importanceById={importanceById}
            onAdd={(legislatorId, reason) => addEntry(legislatorId, reason)}
          />

          <div className="mb-3 flex items-center gap-2 border-b-2 border-[var(--color-border)] pb-2 text-[15px] font-bold text-[var(--color-text)]">
            <Users className="h-4 w-4" />
            워치리스트
            <span className="ml-auto text-[12px] font-normal text-[var(--color-text-secondary)]">
              {watchedMembers.length}명
            </span>
          </div>

          {watchedMembers.length === 0 ? (
            <div className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center text-[13px] text-[var(--color-text-tertiary)]">
              워치리스트가 비어 있습니다.
              <br />
              오른쪽 의석도에서 의원을 클릭해 추가하세요.
            </div>
          ) : (
            <div className="flex flex-col gap-[10px]">
              {watchedMembers.map(({ member, reason }) => (
                <DemoWatchCard
                  key={member.id}
                  member={member}
                  importance={importanceById.get(member.id) ?? null}
                  reason={reason}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="flex flex-col items-center rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] lg:sticky lg:top-[80px]">
          <div className="mb-2 text-center">
            <h3 className="text-[13px] font-bold text-[var(--color-text)]">
              의원 선택
            </h3>
            <p className="mt-0.5 text-[10px] text-[var(--color-text-tertiary)]">
              흰 링은 현재 워치 · 색 링은 산업 중요도
            </p>
          </div>
          <div className="w-full max-w-[480px]">
            <Hemicycle
              members={hemicycleMembers}
              detailHrefBase="/legislators"
              detailHrefMode="path"
              hideLegend
            />
          </div>
          <p className="mt-3 text-[11px] text-[var(--color-text-tertiary)]">
            좌석을 클릭하면 프로필에서 워치리스트에 바로 추가·제거할 수 있습니다.
          </p>
        </aside>
      </div>
    </>
  );
}

function DemoWatchCard({
  member,
  importance,
  reason,
}: {
  member: DemoWatchMember;
  importance: ImportanceRecord | null;
  reason: string | null;
}) {
  return (
    <a
      href={`/legislators/${member.id}`}
      className="flex gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
    >
      <LegislatorAvatar name={member.name} photoUrl={member.photoUrl} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold text-[var(--color-text)]">
            {member.name}
          </span>
          {member.nameHanja && (
            <span className="text-[11px] text-[var(--color-text-tertiary)]">
              {member.nameHanja}
            </span>
          )}
          <LegislatorImportanceStar
            level={importance?.level ?? null}
            size={14}
            reasons={importance?.reasons}
          />
          <span className="text-[11px] text-[var(--color-text-secondary)]">
            {member.party}
          </span>
          {member.termNumber && (
            <span className="text-[10px] text-[var(--color-text-tertiary)]">
              {member.termNumber}선
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-[var(--color-text-secondary)]">
          {member.district ?? "비례대표"}
          {member.electionType && <> · {member.electionType}</>}
          {member.committees && member.committees.length > 0 && (
            <> · {member.committees.join(", ")}</>
          )}
        </div>
        {member.committeeRole &&
          member.committeeRole !== "위원" && (
            <div className="mt-1">
              <CommitteeRoleBadge role={member.committeeRole} />
            </div>
          )}
        {reason && (
          <div className="mt-1.5 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] italic text-[var(--color-text-secondary)]">
            {reason}
          </div>
        )}
        {importance?.reasons && importance.reasons.length > 0 && (
          <div className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
            {importance.reasons.join(" · ")}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-[10px] text-[var(--color-text-tertiary)]">
        <span className="rounded-[4px] bg-[var(--color-surface-2)] px-2 py-0.5 font-mono">
          발의 {importance?.sponsoredBillCount ?? 0}
        </span>
      </div>
    </a>
  );
}

function DemoRecommendationSection({
  members,
  importanceById,
  onAdd,
}: {
  members: DemoWatchMember[];
  importanceById: Map<number, ImportanceRecord>;
  onAdd: (legislatorId: number, reason: string) => void;
}) {
  return (
    <div className="mb-6 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2 border-b border-[var(--color-border)] pb-2 text-[14px] font-bold text-[var(--color-text)]">
        <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
        산업 관련 의원 자동 추천
      </div>
      {members.length === 0 ? (
        <p className="text-[12px] text-[var(--color-text-tertiary)]">
          아직 추천할 의원이 없습니다. 현재 워치가 이미 충분하거나 중요도 계산 결과가 비어 있습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {members.map((member) => {
            const importance = importanceById.get(member.id);
            return (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-text)]">
                    <span>{member.name}</span>
                    <LegislatorImportanceStar
                      level={importance?.level ?? null}
                      size={14}
                      reasons={importance?.reasons}
                    />
                    <span className="text-[11px] font-normal text-[var(--color-text-secondary)]">
                      {member.party}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--color-text-secondary)]">
                    {member.district ?? "비례대표"}
                    {member.electionType && <> · {member.electionType}</>}
                    {member.termNumber && <> · {member.termNumber}선</>}
                    {member.committeeRole &&
                      member.committeeRole !== "위원" && (
                        <> · {member.committeeRole}</>
                      )}
                  </div>
                  {importance?.reasons && importance.reasons.length > 0 && (
                    <div className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
                      {importance.reasons.join(" · ")}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onAdd(
                      member.id,
                      importance?.reasons.join(" · ") || "산업 중요도 자동 추천",
                    )
                  }
                  className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-2.5 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <Plus className="h-3 w-3" />
                  워치리스트에 추가
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function compareImportance(
  left: ImportanceRecord | undefined,
  right: ImportanceRecord | undefined,
): number {
  const rank = (level: ImportanceLevel | null | undefined) =>
    level === "S" ? 0 : level === "A" ? 1 : level === "B" ? 2 : 3;
  const byLevel = rank(left?.level) - rank(right?.level);
  if (byLevel !== 0) return byLevel;
  return (right?.sponsoredBillCount ?? 0) - (left?.sponsoredBillCount ?? 0);
}

function CommitteeRoleBadge({ role }: { role: string }) {
  const color =
    role === "위원장"
      ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-text)]"
      : role === "간사"
        ? "bg-[var(--color-info-soft)] text-[var(--color-info-text)]"
        : "bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]";
  return (
    <span
      className={`inline-block rounded-[8px] px-[6px] py-[1px] text-[10px] font-semibold ${color}`}
    >
      {role}
    </span>
  );
}
