/**
 * Kebijakan Privasi (issue #142, UU PDP No. 27/2022) — halaman PUBLIK
 * pasangan /terms; versinya ikut tercatat pada setiap persetujuan.
 *
 * ⚠ ISINYA DRAF (lihat catatan /terms) — mekanismenya nyata dan sudah ada di
 * produk (ekspor mandiri, permintaan penghapusan, anonimisasi, jejak audit);
 * naskah hukumnya menunggu tinjauan penasihat. Pertanyaan TEMPAT PENYIMPANAN
 * (data residency) masih TERBUKA dan dokumen ini sengaja tidak menjawabnya —
 * docs/COMPLIANCE.md.
 */
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import { PRIVACY_VERSION, isDraftLegalVersion } from "@/lib/legal";

export const dynamic = "force-static";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <article className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Kebijakan Privasi — {APP_NAME}
          </h1>
          <p className="text-sm text-muted-foreground">
            Versi dokumen:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">{PRIVACY_VERSION}</code>
          </p>
        </header>

        {isDraftLegalVersion(PRIVACY_VERSION) && (
          <div
            role="status"
            className="flex gap-3 rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm text-warning-strong"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              <strong>DRAF.</strong> Belum ditinjau penasihat hukum. Mekanisme yang disebut di
              bawah sudah berjalan di produk; naskah ini yang belum final.
            </p>
          </div>
        )}

        <section className="space-y-4 text-sm leading-relaxed text-foreground">
          <h2 className="text-base font-semibold">1. Data yang diproses</h2>
          <p>
            Data akun (nama, email, kata sandi ter-hash), data keanggotaan, dan data
            pembukuan yang Anda catat sendiri. Jejak audit menyimpan siapa melakukan apa —
            itu bagian dari fungsi produk pembukuan.
          </p>

          <h2 className="text-base font-semibold">2. Dasar pemrosesan</h2>
          <p>
            Pelaksanaan perjanjian layanan (langganan Anda) dan kepatuhan pada kewajiban
            hukum (retensi pembukuan menurut UU KUP).
          </p>

          <h2 className="text-base font-semibold">3. Hak Anda (UU PDP)</h2>
          <p>
            <strong>Akses &amp; portabilitas:</strong> unduh seluruh data dari Pengaturan
            Tenant, dalam format terbuka (CSV), kapan saja — termasuk saat langganan
            ditangguhkan. <strong>Penghapusan:</strong> ajukan dari Pengaturan Tenant; masa
            tenggang 30 hari, lalu akses ditutup dan data pribadi dianonimkan. Buku
            pembukuan disimpan 10 tahun sesuai UU KUP sebelum dapat dihancurkan — kewajiban
            hukum yang didahulukan atas permintaan penghapusan, sebagaimana diatur UU PDP.
          </p>

          <h2 className="text-base font-semibold">4. Tempat penyimpanan</h2>
          <p>
            Lokasi pusat data akan dinyatakan di sini sebelum layanan menerima pelanggan
            umum. (Keputusan tempat penyimpanan — termasuk ketentuan penyimpanan di
            Indonesia — sedang dikonfirmasi dan belum dijawab dokumen ini.)
          </p>

          <h2 className="text-base font-semibold">5. Pemberitahuan kebocoran</h2>
          <p>
            Bila terjadi kebocoran data pribadi, pemilik akun terdampak diberi tahu sesuai
            tenggat UU PDP melalui email terdaftar.
          </p>
        </section>

        <footer className="flex flex-wrap gap-3 border-t border-border pt-6">
          <Button asChild variant="outline">
            <Link href="/terms">Syarat &amp; Ketentuan</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/register">Kembali ke pendaftaran</Link>
          </Button>
        </footer>
      </article>
    </div>
  );
}
