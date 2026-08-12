"use client";
import { WeekState } from "@/lib/types";

export const C = {
  bg: "#0B0F0C", s1: "#141A16", s2: "#1D2620", line: "#2A342C",
  tx: "#E8EFE9", mu: "#93A197", dim: "#6E7D74", gr: "#45D07A", am: "#FFA92E", rd: "#E06060",
};

export function Card({
  children,
  accent,
  className = "",
}: {
  children: React.ReactNode;
  accent?: "am" | "gr" | "rd";
  className?: string;
}) {
  return (
    <div
      className={`bg-s1 border border-line ${className}`}
      style={accent ? { borderTop: `3px solid ${C[accent]}` } : undefined}
    >
      {children}
    </div>
  );
}

export function StateBadge({ state }: { state?: WeekState }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    UPCOMING: { label: "À VENIR", bg: C.line, fg: C.tx },
    OPEN: { label: "OUVERT", bg: C.gr, fg: C.bg },
    LOCKED: { label: "VERROUILLÉ", bg: C.am, fg: C.bg },
    SCORING: { label: "CALCUL", bg: C.am, fg: C.bg },
    PUBLISHED: { label: "PUBLIÉE", bg: C.am, fg: C.bg },
  };
  const s = map[state || "UPCOMING"];
  return (
    <span className="font-mono text-[10px] tracking-[0.1em] px-[7px] py-[3px]" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[10px] tracking-[0.1em] bg-line text-tx px-[7px] py-[4px]">{children}</span>;
}

export function BigNum({
  children,
  color = C.tx,
  size = 44,
}: {
  children: React.ReactNode;
  color?: string;
  size?: number;
}) {
  return (
    <span className="font-display font-extrabold leading-[0.9]" style={{ fontSize: size, color }}>
      {children}
    </span>
  );
}
