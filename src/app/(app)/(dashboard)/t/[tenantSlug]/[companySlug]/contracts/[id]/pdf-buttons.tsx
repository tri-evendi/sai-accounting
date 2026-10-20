"use client";

/**
 * Dua tombol cetak kontrak: kontrak itu sendiri, dan surat jalannya.
 *
 * Sejak tahap 1c keduanya hanya meneruskan ID dan nomor kontrak — PDF-nya
 * dirender di SERVER dari baris buku (rancangan §5). Prop yang dulu memuat
 * seluruh muatan kontrak — item, pembayaran, termin — dicabut: angka di atas
 * kertas tidak boleh ditentukan oleh apa yang dikirim peramban.
 *
 * Jarak antar tombol dari token (`marginXS` = 8px), tidak berubah sejak #195.
 */

import { Flex, theme } from "antd";
import { ContractPDFButton, ShippingDocButton } from "@/components/shared/pdf-export-buttons";

export function ContractPDFButtons({
  contractId,
  contractNo,
}: {
  contractId: number;
  contractNo: string;
}) {
  const { token } = theme.useToken();
  return (
    <Flex wrap gap={token.marginXS}>
      <ContractPDFButton contractId={contractId} contractNo={contractNo} />
      <ShippingDocButton contractId={contractId} contractNo={contractNo} />
    </Flex>
  );
}
