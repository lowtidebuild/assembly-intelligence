"use client";

/**
 * Hemicycle — SVG rendering of the 대한민국 국회 본회의장 seating chart.
 *
 * Layout matches the actual 22대 국회 (2024.9.19 기준):
 * https://www.assembly.go.kr/ shows the chamber divided into THREE
 * distinct fan-shaped sectors separated by aisles, not a single
 * European-style hemicycle.
 *
 *   LEFT sector   — minor parties (조국혁신당, 개혁신당, 진보당,
 *                   기본소득당, 사회민주당, 무소속, 등)
 *   CENTER sector — 더불어민주당 (largest, 170석)
 *   RIGHT sector  — 국민의힘 (108석)
 *
 * Each sector has its own concentric rows. The aisles between sectors
 * are visually preserved by leaving angular gaps.
 *
 * ⚠️ This is NOT the European left/right political convention. In the
 * real 본회의장:
 *   - 민주당 is in the CENTER because they're the largest party
 *   - 국힘 is on the RIGHT
 *   - Minor parties are on the LEFT
 *
 * Party coloring uses the Korean political convention:
 *   더불어민주당   → #004EA2  (blue)
 *   국민의힘       → #E61E2B  (red)
 *   조국혁신당     → #0073cf  (light blue)
 *   개혁신당       → #ff7210  (orange)
 *   진보당         → #D6001C  (dark red)
 *   기본소득당     → #00D2C3  (teal)
 *   사회민주당     → #F58400  (orange-ish)
 *   새로운미래     → #00B1EB  (cyan)
 *   무소속         → #888888  (grey)
 *
 * Reused in:
 *   - /assembly (국회 현황) as main view
 *   - /watch (의원 워치) as picker/overview
 *   - /setup (wizard) as legislator selector
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { LegislatorImportanceStar } from "@/components/legislator-importance-star";
import type { ImportanceLevel } from "@/lib/legislator-importance-ui";

export interface HemicycleMember {
  id: number;
  memberId: string;
  name: string;
  nameHanja?: string | null;
  party: string;
  district: string | null;
  committees?: string[];
  electionType?: string | null;
  termNumber?: number | null;
  committeeRole?: string | null;
  importance?: ImportanceLevel;
  importanceReasons?: string[];
  /** If true, render a highlight ring around this seat. */
  highlighted?: boolean;
}

export interface HemicycleProps {
  members: HemicycleMember[];
  /** Total seats (default 300 for 22대) */
  totalSeats?: number;
  /** Render size (width in px). Omit for responsive width="100%". */
  width?: number;
  /** Which member is selected (memberId). Emits onSelect on click. */
  selectedMemberId?: string | null;
  onSelect?: (member: HemicycleMember) => void;
  detailHrefBase?: string;
  /** Hide legend */
  hideLegend?: boolean;
}

/* ─────────────────────────────────────────────────────────────
 * Party color + sector classification (Korean convention)
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

/**
 * Seat opacity based on importance. Non-important seats fade to let
 * S/A/B seats pop visually, without adding rings or extra colors
 * that compete with party colors.
 *
 * Highlighted (watched) seats always stay bright regardless of level.
 */
function seatOpacity(
  level: ImportanceLevel,
  isHighlighted: boolean,
): number {
  if (isHighlighted) return 1;
  if (level === "S") return 1;
  if (level === "A") return 0.85;
  if (level === "B") return 0.6;
  return 0.28;
}

/**
 * Classify a party into one of the three physical sectors of the
 * 본회의장. Based on the 2024.9.19 공식 배치도.
 */
type Sector = "left" | "center" | "right";

function partySector(party: string): Sector {
  if (party === "더불어민주당") return "center";
  if (party === "국민의힘") return "right";
  // Everything else (조국혁신, 개혁신, 진보, 기본소득, 사회민주,
  // 새로운미래, 무소속, 공석) goes to the LEFT sector.
  return "left";
}

/* ─────────────────────────────────────────────────────────────
 * Seat layout math — three-sector fan
 * ────────────────────────────────────────────────────────────── */

interface SeatPosition {
  x: number;
  y: number;
  r: number;
  sector: Sector;
}

const VIEWBOX_W = 400;
const VIEWBOX_H = 235;
const CENTER_X = 200;
const CENTER_Y = 220;
const INNER_R = 55;
const OUTER_R = 175;
const SEAT_RADIUS = 3.5;

