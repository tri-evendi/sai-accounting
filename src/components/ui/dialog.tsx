"use client";

/**
 * Dialog — primitif dialog umum di atas Ant Design `Modal` (issue #190,
 * fase B4). Sebelumnya Radix UI, pola shadcn.
 *
 * Bentuk ekspornya SENGAJA tetap komposisional (`Dialog` / `DialogTrigger` /
 * `DialogContent` / `DialogTitle` / `DialogDescription` / `DialogClose`)
 * walaupun AntD `Modal` adalah SATU komponen dengan prop `title`, `footer`, dan
 * `open`. Alasannya bukan selera: ketiga pemanggilnya menaruh judul, deskripsi,
 * dan tombol tutupnya di TENGAH tata letak sendiri — kepala berbatas milik
 * dialog parameter Pusat Laporan, baris alat pratinjau dokumen, judul
 * tersembunyi (`sr-only`) milik palet perintah. Memindahkannya ke prop `title`
 * berarti menulis ulang ketiga permukaan itu, yaitu pekerjaan fase C.
 *
 * ── Yang tetap sama, dan dari mana datangnya ───────────────────────────────
 *  • **Escape menutup.** `@rc-component/portal` memasang SATU pendengar
 *    `keydown` global dan menumpuk setiap overlay terbuka; hanya yang paling
 *    atas menerima `top: true` dan menutup (`useEscKeyDown.js`). Jadi Escape di
 *    dalam dialog yang membuka popover hanya menutup popovernya — perilaku yang
 *    dulu diberi Radix, kini diberi jalur yang sama untuk seluruh overlay AntD.
 *  • **Fokus kembali ke pemicunya.** `focusTriggerAfterClose` bawaan rc-dialog
 *    `true`: elemen yang sedang fokus SEBELUM dialog dibuka disimpan, lalu
 *    difokuskan ulang saat ditutup (`@rc-component/dialog/es/Dialog/index.js`).
 *    Sifat itu hanya berlaku bila dialognya bertirai — dan dialog ini selalu
 *    bertirai.
 *  • **Fokus terkurung & badan halaman terkunci** selama terbuka
 *    (`focusTrap`, `scrollLock`), keduanya menyala secara bawaan.
 *  • **Klik-luar menutup** — beda dari `AlertDialog`, yang sengaja tidak.
 *
 * ── Pelabelan: satu-satunya bagian yang harus dirakit tangan ───────────────
 * `Modal` hanya menuliskan `aria-labelledby` bila judulnya lewat prop `title`
 * (dibaca di `@rc-component/dialog/es/Dialog/Content/Panel.js`), dan panel itu
 * tidak meneruskan atribut `aria-*` sembarangan dari propnya. Karena judul di
 * sini datang sebagai ANAK, dialognya akan kehilangan namanya — palet perintah
 * yang seluruh isinya kotak ketik akan diumumkan sebagai "dialog" tanpa nama.
 *
 * Karena itu `DialogTitle`/`DialogDescription` mendaftarkan dirinya ke induk,
 * dan induknya menuliskan `aria-labelledby`/`aria-describedby` langsung ke
 * elemen `role="dialog"` lewat `panelRef`. Atributnya bertahan: React merender
 * `aria-labelledby` sebagai `null` di sana dan tidak pernah mengubahnya lagi,
 * jadi tidak ada render berikutnya yang menghapus tulisan kita. Deskripsi hanya
 * ditulis kalau `DialogDescription` MEMANG dirender — rujukan `aria-describedby`
 * ke id yang tidak ada lebih buruk daripada tidak ada rujukan sama sekali.
 */

import * as React from "react";
import { Modal } from "antd";

import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------------ */
/* Keadaan buka/tutup — konteks yang menggantikan `Dialog.Root` Radix         */
/* ------------------------------------------------------------------------ */

interface DialogState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DialogStateContext = React.createContext<DialogState | null>(null);

