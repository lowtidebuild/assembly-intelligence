"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export function LegislatorAvatar({
  name,
  photoUrl,
  size = 36,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = useMemo(() => name.slice(0, 1), [name]);
  const showPhoto = Boolean(photoUrl) && !failed;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-[var(--color-primary-light)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {showPhoto ? (
        <Image
          src={photoUrl!}
          alt={name}
          fill
          sizes={`${size}px`}
          className="object-cover"
          onError={() => setFailed(true)}
        />
      ) : null}
      {!showPhoto ? (
        <div
          className="flex h-full w-full items-center justify-center font-bold text-[var(--color-primary)]"
          style={{ fontSize: Math.max(12, Math.round(size * 0.42)) }}
        >
          {initials}
        </div>
      ) : null}
    </div>
  );
}
