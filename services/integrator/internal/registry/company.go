// Package registry membaca daftar perusahaan di basis data KENDALI.
//
// Padanan `dalamKonteksPerusahaan` di `workers/jalur-perusahaan.ts`: dari
// `jobs.company_id` ke nama basis data buku PT-nya. Hanya MEMBACA.
//
// ══ KONTEKS YANG HILANG MELEMPAR (#104) ════════════════════════════════════
// Pekerjaan tanpa `company_id`, atau dengan id yang tidak ada di registry,
// MELEMPAR — tidak pernah jatuh ke basis data bawaan. Jatuh ke bawaan berarti
// berkas PT A dihitung dari buku PT B tanpa galat dan tanpa jejak.
package registry

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Company adalah satu baris `companies` yang dibutuhkan pelari.
type Company struct {
	ID           int32
	Slug         string
	Name         string
	DatabaseName string
	IsActive     bool
	// InstanceURLEnvVar: nama env var `db_instances.url_env_var` tempat
	// bukunya hidup; kosong = instans bawaan (tahap 4).
	InstanceURLEnvVar string
	// InstanceKey: `companies.db_instance_key`; kosong = instans bawaan.
	InstanceKey string
}

// ListAll membaca SELURUH perusahaan terdaftar — termasuk yang nonaktif —
// urut `id`. Padanan `control.company.findMany({ orderBy: { id: "asc" } })`
// di `scripts/check-data-conformance.ts`: buku nonaktif tetap buku, dan data
// di dalamnya tetap bisa menyimpang.
func ListAll(ctx context.Context, pool *pgxpool.Pool) ([]Company, error) {
	rows, err := pool.Query(ctx, pilihCompany+` ORDER BY c.id ASC`)
	if err != nil {
		return nil, fmt.Errorf("baca registry perusahaan: %w", err)
	}
	defer rows.Close()
	var hasil []Company
	for rows.Next() {
		c, err := scanCompany(rows)
		if err != nil {
			return nil, err
		}
		hasil = append(hasil, *c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("baca registry perusahaan: %w", err)
	}
	return hasil, nil
}

// ErrNoCompany: pekerjaan tanpa konteks perusahaan yang sah.
var ErrNoCompany = errors.New(
	"pekerjaan tanpa `company_id` yang sah — ia tidak bisa tahu buku mana. " +
		"Konteks perusahaan yang hilang MELEMPAR (#104)")

// Lookup membaca satu perusahaan menurut id-nya.
func Lookup(ctx context.Context, pool *pgxpool.Pool, id *int32) (*Company, error) {
	if id == nil || *id <= 0 {
		return nil, ErrNoCompany
	}
	c, err := scanCompany(pool.QueryRow(ctx, pilihCompany+` WHERE c.id = $1`, *id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf(
			"perusahaan #%d tidak ada di registry kendali — pekerjaan ini TIDAK "+
				"dijalankan, dan tidak pernah jatuh ke basis data bawaan (#104)", *id)
	}
	if err != nil {
		return nil, fmt.Errorf("baca registry perusahaan #%d: %w", *id, err)
	}
	return c, nil
}

// LookupByDatabase membaca satu perusahaan menurut `companies.database_name`
// (unik). Dipakai perkakas yang menerima nama basis data, bukan id — mis.
// `cmd/parity` — supaya mereka menyelesaikan instansnya PERSIS seperti pelari:
// nama yang tidak ada di registry MELEMPAR, bukan dibaca dari server bawaan.
func LookupByDatabase(ctx context.Context, pool *pgxpool.Pool, databaseName string) (*Company, error) {
	if databaseName == "" {
		return nil, ErrNoCompany
	}
	c, err := scanCompany(pool.QueryRow(ctx, pilihCompany+` WHERE c.database_name = $1`, databaseName))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf(
			"basis data %q tidak terdaftar di registry kendali — instansnya tidak "+
				"diketahui, dan ia TIDAK dibaca dari server bawaan sebagai gantinya (#104)", databaseName)
	}
	if err != nil {
		return nil, fmt.Errorf("baca registry basis data %q: %w", databaseName, err)
	}
	return c, nil
}

const pilihCompany = `SELECT c.id, c.slug, c.name, c.database_name, c.is_active, c.db_instance_key, i.url_env_var
		   FROM companies c
		   LEFT JOIN db_instances i ON i.key = c.db_instance_key`

func scanCompany(row pgx.Row) (*Company, error) {
	var c Company
	var instanceKey, urlEnvVar *string
	if err := row.Scan(&c.ID, &c.Slug, &c.Name, &c.DatabaseName, &c.IsActive, &instanceKey, &urlEnvVar); err != nil {
		return nil, err
	}
	if err := c.setInstance(instanceKey, urlEnvVar); err != nil {
		return nil, err
	}
	return &c, nil
}

// setInstance mengisi InstanceURLEnvVar dari hasil LEFT JOIN `db_instances`.
// Kunci instans tanpa baris `db_instances` (FK menolaknya, tapi kode tidak
// bersandar pada itu): melempar, bukan membaca server bawaan.
func (c *Company) setInstance(instanceKey, urlEnvVar *string) error {
	if instanceKey == nil {
		return nil
	}
	if urlEnvVar == nil || *urlEnvVar == "" {
		return fmt.Errorf(
			"perusahaan #%d menunjuk instans %q yang tidak terdaftar di db_instances", c.ID, *instanceKey)
	}
	c.InstanceURLEnvVar = *urlEnvVar
	c.InstanceKey = *instanceKey
	return nil
}
