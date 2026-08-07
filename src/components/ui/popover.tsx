"use client";

/**
 * Popover — panel melayang di atas Ant Design `Popover` (issue #190, fase B4).
 * Sebelumnya Radix UI, pola shadcn.
 *
 * Bentuk ekspornya tetap komposisional (`Popover` / `PopoverTrigger` /
 * `PopoverContent` / `PopoverAnchor`) walau AntD memakai SATU komponen dengan
 * prop `content`. Penerjemahnya ada di `Popover` di bawah: ia memisahkan anak
 * `PopoverContent` dari anak pemicunya, lalu menyerahkan yang pertama sebagai
 * `content` dan yang kedua sebagai `children`.
 *
 * ── Yang AntD TIDAK berikan, dan karena itu ditulis di sini ────────────────
 * Radix memindahkan fokus ke dalam panel saat dibuka lewat papan ketik, lalu
 * mengembalikannya ke pemicu saat ditutup. AntD tidak melakukan keduanya, dan
 * ketiadaannya bukan soal kerapian: panelnya dirender di PORTAL di ujung
 * `<body>`, jadi menekan Tab dari pemicunya melompati seluruh isi panel. Untuk
 * `TermTooltip` — satu-satunya pemakai primitif ini — isi panel itu memuat
 * tautan "Pelajari selengkapnya" ke Kamus Istilah (issue #21). Tanpa
 * pemindahan fokus, tautan itu tidak dapat dijangkau papan ketik sama sekali.
 *
 * Karena itu `PopoverContent` mempertahankan kontrak `onOpenAutoFocus` milik
 * Radix: dipanggil saat panel terbuka, dan pemanggil boleh membatalkannya
 * dengan `preventDefault()` — yang dipakai `TermTooltip` supaya panel yang
 * terbuka karena kursor LEWAT tidak mencuri fokus dari kolom yang sedang
 * diketik.
 *
 * ── Yang datang gratis, dan sengaja tidak dirakit ulang ───────────────────
 *  • Escape menutup — `@rc-component/portal` menumpuk setiap overlay terbuka
 *    dan hanya memberi tahu yang paling atas (`useEscKeyDown.js`), jadi Escape
 *    di dalam popover yang berada di atas dialog menutup popovernya saja.
 *  • Klik di luar menutup (aksi `click` di rc-trigger).
 *  • Penempatan sadar-tabrakan: panel membalik/menggeser sendiri di tepi layar.
 */

import * as React from "react";
import { Popover as AntdPopover } from "antd";

/* ------------------------------------------------------------------------ */
/* Keadaan bersama                                                            */
/* ------------------------------------------------------------------------ */

/**
 * Dua fungsi, bukan sebuah ref yang dibagikan: elemen pemicunya memang harus
 * dicatat oleh anak dan dibaca oleh anak yang lain, tetapi menaruh objek ref di
 * dalam nilai konteks berarti anaknya MENULIS ke sesuatu yang dikembalikan
 * `useContext` — pola yang ditolak `react-hooks/immutability`, dan ditolak
 * dengan alasan: nilai konteks yang bermutasi tidak memberi tahu siapa pun
 * bahwa ia berubah.
 */
interface PopoverState {
  /** Dicatat `PopoverTrigger` saat elemen DOM-nya terpasang. */
  setTrigger: (node: HTMLElement | null) => void;
  /** Dipanggil `PopoverContent` saat panelnya dilepas. */
  focusTrigger: () => void;
}

const PopoverContext = React.createContext<PopoverState | null>(null);

type Side = "top" | "right" | "bottom" | "left";
type Align = "start" | "center" | "end";

/**
 * `side` + `align` Radix -> satu nama `placement` AntD. Ditulis sebagai tabel,
 * bukan sebagai gabungan string, supaya kombinasi yang tidak ada di AntD
 * ditolak `tsc` alih-alih menghasilkan penempatan yang diam-diam meleset.
 */
const PLACEMENT: Record<Side, Record<Align, string>> = {
  top: { start: "topLeft", center: "top", end: "topRight" },
  bottom: { start: "bottomLeft", center: "bottom", end: "bottomRight" },
  left: { start: "leftTop", center: "left", end: "leftBottom" },
  right: { start: "rightTop", center: "right", end: "rightBottom" },
};

interface PopoverContentProps extends React.ComponentProps<"div"> {
  side?: Side;
  align?: Align;
  /**
   * Diterima dan diabaikan dengan anggun: jarak panel ke pemicunya dan bantalan
   * tepi layar ditentukan token AntD (`sizePopupArrow`, `marginXXS`), bukan
   * angka per pemanggil.
   */
  sideOffset?: number;
  collisionPadding?: number;
  /**
   * Dipanggil saat panel terbuka. `event.preventDefault()` menahan fokus tetap
   * di tempatnya — kontrak yang sama dengan Radix, dipertahankan karena
   * `TermTooltip` membedakan pembukaan lewat sorotan kursor dan lewat papan
   * ketik.
   */
  onOpenAutoFocus?: (event: { preventDefault: () => void }) => void;
}

/* ------------------------------------------------------------------------ */
/* Akar                                                                       */
/* ------------------------------------------------------------------------ */

interface PopoverProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function isElementOf<P>(
  node: React.ReactNode,
  type: React.ComponentType<P>
): node is React.ReactElement<P> {
  return React.isValidElement(node) && node.type === type;
}

function Popover({ open, defaultOpen = false, onOpenChange, children }: PopoverProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolled;
  const triggerRef = React.useRef<HTMLElement | null>(null);

  const items = React.Children.toArray(children);
  const contentElement = items.find((child) => isElementOf(child, PopoverContent)) as
    | React.ReactElement<PopoverContentProps>
    | undefined;
  const rest = items.filter((child) => child !== contentElement);
  /*
   * SATU elemen, bukan larik. `Tooltip` AntD membungkus anaknya dengan `<span>`
   * begitu ia bukan elemen tunggal yang sah (dibaca di `antd/es/tooltip`), dan
   * `<span>` itu yang lalu menerima `ref` pengukur posisi — bukan tombol
   * pemicunya. Panelnya masih muncul, hanya menempel pada kotak yang salah.
   */
  const trigger = rest.length === 1 ? rest[0] : rest;

  const { side = "bottom", align = "center" } = contentElement?.props ?? {};

  const state = React.useMemo<PopoverState>(
    () => ({
      setTrigger: (node) => {
        triggerRef.current = node;
      },
      focusTrigger: () => triggerRef.current?.focus({ preventScroll: true }),
    }),
    []
  );

  return (
    <PopoverContext.Provider value={state}>
      <AntdPopover
        open={isOpen}
        onOpenChange={(next) => {
          if (!isControlled) setUncontrolled(next);
          onOpenChange?.(next);
        }}
        /*
         * Hanya `click`. Sorotan kursor sengaja TIDAK didaftarkan di sini:
         * `TermTooltip` mengurusnya sendiri di elemen pembungkus labelnya,
         * karena panelnya harus tetap terbuka selama kursor menyeberangi celah
         * antara label dan panel — jeda yang tidak bisa dinyatakan lewat
         * `mouseLeaveDelay` pada pemicu saja.
         */
        trigger={["click"]}
        placement={PLACEMENT[side][align] as "bottom"}
        content={contentElement}
        /*
         * Dilepas saat ditutup, supaya `PopoverContent` terpasang tepat ketika
         * panelnya terbuka — itulah yang membuat pemindahan & pengembalian
         * fokus di bawah bisa bersandar pada siklus hidup komponen, bukan pada
         * tebakan waktu.
         */
        destroyOnHidden
        arrow={false}
        styles={{ content: { padding: 0 }, container: { padding: 0 } }}
      >
        {trigger}
      </AntdPopover>
    </PopoverContext.Provider>
  );
}

