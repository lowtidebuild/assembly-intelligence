"use client";

/**
 * Hemicycle — a semicircular SVG rendering of the 국회 seating chart.
 *
 * Layout strategy:
 *   - 300 seats default (22대 has 300 seats total, 295 filled).
 *   - 9 concentric rows of seats from innermost to outermost.
 *   - Seats per row are distributed by row arc length so each seat
 *     is roughly the same size.
 *   - Party coloring uses the Korean political color convention:
 *       더불어민주당 → blue
 *       국민의힘    → red
 *       조국혁신당 → purple
 *       개혁신당   → orange
 *       진보당     → magenta
 *       기본소득당 → teal
 *       사회민주당 → pink
 *       무소속     → grey
 *   - Unknown party → grey
 *   - Selected seat → stroked in primary
 *
 * Callers pass an array of `HemicycleMember` rows. This component
 * is purely presentational — it doesn't fetch data.
 *
 * Reused in:
 *   - /assembly (국회 현황) as main view
 *   - /watch (의원 워치) as picker/overview
 *   - /setup (wizard) as legislator selector
 */

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface HemicycleMember {
  id: number;
  memberId: string;
  name: string;
  party: string;
  district: string | null;
  committees?: string[];
  /** If true, render a highlight ring around this seat. */
  highlighted?: boolean;
}

export interface HemicycleProps {
  members: HemicycleMember[];
  /** Total seats (default 300 for 22대) */
  totalSeats?: number;
  /** Render size (width in px). Height is derived (≈ width/2 + padding). */
  width?: number;
  /** Which member is selected (memberId). Emits onSelect on click. */
  selectedMemberId?: string | null;
  onSelect?: (member: HemicycleMember) => void;
  /** Hide legend */
  hideLegend?: boolean;
}

/* ─────────────────────────────────────────────────────────────
 * Party color map (Korean political convention)
 * ────────────────────────────────────────────────────────────── */

const PARTY_COLORS: Record<string, string> = {
  더불어민주당: "#004EA2",
  국민의힘: "#E61E2B",
  조국혁신당: "#0073cf",
  개혁신당: "#ff7210",
  진보당: "#D6001C",
  기본소득당: "#00D2C3",
  사회민주당: "#F58400",
  새로운미래: "#00B1EB",
  무소속: "#888888",
};

function partyColor(party: string): string {
  return PARTY_COLORS[party] ?? "#9ca3af";
}

/* ─────────────────────────────────────────────────────────────
 * Seat layout math
 * ────────────────────────────────────────────────────────────── */

interface SeatPosition {
  x: number;
  y: number;
  r: number;
}

/**
 * Generate (x, y, radius) positions for `totalSeats` seats laid out
 * in a half-moon (hemicycle) from left to right along the bottom edge.
 *
 * We use a fixed number of rows (9 matches the 국회 본회의장 layout
 * closely enough for a schematic). Inner rows have fewer seats,
 * outer rows more. Row seat counts are proportional to row radius
 * to keep seat-to-seat spacing roughly constant.
 */
function computeSeatPositions(totalSeats: number): SeatPosition[] {
  const ROWS = 9;
  const INNER_R = 85;
  const OUTER_R = 170;
  const CENTER_X = 200;
  const CENTER_Y = 185;
  const SEAT_RADIUS = 4;

  // Row radii evenly spaced.
  const rowRadii = Array.from(
    { length: ROWS },
    (_, i) => INNER_R + ((OUTER_R - INNER_R) * i) / (ROWS - 1),
  );

  // Seats per row ∝ radius (longer arc = more seats).
  const totalWeight = rowRadii.reduce((a, b) => a + b, 0);
  const rowSeatCounts = rowRadii.map((r) =>
    Math.round((r / totalWeight) * totalSeats),
  );

  // Adjust rounding error so sum == totalSeats exactly.
  let diff = totalSeats - rowSeatCounts.reduce((a, b) => a + b, 0);
  let idx = ROWS - 1;
  while (diff !== 0) {
    rowSeatCounts[idx] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
    idx = (idx - 1 + ROWS) % ROWS;
  }

  const positions: SeatPosition[] = [];
  for (let row = 0; row < ROWS; row++) {
    const n = rowSeatCounts[row];
    const r = rowRadii[row];
    // Distribute angles from π (left) to 0 (right) across n seats.
    // Use (n+1) gaps so first/last seats sit inside the edges, not on them.
    for (let i = 0; i < n; i++) {
      const angle = Math.PI - (Math.PI * (i + 0.5)) / n;
      const x = CENTER_X + r * Math.cos(angle);
      const y = CENTER_Y - r * Math.sin(angle);
      positions.push({ x, y, r: SEAT_RADIUS });
    }
  }
  return positions;
}

