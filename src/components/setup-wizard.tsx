"use client";

/**
 * SetupWizard — 5-step client component for creating/editing an
 * IndustryProfile.
 *
 * Steps:
 *   1. 산업 선택       — preset grid or "직접 입력"
 *   2. 키워드          — chip editor (add/remove)
 *   3. 위원회          — checkbox list from ALL_COMMITTEES
 *   4. 의원 워치       — hemicycle picker (optional)
 *   5. 확인            — summary + submit
 *
 * State flows through local useState — single source of truth
 * until the final POST. `onPreset()` seeds the state from a preset,
 * but every field remains editable afterwards.
 *
 * Edit mode: if `existingProfile` is passed, step 1 is pre-selected
 * and all subsequent steps load existing values.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Hemicycle, type HemicycleMember } from "@/components/hemicycle";
import type { AssemblyCommittee } from "@/lib/assembly-committees";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Sparkles,
  Users,
  X,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────
 * Props
 * ────────────────────────────────────────────────────────────── */

export interface PresetDTO {
  slug: string;
  name: string;
  nameEn: string;
  icon: string;
  description: string;
  keywords: string[];
  excludeKeywords: string[];
  suggestedCommittees: string[];
  llmContext: string;
  presetVersion: string;
}

export interface ExistingProfileDTO {
  slug: string;
  name: string;
  nameEn: string;
  icon: string;
  description: string;
  keywords: string[];
  excludeKeywords: string[];
  llmContext: string;
  presetVersion: string | null;
  committees: string[];
  legislatorIds: number[];
}

export interface SetupWizardProps {
  presets: PresetDTO[];
  allCommittees: AssemblyCommittee[];
  allLegislators: HemicycleMember[];
  existingProfile: ExistingProfileDTO | null;
}

/* ─────────────────────────────────────────────────────────────
 * Wizard state + step enum
 * ────────────────────────────────────────────────────────────── */

type StepId = 1 | 2 | 3 | 4 | 5;

interface WizardState {
  slug: string;
  name: string;
  nameEn: string;
  icon: string;
  description: string;
  keywords: string[];
  excludeKeywords: string[];
  llmContext: string;
  presetVersion: string | null;
  committees: string[];
  legislatorIds: Set<number>;
}

function initialStateFromProfile(p: ExistingProfileDTO): WizardState {
  return {
    slug: p.slug,
    name: p.name,
    nameEn: p.nameEn,
    icon: p.icon,
    description: p.description,
    keywords: [...p.keywords],
    excludeKeywords: [...p.excludeKeywords],
    llmContext: p.llmContext,
    presetVersion: p.presetVersion,
    committees: [...p.committees],
    legislatorIds: new Set(p.legislatorIds),
  };
}

function initialStateFromPreset(p: PresetDTO): WizardState {
  return {
    slug: p.slug,
    name: p.name,
    nameEn: p.nameEn,
    icon: p.icon,
    description: p.description,
    keywords: [...p.keywords],
    excludeKeywords: [...p.excludeKeywords],
    llmContext: p.llmContext,
    presetVersion: p.presetVersion,
    committees: [...p.suggestedCommittees],
    legislatorIds: new Set(),
  };
}

function emptyCustomState(): WizardState {
  return {
    slug: "custom",
    name: "",
    nameEn: "",
    icon: "📊",
    description: "",
    keywords: [],
    excludeKeywords: [],
    llmContext: "",
    presetVersion: null,
    committees: [],
    legislatorIds: new Set(),
  };
}

/* ─────────────────────────────────────────────────────────────
 * Main component
 * ────────────────────────────────────────────────────────────── */