function useDialogState(): DialogState {
  const state = React.useContext(DialogStateContext);
  if (!state) {
    // Sengaja melempar, bukan diam: sebuah `DialogContent` di luar `Dialog`
    // tidak akan pernah bisa dibuka, dan kegagalan diam berarti tombol yang
    // ditekan orang tidak melakukan apa pun tanpa satu pun petunjuk.
    throw new Error("Komponen Dialog dipakai di luar <Dialog>.");
  }
  return state;
}

interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open, defaultOpen = false, onOpenChange, children }: DialogProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const value = React.useMemo<DialogState>(
    () => ({
      open: isControlled ? open : uncontrolled,
      setOpen: (next) => {
        if (!isControlled) setUncontrolled(next);
        onOpenChange?.(next);
      },
    }),
    [isControlled, open, uncontrolled, onOpenChange]
  );

  return <DialogStateContext.Provider value={value}>{children}</DialogStateContext.Provider>;
}

/* ------------------------------------------------------------------------ */
/* Pelabelan — judul & deskripsi yang hidup sebagai ANAK                      */
/* ------------------------------------------------------------------------ */

interface DialogLabelling {
  titleId: string;
  descriptionId: string;
  register: (part: "title" | "description") => void;
}

const DialogLabellingContext = React.createContext<DialogLabelling | null>(null);

/* ------------------------------------------------------------------------ */
/* Pemicu & penutup                                                           */
/* ------------------------------------------------------------------------ */

function DialogTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<"button">) {
  const { setOpen } = useDialogState();
  return (
    <button type="button" className={className} onClick={() => setOpen(true)} {...props}>
      {children}
    </button>
  );
}

/**
 * `asChild` dipertahankan karena satu pemanggil memakainya untuk membungkus
 * `Button` primitif (dialog parameter laporan). Tanpa itu tombol "Batal" di
 * sana berubah menjadi `<button>` telanjang di dalam `<button>`.
 */
function DialogClose({
  asChild = false,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const { setOpen } = useDialogState();
  const close = () => setOpen(false);

  if (asChild) {
    const child = React.Children.only(children) as React.ReactElement<{
      onClick?: React.MouseEventHandler;
    }>;
    return React.cloneElement(child, {
      onClick: (event: React.MouseEvent) => {
        child.props.onClick?.(event);
        close();
      },
    });
  }

  return (
    <button type="button" className={className} onClick={close} {...props}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------------ */
/* Isi dialog                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Lebar & tinggi tetap ditentukan KELAS pemanggil, bukan prop `width` AntD.
 *
 * Ketiga pemanggilnya menulis `max-w-lg`, `max-w-5xl`, `sm:max-w-lg`, dan
 * `h-[92vh]` — dan `width` AntD adalah `width` CSS, yang tidak bisa dikalahkan
 * `max-width` sebuah kelas. Karena itu lebarnya diserahkan ke `calc` yang sama
 * dengan primitif lama (`w-[calc(100vw-2rem)]`), dan `max-w-*` pemanggil yang
 * menjepitnya — persis seperti sebelum migrasi. `cn()` memakai tailwind-merge,
 * jadi `max-w-lg` pemanggil menggantikan `max-w-2xl` bawaan di sini, bukan
 * bertumpuk dengannya.
 *
 * Baris ini adalah utang fase C yang disengaja: ia hilang bersama Tailwind di
 * issue #203, ketika ketiga pemanggilnya memakai `width` AntD.
 */
const CONTENT_BASE = "max-w-2xl";

/**
 * Lebar dialog sebagai PROP, jalan keluar dari paragraf di atas (#194).
 *
 * Selama pemanggil hanya bisa mengatur lebar lewat `max-w-*`, setiap dialog
 * non-standar di fase C harus membawa satu kelas Tailwind — dan `document-
 * preview` membuktikan biayanya: lembar A4 dibaca di dalam kotak 672px karena
 * itulah bawaan yang bisa dikalahkan sebuah kelas.
 *
 * Nilainya piksel, bukan kelas, dan dipasang sebagai `maxWidth` sebaris.
 * Sengaja `maxWidth` dan bukan `width`: lebar sesungguhnya tetap
 * `calc(100vw - 2rem)`, jadi di 375px dialog tetap menyesuaikan layar alih-alih
 * memaksa 1024px dan menggeser halaman.
 *
 * Pemanggil yang masih mengirim `max-w-*` lewat `className` tetap bekerja —
 * `size` hanya berlaku bila disebut. Keduanya hidup berdampingan sampai #203
 * mencabut Tailwind.
 */
const CONTENT_MAX_WIDTH = {
  /** Setara `max-w-lg` — konfirmasi, formulir pendek. */
  sm: 512,
  /** Setara `max-w-2xl` — bawaan, sama dengan sebelum prop ini ada. */
  md: 672,
  /** Setara `max-w-5xl` — pratinjau dokumen; lembar A4 butuh ruang. */
  lg: 1024,
} as const;

export type DialogSize = keyof typeof CONTENT_MAX_WIDTH;

/** Cukup untuk menulis atribut; sengaja bukan `HTMLElement` supaya bisa diuji. */
type AriaTarget = Pick<HTMLElement, "setAttribute">;

/**
 * Menuliskan peran & pelabelan ke elemen `role="dialog"` milik rc-dialog.
 *
 * Diekstrak sebagai fungsi murni karena inilah bagian yang paling mudah rusak
 * diam-diam — dan satu-satunya bagian dialog yang tidak bisa dibaca dari markup
 * hasil render (ia ditulis setelah panelnya terpasang). Bentuk ini membuatnya
 * bisa diuji tanpa DOM: `tests/ui-overlay-antd.test.tsx` memberinya perekam.
 *
 * `aria-describedby` HANYA ditulis kalau deskripsinya memang dirender. Rujukan
 * ke id yang tidak ada bukan sekadar sia-sia: sebagian pembaca layar berhenti
 * mengumumkan apa pun untuk dialog itu.
 */
export function writeDialogAria(
  panel: AriaTarget,
  { role, titleId, descriptionId }: { role: string; titleId?: string; descriptionId?: string }
): void {
  panel.setAttribute("role", role);
  if (titleId) panel.setAttribute("aria-labelledby", titleId);
  if (descriptionId) panel.setAttribute("aria-describedby", descriptionId);
}

interface DialogContentProps {
  className?: string;
  children?: React.ReactNode;
  /**
   * Diterima dan diabaikan dengan anggun. Dulu ini cara Radix mengatakan
   * "dialog ini memang tanpa deskripsi"; di sini isyarat itu tak dibutuhkan —
   * `aria-describedby` hanya ditulis kalau `DialogDescription` benar-benar
   * dirender. Tetap ada di tanda tangannya supaya satu pemanggil (dialog
   * parameter laporan) tidak perlu berubah di fase B.
   */
  "aria-describedby"?: string;
  /** Tombol X di pojok. Bawaannya ada, seperti sebelum migrasi. */
  showClose?: boolean;
  /** Internal: `AlertDialog` mematikannya (konfirmasi harus dijawab). */
  maskClosable?: boolean;
  /** Internal: `AlertDialog` memakai `alertdialog`. */
  role?: "dialog" | "alertdialog";
  /** Internal: `AlertDialog` memakai padding badan bawaan AntD. */
  padded?: boolean;
  /** Internal: `ConfirmDialog` menahan Escape selama prosesnya berjalan. */
  keyboard?: boolean;
  /**
   * Lebar maksimum dialog. Tak diisi = seperti sebelumnya (kelas pemanggil yang
   * menentukan, bawaan `max-w-2xl`). Lihat `CONTENT_MAX_WIDTH`.
   */
  size?: DialogSize;
  /** Internal: dijalankan sekali setiap dialog terbuka, setelah panelnya ada. */
  onOpenAutoFocus?: () => void;
}

function DialogContent({
  className,
  children,
  showClose = true,
  maskClosable = true,
  role = "dialog",
  padded = false,
  keyboard = true,
  size,
  onOpenAutoFocus,
}: DialogContentProps) {
  const { open, setOpen } = useDialogState();
  const t = useT();

  const titleId = React.useId();
  const descriptionId = React.useId();
  /** Diisi anak-anaknya saat render; dibaca induk setelah mereka terpasang. */
  const rendered = React.useRef({ title: false, description: false });
  const [panel, setPanel] = React.useState<HTMLDivElement | null>(null);

  const labelling = React.useMemo<DialogLabelling>(
    () => ({
      titleId,
      descriptionId,
      register: (part) => {
        rendered.current[part] = true;
      },
    }),
    [titleId, descriptionId]
  );

  React.useEffect(() => {
    if (!panel) return;
    /*
     * Imperatif karena tidak ada jalan lain: `Panel` rc-dialog merender
     * `role`/`aria-labelledby` sendiri dan tidak menyebarkan `aria-*` dari
     * propnya. Tulisan ini bertahan karena nilai yang dirender React di sana
     * KONSTAN (`role="dialog"`, `aria-labelledby={null}`) — React hanya
     * menyentuh atribut yang nilainya berubah antar-render.
     */
    writeDialogAria(panel, {
      role,
      titleId: rendered.current.title ? titleId : undefined,
      descriptionId: rendered.current.description ? descriptionId : undefined,
    });
    onOpenAutoFocus?.();
  }, [panel, role, titleId, descriptionId, onOpenAutoFocus]);

  return (
    <DialogLabellingContext.Provider value={labelling}>
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        centered
        keyboard={keyboard}
        /*
         * `mask.closable`, bukan prop `maskClosable` — bentuk lama sudah
         * ditandai usang di AntD v6 dan berteriak di konsol dev.
         */
        mask={{ closable: maskClosable }}
        /*
         * Ditutup = benar-benar dilepas, seperti Portal Radix dulu. Bukan
         * kerapian: pratinjau dokumen memuat PDF di dalam `<iframe>`, dan
         * membiarkannya terpasang berarti berkas itu tetap hidup di latar
         * setelah panelnya ditutup.
         */
        destroyOnHidden
        closable={showClose ? { "aria-label": t("common.close") } : false}
        footer={null}
        panelRef={setPanel}
        width="calc(100vw - 2rem)"
        className={cn(CONTENT_BASE, className)}
        styles={{
          /* `size` menang atas kelas karena gaya sebaris memang menang — itu
             sebabnya ia hanya ditulis saat pemanggil menyebutnya. */
          ...(size ? { content: { maxWidth: CONTENT_MAX_WIDTH[size] } } : {}),
          /* Tinggi mengikuti kelas pemanggil (`h-[92vh]`) sampai ke isinya. */
          container: { display: "flex", flexDirection: "column", height: "100%" },
          body: {
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
            maxHeight: "92vh",
            /*
             * Primitif lama tidak punya padding sama sekali — ketiga pemanggil
             * menggambar paddingnya sendiri (kepala berbatas, badan yang
             * bergulir, kaki bertombol). Padding 24px bawaan AntD akan
             * menyisipkan celah di luar garis-garis itu.
             */
            padding: padded ? undefined : 0,
          },
        }}
      >
        {children}
      </Modal>
    </DialogLabellingContext.Provider>
  );
}

/* ------------------------------------------------------------------------ */
/* Judul & deskripsi                                                          */
/* ------------------------------------------------------------------------ */

function DialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  const labelling = React.useContext(DialogLabellingContext);
  labelling?.register("title");
  return <h2 id={labelling?.titleId} className={className} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  const labelling = React.useContext(DialogLabellingContext);
  labelling?.register("description");
  return <p id={labelling?.descriptionId} className={className} {...props} />;
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle, DialogDescription };
export type { DialogContentProps };
