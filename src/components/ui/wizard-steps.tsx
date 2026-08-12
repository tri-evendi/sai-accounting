"use client";

/**
 * PENANDA LANGKAH — satu kosakata untuk SETIAP wisaya di aplikasi ini.
 *
 * ══ KENAPA BERKAS INI ADA ══════════════════════════════════════════════════
 * Sampai berkas ini ada, app ini punya DUA penanda langkah tulisan tangan untuk
 * konsep yang sama persis:
 *
 *   • `components/shared/wizard.tsx` (Penjualan Baru, Pembelian Baru) —
 *     kartu dua baris bertepi, judul + kata keadaan, bisa ditekan untuk mundur;
 *   • wisaya penyiapan `/t/…/setup` — deretan PIL datar bernomor, tidak bisa
 *     ditekan sama sekali.
 *
 * Dua kosakata untuk satu konsep berarti pengguna yang sudah belajar membaca
 * yang satu harus belajar lagi saat bertemu yang lain. Dan pil `/setup` bukan
 * cuma berbeda — ia melanggar aturan: bedanya langkah **sedang dibuka** dari
 * langkah **belum** hanyalah RONA (biru vs abu-abu). MASTER.md §Anti-Patterns
 * melarang warna sebagai penanda tunggal, dan kartu di `wizard.tsx` justru
 * sudah menaatinya sejak semula lewat kata "Selesai / Sedang diisi / Belum".
 *
 * ══ KENAPA `Steps` ANTD, BUKAN SALAH SATU YANG SUDAH ADA ═══════════════════
 * Menyeragamkan ke kartu dua baris pernah ditimbang dan kalah pada aritmetika:
 * wisaya penyiapan enam langkah dan lebar isinya 1024px, jadi setiap kartu
 * kebagian ±160px — cukup untuk "Identitas", tidak cukup untuk "Bagan Akun"
 * apalagi "Mata Uang & Tahun Buku", yang akan terpotong di layar pertama yang
 * pernah dilihat pengguna baru.
 *
 * `Steps` menyelesaikannya tanpa tawar-menawar: judulnya di BAWAH bulatan
 * (`titlePlacement="vertical"`), jadi lebar per langkah tidak lagi memikul
 * ikon + judul + kata keadaan pada satu baris. Ia juga menyumbang hal yang
 * tidak dimiliki kedua penanda lama — **rel penghubung antar-langkah**, yang
 * membuat "sudah sejauh mana" terbaca sekali lihat alih-alih dihitung dengan
 * mata. Dan ia komponen AntD, yaitu keputusan "identitas visual = palet & token
 * bawaan AntD" (epik #206 / #192) dijalankan alih-alih ditulis ulang.
 *
 * ══ YANG TIDAK BOLEH HILANG SAAT MENYENTUH BERKAS INI ══════════════════════
 *  1. **Keadaan selalu KATA.** `content` setiap butir berisi "Selesai / Sedang
 *     diisi / Belum". Menghapusnya mengembalikan pelanggaran yang justru
 *     melahirkan berkas ini — dan `status` AntD sendiri hanya rona + ikon.
 *  2. **Maju TIDAK boleh lewat penanda.** `canJump` yang dioper kedua pemanggil
 *     hanya mengizinkan MUNDUR; melompat maju akan melewati penjaga langkah
 *     yang sedang dibuka tanpa terlihat. Penjaganya `disabled` per butir, bukan
 *     sekadar `onChange` yang menolak diam-diam: butir yang tidak bisa ditekan
 *     harus TERLIHAT tidak bisa ditekan.
 *  3. **`content`, bukan `description`.** Yang kedua ditandai usang di `Steps`
 *     AntD v6 (`antd/es/steps/index.d.ts`) dan akan hilang; ia masih bekerja,
 *     jadi salah pilih tidak berbunyi hari ini.
 */

import { Flex, Steps, theme, Typography } from "antd";

import { useT } from "@/lib/i18n/client";

export interface WizardStepView {
  /** Kunci stabil — id langkah, bukan indeks. */
  key: string;
  title: string;
  /** Menambahkan sufiks "(opsional)" di belakang judul. */
  optional?: boolean;
}

interface WizardStepsProps {
  steps: readonly WizardStepView[];
  /** Indeks langkah yang sedang dibuka. */
  current: number;
  /**
   * Boleh melompat ke indeks ini? Tanpa `onJump` penanda tidak interaktif sama
   * sekali, dan prop ini tidak dibaca.
   */
  canJump?: (index: number) => boolean;
  onJump?: (index: number) => void;
  /**
   * Ditaruh di ujung kanan baris hitungan — dipakai wisaya penyiapan untuk
   * penanda "draf tersimpan". Sengaja `ReactNode` dan bukan string: yang
   * ditaruh di sana adalah ikon + teks, bukan kalimat.
   */
  aside?: React.ReactNode;
}

export function WizardSteps({ steps, current, canJump, onJump, aside }: WizardStepsProps) {
  const t = useT();
  const { token } = theme.useToken();

  const items = steps.map((s, i) => {
    const status = i < current ? "finish" : i === current ? "process" : "wait";
    return {
      key: s.key,
      title: s.optional ? `${s.title} ${t("wizard.optionalSuffix")}` : s.title,
      /* Keadaan sebagai KATA — butir 1 di kepala berkas. */
      content: t(
        status === "finish"
          ? "wizard.stateDone"
          : status === "process"
            ? "wizard.stateCurrent"
            : "wizard.stateTodo"
      ),
      status,
      /* Butir yang tidak boleh dilompati DIMATIKAN, bukan diam-diam ditolak. */
      disabled: !onJump || i === current || !(canJump?.(i) ?? false),
    } as const;
  });

  return (
    <nav aria-label={t("wizard.stepsAria")}>
      {/*
       * Hitungan "Langkah X dari Y" berdiri sendiri di atas relnya, dan itu
       * bukan pengulangan: pada layar sempit `Steps` menyusun dirinya menegak,
       * dan "seberapa jauh lagi" — satu-satunya pertanyaan pengguna di layar
       * wajib — jadi harus dihitung sendiri dengan mata. Angkanya DITURUNKAN
       * dari `steps`, tidak pernah diketik.
       */}
      <Flex
        wrap
        align="center"
        justify="space-between"
        gap={token.marginXS}
        style={{ marginBottom: token.marginSM }}
      >
        <Typography.Text strong type="secondary" style={{ fontVariantNumeric: "tabular-nums" }}>
          {t("wizard.stepOf", { step: current + 1, total: steps.length })}
        </Typography.Text>
        {aside}
      </Flex>

      <Steps
        size="small"
        titlePlacement="vertical"
        current={current}
        items={items}
        onChange={
          onJump
            ? (next) => {
                /* Sabuk pengaman kedua di belakang `disabled`: kalau kelak ada
                   jalan lain memanggil `onChange`, aturan "hanya mundur" tetap
                   berlaku di sini. */
                if (next !== current && (canJump?.(next) ?? false)) onJump(next);
              }
            : undefined
        }
      />
    </nav>
  );
}
