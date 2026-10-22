package ledgerread

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// ══ NERACA SALDO — PADANAN `getTrialBalance` DI `src/lib/reports.ts` ═══════
//
// Ini laporan PERTAMA tahap 1d, dan aturannya disalin dari TypeScript, bukan
// dirancang ulang. Setiap butir di bawah adalah perilaku TS yang wajib sama,
// sebab `bun run parity:trial-balance` membandingkan keduanya baris demi baris:
//
//  1. Saldo dari `base_debit` / `base_credit` (rupiah dasar), dijumlahkan per
//     akun atas jurnal bertanggal <= asOf. Jurnal penutup tahunan IKUT — di
//     situlah Laba Ditahan memperoleh saldonya (#555); hanya Laba Rugi yang
//     membuangnya.
//  2. Akun diurutkan `ORDER BY code` di BASIS DATA — kolasi server yang
//     menentukan, persis seperti `orderBy: { code: "asc" }` Prisma. Mengurutkan
//     ulang di Go dengan perbandingan byte akan berbeda dari TS pada kode
//     berhuruf.
//  3. Selisih debit − kredit ditaruh di sisi yang ditunjuk TANDANYA, bukan di
//     sisi saldo normal tipe akunnya.
//  4. Akun dilewati HANYA bila jumlah debit DAN kredit-nya nol. Akun yang
//     bergerak lalu netral tetap tampil sebagai baris 0/0.
//  5. Seimbang = total debit sama dengan total kredit pada ketelitian sen.
//
// Bedanya satu, dan disengaja: TS menjumlahkan float, Go menjumlahkan sen
// int64. Paritas membandingkan pada ketelitian sen; selisih yang muncul HANYA
// karena float adalah temuan tentang sisi TS, bukan tentang Go.

// TrialBalanceRow adalah satu baris Neraca Saldo.
type TrialBalanceRow struct {
	Code   string `json:"code"`
	Name   string `json:"name"`
	Type   string `json:"type"`
	Debit  Cents  `json:"debit"`
	Credit Cents  `json:"credit"`
}

// TrialBalance adalah Neraca Saldo satu buku per satu tanggal.
type TrialBalance struct {
	AsOf        time.Time         `json:"asOf"`
	Rows        []TrialBalanceRow `json:"rows"`
	TotalDebit  Cents             `json:"totalDebit"`
	TotalCredit Cents             `json:"totalCredit"`
	Balanced    bool              `json:"balanced"`
	// UnknownTypes adalah kode akun BERGERAK yang tipenya tidak dikenal
	// `contract/accounting.yaml`. Barisnya tetap dihitung — TS juga
	// menghitungnya, dan Neraca Saldo yang membuang akun bertipe asing tidak
	// lagi seimbang dengan buku. Yang dibeli daftar ini: tipe asing terlihat,
	// bukan ditelan. Pemeriksaan yang sama di sisi TS:
	// `scripts/check-data-conformance.ts` ("tipe akun asing").
	UnknownTypes []string `json:"unknownTypes"`
}

// accountSums adalah satu akun beserta jumlah gerakannya — masukan fungsi
// murni buildTrialBalance, jadi aturannya teruji tanpa basis data.
type accountSums struct {
	code, name, accountType string
	debit, credit           Cents
}

// trialBalanceSQL: satu kueri, akun LEFT JOIN jumlah gerakannya.
//
// `$1::timestamp` dan bukan time.Time yang diserahkan ke pgx: kolom `date`
// bertipe TIMESTAMP(3) TANPA zona, dan di mode `exec` (PgBouncer) pgx
// mengirim time.Time sebagai timestamptz — yang lalu dikonversi server memakai
// TimeZone SESI. Teks UTC yang di-cast eksplisit tidak bergantung pada mode
// koneksi maupun zona sesi, dan itu bentuk yang sama dengan nilai yang ditulis
// Prisma (UTC).
//
// `::text` pada jumlahnya: NUMERIC dibaca sebagai teks dan diurai TEPAT ke
// sen. Tidak ada float di jalur ini.
const trialBalanceSQL = `
SELECT a.code, a.name, a.type,
       COALESCE(n.debit, 0)::text, COALESCE(n.credit, 0)::text
  FROM accounts a
  LEFT JOIN (
        SELECT jl.account_id,
               SUM(jl.base_debit)  AS debit,
               SUM(jl.base_credit) AS credit
          FROM journal_lines jl
          JOIN journals j ON j.id = jl.journal_id
         WHERE j.date <= $1::timestamp
         GROUP BY jl.account_id
       ) n ON n.account_id = a.id
 ORDER BY a.code`

// timestampLayout: presisi mikrodetik, cukup untuk TIMESTAMP(3) dan tanpa
// zona — nilainya selalu UTC (lihat trialBalanceSQL).
const timestampLayout = "2006-01-02 15:04:05.999999"

// TrialBalance menghitung Neraca Saldo per asOf (INKLUSIF), di dalam satu
// transaksi baca.
func (r *Reader) TrialBalance(ctx context.Context, asOf time.Time) (*TrialBalance, error) {
	var sums []accountSums
	err := r.readOnly(ctx, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, trialBalanceSQL, asOf.UTC().Format(timestampLayout))
		if err != nil {
			return fmt.Errorf("kueri neraca saldo: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var s accountSums
			var debit, credit string
			if err := rows.Scan(&s.code, &s.name, &s.accountType, &debit, &credit); err != nil {
				return fmt.Errorf("baca baris neraca saldo: %w", err)
			}
			if s.debit, err = ParseCents(debit); err != nil {
				return fmt.Errorf("akun %s, debit: %w", s.code, err)
			}
			if s.credit, err = ParseCents(credit); err != nil {
				return fmt.Errorf("akun %s, kredit: %w", s.code, err)
			}
			sums = append(sums, s)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	tb := buildTrialBalance(sums)
	tb.AsOf = asOf.UTC()
	return tb, nil
}

// buildTrialBalance menerapkan aturan Neraca Saldo atas akun yang SUDAH
// terurut. Murni — inilah yang diuji `trial_balance_test.go`.
func buildTrialBalance(accounts []accountSums) *TrialBalance {
	tb := &TrialBalance{Rows: []TrialBalanceRow{}, UnknownTypes: []string{}}
	for _, a := range accounts {
		// Aturan 4: lewati hanya akun TANPA gerakan sama sekali.
		if a.debit == 0 && a.credit == 0 {
			continue
		}
		net := a.debit - a.credit // positif => saldo di sisi debit
		row := TrialBalanceRow{Code: a.code, Name: a.name, Type: a.accountType}
		switch {
		case net > 0:
			row.Debit = net
		case net < 0:
			row.Credit = -net
		}
		if !contract.IsAccountType(a.accountType) {
			tb.UnknownTypes = append(tb.UnknownTypes, a.code)
		}
		tb.Rows = append(tb.Rows, row)
		tb.TotalDebit += row.Debit
		tb.TotalCredit += row.Credit
	}
	tb.Balanced = tb.TotalDebit == tb.TotalCredit
	return tb
}
