package ledgerread

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"
	// Zona tahun buku (`contract.BusinessTimeZone`) dari DALAM biner: image
	// `debian:bookworm-slim` tanpa `tzdata`, dan Neraca tidak boleh bergantung
	// pada isi image untuk memisahkan laba tahun berjalan.
	_ "time/tzdata"

	"github.com/jackc/pgx/v5"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jscompat"
)

// ══ LABA RUGI & NERACA — PADANAN `getIncomeStatement` / `getBalanceSheet` ══
//
// Laporan KEDUA dan KETIGA tahap 1d. Seperti Neraca Saldo, aturannya DISALIN
// dari `src/lib/reports.ts`, bukan dirancang ulang — `bun run
// parity:income-statement` dan `parity:balance-sheet` membandingkan keduanya
// atas buku sungguhan. Setiap butir di bawah adalah perilaku TS yang wajib sama:
//
//  1. Jumlah dari `base_debit` / `base_credit` (rupiah dasar) — valas TIDAK
//     pernah dijumlahkan dalam mata uang aslinya.
//  2. Akun diurutkan `ORDER BY code` di BASIS DATA (kolasi server), lalu
//     dibaca sekali; band dan seksi mewarisi urutan itu.
//  3. Kategori, sisi laporan, dan band DIBACA dari `contract` (bangkitan
//     `contract/accounting.yaml`), tidak ditulis di sini. Akun bertipe di luar
//     kontrak tidak masuk Laba Rugi maupun Neraca — seperti TS — tetapi yang
//     BERGERAK dicatat di `UnknownTypes` supaya terlihat.
//  4. Tanda per KATEGORI (`CategoryStatementSide`): Retur Penjualan
//     menetralkan dirinya di pendapatan; Akumulasi Penyusutan tampil NEGATIF di
//     aset. Tidak ada "perbaikan" sisi abnormal.
//  5. Baris akun dilewati bila jumlah LAPORANNYA nol (bukan bila tak bergerak
//     — beda dari Neraca Saldo).
//
// Laba Rugi:
//
//  6. Jurnal penutup tahunan DIBUANG (`ClosingJournalType`, #555); penyaring
//     tanggal `>= from` dan `<= to` hanya bila diberikan; pusat biaya pada
//     BARIS jurnal (#91), `unassigned` = `cost_center_id IS NULL`.
//  7. Band dari `IncomeStatementTypeSections`, sisanya bawaan kategori. Laba
//     Kotor = Penjualan − HPP; Laba Usaha = Laba Kotor − Beban Operasional;
//     Laba Bersih = Laba Usaha + Pendapatan Lain − Beban Lain.
//
// Neraca:
//
//  8. SEMUA jurnal sampai asOf, termasuk penutup.
//  9. `netIncome` = laba yang belum ditutup (pendapatan − beban sepanjang
//     buku); `totalLiabilitiesEquity` = liabilitas + (ekuitas + netIncome) —
//     rumus tunggal `balanceSheetEquityTotal` (#258).
//  10. Pecahan #555: bila `company_settings` ADA (baris pertama tanpa urutan,
//     persis `findFirst` tanpa `orderBy`), laba sejak awal tahun buku yang
//     memuat asOf = `currentYearIncome`; sisanya `priorUnclosedIncome`. Batas
//     tahun buku dihitung di zona `contract.BusinessTimeZone` — TS memakai
//     zona PROSES, dan produksi memasang `TZ=Asia/Jakarta`. Pecahan ini juga
//     memasukkan jurnal penutup, seperti TS.
//
// Bedanya satu, dan disengaja — sama dengan Neraca Saldo: TS menjumlahkan
// float, Go sen int64. Selisih yang muncul HANYA karena float (mis. tanda
// "Laba"/"Rugi" pada laba bersih −0,0000000001) adalah temuan tentang sisi TS.

