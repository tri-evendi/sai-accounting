"use client";

/**
 * Daftar perusahaan yang bisa dibuka + tindakan memilihnya (issue #104).
 *
 * ══ MEMUAT ULANG PENUH, BUKAN NAVIGASI KLIEN ═══════════════════════════════
 * Setelah `update({ companyId })` berhasil, halaman dipindahkan dengan
 * `window.location.assign` — bukan `router.push`. Ini bukan kemalasan.
 *
 * Berganti perusahaan mengubah SEGALANYA yang di-cache di sisi klien: izin
 * efektif, himpunan modul aktif, identitas perusahaan yang tercetak di
 * dokumen, dan setiap hasil query React yang masih tersimpan. Navigasi klien
 * mempertahankan cache itu, sehingga ada jendela — sekejap, tapi nyata — di
 * mana menu PT A dirender di atas data PT B. Di aplikasi akuntansi, kebingungan
 * seperti itu persis yang tidak boleh terjadi.
 *
 * Anggap berganti perusahaan sebagai "masuk ke buku yang lain", bukan sebagai
 * mengubah penyaring.
 */

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Building2, Check, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

/**
 * Jalan keluar dari layar "belum ada perusahaan untuk akun ini".
 *
 * Tanpa ini layar tersebut adalah satu-satunya jalan buntu di seluruh aplikasi:
 * setiap layar pra-aplikasi lain punya jalan keluarnya sendiri — /setup-required
 * menawarkan "coba lagi", /feature-inactive menawarkan kembali ke beranda —
 * sedangkan yang ini hanya kalimat, tanpa satu pun kendali. Orang yang aksesnya
 * baru dicabut terdampar di sana: tidak bisa masuk, dan tidak bisa keluar untuk
 * mencoba akun lain selain dengan menutup tab.
 *
 * Kuncinya (`auth.selectCompany.signOut`) sudah lama ada di ketiga kamus —
 * hanya tidak pernah dirender.
 */
export function SignOutAction() {
  const t = useT();
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={() => void signOut({ callbackUrl: "/login" })}
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      {t("auth.selectCompany.signOut")}
    </Button>
  );
}

export interface CompanyChoice {
  id: number;
  name: string;
  slug: string;
}

export function CompanyChoices({
  companies,
  activeId,
}: {
  companies: CompanyChoice[];
  activeId: number | null;
}) {
  const t = useT();
  const { update } = useSession();
  const [busyId, setBusyId] = useState<number | null>(null);

  async function open(companyId: number) {
    setBusyId(companyId);
    // Keanggotaannya diperiksa ULANG di server (lihat callback `jwt` di
    // lib/auth.ts) — angka yang dikirim dari sini tidak pernah dipercaya.
    await update({ companyId });
    window.location.assign("/dashboard");
  }

  return (
    <ul className="space-y-2">
      {companies.map((company) => {
        const isActive = company.id === activeId;
        return (
          <li key={company.id}>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{company.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{company.slug}</p>
                </div>
              </div>

              {isActive ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("auth.selectCompany.currentLabel")}
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 cursor-pointer"
                  disabled={busyId !== null}
                  onClick={() => void open(company.id)}
                >
                  {busyId === company.id
                    ? t("auth.selectCompany.switching")
                    : t("auth.selectCompany.openLabel")}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
