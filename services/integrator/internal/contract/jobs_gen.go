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
	KindCompanyProvision         JobKind = "company.provision"
	KindDocumentGenerate         JobKind = "document.generate"
	KindDocumentInvoiceSend      JobKind = "document.invoice_send"
	KindEfakturRecord            JobKind = "efaktur.record"
	KindImportProcess            JobKind = "import.process"
	KindIntegrationBankFeed      JobKind = "integration.bank_feed"
	KindIntegrationEfakturCancel JobKind = "integration.efaktur_cancel"
	KindIntegrationEfakturPoll   JobKind = "integration.efaktur_poll"
	KindIntegrationEfakturSubmit JobKind = "integration.efaktur_submit"
	KindLedgerDunning            JobKind = "ledger.dunning"
	KindLedgerRecurring          JobKind = "ledger.recurring"
	KindMailBatch                JobKind = "mail.batch"
	KindReportExport             JobKind = "report.export"
	KindReportExportGo           JobKind = "report.export_go"
	KindReportPackage            JobKind = "report.package"
	KindScheduleTick             JobKind = "schedule.tick"
	KindSchemaMigrate            JobKind = "schema.migrate"
	KindTenantBackup             JobKind = "tenant.backup"
	KindTenantConformance        JobKind = "tenant.conformance"
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
	KindCompanyProvision:         {Lane: LaneInteractive, MaxAttempts: 1, WritesLedger: false},
	KindDocumentGenerate:         {Lane: LaneInteractive, MaxAttempts: 3, WritesLedger: false},
	KindDocumentInvoiceSend:      {Lane: LaneInteractive, MaxAttempts: 3, WritesLedger: false},
	KindEfakturRecord:            {Lane: LaneInteractive, MaxAttempts: 5, WritesLedger: false},
	KindImportProcess:            {Lane: LaneBulk, MaxAttempts: 1, WritesLedger: false},
	KindIntegrationBankFeed:      {Lane: LaneIntegration, MaxAttempts: 5, WritesLedger: false},
	KindIntegrationEfakturCancel: {Lane: LaneIntegration, MaxAttempts: 5, WritesLedger: false},
	KindIntegrationEfakturPoll:   {Lane: LaneIntegration, MaxAttempts: 5, WritesLedger: false},
	KindIntegrationEfakturSubmit: {Lane: LaneIntegration, MaxAttempts: 5, WritesLedger: false},
	KindLedgerDunning:            {Lane: LaneLedger, MaxAttempts: 3, WritesLedger: true},
	KindLedgerRecurring:          {Lane: LaneLedger, MaxAttempts: 3, WritesLedger: true},
	KindMailBatch:                {Lane: LaneBulk, MaxAttempts: 3, WritesLedger: false},
	KindReportExport:             {Lane: LaneInteractive, MaxAttempts: 3, WritesLedger: false},
	KindReportExportGo:           {Lane: LaneInteractive, MaxAttempts: 3, WritesLedger: false},
	KindReportPackage:            {Lane: LaneBulk, MaxAttempts: 3, WritesLedger: false},
	KindScheduleTick:             {Lane: LaneSchedule, MaxAttempts: 1, WritesLedger: false},
	KindSchemaMigrate:            {Lane: LaneSchema, MaxAttempts: 1, WritesLedger: false},
	KindTenantBackup:             {Lane: LaneTenant, MaxAttempts: 2, WritesLedger: false},
	KindTenantConformance:        {Lane: LaneTenant, MaxAttempts: 2, WritesLedger: false},
}

// LaneSpec: lebih dari satu proses jalur ber-SingleInstance adalah kesalahan
// konfigurasi, bukan penskalaan.
type LaneSpec struct {
	SingleInstance bool
	// MemoryFenceMiB: pagar memori per pekerjaan (MiB heap Go); 0 = tanpa pagar.
	MemoryFenceMiB int
}

// JobLanes memetakan setiap jalur ke sifatnya.
var JobLanes = map[JobLane]LaneSpec{
	LaneBulk:        {SingleInstance: false, MemoryFenceMiB: 512},
	LaneIntegration: {SingleInstance: false, MemoryFenceMiB: 0},
	LaneInteractive: {SingleInstance: false, MemoryFenceMiB: 0},
	LaneLedger:      {SingleInstance: true, MemoryFenceMiB: 0},
	LaneSchedule:    {SingleInstance: true, MemoryFenceMiB: 0},
	LaneSchema:      {SingleInstance: true, MemoryFenceMiB: 0},
	LaneTenant:      {SingleInstance: true, MemoryFenceMiB: 0},
}