// StatementLine adalah satu baris akun Laba Rugi atau Neraca.
type StatementLine struct {
	Code   string `json:"code"`
	Name   string `json:"name"`
	Amount Cents  `json:"amount"`
}

// StatementSection adalah satu band Laba Rugi.
type StatementSection struct {
	Lines []StatementLine `json:"lines"`
	Total Cents           `json:"total"`
}

// CostCenterFilter: penyaring pusat biaya Laba Rugi (#91). Nol = tanpa
// penyaring; Active tanpa ID = hanya baris yang BELUM ditetapkan.
type CostCenterFilter struct {
	Active bool
	ID     *int64
}

// IncomeStatement adalah Laba Rugi satu periode — bentuk `IncomeStatement` TS.
type IncomeStatement struct {
	Revenue          []StatementLine  `json:"revenue"`
	Expense          []StatementLine  `json:"expense"`
	TotalRevenue     Cents            `json:"totalRevenue"`
	TotalExpense     Cents            `json:"totalExpense"`
	NetIncome        Cents            `json:"netIncome"`
	Sales            StatementSection `json:"sales"`
	Cogs             StatementSection `json:"cogs"`
	GrossProfit      Cents            `json:"grossProfit"`
	OperatingExpense StatementSection `json:"operatingExpense"`
	OperatingProfit  Cents            `json:"operatingProfit"`
	OtherIncome      StatementSection `json:"otherIncome"`
	OtherExpense     StatementSection `json:"otherExpense"`
	// UnknownTypes: kode akun bergerak (di rentang ini) bertipe di luar kontrak.
	UnknownTypes []string `json:"unknownTypes"`
}

// BalanceSheet adalah Neraca per satu tanggal — bentuk hasil `getBalanceSheet`.
type BalanceSheet struct {
	AsOf                   time.Time       `json:"asOf"`
	Assets                 []StatementLine `json:"assets"`
	Liabilities            []StatementLine `json:"liabilities"`
	Equity                 []StatementLine `json:"equity"`
	TotalAssets            Cents           `json:"totalAssets"`
	TotalLiabilities       Cents           `json:"totalLiabilities"`
	TotalEquity            Cents           `json:"totalEquity"`
	NetIncome              Cents           `json:"netIncome"`
	CurrentYearIncome      Cents           `json:"currentYearIncome"`
	PriorUnclosedIncome    Cents           `json:"priorUnclosedIncome"`
	TotalLiabilitiesEquity Cents           `json:"totalLiabilitiesEquity"`
	Balanced               bool            `json:"balanced"`
	// EquitySplitJS: apakah `priorUnclosedIncome` TS bernilai BENAR (≠ 0)
	// menurut aritmetika FLOAT JavaScript — yang memutuskan apakah
	// `balanceSheetLayout()` memecah blok ekuitas menjadi dua baris (#555).
	//
	// Tidak sama dengan `PriorUnclosedIncome != 0`. TS menurunkan pecahan itu
	// sebagai selisih DUA jumlah float (laba sepanjang buku − laba tahun
	// berjalan), dan pada buku yang tahun lalunya SUDAH ditutup kedua jumlah
	// itu bisa berbeda di digit ke-14 (100,4 − 0,3 = 100,10000000000001 ≠
	// 100,1): sen-nya nol, tetapi `!!1.4e-14` benar. Neraca PEMBANDING membawa
	// pecahan ini ke berkas (09 §9, jebakan 3) — jadi Go meniru kebenarannya,
	// bukan hanya angkanya. Dihitung `jsSplit`, urutan penjumlahan TS.
	EquitySplitJS bool     `json:"equitySplitJS"`
	UnknownTypes  []string `json:"unknownTypes"`
}

// netsFilter: penyaring jumlah per akun — padanan argumen `accountNets` TS.
type netsFilter struct {
	from, to       *time.Time // nil = tanpa batas di sisi itu
	excludeClosing bool
	costCenter     CostCenterFilter
}