/**
 * Angular ranges for each sector, measured from the top of the
 * chamber looking down. 0 = left edge, π = right edge.
 *
 * The real 본회의장 배치도 shows:
 *   - LEFT sector  ≈ 30° wide (minor parties: ~22 seats)
 *   - CENTER sector ≈ 65° wide (민주당 170석)
 *   - RIGHT sector ≈ 55° wide (국힘 108석)
 *
 * Aisle gaps between sectors ≈ 5° each.
 */
const SECTOR_RANGES: Record<Sector, { start: number; end: number }> = {
  //                                ↙ leftmost                  rightmost ↘
  //                                         angle=π                 angle=0
  // In SVG, larger angle = leftward. We express ranges in [angleStart, angleEnd]
  // where angleStart > angleEnd (since angle decreases left→right).
  left: { start: Math.PI - 0.12, end: Math.PI - 0.12 - 0.55 }, // ~31°
  center: {
    start: Math.PI - 0.12 - 0.55 - 0.08, // aisle
    end: Math.PI - 0.12 - 0.55 - 0.08 - 1.15, // ~66°
  },
  right: {
    start: Math.PI - 0.12 - 0.55 - 0.08 - 1.15 - 0.08, // aisle
    end: 0.12, // ~31° wide on the right, leaving a small edge margin
  },
};

/** Count of seats in each sector, computed from the members array. */
interface SectorCounts {
  left: number;
  center: number;
  right: number;
}

/**
 * Compute seat positions for ONE sector as an arc of concentric rows.
 *
 * Given:
 *   - sector angular range [startAngle, endAngle] (startAngle > endAngle)
 *   - total seats in that sector
 *   - inner radius, outer radius
 *
 * Output: an array of (x, y) positions, ordered LEFT→RIGHT across rows.
 * The algorithm:
 *   1. Decide row count based on seat count (more seats = more rows)
 *   2. Distribute seats across rows proportional to row arc length
 *      so spacing is roughly constant
 *   3. Generate raw positions row-by-row
 *   4. Sort by angle (descending, left→right) then by row (outer first)
 *      so that sequential member assignment produces vertical wedges
 *      WITHIN the sector (useful when you want sub-groups inside the
 *      left sector — 조국혁신 is visually left of 개혁신, etc.)
 */
function buildSectorSeats(
  seatCount: number,
  startAngle: number,
  endAngle: number,
  innerR: number,
  outerR: number,
  sector: Sector,
): SeatPosition[] {
  if (seatCount === 0) return [];

  // Row count: scale with seat count.
  // sqrt gives natural scaling — 300 seats → ~17 rows,
  // 108 seats → ~10, 22 seats → ~5.
  const rows = Math.max(3, Math.round(Math.sqrt(seatCount * 1.2)));

  // Evenly spaced row radii.
  const rowRadii = Array.from(
    { length: rows },
    (_, i) => innerR + ((outerR - innerR) * i) / (rows - 1 || 1),
  );

  // Seats per row ∝ radius (longer arc = more seats).
  const totalWeight = rowRadii.reduce((a, b) => a + b, 0);
  const rowSeatCounts = rowRadii.map((r) =>
    Math.round((r / totalWeight) * seatCount),
  );

  // Adjust for rounding error.
  let diff = seatCount - rowSeatCounts.reduce((a, b) => a + b, 0);
  let idx = rows - 1;
  while (diff !== 0) {
    rowSeatCounts[idx] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
    idx = (idx - 1 + rows) % rows;
  }

  // Generate raw positions.
  const raw: Array<{
    x: number;
    y: number;
    angle: number;
    row: number;
  }> = [];
  const angleRange = startAngle - endAngle; // positive
  for (let row = 0; row < rows; row++) {
    const n = rowSeatCounts[row];
    if (n === 0) continue;
    const r = rowRadii[row];
    for (let i = 0; i < n; i++) {
      // Distribute i = 0..n-1 across [startAngle, endAngle].
      // Use (i + 0.5) / n so first/last sit inside the edges.
      const angle = startAngle - (angleRange * (i + 0.5)) / n;
      const x = CENTER_X + r * Math.cos(angle);
      const y = CENTER_Y - r * Math.sin(angle);
      raw.push({ x, y, angle, row });
    }
  }

  // Sort left→right by angle (desc), then by row (desc: outer first)
  // so sub-groups within a sector form wedges.
  raw.sort((a, b) => {
    if (b.angle !== a.angle) return b.angle - a.angle;
    return b.row - a.row;
  });

  return raw.map((s) => ({
    x: s.x,
    y: s.y,
    r: SEAT_RADIUS,
    sector,
  }));
}

