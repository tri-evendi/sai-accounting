// PARITAS PENERBIT: Go menghitung butir, kunci, dan muatan yang SAMA dengan
// `@sai/core/schedule-due` — dibuktikan terhadap fikstur bersama yang juga
// dibaca `tests/schedule-due.test.ts`. Tanpa basis data.
package schedulelane

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

type kasusFikstur struct {
	Name      string          `json:"name"`
	At        string          `json:"at"`
	Kind      string          `json:"kind"`
	Companies []int32         `json:"companies"`
	Expected  []terbitDiharap `json:"expected"`
}

type terbitDiharap struct {
	Kind      string          `json:"kind"`
	CompanyID *int32          `json:"companyId"`
	DedupeKey string          `json:"dedupeKey"`
	Payload   json.RawMessage `json:"payload"`
}

func bacaFikstur(t *testing.T) []kasusFikstur {
	t.Helper()
	isi, err := os.ReadFile(filepath.Join("testdata", "schedule_due_fixtures.json"))
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Cases []kasusFikstur `json:"cases"`
	}
	if err := json.Unmarshal(isi, &doc); err != nil {
		t.Fatal(err)
	}
	if len(doc.Cases) < 5 {
		// Fikstur yang terpotong LULUS dengan nol kasus.
		t.Fatalf("fikstur hanya memuat %d kasus", len(doc.Cases))
	}
	return doc.Cases
}

func jsonSetara(t *testing.T, a, b json.RawMessage) bool {
	t.Helper()
	var x, y any
	if err := json.Unmarshal(a, &x); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &y); err != nil {
		t.Fatal(err)
	}
	return reflect.DeepEqual(x, y)
}

func TestPublicationsSamaDenganFiksturBersama(t *testing.T) {
	for _, k := range bacaFikstur(t) {
		t.Run(k.Name, func(t *testing.T) {
			at, err := time.Parse(time.RFC3339Nano, k.At)
			if err != nil {
				t.Fatal(err)
			}
			cs := make([]Company, 0, len(k.Companies))
			for _, id := range k.Companies {
				cs = append(cs, Company{ID: id})
			}
			got, err := Publications(contract.JobKind(k.Kind), at, cs)
			if err != nil {
				t.Fatal(err)
			}
			if len(got) != len(k.Expected) {
				t.Fatalf("%d baris, diharap %d", len(got), len(k.Expected))
			}
			for i, g := range got {
				e := k.Expected[i]
				if string(g.Kind) != e.Kind {
					t.Errorf("[%d] kind %q, diharap %q", i, g.Kind, e.Kind)
				}
				if g.DedupeKey != e.DedupeKey {
					t.Errorf("[%d] dedupeKey %q, diharap %q", i, g.DedupeKey, e.DedupeKey)
				}
				if (g.CompanyID == nil) != (e.CompanyID == nil) ||
					(g.CompanyID != nil && *g.CompanyID != *e.CompanyID) {
					t.Errorf("[%d] companyId %v, diharap %v", i, g.CompanyID, e.CompanyID)
				}
				if !jsonSetara(t, g.Payload, e.Payload) {
					t.Errorf("[%d] payload %s, diharap %s", i, g.Payload, e.Payload)
				}
			}
		})
	}
}

func TestFiksturMencakupSetiapKindBerjadwal(t *testing.T) {
	// Kind berjadwal baru tanpa kasus fikstur = kunci yang tidak pernah
	// dibuktikan sama di kedua bahasa.
	ada := map[string]bool{}
	for _, k := range bacaFikstur(t) {
		ada[k.Kind] = true
	}
	for k := range contract.ScheduledKinds {
		if !ada[string(k)] {
			t.Errorf("kind berjadwal %q tanpa kasus di testdata/schedule_due_fixtures.json", k)
		}
	}
}

func TestISOStringMemotongBukanMembulatkan(t *testing.T) {
	// `Date` JS hanya memegang milidetik; nanodetik Go yang dibulatkan akan
	// menggeser `.9995` ke detik berikutnya — dan pada 59:59.9995 ke JAM
	// berikutnya, yaitu butir yang berbeda.
	at := time.Date(2026, 10, 23, 16, 59, 59, 999_900_000, time.UTC)
	if got := ISOString(at); got != "2026-10-23T16:59:59.999Z" {
		t.Fatalf("ISOString = %q", got)
	}
	if b, _ := Bucket(contract.GrainHour, at); b != "2026-10-23T16" {
		t.Fatalf("butir = %q", b)
	}
}

func TestKindTanpaJadwalDitolak(t *testing.T) {
	if _, err := Publications(contract.KindReportExport, time.Now(), nil); err == nil {
		t.Fatal("kind tanpa `schedule:` diterima")
	}
	if _, err := Bucket("minggu", time.Now()); err == nil {
		t.Fatal("butir asing diterima")
	}
}

func TestGoOwnedHanyaPenerbitGo(t *testing.T) {
	for _, k := range GoOwned() {
		if contract.ScheduledKinds[k].Publisher != contract.PublisherGo {
			t.Errorf("%s bukan milik Go", k)
		}
	}
	n := 0
	for _, s := range contract.ScheduledKinds {
		if s.Publisher == contract.PublisherGo {
			n++
		}
	}
	if n != len(GoOwned()) {
		t.Fatalf("GoOwned melewatkan kind: %d dari %d", len(GoOwned()), n)
	}
}