// netsSQL: akun LEFT JOIN jumlah gerakannya, SATU teks kueri untuk setiap
// kombinasi penyaring — parameter yang NULL/false mematikan klausanya, jadi
// tidak ada teks yang dirangkai ke dalam SQL. Batas tanggal teks UTC
// `::timestamp` (alasan di `trialBalanceSQL`). `IS NOT DISTINCT FROM` membuat
// `NULL` = "belum ditetapkan", padanan `costCenterId: null` Prisma.
const netsSQL = `
SELECT a.code, a.name, a.type,
       COALESCE(n.debit, 0)::text, COALESCE(n.credit, 0)::text
  FROM accounts a
  LEFT JOIN (
        SELECT jl.account_id,
               SUM(jl.base_debit)  AS debit,
               SUM(jl.base_credit) AS credit
          FROM journal_lines jl
          JOIN journals j ON j.id = jl.journal_id
         WHERE ($1::timestamp IS NULL OR j.date >= $1::timestamp)
           AND ($2::timestamp IS NULL OR j.date <= $2::timestamp)
           AND ($3::text IS NULL OR j.type <> $3::text)
           AND (NOT $4::boolean OR jl.cost_center_id IS NOT DISTINCT FROM $5::integer)
         GROUP BY jl.account_id
       ) n ON n.account_id = a.id
 ORDER BY a.code`

func tsParam(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.UTC().Format(timestampLayout)
	return &s
}

