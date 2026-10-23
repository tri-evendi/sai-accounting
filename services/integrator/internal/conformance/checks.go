package conformance

import (
	"context"
	"fmt"
	"strconv"

	"github.com/jackc/pgx/v5"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// ══ SEBELAS PEMERIKSAAN — KEMBARAN `CHECKS` DI `scripts/check-data-conformance.ts`
//
// Urutan, `key`, dan `judul` SAMA PERSIS dengan sisi TS: `judul` masuk ke
// kalimat temuan di jejak putaran (`<slug> · <judul>: <label>`), dan konsol
// menampilkannya apa adanya. Paritasnya dibuktikan `bun run
// parity:conformance` terhadap buku sungguhan, bukan diyakini dari ulasan.
//
// SQL-nya kembaran juga, dengan satu beda bentuk yang disengaja: kosakata
// (status, mata uang, tipe akun) masuk sebagai PARAMETER terikat dari
// `contract.*`, bukan dirangkai ke dalam teks seperti `list(...)` TS — pohon
// Go tidak pernah merangkai teks ke dalam SQL (`tests/services-go.test.ts`).
// `status <> ALL($1)` dan `status NOT IN (…)` setara, termasuk untuk NULL.
//
// Setiap kueri ber-ORDER BY yang sama di kedua bahasa. Tanpa itu urutan baris
// adalah urutan heap — sama di dua pembaca hampir selalu, dan "hampir"
// bukan paritas.

// Check: satu pemeriksaan.
type Check struct {
	Key   string
	Judul string
	sql   string
	args  func() []any
	// nilai: aturan MURNI untuk pemeriksaan yang SQL-nya hanya mengumpulkan
	// angka (pagar materialitas). nil = SQL-nya memulangkan kolom `label`.
	nilai func(rows []ExpenseAccountTotal, threshold float64) []string
}

func teks[T ~string](xs []T) []string {
	out := make([]string, len(xs))
	for i, x := range xs {
		out[i] = string(x)
	}
	return out
}

// tipeBeban: tipe akun berkategori `expense`, urutan kontrak — padanan
// `EXPENSE_ACCOUNT_TYPE_VALUES` (diturunkan, tidak diketik ulang).
func tipeBeban() []string {
	var out []string
	for _, t := range contract.AccountTypes {
		if k, ok := contract.CategoryOf(string(t)); ok && k == contract.AccountCategoryExpense {
			out = append(out, string(t))
		}
	}
	return out
}

// base: nilai IDR sebuah baris uang — padanan `BASE()` TS (`toBase()` di
// receivables.ts). `$1` = mata uang dasar kontrak.
func base(t string) string {
	return `COALESCE(` + t + `.base_amount, CASE WHEN ` + t + `.currency = $1 THEN ` + t + `.amount
     WHEN ` + t + `.rate IS NOT NULL AND ` + t + `.rate > 0 THEN ` + t + `.amount * ` + t + `.rate END)`
}

const sqlBeban = `SELECT a.code AS code, a.name AS name, a.type AS type,
                 a.expense_nature AS nature,
                 SUM(l.base_debit - l.base_credit)::text AS amount
            FROM accounts a
            JOIN journal_lines l ON l.account_id = a.id
           WHERE a.type = ANY($1::text[])
           GROUP BY a.id, a.code, a.name, a.type, a.expense_nature
           ORDER BY a.code, a.id`

// Checks: daftar pemeriksaan, dalam urutan TS.
var Checks = []Check{
	{
		Key:   "status-kontrak",
		Judul: "Status kontrak di luar kosakata aplikasi",
		sql: `SELECT CONCAT(contract_no, ' → ', status) AS label FROM contracts
          WHERE status <> ALL($1::text[]) ORDER BY label`,
		args: func() []any { return []any{teks(contract.ContractStatuses)} },
	},
	{
		Key:   "status-faktur",
		Judul: "Status faktur di luar kosakata aplikasi",
		sql: `SELECT CONCAT(invoice_no, ' → ', status) AS label FROM invoices
          WHERE status <> ALL($1::text[]) ORDER BY label`,
		args: func() []any { return []any{teks(contract.InvoiceStatuses)} },
	},
	{
		Key:   "mata-uang-tak-dikenal",
		Judul: "Mata uang yang tidak dikenal aplikasi",
		sql: `SELECT label FROM (
            SELECT CONCAT('kontrak ', contract_no, ' → ', currency) AS label, currency FROM contracts
            UNION ALL SELECT CONCAT('faktur ', invoice_no, ' → ', currency), currency FROM invoices
            UNION ALL SELECT CONCAT('bayar kontrak #', id, ' → ', currency), currency FROM contract_payments
            UNION ALL SELECT CONCAT('bayar faktur #', id, ' → ', currency), currency FROM invoice_payments
            UNION ALL SELECT CONCAT('transaksi pemasok #', id, ' → ', currency), currency FROM supplier_transactions
          ) x WHERE currency <> ALL($1::text[]) ORDER BY label`,
		args: func() []any { return []any{teks(contract.Currencies)} },
	},
	{
		Key:   "valas-tanpa-nilai-idr",
		Judul: "Dokumen valas tanpa kurs — nilai IDR-nya tidak diketahui",
		sql: `SELECT label FROM (
            SELECT CONCAT('kontrak ', contract_no, ' (', currency, ')') AS label, currency, rate, base_amount FROM contracts
            UNION ALL SELECT CONCAT('faktur ', invoice_no, ' (', currency, ')'), currency, rate, base_amount FROM invoices
            UNION ALL SELECT CONCAT('bayar kontrak #', id, ' (', currency, ')'), currency, rate, base_amount FROM contract_payments
            UNION ALL SELECT CONCAT('bayar faktur #', id, ' (', currency, ')'), currency, rate, base_amount FROM invoice_payments
          ) x WHERE currency <> $1 AND rate IS NULL AND base_amount IS NULL ORDER BY label`,
		args: func() []any { return []any{string(contract.BaseCurrency)} },
	},
	{
		Key:   "mata-uang-bayar-beda",
		Judul: "Mata uang pembayaran berbeda dari dokumennya",
		sql: `SELECT label FROM (
            SELECT CONCAT('bayar faktur #', p.id, ': ', p.currency, ' atas ', i.invoice_no, ' (', i.currency, ')') AS label
              FROM invoice_payments p JOIN invoices i ON i.id = p.invoice_id WHERE p.currency <> i.currency
            UNION ALL
            SELECT CONCAT('bayar kontrak #', p.id, ': ', p.currency, ' atas ', c.contract_no, ' (', c.currency, ')')
              FROM contract_payments p JOIN contracts c ON c.id = p.contract_id WHERE p.currency <> c.currency
          ) x ORDER BY label`,
	},
	{
		Key:   "kelebihan-bayar-faktur",
		Judul: "Faktur yang dibayar melebihi nilainya",
		sql: `SELECT CONCAT(i.invoice_no, ': dibayar ', ROUND(pay.terbayar, 0), ' atas nilai ', ROUND(nilai.total, 0)) AS label
            FROM invoices i
            JOIN (SELECT invoice_id, SUM(quantity * price) AS total FROM invoice_items GROUP BY invoice_id) nilai
              ON nilai.invoice_id = i.id
            JOIN (SELECT p.invoice_id, SUM(` + base("p") + `) AS terbayar, COUNT(*) FILTER (WHERE ` + base("p") + ` IS NULL) AS tak_terukur
                    FROM invoice_payments p GROUP BY p.invoice_id) pay
              ON pay.invoice_id = i.id
           WHERE pay.tak_terukur = 0
             AND pay.terbayar > (nilai.total + COALESCE(i.tax_amount, 0)) + 0.005
           ORDER BY label`,
		args: func() []any { return []any{string(contract.BaseCurrency)} },
	},
	{
		Key:   "jurnal-timpang",
		Judul: "Jurnal yang debit ≠ kredit",
		sql: `SELECT CONCAT(j.number, ': debit ', ROUND(SUM(l.base_debit), 2), ' vs kredit ', ROUND(SUM(l.base_credit), 2)) AS label
            FROM journals j JOIN journal_lines l ON l.journal_id = j.id
           GROUP BY j.id, j.number HAVING ABS(SUM(l.base_debit) - SUM(l.base_credit)) > 0.005
           ORDER BY label`,
	},
	{
		Key:   "jurnal-tanpa-baris",
		Judul: "Jurnal tanpa satu baris pun",
		sql: `SELECT j.number AS label FROM journals j
           WHERE NOT EXISTS (SELECT 1 FROM journal_lines l WHERE l.journal_id = j.id)
           ORDER BY label`,
	},
	{
		Key:   "tipe-akun",
		Judul: "Akun bertipe atau bersaldo normal yang tidak dikenal",
		sql: `SELECT CONCAT(code, ' ', name, ' → ', type, '/', normal_balance) AS label FROM accounts
           WHERE type <> ALL($1::text[]) OR normal_balance NOT IN ('debit','credit')
           ORDER BY label`,
		args: func() []any { return []any{teks(contract.AccountTypes)} },
	},
	{
		Key:   "akun-penampung",
		Judul: "Akun penampung beban berskala material",
		sql:   sqlBeban,
		args:  func() []any { return []any{tipeBeban()} },
		nilai: func(rows []ExpenseAccountTotal, ambang float64) []string {
			_, temuan := AssessCatchAll(rows, ambang)
			out := make([]string, 0, len(temuan))
			for _, f := range temuan {
				out = append(out, DescribeCatchAll(f))
			}
			return out
		},
	},
	{
		Key:   "beban-tanpa-sifat",
		Judul: "Beban berskala material yang belum ditandai sifatnya",
		sql:   sqlBeban,
		args:  func() []any { return []any{tipeBeban()} },
		nilai: func(rows []ExpenseAccountTotal, ambang float64) []string {
			_, temuan := FindUntagged(rows, ambang)
			out := make([]string, 0, len(temuan))
			for _, f := range temuan {
				out = append(out, DescribeUntagged(f))
			}
			return out
		},
	},
}

// CheckResult: temuan satu pemeriksaan di satu buku.
type CheckResult struct {
	Key    string   `json:"key"`
	Judul  string   `json:"judul"`
	Labels []string `json:"labels"`
}

// RunChecks menjalankan setiap pemeriksaan di dalam SATU transaksi baca, dan
// memulangkan HANYA yang berbunyi, dalam urutan `Checks` — bentuk `temuan` TS.
func RunChecks(ctx context.Context, tx pgx.Tx, threshold float64) ([]CheckResult, error) {
	var hasil []CheckResult
	for _, c := range Checks {
		var args []any
		if c.args != nil {
			args = c.args()
		}
		var label []string
		var err error
		if c.nilai != nil {
			var baris []ExpenseAccountTotal
			baris, err = bacaBeban(ctx, tx, c.sql, args)
			if err == nil {
				label = c.nilai(baris, threshold)
			}
		} else {
			label, err = bacaLabel(ctx, tx, c.sql, args)
		}
		if err != nil {
			return nil, fmt.Errorf("%s: %w", c.Key, err)
		}
		if len(label) > 0 {
			hasil = append(hasil, CheckResult{Key: c.Key, Judul: c.Judul, Labels: label})
		}
	}
	return hasil, nil
}

func bacaLabel(ctx context.Context, tx pgx.Tx, sql string, args []any) ([]string, error) {
	rows, err := tx.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var l *string
		if err := rows.Scan(&l); err != nil {
			return nil, err
		}
		// `${r.label}` TS atas NULL menulis "null" — dan baris itu tetap temuan.
		if l == nil {
			out = append(out, "null")
		} else {
			out = append(out, *l)
		}
	}
	return out, rows.Err()
}

func bacaBeban(ctx context.Context, tx pgx.Tx, sql string, args []any) ([]ExpenseAccountTotal, error) {
	rows, err := tx.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ExpenseAccountTotal
	for rows.Next() {
		var code, name, tipe, nature, amount *string
		if err := rows.Scan(&code, &name, &tipe, &nature, &amount); err != nil {
			return nil, err
		}
		a := ExpenseAccountTotal{Code: deref(code), Name: deref(name), Type: deref(tipe), Nature: nature}
		// `Number(r.amount ?? 0)`: teks NUMERIC → double terdekat, sama dengan
		// `strconv.ParseFloat` atas teks yang sama.
		if amount != nil {
			f, err := strconv.ParseFloat(*amount, 64)
			if err != nil {
				return nil, fmt.Errorf("jumlah beban %q tak terbaca: %w", *amount, err)
			}
			a.Amount = f
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
