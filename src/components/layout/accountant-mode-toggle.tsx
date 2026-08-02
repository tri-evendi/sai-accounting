"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Calculator, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { effectiveAccountantMode } from "@/lib/accountant-mode";
import { ROLES, isFullAccessRole } from "@/lib/constants";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

/**
 * Mode Akuntan toggle (issue #11) — the primary surface for the preference.
 *
 * Lives in the navbar. Reads the current user's role + stored preference from
 * the session and shows the EFFECTIVE mode. Menekan tombol TIDAK langsung
 * mengganti mode: ia membuka dialog konfirmasi yang MENJELASKAN apa yang akan
 * berubah (ON vs OFF) dulu, baru menerapkan bila dikonfirmasi. Ini juga jadi
 * satu-satunya tempat penjelasan (menggantikan tooltip lama yang penuh jargon):
 * pengguna yang cuma ingin tahu tinggal buka lalu "Batal".
 *
 * Display-only: it changes what the user sees, never their role/authorisation,
 * and never what the posting engine writes.
 */
export function AccountantModeToggle() {
  const t = useT();
  const { data: session, update } = useSession();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!session?.user) return null;

  const role = session.user.role;
  // The toggle is meaningful only where there are accounting surfaces or
  // transaction forms with debit/kredit terminology: the full-access roles
  // (managing_director, administrator — menus + forms) and finance_manager
  // (forms). warehouse_head has neither, so it never sees a control that would
  // do nothing. Administrators default to ON, so this is also their way OFF.
  if (!isFullAccessRole(role) && role !== ROLES.FINANCE_MANAGER) return null;

  const isOn = effectiveAccountantMode({
    role,
    accountantMode: session.user.accountantMode,
  });

  async function applyToggle() {
    if (saving) return;
    const next = !isOn;
    setSaving(true);
    try {
      const res = await apiFetch("/api/user/accountant-mode", {
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

  // Pesan konfirmasi bahasa sehari-hari, menjelaskan AKIBAT dari pilihan ini —
  // jargon dijelaskan (jurnal, buku besar), bukan diasumsikan. Teksnya hidup di
  // kamus (`accountantMode.*`) supaya penjelasan panjang ini ikut berbahasa
  // pengguna, bukan hanya tombolnya.
  const dialogTitle = isOn
    ? t("accountantMode.turnOffTitle")
    : t("accountantMode.turnOnTitle");
  const dialogMessage = isOn
    ? t("accountantMode.turnOffMessage")
    : t("accountantMode.turnOnMessage");

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        disabled={saving}
        role="switch"
        aria-checked={isOn}
        aria-label={t("accountantMode.toggleAria", {
          state: isOn ? t("accountantMode.state.on") : t("accountantMode.state.off"),
        })}
        title={t("accountantMode.toggleTitle")}
        className={cn(
          "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
          isOn
            ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/10"
            : "border-border bg-card text-muted-foreground hover:bg-muted"
        )}
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Calculator className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">{t("accountantMode.label")}</span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-xs font-semibold",
            isOn ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {isOn ? t("accountantMode.on") : t("accountantMode.off")}
        </span>
      </button>

      {/* Dialog konfirmasi yang menjelaskan pilihan sebelum diterapkan. "Batal"
          juga berfungsi sebagai jalan "cuma ingin tahu" tanpa mengubah apa pun. */}
      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={dialogTitle}
        message={dialogMessage}
        confirmLabel={
          isOn ? t("accountantMode.confirmTurnOff") : t("accountantMode.confirmTurnOn")
        }
        confirmVariant="primary"
        onConfirm={applyToggle}
      />
    </>
  );
}
