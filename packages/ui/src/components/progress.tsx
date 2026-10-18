"use client";

/**
 * Bilah kemajuan DETERMINATE, di atas Ant Design `Progress` (issue #104,
 * dipindahkan ke AntD di issue #187).
 *
 * Dipakai HANYA bila kemajuannya SUNGGUHAN diketahui. Untuk pekerjaan yang
 * tidak melaporkan kemajuan, pemutar berputar + kalimat status lebih jujur
 * daripada bilah yang bergerak berdasarkan jadwal karangan (lihat catatan
 * "sengaja TIDAK mengarang tahapan" di wisaya penyiapan).
 *
 * ── Yang tetap dipikul primitif ini, dan tidak diberikan AntD ─────────────
 * 1. **Satuan.** API lama menerima 0–1, sedangkan AntD menerima 0–100. Yang
 *    berbahaya bukan konversinya melainkan kemiripannya: `value={0.4}`
 *    diteruskan apa adanya menghasilkan bilah 0,4% — hampir kosong, dan tetap
 *    "berjalan" sehingga tidak terlihat seperti bug. Konversi + penjepitan
 *    hidup di sini supaya tidak ada pemanggil yang harus mengingatnya.
 * 2. **`label` wajib.** AntD memang memasang `role="progressbar"` beserta
 *    `aria-valuenow/min/max`, tetapi tidak ada yang memaksa bilah itu punya
 *    NAMA. Bilah tanpa nama mengumumkan "42 persen" tanpa menyebut dari apa —
 *    persis bagian yang paling dibutuhkan pengguna pembaca layar pada proses
 *    panjang. Karena itu `label` tetap prop wajib, bukan opsional.
 * 3. **`showInfo={false}`.** Angka persen di sebelah kanan adalah bawaan AntD;
 *    di sini nomor kemajuannya sudah diceritakan kalimat status di dekatnya,
 *    dan dua angka yang sama berdampingan hanya membuat orang mengira keduanya
 *    mengukur hal berbeda.
 */

import { Progress as AntdProgress } from "antd";

export function Progress({
  value,
  label,
}: {
  /** 0–1. Nilai di luar rentang dijepit — bukan dibiarkan memecah tata letak. */
  value: number;
  /** Wajib: pembaca layar butuh tahu bilah ini MENGUKUR APA. */
  label: string;
}) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

  return (
    <AntdProgress
      percent={Math.round(clamped * 100)}
      showInfo={false}
      size="small"
      aria-label={label}
    />
  );
}
