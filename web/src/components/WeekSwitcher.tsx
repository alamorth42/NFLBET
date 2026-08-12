"use client";
import { useRouter } from "next/navigation";
import { C } from "@/components/ui";

/**
 * Navigation ← W07 → bornée par la saison. Sans ça une saison de 18 semaines
 * n'est consultable qu'en éditant l'URL à la main.
 */
export function WeekSwitcher({
  n,
  startWeek = 1,
  endWeek = 18,
  hrefFor,
  label,
}: {
  n: number;
  startWeek?: number;
  endWeek?: number;
  hrefFor: (w: number) => string;
  label?: string;
}) {
  const router = useRouter();
  const prev = n > startWeek ? n - 1 : null;
  const next = n < endWeek ? n + 1 : null;

  const btn = (target: number | null, glyph: string, aria: string) => (
    <button
      onClick={() => target && router.push(hrefFor(target))}
      disabled={!target}
      aria-label={aria}
      className="w-9 h-9 grid place-items-center font-display font-extrabold text-[18px] cursor-pointer disabled:opacity-25 disabled:cursor-default"
      style={{ border: `1px solid ${C.line}`, color: C.mu }}
    >
      {glyph}
    </button>
  );

  return (
    <div className="flex items-center gap-2">
      {btn(prev, "‹", "Semaine précédente")}
      <select
        value={n}
        onChange={(e) => router.push(hrefFor(parseInt(e.target.value, 10)))}
        className="flex-1 bg-s1 border border-line px-2 py-[7px] font-mono text-[11px] tracking-[0.1em] text-center cursor-pointer"
      >
        {Array.from({ length: Math.max(0, endWeek - startWeek + 1) }, (_, i) => startWeek + i).map((w) => (
          <option key={w} value={w}>
            {label ? `${label} ` : ""}WEEK {String(w).padStart(2, "0")}
          </option>
        ))}
      </select>
      {btn(next, "›", "Semaine suivante")}
    </div>
  );
}
