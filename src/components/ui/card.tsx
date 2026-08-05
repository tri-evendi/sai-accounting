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
 * kelasnya ditulis. Contoh nyata, kartu KPI beranda:
 *
 *     <Card className="flex h-full flex-col p-5">   …   <Link className="mt-auto">
 *
 * `mt-auto` mendorong tautan "Lihat detail →" ke dasar kartu supaya keempat
 * kartu dalam satu baris memiliki tautan yang sejajar. Dengan `.ant-card-body`
 * di antaranya, `flex-col` berlaku pada SATU anak dan `mt-auto` kehilangan
 * ruang untuk mendorong — tautannya naik, dan hanya terlihat kalau seseorang
 * membuka beranda dan memperhatikan garis dasarnya.
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
 * ── Kenapa sub-komponennya MASIH memakai kelas Tailwind ────────────────────
 * Ini bagian yang paling mudah salah, jadi ditulis eksplisit. Menerjemahkan
 * padding `CardContent` menjadi `style={{padding: token.paddingLG}}` terlihat
 * lebih "AntD" dan akan diam-diam merusak ±30 pemanggil: gaya sebaris SELALU
 * menang atas kelas, sehingga `<CardContent className="px-0 py-0">` (4 tempat),
 * `py-6`, `pt-0`, `pb-3`, dan `<CardTitle className="text-sm …">` (10 tempat)
 * berhenti berlaku — tanpa satu pun galat, di tempat yang hanya terlihat kalau
 * halamannya dibuka. Selama pemanggilnya masih menimpa lewat `className`,
 * lapisan yang bisa ditimpa `className` harus tetap kelas. Keduanya berganti
 * bersamaan di fase C, dan kelas terakhirnya hilang di #203.
 */

import { Card as AntdCard } from "antd";

import { cn } from "@/lib/utils";

type DivProps = React.ComponentProps<"div">;

/**
 * Badan kartu tidak menggambar kotak — lihat catatan tata letak di kepala
 * berkas. Objeknya dibekukan di tingkat modul supaya identitasnya stabil dan
 * AntD tidak menghitung ulang gaya semantiknya di setiap render.
 */
const BODY_STYLES = { body: { display: "contents" } } as const;

function Card({ className, ...props }: DivProps) {
  return (
    <AntdCard data-slot="card" className={className} styles={BODY_STYLES} {...props} />
  );
}

function CardHeader({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card-header"
      className={cn("border-b border-border px-6 py-4", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: DivProps) {
  return (
    <div data-slot="card-content" className={cn("px-6 py-4", className)} {...props} />
  );
}

function CardFooter({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center gap-3 border-t border-border px-6 py-4", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn("text-lg font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription };
