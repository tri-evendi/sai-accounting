// Package schedulelane: pelari jalur `schedule` — denyut penerbitan tiap jam
// (rancangan 09 §3.2, §4; tahap 1c).
//
// Dijalankan `cmd/integrator` (service `svc-integrator`), seproses dengan
// jalur `tenant` dan `interactive` sisi Go.
//
// ══ HANYA MENERBITKAN, TIDAK PERNAH MELAKSANAKAN ══════════════════════════
// Satu-satunya tabel yang ditulis paket ini adalah `jobs` (lewat
// `jobs.Queue.Publish`) — tabel di daftar-izin pohon Go. Kind yang
// diterbitkannya dilaksanakan pelari jalurnya masing-masing:
// `ledger.recurring` oleh jalur `ledger` NODE (satu-satunya pintu posting,
// I-2), `tenant.backup` oleh jalur `tenant`. Menerbitkan kind penulis buku
// bukan menulis buku: penerbit tidak membuka satu buku pun — ia hanya membaca
// registry perusahaan di basis data KENDALI.
//
// ══ REKONSILIASI, BUKAN PEMICU (09 §4) ════════════════════════════════════
// Denyut tidak mengingat apa yang sudah ia terbitkan. Setiap jam ia membaca
// keadaan (daftar perusahaan aktif), menyimpulkan apa yang jatuh tempo pada
// butir jam/hari itu, dan menerbitkan dengan `dedupe_key` yang unik — jadi
// penerbitan ulang tidak melakukan apa pun, dan denyut yang mati tiga jam
// menyusul sendiri begitu hidup lagi (butir yang terlewat memang terlewat:
// sama persis dengan putaran Node yang tertidur, dan mesin berulang
// menyusulkan kejadian yang tertinggal sendiri).
//
// ══ PENERBITNYA TEPAT SATU — DAN BAWAANNYA NODE ═══════════════════════════
// `contract/kinds.yaml` → `schedule.publisher` per kind. Jalur ini hanya
// menerbitkan kind ber-`publisher: go` (`GoOwned`); langkah Node
// (`recurring:publish`, `backup:publish`) hanya menerbitkan yang
// ber-`publisher: node`. Keduanya membaca nilai yang sama dari commit yang
// sama, jadi "keduanya" tidak bisa terjadi kecuali di jendela gelar campuran
// versi — dan di jendela itu kunci yang IDENTIK (fikstur bersama) membuat
// penerbit kedua menabrak `dedupe_key` milik yang pertama. Selama Node
// penerbit semuanya, jalur ini memegang pagarnya dan TIDAK menerbitkan apa
// pun — bahkan denyutnya sendiri.
//
// ══ BENTUKNYA: DENYUT YANG MENERBITKAN DIRINYA, LALU MENGKLAIM DIRINYA ═════
// `Beside` (hanya di pemegang pagar) menerbitkan SATU `schedule.tick` per jam
// UTC (`schedule.tick:<YYYY-MM-DDTHH>`), dan pelari jalur ini mengklaimnya
// seperti pekerjaan lain. Dua lapis itu bukan hiasan: baris `schedule.tick`
// adalah JEJAK denyut Go — `done` per jam, `dead` dengan `last_error` bila
// gagal — terbaca di panel antrean `/scheduler` dan di histogram durasi per
// jalur, tanpa tabel jejak baru (pohon Go tidak boleh menulis tabel lain).
//
// ══ SAMBUNGAN: PEKERJAAN LEWAT POOLER, PAGAR LANGSUNG ═════════════════════
// Registry & antrean lewat `CONTROL_DATABASE_URL` (PgBouncer) — denyut
// membaca puluhan baris sejam. Pagar jalur tunggal-instans di
// `CONTROL_DATABASE_DIRECT_URL`: kunci advisory lewat pooler mode transaksi
// tertinggal di backend milik kolam. Padanan "pooler (pagar: langsung)"
// jalur `ledger` Node.
package schedulelane

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/db"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jobs"
)

// selangPeriksa: seberapa sering denyut memeriksa apakah jam UTC sudah
// berganti. Bukan angka antrean (Node tidak membacanya), jadi ia tidak di
// kontrak. Satu menit = tick terbit paling lambat semenit sesudah jam
// berganti; pemeriksaan di jam yang sama tidak menyentuh basis data.
const selangPeriksa = time.Minute

