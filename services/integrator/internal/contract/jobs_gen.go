// DIBANGKITKAN DARI `contract/kinds.yaml` — JANGAN DISUNTING TANGAN.
//
// Jalankan `bun run contract:gen` setelah mengubah kontraknya, dan commit hasilnya
// bersama perubahan itu. `bun run contract:gen -- --cek` gagal bila berkas ini
// basi, dan penjaga `tests/contract-jobs.test.ts` memanggilnya.
//
// Kontrak versi 1.

package contract

import "time"

// JobStatus adalah status baris `jobs`. Urutannya bermakna:
// queued → claimed → done | failed → dead. `failed` BUKAN akhir.
type JobStatus string

const (
	StatusQueued  JobStatus = "queued"
	StatusClaimed JobStatus = "claimed"
	StatusDone    JobStatus = "done"
	StatusFailed  JobStatus = "failed"
	StatusDead    JobStatus = "dead"
)

// JobStatuses dalam urutan kontrak, bukan urutan abjad.
var JobStatuses = []JobStatus{
	StatusQueued,
	StatusClaimed,
	StatusDone,
	StatusFailed,
	StatusDead,
}

// JobKind adalah jenis pekerjaan. Satu jenis milik tepat satu jalur.
type JobKind string

const (
	KindDocumentGenerate    JobKind = "document.generate"
	KindImportProcess       JobKind = "import.process"
	KindIntegrationBankFeed JobKind = "integration.bank_feed"
	KindIntegrationEfaktur  JobKind = "integration.efaktur"
	KindLedgerDunning       JobKind = "ledger.dunning"
	KindLedgerRecurring     JobKind = "ledger.recurring"
	KindMailBatch           JobKind = "mail.batch"
	KindReportExport        JobKind = "report.export"
	KindReportExportGo      JobKind = "report.export_go"
	KindReportPackage       JobKind = "report.package"
	KindScheduleTick        JobKind = "schedule.tick"
	KindSchemaMigrate       JobKind = "schema.migrate"
	KindTenantBackup        JobKind = "tenant.backup"
	KindTenantConformance   JobKind = "tenant.conformance"
)

// JobLane adalah satu PROSES pekerja. Isolasinya jalur, bukan layanan.
type JobLane string

const (
	LaneBulk        JobLane = "bulk"
	LaneIntegration JobLane = "integration"
	LaneInteractive JobLane = "interactive"
	LaneLedger      JobLane = "ledger"
	LaneSchedule    JobLane = "schedule"
	LaneSchema      JobLane = "schema"
	LaneTenant      JobLane = "tenant"
)

// KindSpec adalah sifat satu jenis pekerjaan.
type KindSpec struct {
	Lane        JobLane
	MaxAttempts int
	// WritesLedger benar HANYA pada jalur ledger — invarian I-2, pintu posting
	// tunggal, dan pintu itu TypeScript. Tidak ada kode Go yang boleh
	// mengklaim jenis pekerjaan ber-WritesLedger.
	WritesLedger bool
}

// JobKinds memetakan setiap jenis ke sifatnya.
var JobKinds = map[JobKind]KindSpec{
	KindDocumentGenerate:    {Lane: LaneInteractive, MaxAttempts: 3, WritesLedger: false},
	KindImportProcess:       {Lane: LaneBulk, MaxAttempts: 1, WritesLedger: false},
	KindIntegrationBankFeed: {Lane: LaneIntegration, MaxAttempts: 5, WritesLedger: false},
	KindIntegrationEfaktur:  {Lane: LaneIntegration, MaxAttempts: 5, WritesLedger: false},
	KindLedgerDunning:       {Lane: LaneLedger, MaxAttempts: 3, WritesLedger: true},
	KindLedgerRecurring:     {Lane: LaneLedger, MaxAttempts: 3, WritesLedger: true},
	KindMailBatch:           {Lane: LaneBulk, MaxAttempts: 3, WritesLedger: false},
	KindReportExport:        {Lane: LaneInteractive, MaxAttempts: 3, WritesLedger: false},
	KindReportExportGo:      {Lane: LaneInteractive, MaxAttempts: 3, WritesLedger: false},
	KindReportPackage:       {Lane: LaneBulk, MaxAttempts: 3, WritesLedger: false},
	KindScheduleTick:        {Lane: LaneSchedule, MaxAttempts: 1, WritesLedger: false},
	KindSchemaMigrate:       {Lane: LaneSchema, MaxAttempts: 1, WritesLedger: false},
	KindTenantBackup:        {Lane: LaneTenant, MaxAttempts: 2, WritesLedger: false},
	KindTenantConformance:   {Lane: LaneTenant, MaxAttempts: 2, WritesLedger: false},
}