/**
 * Build all seat positions for all three sectors.
 */
function computeAllPositions(counts: SectorCounts): {
  left: SeatPosition[];
  center: SeatPosition[];
  right: SeatPosition[];
} {
  return {
    left: buildSectorSeats(
      counts.left,
      SECTOR_RANGES.left.start,
      SECTOR_RANGES.left.end,
      INNER_R,
      OUTER_R,
      "left",
    ),
    center: buildSectorSeats(
      counts.center,
      SECTOR_RANGES.center.start,
      SECTOR_RANGES.center.end,
      INNER_R,
      OUTER_R,
      "center",
    ),
    right: buildSectorSeats(
      counts.right,
      SECTOR_RANGES.right.start,
      SECTOR_RANGES.right.end,
      INNER_R,
      OUTER_R,
      "right",
    ),
  };
}

/**
 * Order members into three sector arrays.
 *
 * LEFT sector: minor parties grouped together, ordered by party size
 *   descending (largest minor party closest to center aisle — matches
 *   real layout where 조국혁신당 is adjacent to 민주당).
 * CENTER sector: all 민주당 members sorted by memberId for stability.
 * RIGHT sector: all 국힘 members sorted by memberId for stability.
 */
function sortMembersBySector(members: HemicycleMember[]): {
  left: HemicycleMember[];
  center: HemicycleMember[];
  right: HemicycleMember[];
} {
  const left: HemicycleMember[] = [];
  const center: HemicycleMember[] = [];
  const right: HemicycleMember[] = [];

  for (const m of members) {
    const s = partySector(m.party);
    if (s === "center") center.push(m);
    else if (s === "right") right.push(m);
    else left.push(m);
  }

  // Center: stable sort by memberId.
  center.sort((a, b) => a.memberId.localeCompare(b.memberId));
  right.sort((a, b) => a.memberId.localeCompare(b.memberId));

  // Left: group by party, largest party FIRST so it ends up adjacent
  // to the center aisle (physically closer to 민주당).
  const byPartyLeft = new Map<string, HemicycleMember[]>();
  for (const m of left) {
    const bucket = byPartyLeft.get(m.party);
    if (bucket) bucket.push(m);
    else byPartyLeft.set(m.party, [m]);
  }
  const leftSortedParties = [...byPartyLeft.keys()].sort((a, b) => {
    const diff = (byPartyLeft.get(b)!.length) - (byPartyLeft.get(a)!.length);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
  // The LEFT sector angles run from startAngle (far left) to endAngle
  // (near the center aisle). We want the largest minor party NEAR the
  // center aisle, so we place them LAST in the array (highest index =
  // closest to center in our left→right sort).
  //
  // But buildSectorSeats() returns positions sorted left→right. So
  // members[0] → leftmost (far from center), members[last] → rightmost
  // (closest to center). That means we should put the largest party
  // LAST in the members array.
  const orderedLeft: HemicycleMember[] = [];
  // Reverse so largest party is last.
  for (const party of [...leftSortedParties].reverse()) {
    const list = byPartyLeft.get(party)!;
    list.sort((a, b) => a.memberId.localeCompare(b.memberId));
    orderedLeft.push(...list);
  }

  return { left: orderedLeft, center, right };
}

/* ─────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────── */

export function Hemicycle({
  members,
  totalSeats = 300,
  width,
  selectedMemberId,
  onSelect,
  detailHrefBase,
  hideLegend = false,
}: HemicycleProps) {
  const router = useRouter();
  const [hovered, setHovered] = useState<HemicycleMember | null>(null);

  const { sectorMembers, sectorPositions, partyCounts, totalRendered } =
    useMemo(() => {
      const sectorMembers = sortMembersBySector(members);
      // Allocate vacancy padding to fill up to totalSeats.
      const filled =
        sectorMembers.left.length +
        sectorMembers.center.length +
        sectorMembers.right.length;
      const vacantCount = Math.max(0, totalSeats - filled);
      // Split vacancies proportionally: most go to the largest sector
      // (center), because real vacancies are scattered but visually
      // we want the sectors to look balanced. Use all to left as
      // trailing-edge since that's where the minor parties already are.
      const vacantLeft = vacantCount;
      const counts: SectorCounts = {
        left: sectorMembers.left.length + vacantLeft,
        center: sectorMembers.center.length,
        right: sectorMembers.right.length,
      };
      const sectorPositions = computeAllPositions(counts);

      // Build party counts for legend (excluding vacancies).
      const partyCounts = new Map<string, number>();
      for (const m of members) {
        partyCounts.set(m.party, (partyCounts.get(m.party) ?? 0) + 1);
      }

      return {
        sectorMembers,
        sectorPositions,
        partyCounts,
        totalRendered: filled,
      };
    }, [members, totalSeats]);

  const isResponsive = width === undefined;
  const heightRatio = VIEWBOX_H / VIEWBOX_W;
  const height = typeof width === "number" ? Math.round(width * heightRatio) : undefined;

  // Render helper: walk through positions in each sector, pair with
  // members (with trailing vacancies).
  const renderSector = (sector: Sector) => {
    const positions = sectorPositions[sector];
    const membersInSector = sectorMembers[sector];
    return positions.map((pos, i) => {
      const member = membersInSector[i];
      if (!member) {
        return (
          <circle
            key={`vacant-${sector}-${i}`}
            cx={pos.x}
            cy={pos.y}
            r={pos.r}
            fill="var(--color-border)"
          />
        );
      }
      const isSelected = selectedMemberId === member.memberId;
      const isHighlighted = member.highlighted || isSelected;
      const level = member.importance ?? null;
      const opacity = seatOpacity(level, isHighlighted);
      return (
        <g
          key={member.memberId}
          className={cn(
            "transition-all",
            onSelect && "cursor-pointer hover:opacity-80",
            !onSelect && detailHrefBase && "cursor-pointer hover:opacity-80",
          )}
          onClick={() => {
            if (onSelect) {
              onSelect(member);
              return;
            }
            if (detailHrefBase) {
              router.push(`${detailHrefBase}?legislator=${member.id}`);
            }
          }}
          onMouseEnter={() => setHovered(member)}
          onMouseLeave={() => setHovered(null)}
          opacity={opacity}
        >
          <circle
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
          />
        </g>
      );
    });
  };

  return (
    <div className={cn("inline-block", isResponsive && "w-full")}>
      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        width={isResponsive ? undefined : width}
        height={height}
        role="img"
        aria-label="대한민국 국회 본회의장 의석 배치도"
        className={cn("select-none", isResponsive && "h-auto w-full")}
      >
        {/* Podium marker (의장석) at the arc's origin — where all seats face */}
        <rect
          x={CENTER_X - 22}
          y={CENTER_Y - 20}
          width={44}
          height={16}
          rx={4}
          fill="var(--color-surface-2)"
          stroke="var(--color-border)"
          strokeWidth={1}
        />
        <text
          x={CENTER_X}
          y={CENTER_Y - 9}
          textAnchor="middle"
          fontSize="8"
          fontWeight="600"
          fill="var(--color-text-secondary)"
        >
          의장석
        </text>

        {/* Seats — rendered per sector so the aisles are visible */}
        {renderSector("left")}
        {renderSector("center")}
        {renderSector("right")}
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
            {hovered.nameHanja && (
              <span className="text-[11px] text-[var(--color-text-tertiary)]">
                {hovered.nameHanja}
              </span>
            )}
            <span className="text-[var(--color-text-secondary)]">
              · {hovered.party}
            </span>
            <LegislatorImportanceStar
              level={hovered.importance ?? null}
              size={12}
              reasons={hovered.importanceReasons}
            />
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">
            {hovered.district ?? "비례대표"}
            {hovered.electionType && <> · {hovered.electionType}</>}
            {hovered.termNumber && <> · {hovered.termNumber}선</>}
          </div>
          {hovered.committees && hovered.committees.length > 0 && (
            <div className="mt-0.5 max-w-[400px] text-[11px] text-[var(--color-text-secondary)]">
              {hovered.committees.join(", ")}
            </div>
          )}
          {hovered.committeeRole && (
            <div className="mt-1 text-[10px] font-semibold text-[var(--color-text-secondary)]">
              {hovered.committeeRole}
            </div>
          )}
          {hovered.importanceReasons && hovered.importanceReasons.length > 0 && (
            <div className="mt-1 max-w-[400px] text-[10px] text-[var(--color-text-tertiary)]">
              {hovered.importanceReasons.join(" · ")}
            </div>
          )}
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
          <span className="text-[var(--color-text-tertiary)]">
            · 총 {totalRendered}명
          </span>
        </div>
      )}
    </div>
  );
}
