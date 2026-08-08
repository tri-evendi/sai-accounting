"use client";

/**
 * Pratinjau dokumen — dialog besar berisi PDF (iframe) atau gambar, dengan
 * tombol Unduh & Cetak. Dipakai ulang oleh semua dokumen: PDF yang dihasilkan
 * (faktur, kontrak, surat jalan, retur, laporan) maupun file yang diunggah.
 *
 * Cetak memakai `iframe.contentWindow.print()` (jendela dokumennya sendiri,
 * bukan seluruh halaman aplikasi); bila terhalang, jatuh ke membuka dokumen di
 * tab baru yang punya tombol cetak bawaan browser.
 */
import { useRef } from "react";
import { Flex, theme } from "antd";
import { DownloadOutlined, PrinterOutlined } from "@ant-design/icons";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

/**
 * Tinggi panel pratinjau. Bukan token — tidak ada token AntD yang berarti
 * "hampir setinggi layar" — dan sengaja diukur terhadap VIEWPORT, bukan
 * terhadap dokumennya: sebuah PDF bisa 40 halaman, dan panel yang tumbuh
 * mengikuti isinya akan menggulung HALAMAN di belakang tirai.
 */
const PREVIEW_HEIGHT = "92vh";

/** Satu baris yang dipotong dengan elipsis — judul dokumen bisa sangat panjang. */
const ELLIPSIS = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

export interface DocumentPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** URL sumber: blob (PDF hasil) atau `/uploads/...` (file diunggah). */
  src: string;
  kind: "pdf" | "image";
  /** Aksi Unduh — untuk PDF hasil (doc.save). Bila tak diberi, tombol Unduh
   *  jadi tautan `download` ke `src` (file yang diunggah). */
  onDownload?: () => void;
}

export function DocumentPreview({
  open,
  onOpenChange,
  title,
  src,
  kind,
  onDownload,
}: DocumentPreviewProps) {
  const t = useT();
  const { token } = theme.useToken();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function handlePrint() {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    } else {
      window.open(src, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
       * `size="lg"` (1024px), bukan bawaan `md` (672px): lembar A4 yang dibaca
       * dalam kolom lebih sempit daripada dokumennya sendiri adalah pratinjau
       * yang gagal justru pada satu hal yang diminta darinya.
       *
       * Dulu ukurannya dikirim sebagai kelas `max-w-5xl`; prop `size` yang
       * menggantikannya (#194) menjadi SATU-SATUNYA cara sejak #203 mencabut
       * Tailwind. Padding badan sudah nol lewat bawaan `padded={false}`, dan
       * tingginya tinggal di pembungkus `Flex` di bawah.
       */}
      <DialogContent size="lg">
        <Flex vertical style={{ height: PREVIEW_HEIGHT }}>
          <Flex
            align="center"
            justify="space-between"
            gap={token.marginSM}
            style={{
              paddingBlock: token.paddingSM,
              paddingInline: token.padding,
              borderBottom: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <DialogTitle
                style={{
                  ...ELLIPSIS,
                  margin: 0,
                  fontSize: token.fontSizeLG,
                  fontWeight: token.fontWeightStrong,
                }}
              >
                {title}
              </DialogTitle>
              <DialogDescription
                style={{
                  margin: 0,
                  fontSize: token.fontSizeSM,
                  color: token.colorTextSecondary,
                }}
              >
                {t("documentPreview.hint")}
              </DialogDescription>
            </div>
            {/* Ruang kanan disisakan untuk tombol tutup (X) milik Modal, yang
                digambar di pojok dan akan menimpa tombol Unduh tanpa ini. */}
            <Flex
              align="center"
              gap={token.marginXS}
              style={{ flexShrink: 0, paddingInlineEnd: token.paddingXL }}
            >
              <Button variant="secondary" size="sm" onClick={handlePrint}>
                <PrinterOutlined aria-hidden="true" /> {t("documentPreview.print")}
              </Button>
              {/* Unduh primer, Cetak `secondary` (#267). Overlay adalah
                  LAYARNYA SENDIRI: tombol ini tidak bersaing dengan aksi utama
                  halaman di belakang tirai. Dua cabang di bawah saling
                  meniadakan — PDF hasil (`onDownload`) atau berkas terunggah
                  (tautan `download`) — jadi yang tampil selalu satu. */}
              {onDownload ? (
                <Button size="sm" variant="primary" onClick={onDownload}>
                  <DownloadOutlined aria-hidden="true" /> {t("documentPreview.download")}
                </Button>
              ) : (
                /* `<Button href download>`, BUKAN `<ButtonLink>`: `src` di
                   cabang ini adalah berkas yang diunggah (`/uploads/…`) atau
                   sebuah `blob:` — keduanya bukan rute app, dan yang diminta
                   memang unduhan, bukan perpindahan halaman. `tautanDicegat()`
                   menolak keduanya (`download`, protokol lain), jadi
                   `<ButtonLink>` hanya akan menjanjikan navigasi sisi-klien yang
                   tidak pernah terjadi. `/uploads` juga bukan segmen bertenant,
                   jadi `scopedHref()` melewatkannya utuh. */
                <Button href={src} download size="sm" variant="primary">
                  <DownloadOutlined aria-hidden="true" /> {t("documentPreview.download")}
                </Button>
              )}
            </Flex>
          </Flex>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              background: token.colorFillAlter,
              borderEndStartRadius: token.borderRadiusLG,
              borderEndEndRadius: token.borderRadiusLG,
            }}
          >
            {kind === "pdf" ? (
              <iframe
                ref={iframeRef}
                src={src}
                title={title}
                style={{ height: "100%", width: "100%", border: 0 }}
              />
            ) : (
              <Flex align="center" justify="center" style={{ height: "100%", padding: token.padding }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={title}
                  style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }}
                />
              </Flex>
            )}
          </div>
        </Flex>
      </DialogContent>
    </Dialog>
  );
}
