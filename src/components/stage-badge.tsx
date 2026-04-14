/**
 * StageBadge — colored chip for bill stages 0-6.
 *
 * Colors match the GR/PA team's Excel convention (globals.css
 * --color-stage-* tokens).
 */

const STAGE_LABELS: Record<string, string> = {
  stage_0: "발의예정",
  stage_1: "법안발의",
  stage_2: "상임위심사",
  stage_3: "법사위심사",
  stage_4: "본회의가결",
  stage_5: "정부이송",
  stage_6: "공포",
};

const STAGE_BG: Record<string, string> = {
  stage_0: "bg-[var(--color-stage-0)] border border-[var(--color-border)]",
  stage_1: "bg-[var(--color-stage-1)]",
  stage_2: "bg-[var(--color-stage-2)]",
  stage_3: "bg-[var(--color-stage-3)]",
  stage_4: "bg-[var(--color-stage-4)]",
  stage_5: "bg-[var(--color-stage-5)]",
  stage_6: "bg-[var(--color-stage-6)]",
};

export function StageBadge({ stage }: { stage: string }) {
  return (
    <span
      className={`inline-block rounded-[4px] px-[7px] py-[2px] text-[10px] font-semibold text-[var(--color-stage-text)] ${STAGE_BG[stage] ?? ""}`}
    >
      {STAGE_LABELS[stage] ?? stage}
    </span>
  );
}
