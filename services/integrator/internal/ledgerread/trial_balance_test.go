package ledgerread

import (
	"reflect"
	"strings"
	"testing"
)

// Fikstur tetap: akun SUDAH terurut seperti keluaran `ORDER BY code`.
func fixtureAccounts() []accountSums {
	return []accountSums{
		{code: "110101", name: "Kas", accountType: "cash_bank", debit: 1_000_000_00, credit: 250_000_00},
		{code: "110201", name: "Bank", accountType: "cash_bank"}, // tanpa gerakan → dilewati
		{code: "110301", name: "Piutang", accountType: "account_receivable", debit: 500_000_00, credit: 500_000_00},
		{code: "210101", name: "Hutang", accountType: "account_payable", debit: 0, credit: 300_000_00},
		{code: "310101", name: "Modal", accountType: "equity", credit: 1_000_000_00},
		{code: "410101", name: "Penjualan", accountType: "revenue", credit: 450_000_55},
		{code: "610101", name: "Beban", accountType: "expense", debit: 1_000_000_55},
	}
}

func TestTrialBalanceRules(t *testing.T) {
	tb := buildTrialBalance(fixtureAccounts())

	want := []TrialBalanceRow{
		{Code: "110101", Name: "Kas", Type: "cash_bank", Debit: 750_000_00},
		// Aturan 4: bergerak lalu netral TETAP tampil sebagai 0/0.
		{Code: "110301", Name: "Piutang", Type: "account_receivable"},
		// Aturan 3: sisi ditentukan TANDA selisih.
		{Code: "210101", Name: "Hutang", Type: "account_payable", Credit: 300_000_00},
		{Code: "310101", Name: "Modal", Type: "equity", Credit: 1_000_000_00},
		{Code: "410101", Name: "Penjualan", Type: "revenue", Credit: 450_000_55},
		{Code: "610101", Name: "Beban", Type: "expense", Debit: 1_000_000_55},
	}
	if !reflect.DeepEqual(tb.Rows, want) {
		t.Fatalf("baris:\n got %+v\nwant %+v", tb.Rows, want)
	}
	if tb.TotalDebit != 1_750_000_55 || tb.TotalCredit != 1_750_000_55 {
		t.Errorf("total = %s / %s", tb.TotalDebit, tb.TotalCredit)
	}
	if !tb.Balanced {
		t.Error("buku seimbang terbaca timpang")
	}
	if len(tb.UnknownTypes) != 0 {
		t.Errorf("tipe asing palsu: %v", tb.UnknownTypes)
	}
}

func TestTrialBalanceAbnormalSideFollowsSign(t *testing.T) {
	// Aturan 3 dari sisi lain: akun pendapatan bersaldo DEBIT (retur besar)
	// tetap di kolom debit — Neraca Saldo melaporkan buku, tidak membetulkannya.
	tb := buildTrialBalance([]accountSums{
		{code: "4", name: "Pendapatan", accountType: "revenue", debit: 100, credit: 40},
	})
	if tb.Rows[0].Debit != 60 || tb.Rows[0].Credit != 0 {
		t.Errorf("baris = %+v", tb.Rows[0])
	}
}

func TestTrialBalanceDetectsOneCentImbalance(t *testing.T) {
	// Ketelitian sen: timpang satu sen adalah timpang. Float yang dibulatkan
	// bisa menelan ini; sen int64 tidak.
	tb := buildTrialBalance([]accountSums{
		{code: "1", name: "A", accountType: "cash_bank", debit: 10_000_01},
		{code: "2", name: "B", accountType: "equity", credit: 10_000_00},
	})
	if tb.Balanced {
		t.Error("selisih satu sen terbaca seimbang")
	}
}

func TestTrialBalanceKeepsDatabaseOrder(t *testing.T) {
	// Aturan 2: urutan dari kolasi basis data dipertahankan, tidak diurutkan
	// ulang di Go — di sini sengaja BUKAN urutan byte.
	in := []accountSums{
		{code: "b-1", name: "x", accountType: "expense", debit: 1},
		{code: "A-2", name: "y", accountType: "expense", debit: 1},
	}
	tb := buildTrialBalance(in)
	if tb.Rows[0].Code != "b-1" || tb.Rows[1].Code != "A-2" {
		t.Errorf("urutan diubah: %v", tb.Rows)
	}
}

func TestTrialBalanceReportsUnknownTypesWithoutDroppingThem(t *testing.T) {
	tb := buildTrialBalance([]accountSums{
		{code: "1", name: "A", accountType: "cash_bank", debit: 5},
		{code: "9", name: "Asing", accountType: "liabilitas_aneh", credit: 5},
		{code: "8", name: "Asing diam", accountType: "liabilitas_aneh"}, // tanpa gerakan
	})
	if len(tb.Rows) != 2 || !tb.Balanced {
		t.Fatalf("akun bertipe asing mesti tetap dihitung: %+v", tb)
	}
	if !reflect.DeepEqual(tb.UnknownTypes, []string{"9"}) {
		t.Errorf("UnknownTypes = %v", tb.UnknownTypes)
	}
}

func TestTrialBalanceEmptyBook(t *testing.T) {
	tb := buildTrialBalance(nil)
	// Slice kosong, bukan nil: JSON-nya `[]`, bukan `null`, dan pembanding
	// paritas tidak perlu membedakan keduanya.
	if tb.Rows == nil || tb.UnknownTypes == nil || !tb.Balanced {
		t.Errorf("buku kosong = %+v", tb)
	}
}

func TestTrialBalanceSQLIsReadOnlyAndMatchesTS(t *testing.T) {
	// Bentuk kueri yang menanggung paritas. Penjaga teks yang sama di sisi TS
	// (`tests/services-go.test.ts`) menolak tulisan; di sini sifat bacanya.
	for _, must := range []string{
		"SUM(jl.base_debit)", "SUM(jl.base_credit)", // rupiah dasar, bukan mata uang asal
		"j.date <= $1::timestamp", // asOf INKLUSIF, teks UTC
		"ORDER BY a.code",         // kolasi basis data
		"LEFT JOIN",               // akun tanpa gerakan ikut, lalu dilewati aturan 4
	} {
		if !strings.Contains(trialBalanceSQL, must) {
			t.Errorf("trialBalanceSQL tidak memuat %q", must)
		}
	}
	// Jurnal penutup TIDAK dibuang (#555) — penyaring itu milik Laba Rugi.
	for _, mustNot := range []string{"closing", "source_type", "is_reversed"} {
		if strings.Contains(trialBalanceSQL, mustNot) {
			t.Errorf("trialBalanceSQL memuat penyaring %q yang TS tidak punya", mustNot)
		}
	}
}
