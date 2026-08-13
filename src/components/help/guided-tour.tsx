"use client";

/**
 * Tur panduan in-app (issue #21) — mesin penampil langkah, kini `Tour` AntD
 * (issue #224).
 *
 * Dipasang sekali di layout dashboard. Ia melihat path saat ini, mencari tur
 * yang cocok di `src/lib/tours.ts` (data murni), lalu:
 *   • MULAI OTOMATIS pada kunjungan pertama saja — penandanya disimpan di
 *     localStorage (`sai:tour-seen:<id>`), bukan tabel baru di database;
 *   • BISA DILEWATI kapan saja (tombol "Lewati" dan tombol Escape) — pedoman UX
 *     "user freedom": tur tidak boleh mengunci layar;
 *   • BISA DIULANG dari menu Bantuan lewat event `sai:tour:replay`.
 *
 * ══ YANG BERPINDAH TUAN KE ANTD (#224) ═════════════════════════════════════
 * Versi sebelumnya adalah overlay tulis tangan: empat panel gelap mengelilingi
 * sasaran, kartu ber-`position: fixed` yang menghitung sendiri muat-tidaknya di
 * atas/bawah/samping sasaran, pengukur `getBoundingClientRect` yang berlangganan
 * `scroll`+`resize`, dan pendengar `keydown` untuk Escape. Semuanya kini milik
 * `Tour`:
 *
 *  • **Penyorotan.** `Tour` melubangi tirainya sendiri tepat di sasaran
 *    (`Mask` + `gap`), jadi tidak ada lagi empat `<div>` yang harus dijaga
 *    tetap sinkron. Tirainya `colorBgMask` — konstanta `rgba(0,0,0,0.45)` di
 *    KEDUA algoritma tema (diukur di #190, lihat `lib/theme/antd-tokens.ts`),
 *    jadi ia tidak bisa berbalik jadi kabut putih di tema gelap.
 *  • **Penempatan & panah penunjuk.** `Trigger` + `builtinPlacements` AntD;
 *    penjepitan agar kartu tak keluar layar sudah termasuk (`autoAdjustOverflow`).
 *    Panah penunjuk adalah hal yang overlay lama TIDAK punya sama sekali.
 *  • **Escape.** `keyboard` bawaan `true` di rc-tour, disalurkan lewat `onEsc`
 *    milik `@rc-component/portal` — yang juga tahu urutan tumpukan overlay,
 *    sesuatu yang pendengar `document` lama tidak tahu. Bonus dari rc-tour:
 *    ArrowLeft/ArrowRight berpindah langkah.
 *  • **Menggulung ke sasaran.** `scrollIntoViewOptions`, dan hanya bila
 *    sasarannya memang di luar viewport (`isInViewPort`).
 *
 * ── Yang TIDAK diberikan AntD, jadi tetap ditulis di sini ─────────────────
 *  1. **Pengembalian fokus ke pemicu.** `Tour` tidak punya elemen pemicu (ia
 *     dibuka oleh event, bukan oleh klik pada dirinya), jadi tidak ada yang
 *     bisa ia kembalikan fokusnya. Karena itu elemen yang sedang fokus DIREKAM
 *     saat tur dibuka dan difokuskan ulang saat ditutup — lihat
 *     `kembalikanFokus`.
 *  2. **Fokus masuk ke kartunya.** Panel `Tour` adalah popup, bukan dialog: ia
 *     tidak menyandang `role="dialog"` dan tidak difokuskan sendiri. Judul
 *     langkah karena itu dirender lewat `JudulLangkah` yang `tabIndex={-1}` dan
 *     memfokuskan dirinya setiap kali langkahnya berganti — perilaku yang sama
 *     dengan kartu lama, supaya pembaca layar membacakan langkah yang baru dan
 *     bukan diam.
 *
 * Sasaran ditunjuk lewat atribut `data-tour="…"` di halaman. **Nama-nama itu
 * tidak boleh berubah** (`lib/tours.ts` yang memilikinya): sasaran yang salah
 * nama tidak menggagalkan apa pun, ia hanya membuat turnya menyorot ruang
 * kosong. Bila elemennya memang tidak ada (mis. panel disembunyikan untuk peran
 * ini), rc-tour menaruh kartunya di tengah layar — tur tidak macet.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Flex, Tour, theme } from "antd";
import type { TourProps } from "antd";
import { CloseOutlined, CompassOutlined } from "@ant-design/icons";
import { Button } from "@/components/ui/button";
import { tourForPath, tourStorageKey, type TourDef } from "@/lib/tours";
import { useT } from "@/lib/i18n/client";

export const TOUR_REPLAY_EVENT = "sai:tour:replay";

/** Dipanggil menu Bantuan untuk memutar ulang tur halaman yang sedang dibuka. */
export function replayTour() {
  window.dispatchEvent(new Event(TOUR_REPLAY_EVENT));
}

