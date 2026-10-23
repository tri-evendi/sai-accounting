package conformance

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

// Fikstur BERSAMA: `testdata/materiality_fixtures.json` juga dibaca
// `tests/materiality-fixtures.test.ts`, yang membuktikan isinya = keluaran
// `src/lib/materiality.ts`. Kasus baru ditulis sekali, di sana, dan berlaku
// untuk kedua bahasa.
type fikstur struct {
	Cases []struct {
		Name      string                `json:"name"`
		Threshold *float64              `json:"threshold"`
		Accounts  []ExpenseAccountTotal `json:"accounts"`
		Expect    struct {
			Names    []bool `json:"names"`
			CatchAll struct {
				TotalExpense float64           `json:"totalExpense"`
				Findings     []CatchAllFinding `json:"findings"`
				Labels       []string          `json:"labels"`
			} `json:"catchAll"`
			Untagged struct {
				TotalExpense float64                  `json:"totalExpense"`
				Findings     []UntaggedExpenseFinding `json:"findings"`
				Labels       []string                 `json:"labels"`
			} `json:"untagged"`
		} `json:"expect"`
	} `json:"cases"`
}

func bacaFikstur(t *testing.T) fikstur {
	t.Helper()
	raw, err := os.ReadFile("testdata/materiality_fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	var f fikstur
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Cases) < 8 {
		t.Fatalf("fikstur hanya %d kasus — penjaga ini tidak sedang melihat apa pun", len(f.Cases))
	}
	return f
}

func TestMaterialitasSamaDenganTypeScript(t *testing.T) {
	for _, k := range bacaFikstur(t).Cases {
		t.Run(k.Name, func(t *testing.T) {
			ambang := contract.MaterialityCatchAllThreshold
			if k.Threshold != nil {
				ambang = *k.Threshold
			}
			for i, a := range k.Accounts {
				if got := IsCatchAllName(a.Name); got != k.Expect.Names[i] {
					t.Errorf("IsCatchAllName(%q) = %v, TS %v", a.Name, got, k.Expect.Names[i])
				}
			}

			totalCA, ca := AssessCatchAll(k.Accounts, ambang)
			if totalCA != k.Expect.CatchAll.TotalExpense {
				t.Errorf("total beban %v, TS %v", totalCA, k.Expect.CatchAll.TotalExpense)
			}
			if ca == nil {
				ca = []CatchAllFinding{}
			}
			if !reflect.DeepEqual(ca, k.Expect.CatchAll.Findings) {
				t.Errorf("temuan penampung\n Go %+v\n TS %+v", ca, k.Expect.CatchAll.Findings)
			}
			label := []string{}
			for _, f := range ca {
				label = append(label, DescribeCatchAll(f))
			}
			if !reflect.DeepEqual(label, k.Expect.CatchAll.Labels) {
				t.Errorf("kalimat penampung\n Go %q\n TS %q", label, k.Expect.CatchAll.Labels)
			}

			totalUn, un := FindUntagged(k.Accounts, ambang)
			if totalUn != k.Expect.Untagged.TotalExpense {
				t.Errorf("total beban (sifat) %v, TS %v", totalUn, k.Expect.Untagged.TotalExpense)
			}
			if un == nil {
				un = []UntaggedExpenseFinding{}
			}
			if !reflect.DeepEqual(un, k.Expect.Untagged.Findings) {
				t.Errorf("temuan tanpa sifat\n Go %+v\n TS %+v", un, k.Expect.Untagged.Findings)
			}
			label = []string{}
			for _, f := range un {
				label = append(label, DescribeUntagged(f))
			}
			if !reflect.DeepEqual(label, k.Expect.Untagged.Labels) {
				t.Errorf("kalimat tanpa sifat\n Go %q\n TS %q", label, k.Expect.Untagged.Labels)
			}
		})
	}
}

func TestPolaPenampungBukanLipatanUnicode(t *testing.T) {
	// `(?i)` RE2 akan mencocokkan keduanya; bendera `i` JS tanpa `u` tidak.
	for _, nama := range []string{"Beban \u017fundry", "Beban \u212aantor dllİ"} {
		want := nama == "Beban \u212aantor dllİ" // `dll` tetap kata utuh
		if got := IsCatchAllName(nama); got != want {
			t.Errorf("IsCatchAllName(%q) = %v, mau %v", nama, got, want)
		}
	}
}
