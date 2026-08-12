"use client";
import { useEffect, useRef, useState } from "react";
import { C } from "@/components/ui";

type Status = "IDLE" | "PENDING" | "OK" | "ERR";

/**
 * Bouton d'action asynchrone qui rend son résultat visible SUR LUI-MÊME :
 * « … » pendant l'appel, « ✓ » en vert au succès, « ✗ + message » en rouge en
 * cas d'échec, puis retour à l'état normal. Sans ça l'admin clique et ne sait
 * pas si l'action est passée.
 *
 * `confirm` ajoute un deuxième clic obligatoire pour les actions à effet
 * irréversible (verrouillage = révélation des grilles).
 */
export function ActionButton({
  label,
  onAction,
  variant = "primary",
  disabled,
  disabledReason,
  confirm,
  confirmLabel,
  className = "",
}: {
  label: string;
  onAction: () => Promise<any>;
  variant?: "primary" | "outline" | "warn";
  disabled?: boolean;
  disabledReason?: string;
  confirm?: boolean;
  confirmLabel?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<Status>("IDLE");
  const [message, setMessage] = useState<string>("");
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const reset = (delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setStatus("IDLE");
      setMessage("");
    }, delay);
  };

  const run = async () => {
    if (confirm && !armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setArmed(false);
    setStatus("PENDING");
    setMessage("");
    try {
      await onAction();
      setStatus("OK");
      reset(2200);
    } catch (e: any) {
      setStatus("ERR");
      setMessage(e?.code || e?.message || "échec");
      reset(6000);
    }
  };

  const palette =
    status === "OK"
      ? { bg: C.gr, fg: C.bg, border: C.gr }
      : status === "ERR"
      ? { bg: "transparent", fg: C.rd, border: C.rd }
      : armed
      ? { bg: C.am, fg: C.bg, border: C.am }
      : variant === "primary"
      ? { bg: C.gr, fg: C.bg, border: C.gr }
      : variant === "warn"
      ? { bg: "transparent", fg: C.am, border: C.am }
      : { bg: "transparent", fg: C.mu, border: C.line };

  const text =
    status === "PENDING" ? "…" : status === "OK" ? `✓ ${label}` : status === "ERR" ? `✗ ${message}` : armed ? confirmLabel || `Confirmer : ${label}` : label;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <button
        onClick={run}
        disabled={disabled || status === "PENDING"}
        title={disabled ? disabledReason : undefined}
        className="min-h-[42px] px-4 font-bold text-sm cursor-pointer transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
        style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}` }}
      >
        {text}
      </button>
      {disabled && disabledReason && <div className="text-dim text-[10px]">{disabledReason}</div>}
    </div>
  );
}
