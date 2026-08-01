/**
 * Syarat & Ketentuan (issue #142) — halaman PUBLIK yang ditautkan form
 * pendaftaran; versinya (`lib/legal.ts`) ikut tercatat pada setiap persetujuan.
 *
 * ⚠ ISINYA DRAF dan berspanduk begitu: kerangka yang menyebut mekanisme yang
 * SUDAH ada di produk (trial, suspensi hanya-baca, retensi, ekspor) — tetapi
 * belum ditinjau penasihat hukum, dan tidak boleh dijanjikan ke pelanggan
 * sebelum itu (docs/COMPLIANCE.md). Dokumen hukum bernaskah tunggal Bahasa
 * Indonesia dengan sengaja — terjemahan informatif menyusul bila diperlukan,
 * naskah mengikatnya tetap satu.
 */
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import { TERMS_VERSION, isDraftLegalVersion } from "@/lib/legal";

export const dynamic = "force-static";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <article className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Syarat &amp; Ketentuan — {APP_NAME}
          </h1>
          <p className="text-sm text-muted-foreground">
            Versi dokumen: <code className="rounded bg-muted px-1.5 py-0.5">{TERMS_VERSION}</code>
          </p>
        </header>

        {isDraftLegalVersion(TERMS_VERSION) && (
          <div
            role="status"
            className="flex gap-3 rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm text-warning-strong"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              <strong>DRAF.</strong> Dokumen ini belum ditinjau penasihat hukum dan belum
              mengikat sebagai perjanjian. Ia diterbitkan lebih awal supaya setiap
              persetujuan tercatat pada versi yang pasti.
            </p>
          </div>
        )}

        <section className="space-y-4 text-sm leading-relaxed text-foreground">
          <h2 className="text-base font-semibold">1. Layanan</h2>
          <p>
            {APP_NAME} adalah layanan pembukuan berlangganan. Setiap perusahaan (PT) yang Anda
            buat mendapat buku yang terpisah penuh dari perusahaan lain.
          </p>

          <h2 className="text-base font-semibold">2. Akun &amp; langganan</h2>
          <p>
            Akun dibuat lewat pendaftaran dengan verifikasi email. Masa uji coba berlaku
            sesuai paket; langganan yang menunggak dapat ditangguhkan — dalam keadaan
            ditangguhkan, data Anda menjadi <em>hanya-baca</em> dan tetap dapat dibaca serta
            diunduh, tidak pernah dikunci total.
          </p>

          <h2 className="text-base font-semibold">3. Data &amp; retensi</h2>
          <p>
            Data pembukuan adalah milik Anda. Anda dapat mengunduh seluruhnya kapan saja dari
            Pengaturan Tenant. Berhenti berlangganan TIDAK menghapus buku pembukuan:
            peraturan perpajakan Indonesia (UU KUP) mewajibkan buku, catatan, dan dokumen
            dasar pembukuan disimpan 10 (sepuluh) tahun. Penghapusan hanya berjalan atas
            permintaan eksplisit, dengan masa tenggang, dan penghancuran buku baru dapat
            dilakukan setelah masa retensi tersebut.
          </p>

          <h2 className="text-base font-semibold">4. Tanggung jawab</h2>
          <p>
            Kebenaran isi pembukuan adalah tanggung jawab pemiliknya; layanan ini mencatat
            dan menghitung, tidak menggantikan penilaian akuntan atau kewajiban pelaporan
            Anda kepada otoritas.
          </p>

          <h2 className="text-base font-semibold">5. Perubahan dokumen</h2>
          <p>
            Setiap perubahan syarat &amp; ketentuan menaikkan versi dokumen ini. Persetujuan
            Anda tercatat pada versi yang tampil saat Anda menyetujuinya.
          </p>
        </section>

        <footer className="flex flex-wrap gap-3 border-t border-border pt-6">
          <Button asChild variant="outline">
            <Link href="/privacy">Kebijakan Privasi</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/register">Kembali ke pendaftaran</Link>
          </Button>
        </footer>
      </article>
    </div>
  );
}