// Run menguras jalur `schedule` sampai SIGTERM/SIGINT atau sampai `stop`
// selesai (boleh nil). Pulang nil tanpa bekerja bila instans lain memegang
// pagarnya — pemanggil yang memutuskan apakah itu berarti berhenti.
func Run(ctx, stop context.Context) error {
	kolam, err := db.Kendali(ctx, 2)
	if err != nil {
		return err
	}
	defer kolam.Close()
	// Satu koneksi saja: ia dipegang pagar selama proses hidup.
	langsung, err := db.KendaliLangsung(ctx, 1)
	if err != nil {
		return err
	}
	defer langsung.Close()

	q := jobs.New(kolam)
	d := &denyut{
		terbit:     q,
		perusahaan: func(c context.Context) ([]Company, error) { return Terjadwal(c, kolam) },
		milik:      GoOwned(),
		now:        time.Now,
		selang:     selangPeriksa,
	}
	pelari := &jobs.Runner{
		Lane:      contract.LaneSchedule,
		Queue:     q,
		LockQueue: jobs.New(langsung),
		Handlers: map[contract.JobKind]jobs.Handler{
			contract.KindScheduleTick: d.tick,
		},
		Beside: d.beat,
		Stop:   stop,
	}
	return pelari.Run(ctx)
}

// penerbit: bagian `jobs.Queue` yang dipakai denyut — tes memakai tiruan.
type penerbit interface {
	Publish(ctx context.Context, p jobs.Publication) (int64, bool, error)
}

// denyut memegang keadaan satu pelari jalur `schedule`.
type denyut struct {
	terbit     penerbit
	perusahaan func(context.Context) ([]Company, error)
	// milik: kind yang DITERBITKAN Go menurut kontrak (`GoOwned`). Dibaca
	// sekali saat mulai: kontrak berubah hanya lewat rilis, dan rilis
	// memulai ulang proses ini.
	milik  []contract.JobKind
	now    func() time.Time
	selang time.Duration
}

// muatanTick: informasi saja — pelaksananya TIDAK membaca instan dari sini
// (lihat tick).
type muatanTick struct {
	At string `json:"at"`
}

// beat menerbitkan `schedule.tick` untuk jam UTC yang sedang berjalan, sekali
// per jam, sampai ctx selesai. Dijalankan `jobs.Runner` HANYA di pemegang
// pagar.
func (d *denyut) beat(ctx context.Context) {
	if len(d.milik) == 0 {
		log.Printf("[schedule] Node masih penerbit setiap kind berjadwal (contract/kinds.yaml → " +
			"schedule.publisher) — denyut Go memegang pagarnya dan TIDAK menerbitkan apa pun.")
		return
	}
	log.Printf("[schedule] penerbit Go untuk %v — satu schedule.tick per jam UTC", d.milik)

	terakhir := d.periksa(ctx, "")
	t := time.NewTicker(d.selang)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			terakhir = d.periksa(ctx, terakhir)
		}
	}
}

// periksa menerbitkan tick jam UTC sekarang bila butirnya belum `terakhir`,
// dan memulangkan butir yang kini sudah diterbitkan. Gagal = `terakhir` tidak
// berubah, jadi pemeriksaan berikutnya mencoba lagi.
func (d *denyut) periksa(ctx context.Context, terakhir string) string {
	at := d.now()
	butir, err := Bucket(contract.GrainHour, at)
	if err != nil || butir == terakhir {
		return terakhir
	}
	muatan, err := json.Marshal(muatanTick{At: ISOString(at)})
	if err != nil {
		log.Printf("[schedule] ⚠ muatan tick: %v", err)
		return terakhir
	}
	id, baru, err := d.terbit.Publish(ctx, jobs.Publication{
		Kind:      contract.KindScheduleTick,
		Payload:   muatan,
		DedupeKey: fmt.Sprintf("%s:%s", contract.KindScheduleTick, butir),
	})
	if err != nil {
		log.Printf("[schedule] ⚠ tick %s gagal diterbitkan (dicoba lagi): %v", butir, err)
		return terakhir
	}
	if baru {
		log.Printf("[schedule] tick %s diterbitkan → pekerjaan #%d", butir, id)
	}
	return butir
}