/**
 * Selektor sasaran sebuah langkah. Satu-satunya tempat nama `data-tour`
 * berubah menjadi selektor — dipakai komponen di bawah DAN oleh
 * `tests/guided-tour-antd.test.tsx`, yang mencocokkan setiap `target` di
 * `lib/tours.ts` dengan atribut yang benar-benar ada di `src/`.
 */
export function selektorSasaran(nama: string): string {
  return `[data-tour="${nama}"]`;
}

/**
 * Bentuk minimum sebuah pemicu fokus. Sengaja BUKAN `HTMLElement`: suite ini
 * berjalan di `environment: "node"` (tanpa DOM), dan aturan di bawah — "hanya
 * fokuskan yang masih tersambung" — adalah bagian yang layak diuji.
 */
export interface PemicuFokus {
  isConnected: boolean;
  focus: () => void;
}

/**
 * Kembalikan fokus ke elemen yang membuka tur.
 *
 * Syarat `isConnected` bukan kehati-hatian berlebihan, ia kasus yang PALING
 * sering terjadi: tur diputar ulang dari sebuah baris menu Bantuan, dan baris
 * itu ikut lenyap begitu dropdown-nya menutup. Memfokuskan simpul yang sudah
 * lepas dari dokumen tidak melempar galat — ia diam-diam membuang fokus ke
 * `<body>`, yaitu persis kegagalan yang ingin dicegah. Ketika simpulnya sudah
 * lepas, fokus justru sudah dikembalikan oleh komponen yang melepasnya
 * (`Dropdown` AntD mengembalikannya ke tombol Bantuan), jadi tidak melakukan
 * apa-apa adalah jawaban yang benar.
 *
 * @returns `true` bila fokus benar-benar dipindahkan.
 */
export function kembalikanFokus(pemicu: PemicuFokus | null): boolean {
  if (!pemicu?.isConnected) return false;
  pemicu.focus();
  return true;
}

/**
 * Id isi langkah — dituju `aria-describedby` milik judulnya. Tetap satu nilai
 * tetap (bukan `useId`) karena hanya ada SATU tur terbuka di satu waktu: kartu
 * kedua tidak pernah ada untuk ditabrak idnya.
 */
const ID_ISI_LANGKAH = "tur-isi-langkah";

/** Elemen yang sedang fokus, atau `null` bila itu cuma `<body>`. */
function pemicuSaatIni(): PemicuFokus | null {
  const aktif = document.activeElement;
  if (!aktif || aktif === document.body) return null;
  return aktif as unknown as PemicuFokus;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function markSeen(tour: TourDef) {
  try {
    window.localStorage.setItem(tourStorageKey(tour.id), "1");
  } catch {
    // Mode privat / storage penuh: tur tetap jalan, hanya tidak diingat.
  }
}

function hasSeen(tour: TourDef): boolean {
  try {
    return window.localStorage.getItem(tourStorageKey(tour.id)) === "1";
  } catch {
    return true;
  }
}

/**
 * Halaman boleh menolak PEMUTARAN OTOMATIS turnya dengan merender
 * `data-tour-suppress="<id tur>"`.
 *
 * Ada karena beranda punya dua wujud. Pada perusahaan yang belum bertransaksi
 * ia berganti menjadi panel "Langkah Pertama" — tanpa Ringkasan, tanpa seksi
 * angka mana pun. Tur Beranda menjelaskan justru bagian-bagian itu, jadi
 * memainkannya di sana berarti menyorot kotak yang tidak ada, di atas layar
 * yang sudah membawa penjelasannya sendiri. Dua sambutan sekaligus, dan yang
 * satu membicarakan halaman yang lain.
 *
 * Yang ditahan hanya OTOMATISNYA. Memutar dari menu Bantuan tetap bekerja di
 * mana pun — penilaian "ini belum saatnya" milik halaman, keputusan "saya mau
 * melihatnya sekarang" milik penggunanya.
 *
 * Bentuknya opt-out, bukan opt-in, supaya halaman bertur di masa depan tidak
 * diam-diam kehilangan turnya karena lupa memasang penanda.
 */
function autostartSuppressed(tour: TourDef): boolean {
  return document.querySelector(`[data-tour-suppress="${tour.id}"]`) !== null;
}

/**
 * Judul satu langkah — dan satu-satunya simpul di kartu yang bisa difokuskan
 * secara program.
 *
 * `tabIndex={-1}` berarti "boleh difokuskan kode, tidak pernah oleh Tab", jadi
 * urutan Tab kartu tetap: tutup → Lewati → Kembali → Lanjut. Cincin fokusnya
 * dimatikan karena simpul ini bukan kendali — ia hanya tempat pembaca layar
 * mendarat; mematikannya di sini tidak menyentuh cincin fokus kendali mana pun
 * (aturan MASTER.md "fokus keyboard harus terlihat" berlaku untuk yang bisa
 * di-Tab).
 */
function JudulLangkah({
  namaTur,
  judul,
  langkah,
}: {
  namaTur: string;
  judul: string;
  /** Indeks langkah — pemicu pemindahan fokus, bukan bahan tampilan. */
  langkah: number;
}) {
  const { token } = theme.useToken();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, [langkah]);

  return (
    <Flex
      vertical
      ref={ref}
      tabIndex={-1}
      /* Isi langkah dirender AntD sebagai simpul TETANGGA, di luar judul ini.
         Tanpa penunjuk ini pembaca layar hanya membacakan judulnya saat fokus
         mendarat — dan penjelasannya, yaitu seluruh gunanya sebuah tur, harus
         dicari sendiri. */
      aria-describedby={ID_ISI_LANGKAH}
      gap={token.marginXXS}
      style={{ outline: "none" }}
    >
      <Flex
        component="span"
        align="center"
        gap={token.marginXXS}
        style={{
          fontSize: token.fontSizeSM,
          fontWeight: token.fontWeightStrong,
          /* `colorLink` = `colorBrandText` #186 (5,65:1); `colorPrimary`
             sebagai teks kecil hanya 4,10:1. */
          color: token.colorLink,
        }}
      >
        <CompassOutlined aria-hidden="true" style={{ fontSize: 14 }} />
        {namaTur}
      </Flex>
      <span style={{ fontSize: token.fontSizeLG }}>{judul}</span>
    </Flex>
  );
}

