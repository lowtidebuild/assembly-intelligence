import type { DailyBriefingContent } from "@/lib/daily-briefing-content";
import { cn } from "@/lib/utils";

const SEVERITY_LABELS: Record<
  DailyBriefingContent["headlines"][number]["severity"],
  string
> = {
  action: "대응",
  watch: "관찰",
  info: "정보",
};

export function DailyBriefingRenderer({
  content,
}: {
  content: DailyBriefingContent;
}) {
  return (
    <article className="space-y-4 text-[12px] text-[var(--color-text)]">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          {content.title}
        </p>
        <h3 className="mt-1 text-[15px] font-bold">오늘의 헤드라인</h3>
      </header>

      <section>
        <ul className="space-y-2">
          {content.headlines.map((headline, index) => (
            <li
              key={`${headline.text}-${index}`}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
            >
              <span
                className={cn(
                  "mr-2 inline-flex rounded-[999px] px-2 py-0.5 text-[10px] font-bold",
                  headline.severity === "action" &&
                    "bg-rose-50 text-rose-700",
                  headline.severity === "watch" &&
                    "bg-amber-50 text-amber-700",
                  headline.severity === "info" &&
                    "bg-sky-50 text-sky-700",
                )}
              >
                {SEVERITY_LABELS[headline.severity]}
              </span>
              {headline.text}
            </li>
          ))}
        </ul>
      </section>

      <BriefingSection title="핵심 법안">
        {content.keyBills.length === 0 ? (
          <EmptyLine />
        ) : (
          <div className="space-y-3">
            {content.keyBills.map((item) => (
              <div
                key={item.billId}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-3"
              >
                <h4 className="font-semibold leading-snug">{item.title}</h4>
                <p className="mt-2 leading-relaxed text-[var(--color-text-secondary)]">
                  {item.whyItMatters}
                </p>
                <p className="mt-2 leading-relaxed text-[var(--color-text-secondary)]">
                  <span className="font-semibold text-[var(--color-text)]">
                    액션
                  </span>{" "}
                  {item.recommendedAction}
                </p>
              </div>
            ))}
          </div>
        )}
      </BriefingSection>

      <BriefingSection title="오늘/이번주 일정">
        {content.schedule.length === 0 ? (
          <EmptyLine />
        ) : (
          <ul className="space-y-1.5">
            {content.schedule.map((item, index) => (
              <li key={`${item.date}-${item.subject}-${index}`}>
                {item.date} {item.time ?? ""} — {item.subject}
                {item.committee ? ` [${item.committee}]` : ""}
                {item.location ? ` @ ${item.location}` : ""}
              </li>
            ))}
          </ul>
        )}
      </BriefingSection>

      <BriefingSection title="신규 발의">
        {content.newBills.length === 0 ? (
          <EmptyLine />
        ) : (
          <ul className="space-y-1.5">
            {content.newBills.map((item) => (
              <li key={item.billId}>
                {item.title} — {item.proposer}
                {item.committee ? ` [${item.committee}]` : ""}
              </li>
            ))}
          </ul>
        )}
      </BriefingSection>

      <BriefingSection title="Watch List">
        {content.watchList.length === 0 ? (
          <EmptyLine />
        ) : (
          <ul className="space-y-1.5">
            {content.watchList.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        )}
      </BriefingSection>

      <footer className="border-t border-[var(--color-border)] pt-3 text-[var(--color-text-secondary)]">
        {content.footerSummary}
      </footer>
    </article>
  );
}

function BriefingSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-[12px] font-bold text-[var(--color-text)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function EmptyLine() {
  return (
    <p className="text-[12px] text-[var(--color-text-tertiary)]">
      오늘은 해당 없음
    </p>
  );
}
