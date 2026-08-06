/**
 * Kerangka muat untuk grup rute `(auth)`.
 *
 * Dua halaman di grup ini adalah server component yang MENUNGGU sebelum ada
 * yang tampil: `/select-company` membaca daftar keanggotaan, `/setup-required`
 * memeriksa gerbang setup dan izin efektif. Tanpa berkas ini keduanya berangkat
 * dari layar putih — pada titik paling rapuh dalam perjalanan pengguna baru,
 * tepat setelah ia menekan "Masuk".
 *
 * Bentuknya sengaja MENIRU geometri `AuthShell` (panel brand kiri + kartu
 * tengah maks 28rem): ruangnya ditahan lebih dulu supaya isinya tidak melompat
 * saat tiba (CLS). Tidak ada teks sama sekali — kerangka ini muncul sebelum
 * kamus bahasa mana pun dipilih, dan menebak bahasanya lebih buruk daripada
 * diam.
 *
 * ── Warnanya token APLIKASI, bukan token AntD (issue #200) ────────────────
 * Berkas ini server component dan karena itu tidak boleh mengimpor `antd`
 * (dijaga `tests/rsc-boundary.test.ts`), jadi `theme.useToken()` tak tersedia.
 * Jalan keluar biasa — variabel `--ant-…` — juga TIDAK berlaku di sini:
 * `ConfigProvider` v6 memasang variabelnya pada elemen ber-kelas
 * `css-var-root` yang digambar komponen AntD sendiri, dan kerangka ini tidak
 * punya satu pun komponen AntD di atasnya (lihat #227). Yang dipakai karena itu
 * adalah token `:root` aplikasi (`--card`, `--muted`, `--sidebar`, …) yang
 * memang dideklarasikan `globals.css` untuk kedua tema — token yang SAMA yang
 * masih dipakai `AuthShell`, sehingga kerangka dan isinya tidak bisa berpisah
 * warna selama kulitnya belum ikut dikonversi.
 *
 * ── Denyut & titik patah lewat `<style>`, bukan kelas utilitas ────────────
 * Dua hal yang gaya sebaris memang tidak bisa lakukan — `@media` dan
 * `prefers-reduced-motion` — ditulis sebagai satu aturan CSS ber-`href` +
 * `precedence`; React 19 meniadakan gandanya dan menaikkannya ke `<head>`.
 * Sasarannya atribut `data-*`, bukan kelas, supaya berkas ini tetap bersih dari
 * kelas apa pun.
 *
 * ⚠ **Titik patahnya HARUS sama dengan `AuthShell`.** Ia kini **992px**, bukan
 * 1024px: sejak #240 kulit itu memakai `Col` ber-`xs`/`lg` AntD, dan `lg` AntD
 * adalah 992px sedangkan `lg:` Tailwind 1024px. Selisih 32px itu tidak terlihat
 * dari kode mana pun — yang terjadi hanyalah kerangka masih menggambar kepala
 * versi ponsel sementara isinya sudah datang dengan panel brand, lalu tata
 * letaknya melompat tepat pada lebar jendela di antara keduanya. Kalau kelak
 * `AuthShell` berganti titik patah lagi, ganti angka di bawah pada saat yang
 * sama.
 */

/** Balok kerangka: satu bentuk, dipakai belasan kali dengan ukuran berbeda. */
function bar(width: number | string, height: number): React.CSSProperties {
  return { width, height, borderRadius: 4, background: "var(--muted)" };
}

export default function AuthLoading() {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--background)",
      }}
    >
      <style href="sai-auth-skeleton" precedence="default">{`
        [data-skeleton]{animation:sai-skeleton-pulse 2s cubic-bezier(.4,0,.6,1) infinite}
        @keyframes sai-skeleton-pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @media (prefers-reduced-motion:reduce){[data-skeleton]{animation:none}}
        @media (min-width:992px){
          [data-auth-skeleton]{flex-direction:row}
          [data-auth-brand]{display:block}
          [data-auth-topbar]{display:none}
        }
      `}</style>

      <div
        data-auth-skeleton
        style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
      >
        {/* Panel brand — solid, bukan berdenyut: isinya statis dan memang sudah
            benar sejak render pertama, jadi menganimasikannya hanya berbohong
            tentang apa yang sedang ditunggu. */}
        <div
          data-auth-brand
          style={{
            display: "none",
            /* 7/24 — lebar `Col lg={7}` milik `AuthShell`, bukan 30% bulat:
               selisih 0,83% sudah cukup membuat tepi panelnya bergeser saat
               isinya tiba. */
            flexBasis: "29.166667%",
            maxWidth: 384,
            flexShrink: 0,
            background: "var(--sidebar)",
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          {/* Kepala layar sempit — pasangan dari `lg:hidden` di `AuthShell`. */}
          <div
            data-auth-topbar
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid var(--border)",
              background: "var(--sidebar)",
            }}
          >
            <div
              style={{
                width: 160,
                height: 20,
                borderRadius: 4,
                background: "color-mix(in srgb, var(--sidebar-foreground) 20%, transparent)",
              }}
            />
            <div
              style={{
                marginTop: 8,
                width: 224,
                height: 16,
                borderRadius: 4,
                background: "color-mix(in srgb, var(--sidebar-foreground) 10%, transparent)",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: "40px 16px",
            }}
          >
            <div data-skeleton style={{ width: "100%", maxWidth: 448 }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 20,
                  padding: 32,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={bar(44, 44)} />
                  <div style={bar(192, 24)} />
                  <div style={bar("100%", 16)} />
                  <div style={bar("75%", 16)} />
                </div>
                <div style={bar("100%", 40)} />
                <div style={bar("100%", 40)} />
                <div style={bar("100%", 44)} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