// KindsByLane adalah klausa WHERE kind = ANY(…) milik setiap pelari.
var KindsByLane = map[JobLane][]JobKind{
	LaneBulk:        {KindImportProcess, KindMailBatch, KindReportPackage},
	LaneIntegration: {KindIntegrationBankFeed, KindIntegrationEfakturCancel, KindIntegrationEfakturPoll, KindIntegrationEfakturSubmit},
	LaneInteractive: {KindCompanyProvision, KindDocumentGenerate, KindDocumentInvoiceSend, KindEfakturRecord, KindReportExport, KindReportExportGo},
	LaneLedger:      {KindLedgerDunning, KindLedgerRecurring},
	LaneSchedule:    {KindScheduleTick},
	LaneSchema:      {KindSchemaMigrate},
	LaneTenant:      {KindTenantBackup, KindTenantConformance},
}

// ScheduleGrain: butir kunci idempotensi denyut — SELALU UTC.
type ScheduleGrain string

const (
	GrainHour ScheduleGrain = "hour"
	GrainDay  ScheduleGrain = "day"
)

// SchedulePublisher: bahasa yang MENERBITKAN satu kind berjadwal — tepat satu.
type SchedulePublisher string

const (
	PublisherNode SchedulePublisher = "node"
	PublisherGo   SchedulePublisher = "go"
)

// ScheduleSpec: bagaimana denyut menerbitkan satu kind, dan siapa penerbitnya.
type ScheduleSpec struct {
	Grain ScheduleGrain
	// PerCompany: satu baris per perusahaan aktif (`<kind>:<id>:<butir>`),
	// atau satu untuk seluruh pemasangan (`<kind>:<butir>`).
	PerCompany bool
	Publisher  SchedulePublisher
}

// ScheduledKinds: kind yang diterbitkan DENYUT. Dibaca `internal/schedulelane`;
// padanan TS `SCHEDULED_KINDS` dibaca `@sai/core/schedule-due`.
var ScheduledKinds = map[JobKind]ScheduleSpec{
	KindLedgerRecurring: {Grain: GrainHour, PerCompany: true, Publisher: PublisherGo},
	KindTenantBackup:    {Grain: GrainDay, PerCompany: false, Publisher: PublisherGo},
}

// KindRunner: bahasa yang MELAKSANAKAN kind yang sedang beralih — tepat satu.
type KindRunner string

const (
	RunnerNode KindRunner = "node"
	RunnerGo   KindRunner = "go"
)

// KindRunners: kind ber-`runner:` beserta pelaksananya hari ini. Pelari Go
// yang menerima pekerjaan kind ini sementara pelaksananya BUKAN Go
// menyelesaikannya tanpa bekerja — dua pelaksana untuk satu putaran adalah
// persis yang sakelar ini cegah. Padanan TS `KIND_RUNNERS`.
var KindRunners = map[JobKind]KindRunner{
	KindTenantConformance: RunnerGo,
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

	// Denyut pagar jalur tunggal-instans (`jobs.LaneLock`; padanan Node
	// `@sai/db/session-lock`). Dijamin generator:
	// LaneLockProbe + LaneLockQueryTimeout < LaneLockIdleSession.
	LaneLockProbe        = 15000 * time.Millisecond
	LaneLockQueryTimeout = 10000 * time.Millisecond
	LaneLockIdleSession  = 90000 * time.Millisecond
)

// ResultOwnerUID/GID: pemilik berkas hasil di volume `hasil` — pengguna
// `node` yang membacanya di `app-customer`. Pelari yang berjalan sebagai root
// wajib chown ke sini, atau rute unduhan menjawab 404 untuk setiap hasil.
const (
	ResultOwnerUID = 1000
	ResultOwnerGID = 1000
)

// EfakturStatus adalah nilai `efaktur_submissions.status` di buku PT —
// ditulis Node, DIBACA Go (docs/EFAKTUR.md).
type EfakturStatus string

const (
	EfakturStatusQueued          EfakturStatus = "queued"
	EfakturStatusSubmitted       EfakturStatus = "submitted"
	EfakturStatusApproved        EfakturStatus = "approved"
	EfakturStatusRejected        EfakturStatus = "rejected"
	EfakturStatusFailed          EfakturStatus = "failed"
	EfakturStatusCancelRequested EfakturStatus = "cancel_requested"
	EfakturStatusCanceled        EfakturStatus = "canceled"
)

// EfakturOutcomes: hasil yang boleh dilaporkan jalur `integration` lewat
// `efaktur.record` — himpunan bagian EfakturStatus, dijamin generator.
var EfakturOutcomes = map[EfakturStatus]bool{
	EfakturStatusSubmitted: true,
	EfakturStatusApproved:  true,
	EfakturStatusRejected:  true,
	EfakturStatusFailed:    true,
	EfakturStatusCanceled:  true,
}

// EfakturProvider adalah nilai `company_settings.efaktur_provider` — dipilih
// pengguna (Node), dipetakan ke implementasi oleh `internal/efaktur` (Go).
type EfakturProvider string

const (
	EfakturProviderMock EfakturProvider = "mock"
	EfakturProviderPjap EfakturProvider = "pjap"
)

// EfakturPollMaxRounds: batas putaran `integration.efaktur_poll`.
const EfakturPollMaxRounds = 24
