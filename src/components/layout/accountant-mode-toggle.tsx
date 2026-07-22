"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Calculator, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { effectiveAccountantMode } from "@/lib/accountant-mode";

/**
 * Mode Akuntan toggle (issue #11) — the primary surface for the preference.
 *
 * Lives in the navbar. Reads the current user's role + stored preference from
 * the session, shows the EFFECTIVE mode, and on click persists the flipped value
 * for THIS user only (PATCH /api/user/accountant-mode), refreshes the session
 * token so the change sticks without a re-login, then `router.refresh()` so the
 * server components (sidebar visibility + page guards) re-evaluate immediately.
 *
 * Display-only: it changes what the user sees, never their role/authorisation.
 * The on/off state is conveyed by icon + text label (not colour alone) and
 * exposed to assistive tech via `aria-pressed`.
 */
export function AccountantModeToggle() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  if (!session?.user) return null;

  const role = session.user.role;
  // The toggle is meaningful only where there are accounting surfaces or
  // transaction forms with debit/kredit terms: bos (menus + forms) and core
  // (forms). ptg has neither, so it never sees a control that would do nothing.
  if (role !== "bos" && role !== "core") return null;

  const isOn = effectiveAccountantMode({
    role,
    accountantMode: session.user.accountantMode,
  });

  async function handleToggle() {
    if (saving) return;
    const next = !isOn;
    setSaving(true);
    try {
      const res = await fetch("/api/user/accountant-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountantMode: next }),
      });
      if (!res.ok) return;
      // Push the new preference into the JWT (jwt callback handles the trigger),
      // then re-render server components that read effective mode.
      await update({ accountantMode: next });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={saving}
      role="switch"
      aria-checked={isOn}
      aria-label={`Mode Akuntan ${isOn ? "aktif" : "nonaktif"}`}
      title="Tampilkan / sembunyikan jurnal, buku besar, COA, dan istilah debit/kredit"
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
        isOn
          ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/10"
          : "border-border bg-white text-muted-foreground hover:bg-muted"
      )}
    >
      {saving ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Calculator className="h-4 w-4" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">Mode Akuntan</span>
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-xs font-semibold",
          isOn ? "bg-primary text-white" : "bg-muted text-muted-foreground"
        )}
      >
        {isOn ? "ON" : "OFF"}
      </span>
    </button>
  );
}
