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
 * ── Warnanya token AntD lewat `var(--ant-…)` (issue #203) ─────────────────
 * Berkas ini server component dan karena itu tidak boleh mengimpor `antd`
 * (dijaga `tests/rsc-boundary.test.ts`), jadi `theme.useToken()` tak tersedia.
 * Yang dipakai sebagai gantinya adalah variabel CSS-nya, dan itu SAH di sini:
 * sejak #227 kelas `ANTD_CSS_VAR_KEY` ("sai-tokens") dipikul `<html>` sendiri
 * oleh root layout — bukan oleh elemen yang digambar komponen AntD — sehingga
 * `var(--ant-…)` teratasi di seluruh dokumen, termasuk pada kerangka yang tidak
 * punya satu pun komponen AntD di atasnya. Token `:root` aplikasi (`--card`,
 * `--muted`, …) tidak lagi dipakai: #203 mencabutnya dari `globals.css`, dan
 * merujuknya sekarang berarti warna yang jatuh diam-diam ke warisan.
 *
 * Satu-satunya nilai warna yang ditulis literal adalah `#001529` pada panel
 * brand dan kepala layar sempit — alasannya ditulis di tempatnya.
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

/** Balok kerangka: satu bentuk, dipakai belasan kali dengan ukuran berbeda.
 *  Warnanya `fillSecondary`, bukan `fillQuaternary`: yang terakhir itu latar
 *  halus untuk bidang lebar, dan sebagai BALOK di atas kartu ia praktis tak
 *  terlihat — kerangka yang tak terlihat sama saja dengan layar kosong. */
function bar(width: number | string, height: number): React.CSSProperties {
  return { width, height, borderRadius: 4, background: "var(--ant-color-fill-secondary)" };
}

export default function AuthLoading() {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--ant-color-bg-layout)",
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
            /* `#001529` ditulis LITERAL, dan itu disengaja: ini nilai
               `Layout.siderBg` bawaan AntD — permukaan yang sama persis dengan
               `Layout.Sider theme="dark"` milik `AuthShell` dan menu samping
               dasbor, yang akan menggantikan bidang ini begitu isinya tiba.
               Tidak ada variabel yang bisa dirujuk: variabel token KOMPONEN
               AntD baru ada bila komponennya benar-benar dirender, sedangkan
               kerangka muat ini justru dirender MENGGANTIKAN halaman yang
               merendernya. Kalau `Layout.siderBg` kelak diubah, ubah juga di
               sini. */
            background: "#001529",
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          {/* Kepala layar sempit — pasangan dari `lg:hidden` di `AuthShell`. */}
          <div
            data-auth-topbar
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid var(--ant-color-border-secondary)",
              /* Literal, alasan yang sama dengan panel brand di atas:
                 `Layout.siderBg` AntD tidak punya variabel selama komponennya
                 belum dirender. */
              background: "#001529",
            }}
          >
            <div
              style={{
                width: 160,
                height: 20,
                borderRadius: 4,
                background: "color-mix(in srgb, var(--ant-color-text-light-solid) 20%, transparent)",
              }}
            />
            <div
              style={{
                marginTop: 8,
                width: 224,
                height: 16,
                borderRadius: 4,
                background: "color-mix(in srgb, var(--ant-color-text-light-solid) 10%, transparent)",
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
                  border: "1px solid var(--ant-color-border-secondary)",
                  background: "var(--ant-color-bg-container)",
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
