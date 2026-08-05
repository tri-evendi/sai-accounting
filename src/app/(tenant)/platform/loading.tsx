/**
 * Kerangka muat untuk seluruh permukaan `/platform`.
 *
 * ══ KENAPA BARU SEKARANG, DAN KENAPA HARUS ADA ═════════════════════════════
 * Grup `(dashboard)` sudah lama punya `loading.tsx` dengan alasan yang tertulis
 * di kepalanya: banyak halamannya `force-dynamic`, jadi tanpa berkas ini layar
 * kosong sampai query selesai. SETIAP rute di bawah `/platform` persis begitu —
 * `export const dynamic = "force-dynamic"`, dan datanya datang dari DUA basis
 * data (kendali + platform) yang tidak selalu di mesin yang sama.
 *
 * Yang terjadi tanpa berkas ini bukan "sedikit lambat": menekan butir menu
 * samping tidak mengubah apa pun di layar sampai server menjawab. Butir yang
 * ditekan bahkan belum menyala, sebab penandanya membaca `usePathname()` yang
 * baru bergerak setelah navigasi selesai. Yang dibaca orang dari layar diam
 * adalah "tekanan saya tidak masuk" — lalu ia menekan lagi.
 *
 * Bentuknya sengaja MENIRU pendaratan (kepala halaman → baris kartu ringkasan →
 * dua kartu) supaya ruangnya sudah ditahan sebelum isi datang; kerangka yang
 * bentuknya meleset justru menambah lompatan tata letak alih-alih menghapusnya.
 *
 * Ia tinggal DI DALAM `platform/layout.tsx`, jadi sidebar, bilah atas, dan
 * penanda akun tetap ada selama menunggu — yang berkedip hanya area isi.
 */
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function PlatformLoading() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      {/* Kepala halaman */}
      <div className="mb-6 space-y-2">
        <div className="h-8 w-56 rounded bg-muted" />
        <div className="h-4 w-80 max-w-full rounded bg-muted" />
      </div>

      <div className="space-y-6">
        {/* Baris kartu ringkasan — kisi yang sama dengan pendaratan. */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="mt-2 h-7 w-20 rounded bg-muted" />
              <div className="mt-3 h-2 w-full rounded-full bg-muted" />
            </div>
          ))}
        </div>

        {/* Dua kartu: identitas akun, lalu daftar perusahaan. */}
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-5 w-40 rounded bg-muted" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-4 w-full rounded bg-muted" />
              <div className="h-4 w-2/3 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