// LaneSpec: lebih dari satu proses jalur ber-SingleInstance adalah kesalahan
// konfigurasi, bukan penskalaan.
type LaneSpec struct {
	SingleInstance bool
}

// JobLanes memetakan setiap jalur ke sifatnya.
var JobLanes = map[JobLane]LaneSpec{
	LaneBulk:        {SingleInstance: false},
	LaneIntegration: {SingleInstance: false},
	LaneInteractive: {SingleInstance: false},
	LaneLedger:      {SingleInstance: true},
	LaneSchedule:    {SingleInstance: true},
	LaneSchema:      {SingleInstance: true},
	LaneTenant:      {SingleInstance: true},
}

// KindsByLane adalah klausa WHERE kind = ANY(…) milik setiap pelari.
var KindsByLane = map[JobLane][]JobKind{
	LaneBulk:        {KindImportProcess, KindMailBatch, KindReportPackage},
	LaneIntegration: {KindIntegrationBankFeed, KindIntegrationEfaktur},
	LaneInteractive: {KindDocumentGenerate, KindReportExport, KindReportExportGo},
	LaneLedger:      {KindLedgerDunning, KindLedgerRecurring},
	LaneSchedule:    {KindScheduleTick},
	LaneSchema:      {KindSchemaMigrate},
	LaneTenant:      {KindTenantBackup, KindTenantConformance},
}

// IsJobKind melaporkan apakah v adalah jenis yang dikenal kontrak ini.
func IsJobKind(v string) bool {
	_, ada := JobKinds[JobKind(v)]
	return ada
}

// IsJobStatus melaporkan apakah v adalah status yang dikenal kontrak ini.
func IsJobStatus(v string) bool {
	for _, s := range JobStatuses {
		if string(s) == v {
			return true
		}
	}
	return false
}

// ── Angka antrean ──────────────────────────────────────────────────────────
//
// Sebab tiap angka ada di sisi TypeScript, di tempat ia dipakai:
// packages/core/src/job-backoff.ts dan packages/core/src/queue-health.ts.
// Yang dibangkitkan angkanya, bukan alasannya.
const (
	BackoffBase = 30000 * time.Millisecond
	BackoffMax  = 3600000 * time.Millisecond

	LeaseRenew = 30000 * time.Millisecond
	// LeaseStaleFactor: ambang basi adalah KELIPATAN interval pembaruan, bukan
	// perkiraan durasi pekerjaan. Dengan lease yang diperpanjang, pertanyaannya
	// berubah dari "apakah pekerjaan ini lama?" menjadi "apakah pekerjanya masih
	// hidup?" — dan yang kedua punya jawaban yang tidak bergantung jenis kerja.
	LeaseStaleFactor = 4
	LeaseStale       = LeaseRenew * LeaseStaleFactor

	// Upkeep dijamin generator LEBIH RAPAT daripada LeaseStale.
	Upkeep = 60000 * time.Millisecond
	Idle   = 2000 * time.Millisecond

	DoneRetentionDays = 14

	QueueAgeWarn = 420 * time.Second
	QueueAgeLate = 600 * time.Second
)

// ResultOwnerUID/GID: pemilik berkas hasil di volume `hasil` — pengguna
// `node` yang membacanya di `app-customer`. Pelari yang berjalan sebagai root
// wajib chown ke sini, atau rute unduhan menjawab 404 untuk setiap hasil.
const (
	ResultOwnerUID = 1000
	ResultOwnerGID = 1000
)
