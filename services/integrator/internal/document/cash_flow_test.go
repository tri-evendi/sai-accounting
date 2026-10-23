package document

import (
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
)

// Lembar sebar Arus Kas dari berkas emas ANGKA `internal/ledgerread`
// (`../ledgerread/testdata/arus-kas-*.golden.json`). Berkas emas lembarnya
// dibaca `tests/cash-flow-equity-golden.test.ts`, yang membandingkan ISI-nya
// dengan lembar jalur berkas TS (`buildReportPayload` → `buildReportSheet` →
// ExcelJS) atas buku yang sama.
func TestCashFlowGoldenWorkbooks(t *testing.T) {
	n := 0
	for _, b := range loadStatementMeta(t) {
		printed, err := time.Parse(time.RFC3339, b.PrintedAt)
		if err != nil {
			t.Fatal(err)
		}
		for _, c := range b.CashFlows {
			n++
			t.Run(c.Case, func(t *testing.T) {
				var cf ledgerread.CashFlow
				readNumbers(t, c.Case, &cf)
				period, err := PeriodRange(c.From, c.To, "")
				if err != nil {
					t.Fatal(err)
				}
				compareGolden(t, c.Case, func() []byte {
					data, err := CashFlowWorkbook(&cf, b.CompanyName, period, printed)
					if err != nil {
						t.Fatal(err)
					}
					return data
				})
			})
		}
	}
	if n == 0 {
		t.Fatal("fixture tanpa kasus Arus Kas")
	}
}

// Bentuk yang paling mudah salah: kelompok cadangan kosong HILANG, tiga
// kelompok baku tetap tampil dengan kalimat kosong, kolom tak berlaku kosong.
func TestCashFlowSheetShape(t *testing.T) {
	cf := &ledgerread.CashFlow{Reconciled: true}
	for _, c := range contract.CashFlowCategories {
		cf.Groups = append(cf.Groups, ledgerread.CashFlowGroup{Category: c})
	}
	s := CashFlowSheet(cf, "PT Uji", "Periode", time.Unix(0, 0))
	body := s.Rows[6:]
	// awal + 3 × (judul, kosong, jumlah) + akhir + total
	if len(body) != 1+3*3+2 {
		t.Fatalf("%d baris badan", len(body))
	}
	for _, r := range body {
		if r[0].Text == contract.CashFlowCategoryLabels[contract.CashFlowFallbackCategory] {
			t.Error("kelompok cadangan kosong tampil")
		}
	}
	if body[0][1].Kind != CellEmpty || body[0][3].Kind != CellNumber {
		t.Error("kas awal: kolom masuk harus kosong, bersih angka")
	}
	last := body[len(body)-1]
	if last[0].Text != contract.CashFlowTotalLabel+" "+contract.CashFlowNoteReconciled || !last[0].Style.Font.Bold {
		t.Errorf("baris total = %q", last[0].Text)
	}
}
