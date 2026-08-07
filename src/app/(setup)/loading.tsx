/**
 * Kerangka muat untuk grup rute `(setup)`.
 *
 * `/setup` adalah `force-dynamic` dan menjalankan enam pembacaan sebelum
 * merender apa pun (setting perusahaan, identitas, jumlah COA, akun kas,
 * pelanggan, pemasok). Ia juga layar WAJIB PERTAMA bagi pengguna baru, jadi
 * jeda kosong di sini adalah kesan pertama aplikasi ini.
 *
 * Dirender DI DALAM `SetupShell` (kepala ramping sudah tergambar oleh layout),
 * jadi yang perlu ditahan hanya ruang isinya: kepala halaman + panel wizard.
 *
 * ── Warna & denyut (issue #203) ──────────────────────────────────────────
 * Server component, jadi tanpa `antd` dan tanpa `theme.useToken()`. Warnanya
 * tetap token AntD lewat `var(--ant-…)`: sejak #227 kelas `ANTD_CSS_VAR_KEY`
 * ("sai-tokens") dipasang root layout pada `<html>`, bukan pada elemen yang
 * digambar komponen AntD, jadi variabelnya teratasi juga di sini — di mana
 * `SetupShell` di atasnya belum menggambar satu pun komponen AntD. Token
 * `:root` aplikasi sudah dicabut dari `globals.css` oleh #203 dan tidak boleh
 * dirujuk lagi. Denyut dan `prefers-reduced-motion` ditulis sebagai satu aturan
 * CSS ber-`href` + `precedence` — gaya sebaris tidak bisa membawa media query,
 * dan React 19 meniadakan gandanya. Sasarannya atribut `data-*`, bukan kelas.
 */

/** Balok kerangka. Warnanya `fillSecondary`, bukan `fillQuaternary`: yang
 *  terakhir itu latar halus untuk bidang lebar, dan sebagai BALOK di atas
 *  panel wisaya ia praktis tak terlihat — kerangka yang tak terlihat sama
 *  saja dengan layar kosong. */
function bar(width: number | string, height: number, radius = 4): React.CSSProperties {
  return { width, height, borderRadius: radius, background: "var(--ant-color-fill-secondary)" };
}

export default function SetupLoading() {
  return (
    <div data-skeleton aria-hidden="true" style={{ width: "100%" }}>
      <style href="sai-setup-skeleton" precedence="default">{`
        [data-skeleton]{animation:sai-skeleton-pulse 2s cubic-bezier(.4,0,.6,1) infinite}
        @keyframes sai-skeleton-pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @media (prefers-reduced-motion:reduce){[data-skeleton]{animation:none}}
      `}</style>

      {/* Kepala halaman */}
      <div
        style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}
      >
        <div style={bar(288, 32)} />
        <div style={{ ...bar("100%", 16), maxWidth: 512 }} />
      </div>

      {/* Baris langkah wizard — enam, sebanyak langkah sungguhannya. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ ...bar("100%", 8, 999), flex: 1 }} />
        ))}
      </div>

      <div
        style={{
          padding: 24,
          borderRadius: 8,
          border: "1px solid var(--ant-color-border-secondary)",
          background: "var(--ant-color-bg-container)",
        }}
      >
        <div style={bar(160, 20)} />
        <div
          style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 24 }}
        >
          <div style={bar("100%", 40)} />
          <div style={bar("100%", 40)} />
          <div style={bar("66%", 40)} />
        </div>
      </div>
    </div>
  );
}