export function SetupWizard({
  presets,
  allCommittees,
  allLegislators,
  existingProfile,
}: SetupWizardProps) {
  const router = useRouter();
  const isEditMode = existingProfile !== null;

  // Determine starting step. Edit mode starts at step 2 (skip preset
  // picker since they already chose one).
  const [step, setStep] = useState<StepId>(isEditMode ? 2 : 1);
  const [state, setState] = useState<WizardState>(() =>
    existingProfile
      ? initialStateFromProfile(existingProfile)
      : emptyCustomState(),
  );

  const [submitting, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ── Navigation ─────────────────────────────────────────
  const next = () => {
    if (step < 5) setStep((step + 1) as StepId);
  };
  const back = () => {
    if (step > 1) setStep((step - 1) as StepId);
  };

  const pickPreset = (preset: PresetDTO) => {
    setState(initialStateFromPreset(preset));
    setStep(2);
  };

  const pickCustom = () => {
    setState(emptyCustomState());
    setStep(2);
  };

  const canProceed = ((): boolean => {
    if (step === 1) return true; // step 1 navigates via pickPreset
    if (step === 2) {
      return state.name.trim().length > 0 && state.keywords.length > 0;
    }
    if (step === 3) return state.committees.length > 0;
    if (step === 4) return true; // watched legislators are optional
    return true;
  })();

  const handleSubmit = () => {
    setError(null);
    startSubmit(async () => {
      try {
        // Validate minimum fields client-side for a better UX than
        // a generic 400.
        if (!state.name.trim()) {
          throw new Error("산업명을 입력해주세요.");
        }
        if (state.keywords.length === 0) {
          throw new Error("키워드를 1개 이상 추가해주세요.");
        }
        if (state.llmContext.trim().length < 20) {
          throw new Error("LLM 컨텍스트는 최소 20자 이상이어야 합니다.");
        }

        const res = await fetch("/api/setup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            slug: state.slug || "custom",
            name: state.name.trim(),
            nameEn: state.nameEn.trim() || state.name.trim(),
            icon: state.icon || "📊",
            description: state.description.trim(),
            keywords: state.keywords,
            excludeKeywords: state.excludeKeywords,
            llmContext: state.llmContext.trim(),
            presetVersion: state.presetVersion,
            committees: state.committees,
            legislatorIds: Array.from(state.legislatorIds),
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error?.message || `HTTP ${res.status}`);
        }
        router.push("/briefing");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Header */}
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4">
        <div className="mx-auto flex max-w-[960px] items-center justify-between">
          <div>
            <h1 className="text-[18px] font-extrabold tracking-[-0.01em] text-[var(--color-primary)]">
              ParlaWatch+ 설정
            </h1>
            <p className="text-[12px] text-[var(--color-text-secondary)]">
              {isEditMode ? "프로필 편집" : "산업 프로필 생성"} · Step {step}/5
            </p>
          </div>
          <StepIndicator step={step} />
        </div>
      </header>

      <main className="mx-auto max-w-[960px] p-6">
        {step === 1 && (
          <Step1Industry
            presets={presets}
            onPickPreset={pickPreset}
            onPickCustom={pickCustom}
          />
        )}
        {step === 2 && (
          <Step2Keywords
            state={state}
            onChange={setState}
            isEditMode={isEditMode}
          />
        )}
        {step === 3 && (
          <Step3Committees
            state={state}
            onChange={setState}
            allCommittees={allCommittees}
          />
        )}
        {step === 4 && (
          <Step4Legislators
            state={state}
            onChange={setState}
            allLegislators={allLegislators}
          />
        )}
        {step === 5 && (
          <Step5Confirm
            state={state}
            allLegislatorsById={
              new Map(allLegislators.map((l) => [l.id, l]))
            }
            onSubmit={handleSubmit}
            submitting={submitting}
            error={error}
          />
        )}

        {/* Step nav (not shown on step 1 since pickPreset moves forward) */}
        {step > 1 && step < 5 && (
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={back}
              disabled={isEditMode && step === 2}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
              이전
            </button>
            <button
              type="button"
              onClick={next}
              disabled={!canProceed}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              다음
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Step indicator
 * ────────────────────────────────────────────────────────────── */

function StepIndicator({ step }: { step: StepId }) {
  const labels = ["산업", "키워드", "위원회", "의원", "확인"];
  return (
    <ol className="flex items-center gap-2 text-[11px] font-semibold">
      {labels.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[10px]",
                active
                  ? "bg-[var(--color-primary)] text-white"
                  : done
                    ? "bg-[var(--color-success)] text-white"
                    : "bg-[var(--color-surface-2)] text-[var(--color-text-tertiary)]",
              )}
            >
              {done ? <Check className="h-3 w-3" /> : n}
            </span>
            <span
              className={cn(
                "hidden sm:inline",
                active
                  ? "text-[var(--color-text)]"
                  : "text-[var(--color-text-tertiary)]",
              )}
            >
              {label}
            </span>
            {n < labels.length && (
              <span className="text-[var(--color-border)]">→</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Step 1 — Industry preset picker
 * ────────────────────────────────────────────────────────────── */

function Step1Industry({
  presets,
  onPickPreset,
  onPickCustom,
}: {
  presets: PresetDTO[];
  onPickPreset: (p: PresetDTO) => void;
  onPickCustom: () => void;
}) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[22px] font-bold text-[var(--color-text)]">
          어떤 산업을 모니터링하시나요?
        </h2>
        <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
          프리셋을 선택하면 해당 산업의 키워드/위원회가 자동으로 채워집니다.
          다음 단계에서 자유롭게 수정할 수 있습니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {presets.map((p) => (
          <button
            key={p.slug}
            type="button"
            onClick={() => onPickPreset(p)}
            className="group flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-left shadow-[var(--shadow-card)] transition-all hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-card-hover)]"
          >
            <div className="flex items-start gap-3">
              <span className="text-[28px] leading-none">{p.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
                  {p.name}
                </div>
                <div className="text-[11px] text-[var(--color-text-tertiary)]">
                  {p.nameEn}
                </div>
              </div>
            </div>
            <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
              {p.description}
            </p>
            <div className="mt-1 flex items-center gap-3 text-[10px] text-[var(--color-text-tertiary)]">
              <span>
                키워드{" "}
                <strong className="text-[var(--color-text-secondary)]">
                  {p.keywords.length}
                </strong>
              </span>
              <span>·</span>
              <span>
                위원회{" "}
                <strong className="text-[var(--color-text-secondary)]">
                  {p.suggestedCommittees.length}
                </strong>
              </span>
            </div>
          </button>
        ))}

        {/* Custom option */}
        <button
          type="button"
          onClick={onPickCustom}
          className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center shadow-[var(--shadow-card)] transition-all hover:border-[var(--color-primary)]"
        >
          <Plus className="h-6 w-6 text-[var(--color-text-tertiary)]" />
          <div className="text-[14px] font-bold text-[var(--color-text)]">
            직접 입력
          </div>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">
            키워드와 위원회를 처음부터 직접 구성
          </p>
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Step 2 — Name + keywords + LLM context
 * ────────────────────────────────────────────────────────────── */

function Step2Keywords({
  state,
  onChange,
  isEditMode,
}: {
  state: WizardState;
  onChange: (s: WizardState) => void;
  isEditMode: boolean;
}) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[22px] font-bold text-[var(--color-text)]">
          {isEditMode ? "산업 정보를 수정하세요" : "산업 정보를 확인하세요"}
        </h2>
        <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
          프리셋의 키워드/컨텍스트는 시작점일 뿐입니다. 자유롭게 추가/삭제/수정하세요.
        </p>
      </div>

      <div className="space-y-5 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)]">
        {/* Name + icon + slug */}
        <div className="grid grid-cols-[80px_1fr_200px] gap-3">
          <FieldLabel label="아이콘">
            <input
              type="text"
              value={state.icon}
              onChange={(e) =>
                onChange({ ...state, icon: e.target.value.slice(0, 4) })
              }
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-center text-[20px]"
              maxLength={4}
            />
          </FieldLabel>
          <FieldLabel label="산업명 (한국어) *">
            <input
              type="text"
              value={state.name}
              onChange={(e) => onChange({ ...state, name: e.target.value })}
              placeholder="예: 게임, 정보보안, 바이오"
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[14px] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </FieldLabel>
          <FieldLabel label="Slug (URL용)">
            <input
              type="text"
              value={state.slug}
              onChange={(e) =>
                onChange({
                  ...state,
                  slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                })
              }
              placeholder="game"
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-[12px] focus:border-[var(--color-primary)] focus:outline-none"
              disabled={isEditMode}
            />
          </FieldLabel>
        </div>

        {/* Description */}
        <FieldLabel label="한 줄 설명 (선택)">
          <input
            type="text"
            value={state.description}
            onChange={(e) =>
              onChange({ ...state, description: e.target.value })
            }
            placeholder="예: 게임산업법, 확률형 아이템, 등급분류..."
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </FieldLabel>

        {/* Keywords */}
        <FieldLabel label={`포함 키워드 (${state.keywords.length}개) *`}>
          <KeywordChipEditor
            items={state.keywords}
            placeholder="포함 키워드 입력 후 Enter (예: 확률형 아이템)"
            emptyHint="이 산업을 잡아내는 핵심 키워드를 추가하세요"
            tone="primary"
            onAdd={(kw) =>
              onChange({ ...state, keywords: [...state.keywords, kw] })
            }
            onRemove={(kw) =>
              onChange({
                ...state,
                keywords: state.keywords.filter((k) => k !== kw),
              })
            }
          />
        </FieldLabel>

        <FieldLabel label={`제외 키워드 (${state.excludeKeywords.length}개)`}>
          <KeywordChipEditor
            items={state.excludeKeywords}
            placeholder="제외 키워드 입력 후 Enter (예: 제로섬 게임)"
            emptyHint="넓은 포함 키워드가 잡아내는 false positive를 막는 표현을 추가하세요"
            tone="warning"
            onAdd={(kw) =>
              onChange({
                ...state,
                excludeKeywords: [...state.excludeKeywords, kw],
              })
            }
            onRemove={(kw) =>
              onChange({
                ...state,
                excludeKeywords: state.excludeKeywords.filter((k) => k !== kw),
              })
            }
          />
          <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
            예: 포함 키워드가 `게임`일 때 제외 키워드로 `제로섬 게임`, `게임이론`,
            `치킨게임`을 넣으면 회의록/입법예고 false positive를 줄일 수 있습니다.
          </p>
        </FieldLabel>

        {/* LLM context */}
        <FieldLabel
          label={`LLM 컨텍스트 (Gemini 프롬프트용, ${state.llmContext.length}자)`}
        >
          <textarea
            value={state.llmContext}
            onChange={(e) =>
              onChange({ ...state, llmContext: e.target.value })
            }
            rows={8}
            placeholder="이 산업이 무엇인지, 어떤 규제/이슈가 핵심인지, 어떤 관점에서 법안을 판단해야 하는지 2-3 단락으로 작성하세요. Gemini가 모든 법안 점수 매기기에 이 컨텍스트를 사용합니다."
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] leading-relaxed focus:border-[var(--color-primary)] focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
            최소 20자. 산업 전문가가 쓴 것처럼 구체적일수록 스코어링이 정확해집니다.
          </p>
        </FieldLabel>
      </div>
    </div>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-[var(--color-text-secondary)]">
      {label}
      {children}
    </label>
  );
}

function KeywordChipEditor({
  items,
  placeholder,
  emptyHint,
  tone,
  onAdd,
  onRemove,
}: {
  items: string[];
  placeholder: string;
  emptyHint: string;
  tone: "primary" | "warning";
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  const [pendingValue, setPendingValue] = useState("");

  const add = () => {
    const value = pendingValue.trim();
    if (!value) return;
    if (items.includes(value)) {
      setPendingValue("");
      return;
    }
    onAdd(value);
    setPendingValue("");
  };

  const chipClassName =
    tone === "primary"
      ? "bg-[var(--color-primary-light)] text-[var(--color-primary)] hover:bg-[#bfdbfe]"
      : "bg-[#fef3c7] text-[#b45309] hover:bg-[#fde68a]";

  const buttonClassName =
    tone === "primary"
      ? "bg-[var(--color-primary)] text-white"
      : "bg-[#b45309] text-white";

  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {items.length === 0 && (
          <span className="text-[11px] italic text-[var(--color-text-tertiary)]">
            {emptyHint}
          </span>
        )}
        {items.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onRemove(item)}
            className={cn(
              "inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] font-semibold",
              chipClassName,
            )}
          >
            {item}
            <X className="h-3 w-3" />
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={pendingValue}
          onChange={(e) => setPendingValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] focus:border-[var(--color-primary)] focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={!pendingValue.trim()}
          className={cn(
            "rounded-[var(--radius-sm)] px-3 text-[12px] font-semibold disabled:opacity-50",
            buttonClassName,
          )}
        >
          추가
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Step 3 — Committees
 * ────────────────────────────────────────────────────────────── */

function Step3Committees({
  state,
  onChange,
  allCommittees,
}: {
  state: WizardState;
  onChange: (s: WizardState) => void;
  allCommittees: AssemblyCommittee[];
}) {
  const toggle = (name: string) => {
    const has = state.committees.includes(name);
    onChange({
      ...state,
      committees: has
        ? state.committees.filter((c) => c !== name)
        : [...state.committees, name],
    });
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[22px] font-bold text-[var(--color-text)]">
          관련 상임위원회를 선택하세요
        </h2>
        <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
          선택한 위원회에 소속된 법안만 아침 동기화에서 수집합니다.
          최소 1개 이상 필수. 보통 2~5개가 적당합니다.
        </p>
      </div>

      <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-center justify-between border-b border-[var(--color-border)] pb-3">
          <span className="text-[12px] font-bold text-[var(--color-text)]">
            17개 상임위 + 특별위원회 · {state.committees.length}개 선택됨
          </span>
          <button
            type="button"
            onClick={() => onChange({ ...state, committees: [] })}
            className="text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-error)]"
          >
            전체 해제
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {allCommittees.map((c) => {
            const checked = state.committees.includes(c.name);
            return (
              <label
                key={c.name}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border px-3 py-2.5 transition-colors",
                  checked
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)]",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(c.name)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[var(--color-text)]">
                      {c.name}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-tertiary)]">
                      {c.shortName}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[var(--color-text-secondary)]">
                    {c.jurisdiction}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Step 4 — Legislators (hemicycle picker)
 * ────────────────────────────────────────────────────────────── */

function Step4Legislators({
  state,
  onChange,
  allLegislators,
}: {
  state: WizardState;
  onChange: (s: WizardState) => void;
  allLegislators: HemicycleMember[];
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(allLegislators.length);
  const router = useRouter();

  const toggle = (id: number) => {
    const next = new Set(state.legislatorIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...state, legislatorIds: next });
  };

  const triggerSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/setup/sync-legislators", {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { count: number };
      setMemberCount(data.count);
      router.refresh();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  // Mark currently-selected members as highlighted for the hemicycle
  const hemicycleMembers: HemicycleMember[] = allLegislators.map((m) => ({
    ...m,
    highlighted: state.legislatorIds.has(m.id),
  }));

  const selectedList = allLegislators.filter((m) =>
    state.legislatorIds.has(m.id),
  );

  if (memberCount === 0) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-[22px] font-bold text-[var(--color-text)]">
            의원 데이터가 필요합니다
          </h2>
          <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
            현재 데이터베이스에 22대 국회의원 정보가 없습니다. 국회 API에서
            전체 295명을 한 번만 가져오면 됩니다 (약 30-60초 소요).
          </p>
        </div>
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-[var(--shadow-card)]">
          <Users className="mx-auto mb-3 h-10 w-10 text-[var(--color-text-tertiary)]" />
          <button
            type="button"
            onClick={triggerSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {syncing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                의원 데이터 가져오는 중... (30-90초)
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                지금 의원 데이터 가져오기
              </>
            )}
          </button>
          {syncError && (
            <p className="mt-3 text-[11px] text-[var(--color-error)]">
              {syncError}
            </p>
          )}
          <p className="mt-4 text-[10px] text-[var(--color-text-tertiary)]">
            의원 선택은 선택 사항입니다. 건너뛰려면 아래 &apos;다음&apos;을 클릭하세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[22px] font-bold text-[var(--color-text)]">
          모니터링할 의원을 선택하세요 (선택)
        </h2>
        <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
          산업 관련 발의 활동이 많은 의원을 미리 지정하면 의원 워치 페이지에서
          바로 추적할 수 있습니다. 언제든 나중에 추가/제거할 수 있습니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col items-center rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
          <div className="w-full max-w-[600px]">
            <Hemicycle
              members={hemicycleMembers}
              onSelect={(m) => toggle(m.id)}
            />
          </div>
          <p className="mt-3 text-[11px] text-[var(--color-text-tertiary)]">
            의석을 클릭해서 선택/해제 · 흰 링이 선택된 의원
          </p>
        </div>

        <aside className="self-start rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] lg:sticky lg:top-6">
          <div className="mb-3 flex items-center justify-between border-b border-[var(--color-border)] pb-2">
            <h3 className="text-[12px] font-bold text-[var(--color-text)]">
              선택된 의원
            </h3>
            <span className="text-[11px] font-semibold text-[var(--color-primary)]">
              {selectedList.length}명
            </span>
          </div>
          {selectedList.length === 0 ? (
            <p className="text-[11px] italic text-[var(--color-text-tertiary)]">
              아직 선택된 의원이 없습니다. 이 단계는 선택 사항이니 건너뛰어도
              됩니다.
            </p>
          ) : (
            <ul className="space-y-1.5 text-[11px]">
              {selectedList.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-1.5"
                >
                  <span className="truncate">
                    <strong className="text-[var(--color-text)]">
                      {m.name}
                    </strong>
                    <span className="ml-1 text-[var(--color-text-tertiary)]">
                      {m.party}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggle(m.id)}
                    className="shrink-0 text-[var(--color-text-tertiary)] hover:text-[var(--color-error)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Step 5 — Confirm + submit
 * ────────────────────────────────────────────────────────────── */

function Step5Confirm({
  state,
  allLegislatorsById,
  onSubmit,
  submitting,
  error,
}: {
  state: WizardState;
  allLegislatorsById: Map<number, HemicycleMember>;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[22px] font-bold text-[var(--color-text)]">
          설정 확인
        </h2>
        <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
          저장하면 바로 브리핑봇 페이지로 이동합니다. 내일 아침 06:30 KST에
          첫 동기화가 실행됩니다 (또는 수동으로 지금 트리거 가능).
        </p>
      </div>

      <div className="space-y-4 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)]">
        {/* Summary grid */}
        <div className="grid grid-cols-[140px_1fr] gap-y-3 text-[13px]">
          <dt className="text-[var(--color-text-tertiary)]">산업</dt>
          <dd className="font-semibold text-[var(--color-text)]">
            {state.icon} {state.name}{" "}
            <span className="ml-2 text-[11px] text-[var(--color-text-tertiary)]">
              ({state.nameEn || state.name}, slug={state.slug})
            </span>
          </dd>

          <dt className="text-[var(--color-text-tertiary)]">프리셋</dt>
          <dd className="font-mono text-[11px] text-[var(--color-text-secondary)]">
            {state.presetVersion ?? "custom (직접 입력)"}
          </dd>

          <dt className="text-[var(--color-text-tertiary)]">
            포함 키워드 ({state.keywords.length})
          </dt>
          <dd className="flex flex-wrap gap-1">
            {state.keywords.map((kw) => (
              <span
                key={kw}
                className="rounded-[var(--radius-sm)] bg-[var(--color-primary-light)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-primary)]"
              >
                {kw}
              </span>
            ))}
          </dd>

          <dt className="text-[var(--color-text-tertiary)]">
            제외 키워드 ({state.excludeKeywords.length})
          </dt>
          <dd className="flex flex-wrap gap-1">
            {state.excludeKeywords.length === 0 && (
              <span className="text-[11px] italic text-[var(--color-text-tertiary)]">
                없음
              </span>
            )}
            {state.excludeKeywords.map((kw) => (
              <span
                key={kw}
                className="rounded-[var(--radius-sm)] bg-[#fef3c7] px-2 py-0.5 text-[11px] font-semibold text-[#b45309]"
              >
                {kw}
              </span>
            ))}
          </dd>

          <dt className="text-[var(--color-text-tertiary)]">
            위원회 ({state.committees.length})
          </dt>
          <dd className="flex flex-wrap gap-1">
            {state.committees.map((c) => (
              <span
                key={c}
                className="rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]"
              >
                {c}
              </span>
            ))}
          </dd>

          <dt className="text-[var(--color-text-tertiary)]">
            워치 의원 ({state.legislatorIds.size})
          </dt>
          <dd className="flex flex-wrap gap-1">
            {state.legislatorIds.size === 0 && (
              <span className="text-[11px] italic text-[var(--color-text-tertiary)]">
                없음 — 나중에 추가 가능
              </span>
            )}
            {Array.from(state.legislatorIds).map((id) => {
              const m = allLegislatorsById.get(id);
              if (!m) return null;
              return (
                <span
                  key={id}
                  className="rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]"
                >
                  {m.name} ({m.party.slice(0, 2)})
                </span>
              );
            })}
          </dd>

          <dt className="text-[var(--color-text-tertiary)]">LLM 컨텍스트</dt>
          <dd className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
            <details>
              <summary className="cursor-pointer text-[var(--color-primary)]">
                {state.llmContext.length}자 · 펼쳐보기
              </summary>
              <pre className="mt-2 max-h-[200px] overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] p-3 font-sans">
                {state.llmContext}
              </pre>
            </details>
          </dd>
        </div>

        {error && (
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-error)] bg-[#fef2f2] px-3 py-2 text-[12px] text-[var(--color-error)]">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-4">
          <span className="text-[11px] text-[var(--color-text-tertiary)]">
            {state.presetVersion
              ? "프리셋 기반 — 언제든 설정 페이지에서 편집 가능"
              : "커스텀 프로필 — 언제든 설정 페이지에서 편집 가능"}
          </span>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                저장 중...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                저장하고 시작하기
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
