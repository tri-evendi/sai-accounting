/**
 * Riwayat rilis — DIBANGKITKAN dari `lib/changelog.ts` (sumber tunggal).
 *
 * Alasan yang sama dengan `permission-matrix.tsx` dan `api-endpoints.tsx`:
 * daftar yang diketik ke dalam prosa adalah daftar yang mulai berbohong pada
 * rilis berikutnya. Berkas ini karena itu tidak memuat satu pun nomor versi
 * maupun kalimat perubahan — ia membaca `RILIS`, dan `CHANGELOG.md` di akar
 * repo dibangkitkan dari sumber yang sama.
 *
 * Dirender di server, tanpa JavaScript yang dikirim ke peramban: halaman ini
 * dibaca, bukan dioperasikan.
 */
import { RILIS, type ButirRilis } from "@/lib/changelog";

const JENIS: Record<ButirRilis["jenis"], { label: string; warna: string; latar: string }> = {
  baru: {
    label: "Baru",
    warna: "var(--ant-color-success-text)",
    latar: "var(--ant-color-success-bg)",
  },
  ubah: {
    label: "Berubah",
    warna: "var(--ant-color-warning-text)",
    latar: "var(--ant-color-warning-bg)",
  },
  perbaikan: {
    label: "Perbaikan",
    warna: "var(--ant-color-info-text)",
    latar: "var(--ant-color-info-bg)",
  },
};

export function ReleaseHistory() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ant-margin-lg)" }}>
      {RILIS.map((r) => (
        <section
          key={r.versi}
          style={{
            border: "1px solid var(--ant-color-border-secondary)",
            borderRadius: "var(--ant-border-radius-lg)",
            padding: "var(--ant-padding)",
            background: "var(--ant-color-bg-container)",
          }}
        >
          <header
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              gap: "var(--ant-margin-xs)",
              marginBottom: "var(--ant-margin-xs)",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "var(--ant-font-size-lg)",
                fontWeight: 600,
                color: "var(--ant-color-text)",
              }}
            >
              Versi {r.versi}
            </h3>
            <time
              dateTime={r.tanggal}
              style={{
                fontSize: "var(--ant-font-size-sm)",
                color: "var(--ant-color-text-secondary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {new Intl.DateTimeFormat("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(new Date(`${r.tanggal}T00:00:00Z`))}
            </time>
          </header>

          <p
            style={{
              margin: "0 0 var(--ant-margin) 0",
              fontSize: "var(--ant-font-size)",
              lineHeight: 1.7,
              color: "var(--ant-color-text-secondary)",
            }}
          >
            {r.ringkas}
          </p>

          <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
            {r.butir.map((b, i) => {
              const j = JENIS[b.jenis];
              return (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    gap: "var(--ant-margin-xs)",
                    alignItems: "flex-start",
                    padding: "var(--ant-padding-xs) 0",
                    borderTop:
                      i === 0 ? "none" : "1px solid var(--ant-color-border-secondary)",
                  }}
                >
                  {/*
                   * Penanda jenis adalah KATA, bukan sekadar warna — warna tidak
                   * pernah menjadi penanda tunggal (MASTER.md Prinsip Inti #2).
                   */}
                  <span
                    style={{
                      flex: "0 0 auto",
                      minWidth: "5.5rem",
                      textAlign: "center",
                      fontSize: "var(--ant-font-size-sm)",
                      fontWeight: 500,
                      color: j.warna,
                      background: j.latar,
                      borderRadius: "var(--ant-border-radius-sm)",
                      padding: "0 var(--ant-padding-xs)",
                      lineHeight: 1.9,
                    }}
                  >
                    {j.label}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--ant-font-size)",
                      lineHeight: 1.7,
                      color: "var(--ant-color-text)",
                    }}
                  >
                    {b.teks}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
