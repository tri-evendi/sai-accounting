package document

import (
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/ledgerread"
)

func ids(cols []contract.AgingColumn) []string {
	var out []string
	for _, c := range cols {
		out = append(out, c.ID)
	}
	return out
}

func TestAgingVisibleColumnsMirrorsResolveColumns(t *testing.T) {
	cases := map[string][]string{
		"":                        {"party", "documentNo", "date", "dueDate", "age", "status", "total", "outstanding"},
		"bukan,kolom":             {"party", "documentNo", "date", "dueDate", "age", "status", "total", "outstanding"},
		" outstanding , age":      {"party", "age", "outstanding"},
		"party":                   {"party"},
		"outstanding,documentNo,": {"party", "documentNo", "outstanding"},
	}
	for raw, want := range cases {
		got := ids(AgingVisibleColumns(contract.ReceivablesColumns, raw))
		if len(got) != len(want) {
			t.Errorf("%q: %v, ingin %v", raw, got, want)
			continue
		}
		for i := range want {
			if got[i] != want[i] {
				t.Errorf("%q: %v, ingin %v", raw, got, want)
				break
			}
		}
	}
}

func TestAgingSheetShape(t *testing.T) {
	out := ledgerread.Cents(150)
	rep := &ledgerread.AgingReport{
		Kind: "payables",
		Rows: []ledgerread.AgingDocument{
			{PartyName: "S1", DocumentNo: "TRX-1", Date: time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC),
				AgeDays: 12, AgeFromIssue: true, Status: contract.PaymentStatusUnpaid, OutstandingBase: &out},
		},
		Buckets:    []ledgerread.AgingBucketTotal{{Bucket: contract.AgingBucketB030, Amount: 150}},
		Total:      150,
		Unresolved: 2,
	}
	// SATU kolom: ringkasan kehilangan kolom nilainya, persis TS.
	one, err := AgingSheet(rep, AgingVisibleColumns(contract.PayablesColumns, "party"), "PT", "Per 1 Maret 2026", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if one.Name != contract.PayablesSheetName || len(one.Rows[6]) != 1 || one.Rows[6][0].Text != contract.AgingSummaryLabel {
		t.Fatalf("lembar satu kolom: %+v", one.Rows[6])
	}
	if len(one.Rows[7]) != 1 {
		t.Errorf("baris ember satu kolom membawa nilai: %+v", one.Rows[7])
	}
	// Dua catatan kaki: umur dari tanggal dokumen, lalu valas tanpa kurs.
	n := len(one.Rows)
	if one.Rows[n-2][0].Text != contract.AgingUndatedNote || one.Rows[n-1][0].Text != "2 dokumen valas tanpa kurs tidak punya nilai IDR, jadi tidak ikut dijumlahkan." {
		t.Errorf("catatan: %q / %q", one.Rows[n-2][0].Text, one.Rows[n-1][0].Text)
	}
	all, err := AgingSheet(rep, AgingVisibleColumns(contract.PayablesColumns, ""), "PT", "Per 1 Maret 2026", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	row := all.Rows[len(all.Rows)-4] // baris dokumen: sebelum baris kosong + 2 catatan
	if row[4].Kind != CellText || row[4].Text != "12 *" {
		t.Errorf("umur dari tanggal dokumen harus teks berbintang: %+v", row[4])
	}
	if row[3].Text != contract.AgingNoDueDate || row[7].Number != "1.5" {
		t.Errorf("jatuh tempo / sisa: %+v %+v", row[3], row[7])
	}
}