export function GuidedTour() {
  const t = useT();
  const pathname = usePathname();
  const tour = tourForPath(pathname);
  const { token } = theme.useToken();
  const [index, setIndex] = useState<number | null>(null);
  /** Elemen yang membuka tur — tujuan pengembalian fokus saat tur ditutup. */
  const pemicuRef = useRef<PemicuFokus | null>(null);

  const buka = useCallback(() => {
    pemicuRef.current = pemicuSaatIni();
    setIndex(0);
  }, []);

  const tutup = useCallback(() => {
    if (tour) markSeen(tour);
    setIndex(null);
    /* Dijalankan SEBELUM React melepas kartunya (setState di atas baru
       diproses setelah penangan ini selesai), jadi fokus sudah pindah ke
       pemicu sebelum simpul yang memegangnya lenyap. */
    kembalikanFokus(pemicuRef.current);
    pemicuRef.current = null;
  }, [tour]);

  // Mulai otomatis hanya pada kunjungan pertama halaman ini.
  //
  // Keputusannya ditunda ke frame berikutnya dengan sengaja: `hasSeen` membaca
  // localStorage yang tidak ada di server, jadi render pertama harus identik
  // dengan hasil server (tur tertutup) sebelum penandanya dibaca di browser.
  // Efek ini juga yang menutup tur ketika pengguna pindah halaman.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      // Penundaan satu frame juga yang membuat `autostartSuppressed` bisa
      // dipercaya: pada frame ini halamannya sudah terpasang, jadi penanda
      // penolakan (bila ada) memang sudah ada di DOM saat ditanyakan.
      if (tour && !hasSeen(tour) && !autostartSuppressed(tour)) buka();
      else setIndex(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tour, buka]);

  // Putar ulang dari menu Bantuan.
  useEffect(() => {
    if (!tour) return;
    window.addEventListener(TOUR_REPLAY_EVENT, buka);
    return () => window.removeEventListener(TOUR_REPLAY_EVENT, buka);
  }, [tour, buka]);

  if (!tour) return null;

  const terakhir = tour.steps.length - 1;
  const steps: TourProps["steps"] = tour.steps.map((step, i) => {
    const nama = step.target;
    return {
      title: <JudulLangkah namaTur={t(tour.titleKey)} judul={t(step.titleKey)} langkah={i} />,
      description: <span id={ID_ISI_LANGKAH}>{t(step.bodyKey)}</span>,
      /*
       * Sasaran dicari saat langkahnya ditampilkan, bukan saat komponen ini
       * dirender: halaman yang memuat datanya sendiri baru menaruh `data-tour`
       * beberapa frame kemudian.
       *
       * Penegasan tipe di sini karena AntD menandatangani `target` sebagai
       * `(() => HTMLElement) | (() => null)` — dua fungsi berbeda, bukan satu
       * fungsi yang boleh mengembalikan keduanya. rc-tour sendiri menangani
       * `null` secara eksplisit (`setTargetElement(next || null)`, lalu
       * kartunya ditaruh di tengah layar), jadi yang tidak cocok hanya tanda
       * tangannya.
       */
      target: nama
        ? ((() => document.querySelector<HTMLElement>(selektorSasaran(nama))) as () => HTMLElement)
        : undefined,
      nextButtonProps: { children: i === terakhir ? t("tour.finish") : t("wizard.next") },
      prevButtonProps: { children: t("common.back") },
    };
  });

  return (
    <>
      {/*
       * `inset:-11px` pada ikon 22×22 = 44×44 area sentuh, tanpa satu piksel
       * pun berubah di layar. Angkanya sama dengan ikon "?" di `term-tooltip`;
       * kalau salah satunya digeser, keduanya harus digeser bersama.
       */}
      <style href="sai-tour" precedence="default">
        {`[data-tour-close]::after{content:"";position:absolute;inset:-11px}`}
      </style>
    <Tour
      open={index !== null}
      current={index ?? 0}
      steps={steps}
      onChange={setIndex}
      /*
       * Hanya `onClose`: rc-tour memanggil `handleClose()` (yang memanggil
       * `onClose`) SEBELUM `onFinish`, jadi memasang keduanya berarti menutup
       * tur dua kali — dan menandainya "sudah dilihat" dua kali.
       */
      onClose={tutup}
      /*
       * Ikon tutup ditulis sendiri, seragam dengan chrome aplikasi — bawaan
       * AntD sama paketnya tapi tanpa `aria-hidden`. `aria-label` menimpa label
       * bawaan AntD yang berbahasa Inggris — panel meletakkan atribut aria milik
       * `closable` SETELAH labelnya sendiri.
       */
      /*
       * ── Area sentuh tombol tutup (issue #355) ────────────────────────────
       * AntD menggambar tombol tutupnya 22×22 — di bawah ambang target sentuh
       * WCAG 2.2 AA (2.5.8), yang 24×24. Tur ini memang masih bisa ditutup
       * lewat "Lewati" yang berukuran penuh, tapi tombol silang adalah yang
       * pertama dicari orang, dan pada ponsel 22px berarti sering meleset.
       *
       * Diperluas lewat `::after` pada IKON KITA SENDIRI — bukan dengan
       * menyasar `.ant-tour-close`. Bedanya bukan gaya: kelas internal AntD
       * bisa berganti nama di rilis mana pun tanpa satu galat pun muncul, dan
       * seluruh `<style>` di repo ini konsisten menyasar `data-*` justru untuk
       * menghindari ketergantungan itu. Ikonnya kita yang menulis, jadi
       * penandanya boleh kita pasang sendiri.
       *
       * Kliknya tetap mendarat di tombol: `::after` adalah bagian dari span di
       * DALAM tombol, jadi peristiwanya menggelembung ke sana — pola yang sama
       * persis dengan ikon "?" di `ui/term-tooltip.tsx`.
       */
      closable={{
        closeIcon: (
          <span data-tour-close style={{ position: "relative", display: "inline-flex" }}>
            <CloseOutlined aria-hidden="true" style={{ fontSize: 16 }} />
          </span>
        ),
        "aria-label": t("tour.close"),
      }}
      /*
       * Penanda langkah bawaan AntD adalah titik-titik: pada tur 5 langkah ia
       * tidak memberi tahu langkah ke berapa, dan tidak terbaca pembaca layar
       * sama sekali. Diganti kalimat yang sama dengan wisaya.
       */
      indicatorsRender={(current, total) => (
        <span
          style={{
            fontSize: token.fontSizeSM,
            color: token.colorTextTertiary,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {t("wizard.stepOf", { step: current + 1, total })}
        </span>
      )}
      /*
       * "Lewati" mendahului tombol bawaan (Kembali/Lanjut/Selesai). Ia tetap
       * ada di langkah terakhir: yang membedakannya dari "Selesai" hanya
       * niatnya, dan menghilangkannya justru membuat tombol berpindah tempat
       * di langkah terakhir.
       */
      actionsRender={(originNode) => (
        <>
          <Button variant="ghost" size="sm" onClick={tutup}>
            {t("tour.skip")}
          </Button>
          {originNode}
        </>
      )}
      /* Sasaran yang sudah terlihat tidak digulung percuma (rc-tour memeriksa
         viewport lebih dulu); yang di luar layar dihampiri tanpa animasi bila
         pengguna memintanya. */
      scrollIntoViewOptions={{
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      }}
      /* Jarak lubang sorotan dari sasaran — 8px, sama dengan overlay lama. */
      gap={{ offset: token.marginXS, radius: token.borderRadius }}
    />
    </>
  );
}
