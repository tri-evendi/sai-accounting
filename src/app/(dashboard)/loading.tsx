/**
 * Kerangka muat tingkat-rute untuk dashboard.
 *
 * Banyak halaman `force-dynamic` (mis. daftar, buku besar, laporan) menunggu
 * query server sebelum ada yang tampil — tanpa file ini layar kosong sampai
 * data siap. Kerangka ini menahan ruang (mengurangi CLS) dan memberi umpan
 * balik "sedang bekerja" sesuai MASTER.md (Motion halus, feedback bermakna).
 *
 * ── Tanpa satu kelas Tailwind pun (PR penutup #201/#240) ───────────────────
 * Berkas ini SERVER component dan harus tetap begitu: `loading.tsx` adalah
 * yang pertama dikirim untuk setiap navigasi dasbor, dan menaikkannya ke
 * `"use client"` berarti menunggu bundel sebelum layar tunggu boleh muncul.
 * Karena itu warnanya `var(--ant-…)` (sah di server component sejak #227) dan
 * bukan `theme.useToken()`.
 *
 * ⚠ `animate-pulse` pada pembungkusnya HILANG bersama kelasnya, dan itu bukan
 * kelalaian: kedipan adalah `@keyframes`, yang tidak punya padanan gaya
 * sebaris. Yang menggantikannya sudah ada di layar — `TableSkeleton` memakai
 * `Skeleton.Input active` AntD, yang membawa animasi kilaunya sendiri. Jadi
 * gerak "sedang bekerja" tetap ada; yang berhenti berdenyut hanya dua batang
 * kepala halaman, yang tugasnya memang MENAHAN RUANG, bukan bergerak.
 */
import { Card } from "@/components/ui/card";
import { TableSkeleton } from "@/components/ui/loading";

/** Batang penampung teks kepala halaman — `h-8 w-64` / `h-4 w-96` dulu. */
const BAR: React.CSSProperties = {
  borderRadius: "var(--ant-border-radius)",
  background: "var(--ant-color-fill-secondary)",
};

export default function DashboardLoading() {
  return (
    <div>
      {/* Kepala halaman */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--ant-margin-xs)",
          marginBottom: "var(--ant-margin-lg)",
        }}
      >
        <div style={{ ...BAR, height: 32, width: 256, maxWidth: "100%" }} />
        <div style={{ ...BAR, height: 16, width: 384, maxWidth: "100%" }} />
      </div>
      {/*
        Isi utama. Padding nol yang dulu dikirim dari sini DIHAPUS, bukan
        diterjemahkan: badan `Card` sudah `display: contents` (lihat kepala
        `ui/card.tsx`), jadi kotaknya tidak digambar dan padding-nya tidak
        pernah berlaku — ia sudah tidak mengatur apa pun sebelum PR ini.
      */}
      <Card>
        <TableSkeleton rows={6} cols={5} />
      </Card>
    </div>
  );
}
