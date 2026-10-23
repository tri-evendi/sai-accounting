package schedulelane

import (
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jobs"
)

// APA YANG JATUH TEMPO DI SATU DENYUT — kembaran Go `@sai/core/schedule-due`.
//
// Murni: tanpa basis data, tanpa jam dinding. Instan denyut diserahkan
// pemanggil, jadi setiap tepi (batas jam, tengah malam UTC yang bukan tengah
// malam WIB, milidetik nol) bisa diuji — dan diuji TERHADAP FIKSTUR YANG SAMA
// dengan sisi TypeScript (`testdata/schedule_due_fixtures.json`). Kunci yang
// identik sampai ke byte-nya adalah satu-satunya hal yang membuat peralihan
// penerbit Node ↔ Go tidak pernah menerbitkan dua kali.

// Company adalah perusahaan yang dipilih penerbit (saringannya di
// `companies.go`, cermin saringan `scripts/publish-recurring.ts`).
type Company struct {
	ID int32
}

// isoJS: bentuk `Date.prototype.toISOString()` — UTC, TEPAT tiga digit
// milidetik (dipotong, bukan dibulatkan: `Date` JS memang hanya memegang
// milidetik), akhiran `Z`. Format RFC3339 bawaan Go membuang milidetik nol,
// dan `.000Z` lawan `Z` adalah dua muatan berbeda untuk instan yang sama.
const isoJS = "2006-01-02T15:04:05.000Z07:00"

// ISOString: padanan `toISOString()` untuk tahun 0000–9999.
func ISOString(at time.Time) string {
	return at.UTC().Truncate(time.Millisecond).Format(isoJS)
}

// Bucket: butir kunci idempotensi di UTC — `YYYY-MM-DDTHH` atau `YYYY-MM-DD`.
// Padanan `scheduleBucket` (`iso.slice(0, 13)` / `iso.slice(0, 10)`).
func Bucket(grain contract.ScheduleGrain, at time.Time) (string, error) {
	iso := ISOString(at)
	switch grain {
	case contract.GrainHour:
		return iso[:13], nil
	case contract.GrainDay:
		return iso[:10], nil
	}
	return "", fmt.Errorf("butir %q tidak dikenal kontrak", grain)
}

// DedupeKey: `<kind>:<companyId>:<butir>` (per perusahaan) atau `<kind>:<butir>`.
func DedupeKey(kind contract.JobKind, at time.Time, companyID *int32) (string, error) {
	spec, ada := contract.ScheduledKinds[kind]
	if !ada {
		return "", fmt.Errorf("kind %q tidak ber-`schedule:` di contract/kinds.yaml", kind)
	}
	butir, err := Bucket(spec.Grain, at)
	if err != nil {
		return "", err
	}
	if spec.PerCompany {
		if companyID == nil {
			return "", fmt.Errorf("kind %q diterbitkan per perusahaan — kuncinya wajib memuat companyId", kind)
		}
		return fmt.Sprintf("%s:%d:%s", kind, *companyID, butir), nil
	}
	return fmt.Sprintf("%s:%s", kind, butir), nil
}

// muatanBerulang: `{ companyId, today }` — bentuk yang dibaca `workers/ledger.ts`.
type muatanBerulang struct {
	CompanyID int32  `json:"companyId"`
	Today     string `json:"today"`
}

// muatanCadangan: `{ butir }` — tanpa daftar basis data, dengan sengaja
// (pencacahan terjadi saat pelaksanaan, `internal/backup/daftar.go`).
type muatanCadangan struct {
	Butir string `json:"butir"`
}

// Payload: muatan per kind — bentuk milik PELAKSANANYA. Kind berjadwal yang
// belum punya cabang di sini MELEMPAR: penerbit yang menebak bentuk muatan
// menerbitkan pekerjaan yang selalu dilempar pelaksananya, tiap jam.
func Payload(kind contract.JobKind, at time.Time, companyID *int32) (json.RawMessage, error) {
	switch kind {
	case contract.KindLedgerRecurring:
		if companyID == nil {
			return nil, fmt.Errorf("kind %q tanpa companyId", kind)
		}
		return json.Marshal(muatanBerulang{CompanyID: *companyID, Today: ISOString(at)})
	case contract.KindTenantBackup:
		butir, err := Bucket(contract.ScheduledKinds[kind].Grain, at)
		if err != nil {
			return nil, err
		}
		return json.Marshal(muatanCadangan{Butir: butir})
	}
	return nil, fmt.Errorf("kind berjadwal %q belum punya bentuk muatan di schedulelane — "+
		"tambahkan di Payload DAN di @sai/core/schedule-due, lalu kasusnya di fikstur bersama", kind)
}

// Publications: setiap baris yang jatuh tempo untuk `kind` pada instan `at`.
// SATU instan untuk seluruh putaran; urutan perusahaan dipertahankan.
func Publications(kind contract.JobKind, at time.Time, companies []Company) ([]jobs.Publication, error) {
	spec, ada := contract.ScheduledKinds[kind]
	if !ada {
		return nil, fmt.Errorf("kind %q tidak ber-`schedule:` di contract/kinds.yaml", kind)
	}
	satu := func(companyID *int32) (jobs.Publication, error) {
		kunci, err := DedupeKey(kind, at, companyID)
		if err != nil {
			return jobs.Publication{}, err
		}
		muatan, err := Payload(kind, at, companyID)
		if err != nil {
			return jobs.Publication{}, err
		}
		return jobs.Publication{Kind: kind, CompanyID: companyID, Payload: muatan, DedupeKey: kunci}, nil
	}
	if !spec.PerCompany {
		p, err := satu(nil)
		if err != nil {
			return nil, err
		}
		return []jobs.Publication{p}, nil
	}
	hasil := make([]jobs.Publication, 0, len(companies))
	for _, c := range companies {
		id := c.ID
		p, err := satu(&id)
		if err != nil {
			return nil, err
		}
		hasil = append(hasil, p)
	}
	return hasil, nil
}

// GoOwned: kind berjadwal yang PENERBITNYA Go menurut kontrak, terurut.
// Kosong = Node masih menerbitkan semuanya, dan jalur ini tidak menerbitkan
// apa pun (bahkan denyutnya sendiri).
func GoOwned() []contract.JobKind {
	var milik []contract.JobKind
	for k, s := range contract.ScheduledKinds {
		if s.Publisher == contract.PublisherGo {
			milik = append(milik, k)
		}
	}
	sort.Slice(milik, func(i, j int) bool { return milik[i] < milik[j] })
	return milik
}