func (r *Reader) nets(ctx context.Context, tx pgx.Tx, f netsFilter) ([]accountSums, error) {
	var closing *string
	if f.excludeClosing {
		c := contract.ClosingJournalType
		closing = &c
	}
	rows, err := tx.Query(ctx, netsSQL,
		tsParam(f.from), tsParam(f.to), closing, f.costCenter.Active, f.costCenter.ID)
	if err != nil {
		return nil, fmt.Errorf("kueri jumlah per akun: %w", err)
	}
	defer rows.Close()
	var out []accountSums
	for rows.Next() {
		var s accountSums
		var debit, credit string
		if err := rows.Scan(&s.code, &s.name, &s.accountType, &debit, &credit); err != nil {
			return nil, fmt.Errorf("baca jumlah per akun: %w", err)
		}
		if s.debit, err = ParseCents(debit); err != nil {
			return nil, fmt.Errorf("akun %s, debit: %w", s.code, err)
		}
		if s.credit, err = ParseCents(credit); err != nil {
			return nil, fmt.Errorf("akun %s, kredit: %w", s.code, err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// IncomeStatement menghitung Laba Rugi untuk [from, to] (keduanya INKLUSIF,
// nil = tanpa batas di sisi itu), di dalam satu transaksi baca.
func (r *Reader) IncomeStatement(ctx context.Context, from, to *time.Time, cc CostCenterFilter) (*IncomeStatement, error) {
	var sums []accountSums
	err := r.readOnly(ctx, func(tx pgx.Tx) error {
		var err error
		sums, err = r.nets(ctx, tx, netsFilter{from: from, to: to, excludeClosing: true, costCenter: cc})
		return err
	})
	if err != nil {
		return nil, err
	}
	return BuildIncomeStatement(sums), nil
}

// statementAmount: jumlah laporan satu akun, bertanda per sisi kategorinya.
func statementAmount(cat contract.AccountCategory, a accountSums) Cents {
	if contract.CategoryStatementSide[cat] == contract.StatementSideDebit {
		return a.debit - a.credit
	}
	return a.credit - a.debit
}

// incomeStatementSection: padanan `incomeStatementSectionFor`.
func incomeStatementSection(accountType string) (contract.IncomeStatementSection, contract.AccountCategory, bool) {
	cat, ok := contract.CategoryOf(accountType)
	if !ok {
		return "", "", false
	}
	fallback, ok := contract.IncomeStatementCategoryDefaultSections[cat]
	if !ok {
		return "", cat, false
	}
	if s, ok := contract.IncomeStatementTypeSections[contract.AccountType(accountType)]; ok {
		return s, cat, true
	}
	return fallback, cat, true
}

func moved(a accountSums) bool { return a.debit != 0 || a.credit != 0 }

// BuildIncomeStatement menerapkan aturan Laba Rugi atas akun yang SUDAH
// terurut. MURNI — diuji tanpa basis data, dan dipakai berkas emas.
func BuildIncomeStatement(accounts []accountSums) *IncomeStatement {
	is := &IncomeStatement{Revenue: []StatementLine{}, Expense: []StatementLine{}, UnknownTypes: []string{}}
	sections := map[contract.IncomeStatementSection]*StatementSection{
		contract.IncomeStatementSectionSales:            &is.Sales,
		contract.IncomeStatementSectionCogs:             &is.Cogs,
		contract.IncomeStatementSectionOperatingExpense: &is.OperatingExpense,
		contract.IncomeStatementSectionOtherIncome:      &is.OtherIncome,
		contract.IncomeStatementSectionOtherExpense:     &is.OtherExpense,
	}
	for _, s := range sections {
		s.Lines = []StatementLine{}
	}
	for _, a := range accounts {
		key, cat, ok := incomeStatementSection(a.accountType)
		if !ok {
			if !contract.IsAccountType(a.accountType) && moved(a) {
				is.UnknownTypes = append(is.UnknownTypes, a.code)
			}
			continue
		}
		amount := statementAmount(cat, a)
		if amount == 0 {
			continue
		}
		line := StatementLine{Code: a.code, Name: a.name, Amount: amount}
		sec := sections[key]
		sec.Lines = append(sec.Lines, line)
		sec.Total += amount
		if cat == contract.AccountCategoryRevenue {
			is.Revenue = append(is.Revenue, line)
		} else {
			is.Expense = append(is.Expense, line)
		}
	}
	is.GrossProfit = is.Sales.Total - is.Cogs.Total
	is.OperatingProfit = is.GrossProfit - is.OperatingExpense.Total
	is.TotalRevenue = is.Sales.Total + is.OtherIncome.Total
	is.TotalExpense = is.Cogs.Total + is.OperatingExpense.Total + is.OtherExpense.Total
	is.NetIncome = is.OperatingProfit + is.OtherIncome.Total - is.OtherExpense.Total
	return is
}

// fiscalSettingSQL: `companySetting.findFirst({ select: { fiscalYearStart } })`
// — TANPA `ORDER BY`, persis seperti Prisma tanpa `orderBy`. (Identitas
// perusahaan memakai `ORDER BY id`; Neraca tidak.)
const fiscalSettingSQL = `SELECT fiscal_year_start FROM company_settings LIMIT 1`

// BusinessLocation: zona tahun buku — `contract.BusinessTimeZone`, dimuat dari
// basis data zona waktu di dalam biner (`time/tzdata`, diimpor di atas).
func BusinessLocation() (*time.Location, error) {
	loc, err := time.LoadLocation(contract.BusinessTimeZone)
	if err != nil {
		return nil, fmt.Errorf("zona %s tidak termuat (time/tzdata?): %w", contract.BusinessTimeZone, err)
	}
	return loc, nil
}

// FiscalYearStart: padanan `fiscalYearBounds(start, year).start` — tengah malam
// bulan/tanggal awal tahun buku pada tahun `year`, di zona loc. `time.Date`
// menggulung tanggal yang meluap (31 April → 1 Mei) persis seperti `new Date`.
func FiscalYearStart(fiscalYearStart time.Time, year int, loc *time.Location) time.Time {
	f := fiscalYearStart.In(loc)
	return time.Date(year, f.Month(), f.Day(), 0, 0, 0, 0, loc)
}

// FiscalYearOf: padanan `fiscalYearOf` — tahun KALENDER tempat tahun buku yang
// memuat `date` dimulai.
func FiscalYearOf(fiscalYearStart, date time.Time, loc *time.Location) int {
	year := date.In(loc).Year()
	if date.Before(FiscalYearStart(fiscalYearStart, year, loc)) {
		return year - 1
	}
	return year
}

// BalanceSheet menghitung Neraca per asOf (INKLUSIF), di dalam SATU transaksi
// baca — jumlah sepanjang buku, setelan tahun buku, dan jumlah tahun berjalan
// melihat potret buku yang sama.
func (r *Reader) BalanceSheet(ctx context.Context, asOf time.Time) (*BalanceSheet, error) {
	loc, err := BusinessLocation()
	if err != nil {
		return nil, err
	}
	var all, current []accountSums
	var fiscal *time.Time
	err = r.readOnly(ctx, func(tx pgx.Tx) error {
		var err error
		if all, err = r.nets(ctx, tx, netsFilter{to: &asOf}); err != nil {
			return err
		}
		var fys time.Time
		switch err := tx.QueryRow(ctx, fiscalSettingSQL).Scan(&fys); {
		case errors.Is(err, pgx.ErrNoRows):
			return nil
		case err != nil:
			return fmt.Errorf("baca awal tahun buku: %w", err)
		}
		fiscal = &fys
		start := FiscalYearStart(fys, FiscalYearOf(fys, asOf, loc), loc)
		current, err = r.nets(ctx, tx, netsFilter{from: &start, to: &asOf})
		return err
	})
	if err != nil {
		return nil, err
	}
	bs := BuildBalanceSheet(all, current, fiscal != nil)
	bs.AsOf = asOf.UTC()
	return bs, nil
}

// BuildBalanceSheet menerapkan aturan Neraca. `current` = jumlah sejak awal
// tahun buku yang memuat asOf; dipakai hanya bila hasSetting (TS: `setting &&
// asOf`). MURNI.
func BuildBalanceSheet(all, current []accountSums, hasSetting bool) *BalanceSheet {
	bs := &BalanceSheet{
		Assets: []StatementLine{}, Liabilities: []StatementLine{}, Equity: []StatementLine{},
		UnknownTypes: []string{},
	}
	var revenue, expense Cents
	for _, a := range all {
		cat, ok := contract.CategoryOf(a.accountType)
		if !ok {
			if moved(a) {
				bs.UnknownTypes = append(bs.UnknownTypes, a.code)
			}
			continue
		}
		amount := statementAmount(cat, a)
		line := StatementLine{Code: a.code, Name: a.name, Amount: amount}
		switch cat {
		case contract.AccountCategoryAsset:
			if amount != 0 {
				bs.Assets = append(bs.Assets, line)
				bs.TotalAssets += amount
			}
		case contract.AccountCategoryLiability:
			if amount != 0 {
				bs.Liabilities = append(bs.Liabilities, line)
				bs.TotalLiabilities += amount
			}
		case contract.AccountCategoryEquity:
			if amount != 0 {
				bs.Equity = append(bs.Equity, line)
				bs.TotalEquity += amount
			}
		case contract.AccountCategoryRevenue:
			revenue += amount
		case contract.AccountCategoryExpense:
			expense += amount
		}
	}
	bs.NetIncome = revenue - expense
	bs.CurrentYearIncome = bs.NetIncome
	if hasSetting {
		var curRevenue, curExpense Cents
		for _, a := range current {
			cat, ok := contract.CategoryOf(a.accountType)
			if !ok {
				continue
			}
			switch cat {
			case contract.AccountCategoryRevenue:
				curRevenue += statementAmount(cat, a)
			case contract.AccountCategoryExpense:
				curExpense += statementAmount(cat, a)
			}
		}
		bs.CurrentYearIncome = curRevenue - curExpense
		// Diturunkan, bukan dihitung sendiri — seperti TS.
		bs.PriorUnclosedIncome = bs.NetIncome - bs.CurrentYearIncome
	}
	bs.TotalLiabilitiesEquity = bs.TotalLiabilities + (bs.TotalEquity + bs.NetIncome)
	bs.Balanced = bs.TotalAssets == bs.TotalLiabilitiesEquity
	bs.EquitySplitJS = hasSetting && jsSplit(all, current)
	return bs
}

// jsFloat: rupiah-float TS satu jumlah sen — `Number(decimal)` atas jumlah
// `NUMERIC(…,2)` adalah double terdekat ke desimal itu, dan begitu pula
// pembagian bilangan bulat sen dengan 100 (dibulatkan benar oleh IEEE 754).
func jsFloat(c Cents) float64 { return float64(c) / 100 }

// jsStatementAmount: `statementAmount` TS dalam float — `n.debit − n.credit`
// atau sebaliknya, per sisi kategorinya.
func jsStatementAmount(cat contract.AccountCategory, a accountSums) float64 {
	if contract.CategoryStatementSide[cat] == contract.StatementSideDebit {
		return jsFloat(a.debit) - jsFloat(a.credit)
	}
	return jsFloat(a.credit) - jsFloat(a.debit)
}

// jsIncome: `revenue − expense` TS dalam float, dijumlahkan dalam urutan akun
// yang SAMA (ORDER BY code) — penjumlahan float tidak asosiatif, dan urutan
// lain bisa memberi digit ke-14 yang lain.
func jsIncome(accounts []accountSums) float64 {
	var revenue, expense float64
	for _, a := range accounts {
		cat, ok := contract.CategoryOf(a.accountType)
		if !ok {
			continue
		}
		switch cat {
		case contract.AccountCategoryRevenue:
			revenue += jsStatementAmount(cat, a)
		case contract.AccountCategoryExpense:
			expense += jsStatementAmount(cat, a)
		}
	}
	return revenue - expense
}

// jsSplit: `!!(netIncome − currentYearIncome)` dalam float TS.
func jsSplit(all, current []accountSums) bool {
	return jsIncome(all)-jsIncome(current) != 0
}

// ParseCostCenterFilter: padanan `parseCostCenterFilter` (`src/lib/cost-centers.ts`).
// Apa pun yang tidak masuk akal jatuh ke "tanpa penyaring" — seperti TS. Angka
// di luar jangkauan `Int` basis data MELEMPAR: TS pun gagal di kuerinya.
func ParseCostCenterFilter(raw string) (CostCenterFilter, error) {
	v := jscompat.Trim(raw)
	if v == "" {
		return CostCenterFilter{}, nil
	}
	if v == contract.CostCenterUnassigned {
		return CostCenterFilter{Active: true}, nil
	}
	for _, c := range v {
		if c < '0' || c > '9' {
			return CostCenterFilter{}, nil
		}
	}
	id, err := strconv.ParseInt(v, 10, 32)
	if err != nil {
		return CostCenterFilter{}, fmt.Errorf("pusat biaya %q di luar jangkauan Int: %w", v, err)
	}
	if id <= 0 {
		return CostCenterFilter{}, nil
	}
	return CostCenterFilter{Active: true, ID: &id}, nil
}

// CostCenter membaca kode & nama satu pusat biaya — padanan
// `costCenter.findUnique({ where: { id } })`, aktif atau tidak. found=false bila
// tidak ada.
func (r *Reader) CostCenter(ctx context.Context, id int64) (code, name string, found bool, err error) {
	err = r.readOnly(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT code, name FROM cost_centers WHERE id = $1`, id).Scan(&code, &name)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", false, nil
	}
	if err != nil {
		return "", "", false, fmt.Errorf("baca pusat biaya %d: %w", id, err)
	}
	return code, name, true, nil
}
