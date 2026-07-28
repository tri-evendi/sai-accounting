/**
 * Bilah kemajuan DETERMINATE (issue #104).
 *
 * Dibuat sebagai primitif, bukan `<div>` di dalam satu halaman, karena bagian
 * yang mudah lupa justru yang tak terlihat: peran ARIA beserta ketiga nilainya.
 * Tanpa itu, bilahnya hanya kotak berwarna — pengguna pembaca layar tidak
 * mendapat apa pun, padahal justru mereka yang paling butuh tahu bahwa proses
 * panjang ini bergerak.
 *
 * Dipakai HANYA bila kemajuannya SUNGGUHAN diketahui. Untuk pekerjaan yang
 * tidak melaporkan kemajuan, pemutar berputar + kalimat status lebih jujur
 * daripada bilah yang bergerak berdasarkan jadwal karangan (lihat catatan
 * "sengaja TIDAK mengarang tahapan" di wizard penyiapan).
 */
import { cn } from "@/lib/utils";

export function Progress({
  value,
  label,
  className,
}: {
  /** 0–1. Nilai di luar rentang dijepit — bukan dibiarkan memecah tata letak. */
  value: number;
  /** Wajib: pembaca layar butuh tahu bilah ini MENGUKUR APA. */
  label: string;
  className?: string;
}) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const percent = Math.round(clamped * 100);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      {/* Transisi 200ms: masih di rentang "halus" MASTER.md (150–250ms), dan
          gerakannya membawa makna — tanpa itu bilah melompat-lompat. */}
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out motion-reduce:transition-none"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
