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
 *
 * ── Warna & denyut (issue #203) ──────────────────────────────────────────
 * Server component, jadi tanpa `antd`. Sebagian kerangka ini berdiri DI LUAR
 * `Card` (kepala halaman, baris kartu ringkasan), dan itu dulu jadi alasan
 * memakai token `:root` aplikasi — supaya warnanya tidak setengah token
 * aplikasi, setengah token AntD. Alasan itu gugur sejak #227: kelas
 * `ANTD_CSS_VAR_KEY` ("sai-tokens") dipikul `<html>` oleh root layout, bukan
 * oleh elemen yang digambar komponen AntD, jadi `var(--ant-…)` teratasi sama
 * saja di dalam maupun di luar `Card`. SELURUHNYA karena itu token AntD — dan
 * memang harus, sebab #203 mencabut token `:root` itu dari `globals.css`.
 * Denyut & `prefers-reduced-motion` lewat satu aturan CSS ber-`href` +
 * `precedence` yang menyasar atribut `data-skeleton`, bukan kelas.
 */
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TILE_CONTENT, TILE_HEADER } from "@/components/ui/stat-tile";

/** Balok kerangka. Warnanya `fillSecondary`, bukan `fillQuaternary`: yang
 *  terakhir itu latar halus untuk bidang lebar, dan sebagai BALOK di atas
 *  kartu ia praktis tak terlihat — kerangka yang tak terlihat sama saja
 *  dengan layar kosong. */
function bar(width: number | string, height: number, radius = 4): React.CSSProperties {
  return { width, height, borderRadius: radius, background: "var(--ant-color-fill-secondary)" };
}

export default function PlatformLoading() {
  return (
    <div data-skeleton aria-hidden="true">
      <style href="sai-platform-skeleton" precedence="default">{`
        [data-skeleton]{animation:sai-skeleton-pulse 2s cubic-bezier(.4,0,.6,1) infinite}
        @keyframes sai-skeleton-pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @media (prefers-reduced-motion:reduce){[data-skeleton]{animation:none}}
      `}</style>

      {/* Kepala halaman */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        <div style={bar(224, 32)} />
        <div style={{ ...bar("100%", 16), maxWidth: 320 }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Baris kartu ringkasan — kisi yang SAMA dengan pendaratan, termasuk
            `auto-fit`-nya: kerangka yang jumlah kolomnya berbeda dari isinya
            justru menambah lompatan tata letak alih-alih menghapusnya. */}
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
          }}
        >
          {/* Ubinnya `Card` + anatomi `ui/stat-tile.ts` — BERKAS YANG SAMA yang
              dipakai `QuotaMeter` dan `StatCard`, bukan kotak setara yang
              ditulis ulang di sini. Tepi, radius, bayangan, dan padding karena
              itu tidak bisa meleset dari isi yang menggantikannya; kerangka
              yang bentuknya meleset justru menambah lompatan tata letak. */}
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardHeader style={TILE_HEADER}>
                <div style={bar(96, 22)} />
              </CardHeader>
              <CardContent style={TILE_CONTENT}>
                <div style={bar(80, 32)} />
                <div style={{ ...bar("100%", 8, 999), marginTop: 8 }} />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Dua kartu: identitas akun, lalu daftar perusahaan. */}
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div style={bar(160, 20)} />
            </CardHeader>
            <CardContent>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={bar("100%", 16)} />
                <div style={bar("66%", 16)} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
