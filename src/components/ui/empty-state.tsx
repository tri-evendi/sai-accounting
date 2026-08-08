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
 * bawaannya. 45 pemanggil di aplikasi ini menitipkan ikon `@ant-design/icons` 48px
 * ke slot itu; dibiarkan, ikonnya mengambang di tengah kotak 100px dan seluruh
 * blok kosong tampak lebih tinggi dari sebelumnya. `styles.image` mengembalikan
 * tingginya mengikuti isi.
 *
 * ── Tombolnya `<Button href>`, bukan `<Link><Button/></Link>` ─────────────
 * Bentuk lama menghasilkan `<a><button></a>` — dua elemen interaktif bersarang,
 * HTML tak sah yang diumumkan dua kali oleh pembaca layar (lihat catatan
 * `button.tsx` #187). `<Button href>` merender bentuk anchor milik AntD, dan
 * `href`-nya tetap melewati penyelaras jalur bertenant `app-link.tsx`.
 *
 * Sampai #250 tombol itu ditulis membungkus `<Link>`, dan itu adalah pemanggil
 * paling berbahaya dari bentuk tersebut: berkas ini dipakai 45 halaman,
 * sebagian besar server component, jadi anak `<Link>`-nya rutin menyeberangi
 * batas RSC — persis keadaan yang membuat prerender mati (#203). Ia luput dari
 * hitungan awal issue #250 karena hitungannya mengecualikan `components/ui/**`;
 * yang menemukannya adalah penjaganya sendiri, `tests/button-no-aschild.test.ts`.
 *
 * ── ⚠ Kenapa aksinya `secondary`, bukan primer (#267, potongan 3) ──────────
 * Ini keputusan yang paling mudah dibalik oleh orang berikutnya, jadi alasannya
 * ditulis di tempat perubahannya akan terjadi.
 *
 * Pada halaman daftar yang KOSONG, dua ajakan terender bersamaan: CTA kepala
 * halaman ("Tambah Kontrak", pojok kanan atas) dan CTA di sini — **`href` yang
 * sama, sering label yang sama persis**. Menurut §Aksi utama per layar itu dua
 * primer, dan salah satunya harus mengalah. Yang mengalah CTA keadaan-kosong,
 * karena dua hal yang terukur:
 *
 *  1. **Kosong ≠ modul kosong.** Kesebelas halaman daftar yang memakai blok ini
 *     merendernya juga ketika SARINGAN tidak menemukan apa-apa —
 *     `/contracts?search=zzz` pada perusahaan dengan 400 kontrak menampilkan
 *     "Belum ada kontrak" berikut tombolnya. CTA primer di situ menjawab
 *     "pencarian Anda nihil" dengan "buat yang baru", yaitu jawaban yang salah.
 *     CTA kepala tidak mengklaim apa pun; ia memang selalu di sana.
 *  2. **Kalau yang mengalah CTA kepala, ia harus mengalah SECARA BERKONDISI** —
 *     primer saat kosong, sekunder saat berisi — dan itu berarti tombol yang
 *     berpindah penekanan tepat ketika baris pertama masuk, DAN modul yang
 *     dalam keadaan normalnya (berisi) tidak punya satu pun aksi utama. Rambu
 *     #267 menyebut persis itu: menurunkan semuanya hanya menukar satu hierarki
 *     rata dengan hierarki rata yang lain.
 *
 * Yang TIDAK berubah: blok ini tetap satu-satunya tombol di dalam kotak kosong
 * yang besar, dan CTA kepala menunjuk tempat yang sama — jadi tidak ada jalan
 * maju yang hilang, hanya penekanan yang tidak dibelanjakan dua kali.
 *
 * ⚠ Ini keputusan PRIMITIF: 32 blok kosong di 30 berkas mewarisinya (dihitung
 * dengan parser TS, bukan `grep` — lihat koreksi angka di PR potongan 3). Kalau
 * suatu keadaan-kosong kelak sungguh SATU-SATUNYA jalan maju layarnya (kartu
 * "buat kategori dulu" di `/fixed-assets/new` adalah kandidatnya), yang benar
 * adalah menambah prop eskalasi di sini — bukan menaikkan bawaan ini kembali.
 */

import { Empty, theme } from "antd";
import { ContainerOutlined } from "@ant-design/icons";
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
      image={icon ?? <ContainerOutlined style={{ fontSize: 48 }} />}
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
        // `secondary`, dan alasannya panjang — lihat kepala berkas.
        <Button href={actionHref} variant="secondary" size="sm">
          {actionLabel}
        </Button>
      )}
    </Empty>
  );
}
