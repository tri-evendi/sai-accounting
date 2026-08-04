/**
 * METER kuota — satu rasio terhadap BATAS.
 *
 * ══ KENAPA METER, BUKAN ANGKA TELANJANG ════════════════════════════════════
 * "2 / 3" benar dan tidak menjawab pertanyaan yang sebenarnya dibawa pemilik
 * akun ke halaman ini: *seberapa dekat saya dengan mentok?* Angka menuntut
 * pembacanya membagi sendiri; batang mengatakannya sebelum dibaca. Bentuk ini
 * dipilih dari heuristik: satu rasio terhadap sebuah batas → METER (bukan pai
 * dua irisan, bukan diagram batang satu batang).
 *
 * ══ WARNA TIDAK PERNAH SENDIRIAN ═══════════════════════════════════════════
 * Isian membawa tingkat keparahan (biasa → peringatan → penuh), dan trek
 * kosongnya adalah langkah yang lebih terang dari ramp yang sama sehingga
 * keadaannya terbaca di sepanjang batang. TAPI keparahan itu juga selalu
 * berupa KATA di samping angkanya — MASTER.md §Anti-Patterns melarang warna
 * sebagai satu-satunya penanda, dan meter yang hanya berubah rona tidak
 * terbaca oleh sebagian pembaca sama sekali.
 *
 * ══ AKSESIBILITAS ══════════════════════════════════════════════════════════
 * `role="progressbar"` dengan `aria-valuenow/min/max` dan label yang menyebut
 * apa yang diukur: pembaca layar mengumumkan "2 dari 3", bukan "67 persen"
 * tanpa satuan. Batangnya sendiri `aria-hidden` — nilainya sudah diumumkan
 * oleh peran di pembungkusnya, dan mengumumkannya dua kali hanya berisik.
 *
 * Angka besar memakai angka PROPORSIONAL, bukan `tabular-nums`: tabular
 * memberi setiap digit lebar `0` dan membuat nilai tunggal tampak renggang.
 * Tabular tetap benar di KOLOM tabel, tempat digit harus sejajar ke bawah.
 */
import { cn } from "@/lib/utils";

export interface QuotaMeterProps {
  /** Apa yang dihitung — "Perusahaan", "Pengguna". Sentence case, tanpa titik dua. */
  label: string;
  used: number;
  max: number;
  /** Teks nilai yang sudah dilokalkan, mis. "2 dari 3". */
  valueLabel: string;
  /** Kata keadaan saat hampir/sudah penuh — WAJIB bila `used >= max * 0.8`. */
  stateLabel?: string;
  className?: string;
}

/** Ambang keparahan. 80% = masih bisa direncanakan; 100% = sudah menghalangi. */
const NEARLY_FULL = 0.8;

export function QuotaMeter({
  label,
  used,
  max,
  valueLabel,
  stateLabel,
  className,
}: QuotaMeterProps) {
  /* `max` 0 tidak boleh membuat batang menjadi NaN — perlakukan sebagai penuh:
   * kuota nol berarti tidak ada ruang tersisa, dan itu justru keadaan yang
   * paling perlu terlihat. */
  const ratio = max > 0 ? Math.min(used / max, 1) : 1;
  const full = max > 0 ? used >= max : true;
  const nearly = !full && ratio >= NEARLY_FULL;

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{valueLabel}</p>

      <div
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${label}: ${valueLabel}`}
        className={cn(
          "mt-3 h-2 w-full overflow-hidden rounded-full",
          // Trek = langkah lebih terang dari ramp yang sama dengan isiannya,
          // supaya keadaannya terbaca di sepanjang batang.
          full ? "bg-destructive/20" : nearly ? "bg-warning/20" : "bg-primary/15"
        )}
      >
        <div
          aria-hidden
          style={{ width: `${Math.round(ratio * 100)}%` }}
          className={cn(
            "h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none",
            full ? "bg-destructive" : nearly ? "bg-warning" : "bg-primary"
          )}
        />
      </div>

      {/* Keadaan sebagai KATA. Tanpa baris ini, satu-satunya perbedaan antara
          "lega" dan "mentok" adalah rona batang. */}
      {stateLabel && (full || nearly) && (
        <p
          className={cn(
            "mt-2 text-sm font-medium",
            full ? "text-destructive-strong" : "text-warning-strong"
          )}
        >
          {stateLabel}
        </p>
      )}
    </div>
  );
}