/**
 * Order members by party + alphabetical, matching sync.ts seatIndex
 * assignment (largest party leftmost).
 *
 * This is defensive: if a member's .id already has a well-placed
 * seatIndex from DB, we use it. Otherwise we compute one here.
 */
function orderMembers(members: HemicycleMember[]): HemicycleMember[] {
  // Group by party, sort parties by descending count, name tiebreak
  const byParty = new Map<string, HemicycleMember[]>();
  for (const m of members) {
    (byParty.get(m.party) ?? byParty.set(m.party, []).get(m.party)!).push(m);
  }
  const sortedParties = [...byParty.keys()].sort((a, b) => {
    const diff = (byParty.get(b)?.length ?? 0) - (byParty.get(a)?.length ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
  const ordered: HemicycleMember[] = [];
  for (const party of sortedParties) {
    const list = byParty.get(party)!;
    list.sort((a, b) => a.memberId.localeCompare(b.memberId));
    ordered.push(...list);
  }
  return ordered;
}

/* ─────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────── */

export function Hemicycle({
  members,
  totalSeats = 300,
  width = 400,
  selectedMemberId,
  onSelect,
  hideLegend = false,
}: HemicycleProps) {
  const [hovered, setHovered] = useState<HemicycleMember | null>(null);

  const { ordered, positions, partyCounts } = useMemo(() => {
    const ordered = orderMembers(members);
    const positions = computeSeatPositions(totalSeats);
    const partyCounts = new Map<string, number>();
    for (const m of ordered) {
      partyCounts.set(m.party, (partyCounts.get(m.party) ?? 0) + 1);
    }
    return { ordered, positions, partyCounts };
  }, [members, totalSeats]);

  const heightRatio = 210 / 400; // keep viewBox aspect
  const height = Math.round(width * heightRatio);

  return (
    <div className="inline-block">
      <svg
        viewBox="0 0 400 210"
        width={width}
        height={height}
        role="img"
        aria-label="국회 의석 배치도"
        className="select-none"
      >
        {/* Background arc */}
        <path
          d="M 20,185 A 180,180 0 0 1 380,185"
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        {/* Seats */}
        {positions.map((pos, i) => {
          const member = ordered[i];
          if (!member) {
            return (
              <circle
                key={`empty-${i}`}
                cx={pos.x}
                cy={pos.y}
                r={pos.r}
                fill="var(--color-border)"
              />
            );
          }
          const isSelected = selectedMemberId === member.memberId;
          const isHighlighted = member.highlighted || isSelected;
          return (
            <circle
              key={member.memberId}
              cx={pos.x}
              cy={pos.y}
              r={isHighlighted ? pos.r + 1.5 : pos.r}
              fill={partyColor(member.party)}
              stroke={
                isSelected
                  ? "var(--color-primary)"
                  : isHighlighted
                    ? "#fff"
                    : "none"
              }
              strokeWidth={isSelected ? 2 : isHighlighted ? 1 : 0}
              className={cn(
                "transition-all",
                onSelect && "cursor-pointer hover:opacity-80",
              )}
              onClick={() => onSelect?.(member)}
              onMouseEnter={() => setHovered(member)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
      </svg>

      {/* Tooltip — shows on hover */}
      {hovered && (
        <div className="pointer-events-none mt-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: partyColor(hovered.party) }}
            />
            <span className="font-semibold text-[var(--color-text)]">
              {hovered.name}
            </span>
            <span className="text-[var(--color-text-secondary)]">
              · {hovered.party}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">
            {hovered.district ?? "비례대표"}
            {hovered.committees && hovered.committees.length > 0 && (
              <> · {hovered.committees[0]}</>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      {!hideLegend && partyCounts.size > 0 && (
        <div className="mt-3 flex max-w-[400px] flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {[...partyCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([party, count]) => (
              <span key={party} className="flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: partyColor(party) }}
                />
                <span className="text-[var(--color-text-secondary)]">
                  {party}
                </span>
                <strong className="font-semibold text-[var(--color-text)]">
                  {count}
                </strong>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
