"use client";

/**
 * Identitas + jalan keluar, untuk layar yang TIDAK punya chrome apa pun.
 *
 * Lahir di `/select-company` (issue #104) dan ditarik ke sini saat `/platform`
 * membutuhkannya juga (issue #172) — dua layar pra-aplikasi, satu janji.
 *
 * Tanpa komponen ini, layar semacam itu hanya bisa dimasuki dan tidak bisa
 * ditinggalkan: tidak ada menu samping, tidak ada menu avatar. Pengunjung yang
 * ternyata masuk sebagai AKUN YANG SALAH — komputer bersama, sesi rekan kerja
 * yang belum ditutup — hanya punya satu tindakan yang mungkin: membuka buku
 * perusahaan dengan akun orang lain. (MASTER.md §Orientasi Perusahaan: layar
 * pra-aplikasi WAJIB punya jalan keluar.)
 *
 * Namanya ditulis lebih dulu karena "keluar" baru berguna setelah orangnya
 * sadar ia masuk sebagai siapa.
 */

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

export function SignedInAs({ name }: { name: string }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 text-sm text-muted-foreground">
        {t("auth.selectCompany.signedInAs")}{" "}
        <span className="font-medium text-foreground">{name}</span>
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="shrink-0"
        onClick={() => void signOut({ callbackUrl: "/login" })}
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        {t("auth.selectCompany.signOut")}
      </Button>
    </div>
  );
}
