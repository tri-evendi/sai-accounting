"use client";

/**
 * Card — permukaan konten di atas Ant Design `Card` (issue #50, ditulis ulang
 * di atas AntD pada issue #191, fase B5).
 *
 * Pemakai terbanyak kedua di aplikasi ini: **107 berkas, 218 `<Card>`**. Nama
 * dan tanda tangan ekspornya SENGAJA tidak berubah — memindahkan 107 berkas itu
 * adalah pekerjaan fase C. Selama fase B berkas ini adalah JAHITAN: di dalamnya
 * AntD, di luarnya API lama.
 *
 * ── Satu keputusan yang menentukan apakah 218 kartu berubah bentuk ─────────
 * AntD `Card` menyisipkan satu simpul yang tidak dimiliki kartu lama:
 *
 *     <div class="ant-card">
 *       <div class="ant-card-body">{children}</div>   ← simpul baru
 *     </div>
 *
 * Untuk kartu biasa itu tidak terasa. Untuk kartu yang DIRINYA SENDIRI adalah
 * wadah tata letak, ia memutus hubungan induk–anak yang justru jadi alasan
 * gayanya ditulis. Contoh nyata, kartu KPI beranda: kartunya sebuah kolom
 * flex setinggi penuh, dan tautan "Lihat detail →" di dasarnya didorong ke
 * bawah dengan margin atas `auto` supaya keempat kartu dalam satu baris
 * memiliki tautan yang sejajar. Dengan `.ant-card-body` di antaranya, arah
 * kolom itu berlaku pada SATU anak dan margin `auto` kehilangan ruang untuk
 * mendorong — tautannya naik, dan hanya terlihat kalau seseorang membuka
 * beranda dan memperhatikan garis dasarnya.
 *
 * Karena itu badan kartu dipasang `display: contents`: kotaknya tidak
 * digambar, sedangkan anak-anaknya tetap menjadi anak TATA LETAK dari
 * `.ant-card`, persis seperti sebelum migrasi. Padding badan tidak hilang
 * karena kartu lama memang tidak pernah punya padding di akarnya — padding
 * tinggal di `CardContent`/`CardHeader`, tempat 107 pemanggil menimpanya.
 *
 * ── Yang BERUBAH rupanya, dan itu memang keputusan epik #206 ───────────────
 * Sudut kartu kini `borderRadiusLG` AntD (8px), bukan `rounded-lg` (12px), dan
 * bayangan `shadow-sm` hilang karena `Card` bervarian `outlined` tidak
 * berbayang. Keduanya adalah "identitas visual = palet & token bawaan AntD",
 * keputusan yang sudah diambil di epik. Kalau pemilik ingin 12px MASTER.md
 * kembali, itu SATU token di `ConfigProvider` (`components.Card.borderRadiusLG`)
 * — bukan kelas yang ditulis ulang di 107 berkas.
 *
 * ── Sub-komponennya: dari kelas Tailwind ke gaya sebaris (issue #203) ──────
 * Sampai fase C berkas ini sengaja MEMPERTAHANKAN kelas Tailwind pada
 * sub-komponennya, karena ±30 pemanggil menimpa padding dan ukuran hurufnya
 * lewat `className` (`px-0 py-0`, `pt-0`, `pb-3`, `text-sm`) — dan gaya sebaris
 * selalu menang atas kelas, jadi menukarnya lebih awal akan membatalkan
 * penimpaan itu tanpa satu pun galat.
 *
 * Fase C memindahkan seluruh pemanggil itu ke `style`, sehingga syaratnya
 * terpenuhi dan pertukarannya bisa dilakukan di sini tanpa korban: gaya bawaan
 * ditulis LEBIH DULU dan `style` pemanggil disebar SESUDAHNYA, jadi penimpaan
 * per properti tetap bekerja persis seperti sebelumnya.
 */

import { Card as AntdCard } from "antd";

type DivProps = React.ComponentProps<"div">;

/** Sisi kotak kartu — sesumbu dengan padding sel tabel (24px), supaya kartu
 *  berisi tabel tidak memperlihatkan dua tepi yang berbeda. */
const BOX: React.CSSProperties = {
  paddingInline: "var(--ant-padding-lg)",
  paddingBlock: "var(--ant-padding)",
};

/** Tepi kartu = `colorBorderSecondary`, token yang sama dengan tepi `Card` AntD. */
const DIVIDER = "1px solid var(--ant-color-border-secondary)";

/**
 * Badan kartu tidak menggambar kotak — lihat catatan tata letak di kepala
 * berkas. Objeknya dibekukan di tingkat modul supaya identitasnya stabil dan
 * AntD tidak menghitung ulang gaya semantiknya di setiap render.
 */
const BODY_STYLES = { body: { display: "contents" } } as const;

function Card(props: DivProps) {
  return <AntdCard data-slot="card" styles={BODY_STYLES} {...props} />;
}

function CardHeader({ style, ...props }: DivProps) {
  return (
    <div
      data-slot="card-header"
      style={{ ...BOX, borderBottom: DIVIDER, ...style }}
      {...props}
    />
  );
}

function CardContent({ style, ...props }: DivProps) {
  return <div data-slot="card-content" style={{ ...BOX, ...style }} {...props} />;
}

function CardFooter({ style, ...props }: DivProps) {
  return (
    <div
      data-slot="card-footer"
      style={{
        ...BOX,
        display: "flex",
        alignItems: "center",
        gap: "var(--ant-margin-sm)",
        borderTop: DIVIDER,
        ...style,
      }}
      {...props}
    />
  );
}

function CardTitle({ style, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      style={{
        fontSize: "var(--ant-font-size-lg)",
        fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
        color: "var(--ant-color-text)",
        ...style,
      }}
      {...props}
    />
  );
}

function CardDescription({ style, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      style={{
        fontSize: "var(--ant-font-size)",
        color: "var(--ant-color-text-secondary)",
        ...style,
      }}
      {...props}
    />
  );
}

export { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription };
