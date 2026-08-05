"use client";

/**
 * EmptyState — keadaan kosong yang MEMBAWA AKSI, di atas Ant Design `Empty`
 * (issue #191, fase B5). Dipakai 42 berkas, hampir semuanya sebagai isi tabel
 * yang belum punya baris.
 *
 * ── Yang AntD berikan, dan yang tetap harus disediakan pembungkus ──────────
 * `Empty` bawaan AntD adalah GAMBAR + TEKS. Itu setengah dari yang diminta
 * MASTER.md: "Belum ada faktur. **Buat tagihan pertama →**". Layar kosong yang
 * hanya memberi tahu bahwa layarnya kosong meninggalkan penggunanya di tempat
 * yang sama — dan di aplikasi ini keadaan kosong justru paling sering ditemui
 * pengguna BARU, yang belum tahu langkah berikutnya ada di menu mana.
 *
 * Karena itu aksinya tetap tanggung jawab berkas ini, lewat slot `children`
 * milik `Empty`. Yang diambil dari AntD hanya tata letaknya: gambar di tengah,
 * deskripsi, lalu area aksi.
 *
 * ── `image` diberi tinggi otomatis ────────────────────────────────────────
 * Slot gambar `Empty` bertinggi tetap (±100px), dirancang untuk ilustrasi SVG
 * bawaannya. 45 pemanggil di aplikasi ini menitipkan ikon `lucide-react` 48px
 * ke slot itu; dibiarkan, ikonnya mengambang di tengah kotak 100px dan seluruh
 * blok kosong tampak lebih tinggi dari sebelumnya. `styles.image` mengembalikan
 * tingginya mengikuti isi.
 *
 * ── Tombolnya `asChild`, bukan `<Link><Button/></Link>` ───────────────────
 * Bentuk lama menghasilkan `<a><button></a>` — dua elemen interaktif bersarang,
 * HTML tak sah yang diumumkan dua kali oleh pembaca layar (lihat catatan
 * `button.tsx` #187). `Button asChild` merender bentuk anchor milik AntD, dan
 * `href`-nya tetap melewati penyelaras jalur bertenant `app-link.tsx`.
 */

import { Empty, theme } from "antd";
import { Package } from "lucide-react";

import { Link } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  const { token } = theme.useToken();

  return (
    <Empty
      styles={{
        root: { paddingBlock: token.paddingXL, paddingInline: token.padding },
        // Tinggi mengikuti isi — lihat catatan `image` di kepala berkas.
        image: { height: "auto", marginBottom: token.margin, color: token.colorTextSecondary },
      }}
      image={icon ?? <Package className="h-12 w-12" />}
      description={
        <>
          {/* Tetap sebuah heading: keadaan kosong sering menjadi satu-satunya
              isi sebuah bagian, dan strukturnya harus tetap bisa ditelusuri. */}
          <h3
            style={{
              margin: 0,
              fontSize: token.fontSize,
              fontWeight: token.fontWeightStrong,
              color: token.colorText,
            }}
          >
            {title}
          </h3>
          {description && (
            <p
              style={{
                // Ukurannya panjang BARIS, bukan lebar kotak: kalimat penjelas
                // yang membentang selebar tabel 1440px berhenti terbaca sebagai
                // kalimat. `ch` ikut berubah bila ukuran huruf berubah, jadi ia
                // tidak perlu diaudit ulang seperti angka piksel.
                maxWidth: "48ch",
                margin: `${token.marginXXS}px auto 0`,
                color: token.colorTextSecondary,
              }}
            >
              {description}
            </p>
          )}
        </>
      }
    >
      {actionLabel && actionHref && (
        <Button asChild size="sm">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </Empty>
  );
}
