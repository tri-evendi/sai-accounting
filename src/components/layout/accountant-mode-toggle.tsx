"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Calculator, Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { effectiveAccountantMode } from "@/lib/accountant-mode";
import { ROLES } from "@/lib/constants";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

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
  if (role !== ROLES.BOS && role !== ROLES.CORE) return null;

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
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handleToggle}
        disabled={saving}
        role="switch"
        aria-checked={isOn}
        aria-label={`Mode Akuntan ${isOn ? "aktif" : "nonaktif"}`}
        title="Klik untuk menampilkan / menyembunyikan surface & istilah akuntansi. Ikon (i) untuk penjelasan."
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
        <span className="hidden sm:inline">Mode Akuntan</span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-xs font-semibold",
            isOn ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {isOn ? "ON" : "OFF"}
        </span>
      </button>

      {/* Penjelasan ON/OFF — dapat diklik (ramah sentuh), bukan tooltip hover
          yang penuh jargon. Bahasa sehari-hari, jargon dijelaskan bukan diasumsi. */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Apa itu Mode Akuntan?"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="p-4 text-sm">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 className="font-semibold text-foreground">Mode Akuntan</h3>
            <span
              className={cn(
                "ml-auto rounded px-1.5 py-0.5 text-xs font-semibold",
                isOn ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              Sekarang: {isOn ? "ON" : "OFF"}
            </span>
          </div>
          <p className="mt-2 text-muted-foreground">
            Mengatur seberapa &ldquo;akuntansi&rdquo; tampilan Anda. Hanya mengubah yang{" "}
            <strong className="text-foreground">terlihat</strong> — tidak mengubah data, angka,
            maupun hak akses Anda.
          </p>
          <div className="mt-3 space-y-2">
            <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5">
              <p className="font-medium text-primary">ON — untuk yang paham pembukuan</p>
              <p className="mt-0.5 text-muted-foreground">
                Menampilkan menu &amp; istilah akuntansi: Catatan Transaksi (jurnal), Rincian per
                Akun (buku besar), Daftar Akun, serta label debit/kredit di formulir.
              </p>
            </div>
            <div className="rounded-md border border-border bg-muted/40 p-2.5">
              <p className="font-medium text-foreground">OFF — untuk pemakai awam</p>
              <p className="mt-0.5 text-muted-foreground">
                Menyembunyikan yang teknis itu. Hanya bahasa sehari-hari (uang masuk/keluar,
                pelanggan belum bayar). Lebih ringkas dan tidak membingungkan.
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