// tick: satu denyut — terbitkan setiap kind milik Go yang jatuh tempo.
//
// Instannya `now()` SAAT DIKERJAKAN, bukan instan di muatan tick: tick yang
// tertahan (pelari mati di tengah) lalu dikerjakan jam berikutnya menerbitkan
// butir jam berikutnya — dan tick jam itu sendiri menabrak `dedupe_key`
// yang sama. Rekonsiliasi: yang dinilai adalah keadaan sekarang.
//
// Satu penerbitan yang gagal tidak menghentikan yang lain (doktrin yang sama
// dengan `recurring:publish`), tetapi tick-nya GAGAL — `max_attempts: 1`, jadi
// barisnya `dead` dengan sebab di `last_error`, dan jam berikutnya menyusul.
func (d *denyut) tick(c jobs.Ctx) (*string, error) {
	at := d.now()
	if len(d.milik) == 0 {
		// Tick lama yang tertinggal sesudah penerbit dikembalikan ke Node.
		log.Printf("[schedule] tick #%d: tidak ada kind milik Go — tidak ada yang diterbitkan", c.Job.ID)
		return nil, nil
	}

	var perusahaan []Company
	for _, k := range d.milik {
		if contract.ScheduledKinds[k].PerCompany {
			cs, err := d.perusahaan(c.Ctx)
			if err != nil {
				return nil, fmt.Errorf("baca registry perusahaan: %w", err)
			}
			perusahaan = cs
			break
		}
	}

	terbit, sudah, gagal := 0, 0, 0
	var galatPertama error
	for _, k := range d.milik {
		pubs, err := Publications(k, at, perusahaan)
		if err != nil {
			gagal++
			if galatPertama == nil {
				galatPertama = err
			}
			log.Printf("[schedule] ✗ %s: %v", k, err)
			continue
		}
		for _, p := range pubs {
			if c.Ctx.Err() != nil {
				return nil, c.Ctx.Err()
			}
			_, baru, err := d.terbit.Publish(c.Ctx, p)
			switch {
			case err != nil:
				gagal++
				if galatPertama == nil {
					galatPertama = err
				}
				log.Printf("[schedule] ✗ %s gagal diterbitkan: %v", p.DedupeKey, err)
			case baru:
				terbit++
			default:
				sudah++
			}
		}
	}

	log.Printf("[schedule] tick #%d (%s): %d diterbitkan, %d sudah ada%s",
		c.Job.ID, ISOString(at), terbit, sudah, gagalTeks(gagal))
	if gagal > 0 {
		return nil, fmt.Errorf("%d penerbitan gagal; yang pertama: %w", gagal, galatPertama)
	}
	return nil, nil
}

func gagalTeks(n int) string {
	if n == 0 {
		return ""
	}
	return fmt.Sprintf(", %d GAGAL", n)
}

// pilihTerjadwal: saringan yang SAMA dengan `scripts/publish-recurring.ts`
// (dan `run-recurring.ts`): aktif, bukan buku demo, dan tenant-nya tidak
// DIBEKUKAN untuk pindah ke on-premise (`NOT_FROZEN_COMPANY_WHERE`). Dua
// daftar yang berbeda antara penerbit dan pelaksana berarti pekerjaan yang
// terbit lalu selalu dilempar pelaksananya — gagal berulang sampai `dead`,
// tiap jam. Kesetaraannya dijaga `tests/schedule-lane.test.ts`.
//
// `EXISTS`, bukan LEFT JOIN: `tenant: { is: { frozenAt: null } }` Prisma
// menuntut barisnya ADA; LEFT JOIN akan meloloskan tenant yang hilang.
const pilihTerjadwal = `SELECT c.id FROM companies c
	WHERE c.is_active = true AND c.is_demo = false
	  AND (c.tenant_id IS NULL
	       OR EXISTS (SELECT 1 FROM tenants t WHERE t.id = c.tenant_id AND t.frozen_at IS NULL))
	ORDER BY c.id ASC`

// Terjadwal membaca perusahaan yang menerima kind berjadwal per perusahaan.
func Terjadwal(ctx context.Context, pool *pgxpool.Pool) ([]Company, error) {
	rows, err := pool.Query(ctx, pilihTerjadwal)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var hasil []Company
	for rows.Next() {
		var c Company
		if err := rows.Scan(&c.ID); err != nil {
			return nil, err
		}
		hasil = append(hasil, c)
	}
	return hasil, rows.Err()
}