/* ------------------------------------------------------------------------ */
/* Pemicu                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * rc-trigger meng-`cloneElement` anaknya dengan penangan peristiwa DAN sebuah
 * `ref` — dan `ref` itu yang dipakainya untuk mengukur di mana panel harus
 * muncul. Karena itu keduanya WAJIB diteruskan ke elemen DOM sungguhan;
 * pemicu yang menelan `ref`-nya akan membuat panel muncul di pojok kiri atas
 * layar, bukan di sebelah pemicunya.
 */
function PopoverTrigger({
  asChild = false,
  children,
  ref,
  ...rest
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const context = React.useContext(PopoverContext);

  const composedRef = (node: HTMLButtonElement | null) => {
    context?.setTrigger(node);
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.RefObject<HTMLElement | null>).current = node;
  };

  if (asChild) {
    const child = React.Children.only(children) as React.ReactElement<
      Record<string, unknown>
    >;
    /*
     * `cloneElement` dengan `ref` adalah SATU-SATUNYA cara menyusun `asChild`
     * (pola yang sama dipakai Radix dulu), dan rc-trigger memang menuntut ref
     * itu untuk mengukur posisi panelnya. Penjaga `react-hooks/refs` mencurigai
     * setiap ref yang diserahkan ke sebuah fungsi karena BISA saja dibacanya
     * saat render; di sini ia hanya diteruskan, tidak pernah dibaca.
     */
    // eslint-disable-next-line react-hooks/refs
    return React.cloneElement(child, { ...rest, ref: composedRef });
  }

  return (
    <button type="button" ref={composedRef} {...rest}>
      {children}
    </button>
  );
}

/** Tidak dipakai pemanggil mana pun; dipertahankan agar impor lama tak patah. */
function PopoverAnchor({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

/* ------------------------------------------------------------------------ */
/* Isi panel                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Prop yang dibaca `Popover` untuk memilih `placement`, dan karena itu TIDAK
 * boleh ikut mendarat di `<div>` panelnya — React akan menulis atribut
 * `side="bottom"` sungguhan ke DOM dan berteriak "unknown prop" di konsol.
 * Bentuknya sengaja sama dengan `LINK_ONLY` di `button.tsx`.
 */
const PLACEMENT_ONLY = new Set(["side", "align", "sideOffset", "collisionPadding"]);

function PopoverContent({
  onOpenAutoFocus,
  style,
  ...props
}: PopoverContentProps) {
  const context = React.useContext(PopoverContext);
  const panelRef = React.useRef<HTMLDivElement>(null);
  /** true hanya bila FOKUS benar-benar dipindahkan ke panel ini. */
  const tookFocus = React.useRef(false);

  const domProps = Object.fromEntries(
    Object.entries(props).filter(([key]) => !PLACEMENT_ONLY.has(key))
  );

  React.useEffect(() => {
    let prevented = false;
    onOpenAutoFocus?.({ preventDefault: () => (prevented = true) });
    if (!prevented) {
      panelRef.current?.focus({ preventScroll: true });
      tookFocus.current = true;
    }

    return () => {
      /*
       * Fokus dikembalikan HANYA kalau kita yang memindahkannya. Panel yang
       * terbuka karena sorotan kursor tidak pernah menyentuh fokus, jadi
       * menutupnya juga tidak boleh menarik fokus pergi dari kolom yang sedang
       * diketik seseorang.
       */
      if (tookFocus.current) context?.focusTrigger();
    };
    // Sengaja sekali jalan: komponen ini dilepas saat panelnya ditutup
    // (`destroyOnHidden`), jadi "terpasang" dan "terbuka" adalah peristiwa yang
    // sama.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={panelRef}
      /*
       * `-1`: panel bisa menerima fokus secara programatik, tetapi tidak ikut
       * urutan Tab sebagai perhentian tersendiri.
       */
      tabIndex={-1}
      style={{ outline: "none", ...style }}
      {...domProps}
    />
  );
}

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
export type { PopoverContentProps };
