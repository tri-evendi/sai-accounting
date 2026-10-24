package document

import (
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
)

// Lembar sebar Laporan Perubahan Ekuitas dari berkas emas ANGKA
// `internal/ledgerread` (`../ledgerread/testdata/ekuitas-*.golden.json`).
// Berkas emas lembarnya dibaca `tests/cash-flow-equity-golden.test.ts`, yang
// membandingkan ISI-nya dengan lembar jalur berkas TS (`buildReportPayload` →
// `buildReportSheet` → ExcelJS) atas buku yang sama.
func TestEquityStatementGoldenWorkbooks(t *testing.T) {
	n := 0
	for _, b := range loadStatementMeta(t) {
		printed, err := time.Parse(time.RFC3339, b.PrintedAt)
		if err != nil {
			t.Fatal(err)
		}
		for _, c := range b.EquityStatements {
			n++
			t.Run(c.Case, func(t *testing.T) {
				var es ledgerread.EquityStatement
				readNumbers(t, c.Case, &es)
				period, err := PeriodRange(c.From, c.To, "")
				if err != nil {
					t.Fatal(err)
				}
				compareGolden(t, c.Case, func() []byte {
					data, err := EquityStatementWorkbook(&es, b.CompanyName, period, printed)
					if err != nil {
						t.Fatal(err)
					}
					return data
				})
			})
		}
	}
	if n == 0 {
		t.Fatal("fixture tanpa kasus Laporan Perubahan Ekuitas")
	}
}

// Bentuk yang paling mudah salah: laba belum ditutup SELALU tampil dan arah
// geraknya memilih kolom; Total tanpa tambah/kurang (sel kosong) dan tebal.
func TestEquityStatementSheetShape(t *testing.T) {
	es := &ledgerread.EquityStatement{
		Components: []ledgerread.EquityComponent{
			{Code: "3101", Name: "Modal", Opening: 100_00, Additions: 50_00, Reductions: 0, Closing: 150_00},
		},
		UnclosedIncome: ledgerread.EquityUnclosedIncome{Opening: 30_00, Movement: -40_00, Closing: -10_00},
		TotalOpening:   130_00,
		TotalClosing:   140_00,
	}
	s := EquityStatementSheet(es, "PT Uji", "Periode", time.Unix(0, 0))
	body := s.Rows[6:]
	if len(body) != 3 {
		t.Fatalf("%d baris badan", len(body))
	}
	if body[0][0].Text != "3101  Modal" || body[0][0].Style.Font.Bold {
		t.Errorf("baris komponen = %q", body[0][0].Text)
	}
	un := body[1]
	if un[0].Text != contract.EquityStatementUnclosedLabel || un[0].Style.Font.Bold {
		t.Errorf("baris laba belum ditutup = %q", un[0].Text)
	}
	if un[2].Kind != CellNumber || un[2].Number != "0" || un[3].Number != "40" {
		t.Errorf("rugi harus di kolom kurang: tambah %q, kurang %q", un[2].Number, un[3].Number)
	}
	total := body[2]
	if total[0].Text != contract.EquityStatementTotalLabel || !total[0].Style.Font.Bold {
		t.Errorf("baris total = %q", total[0].Text)
	}
	if total[2].Kind != CellEmpty || total[3].Kind != CellEmpty || total[4].Number != "140" {
		t.Error("total: tambah/kurang harus kosong, akhir angka")
	}

	// Buku kosong tetap mencetak laba belum ditutup (nol) dan Total.
	empty := EquityStatementSheet(&ledgerread.EquityStatement{}, "PT Uji", "Periode", time.Unix(0, 0))
	if len(empty.Rows[6:]) != 2 {
		t.Fatalf("buku kosong: %d baris badan", len(empty.Rows[6:]))
	}
}

// Bentuk usaha (24 Okt 2026): teks porsi dan label pemilik — padanan
// `shareBpText` / `equityPartnerLabel` TS, karakter demi karakter.
func TestEquityPartnerLabels(t *testing.T) {
	for bp, want := range map[int]string{10000: "100", 5000: "50", 3333: "33,33", 3330: "33,3", 1667: "16,67", 5: "0,05", 0: "0"} {
		if got := ShareBpText(bp); got != want {
			t.Errorf("ShareBpText(%d) = %q, mau %q", bp, got, want)
		}
	}
	aktif := "aktif"
	if got := EquityPartnerLabel(ledgerread.EquityPartner{Name: "Andi", Role: &aktif, ShareBp: 5000, IsActive: true}); got != "Andi (sekutu aktif, 50%)" {
		t.Errorf("label = %q", got)
	}
	if got := EquityPartnerLabel(ledgerread.EquityPartner{Name: "Sari", ShareBp: 10000}); got != "Sari (100%) — nonaktif" {
		t.Errorf("label nonaktif = %q", got)
	}
}

// Buku PT: tidak ada lembar kedua — berkasnya tetap SATU lembar.
func TestEquityPartnerSheetOnlyWithPartners(t *testing.T) {
	if sheets := EquityStatementSheets(&ledgerread.EquityStatement{}, "PT Uji", "Periode", time.Unix(0, 0)); len(sheets) != 1 {
		t.Fatalf("PT: %d lembar, mau 1", len(sheets))
	}
	es := &ledgerread.EquityStatement{Partners: []ledgerread.EquityPartner{
		{Name: "A", ShareBp: 6000, IsActive: true, Opening: 100_00, ProfitShare: 60_00, Drawings: 10_00, Closing: 150_00},
		{Name: "B", ShareBp: 4000, IsActive: true, Opening: 50_00, ProfitShare: 40_00, Contributions: 5_00, Closing: 95_00},
	}}
	sheets := EquityStatementSheets(es, "CV Uji", "Periode", time.Unix(0, 0))
	if len(sheets) != 2 || sheets[1].Name != contract.EquityPartnerSheetName {
		t.Fatalf("CV: %d lembar", len(sheets))
	}
	body := sheets[1].Rows[6:]
	total := body[len(body)-1]
	if total[0].Text != contract.EquityPartnerTotalLabel || !total[0].Style.Font.Bold || total[5].Number != "245" {
		t.Errorf("total pemilik = %q / %q", total[0].Text, total[5].Number)
	}
}
