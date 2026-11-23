// Run from backend with: go run ../database/scripts/migrate.go
package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		fatal("DATABASE_URL is required")
	}
	dir := os.Getenv("MIGRATIONS_DIR")
	if dir == "" {
		dir = "../database/migrations"
	}
	files, err := filepath.Glob(filepath.Join(dir, "*.sql"))
	if err != nil {
		fatal(err.Error())
	}
	sort.Strings(files)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		fatal(err.Error())
	}
	defer db.Close()
	if err = db.Ping(ctx); err != nil {
		fatal(err.Error())
	}
	if _, err = db.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		fatal(err.Error())
	}
	for _, file := range files {
		version := filepath.Base(file)
		var applied bool
		if err = db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=$1)`, version).Scan(&applied); err != nil {
			fatal(err.Error())
		}
		if applied {
			continue
		}
		sql, readErr := os.ReadFile(file)
		if readErr != nil {
			fatal(readErr.Error())
		}
		tx, beginErr := db.Begin(ctx)
		if beginErr != nil {
			fatal(beginErr.Error())
		}
		if _, err = tx.Exec(ctx, string(sql)); err == nil {
			_, err = tx.Exec(ctx, `INSERT INTO schema_migrations(version) VALUES($1)`, version)
		}
		if err != nil {
			_ = tx.Rollback(ctx)
			fatal(fmt.Sprintf("migration %s: %v", version, err))
		}
		if err = tx.Commit(ctx); err != nil {
			fatal(fmt.Sprintf("migration %s commit: %v", version, err))
		}
		fmt.Println("applied", version)
	}
}

func fatal(message string) { fmt.Fprintln(os.Stderr, message); os.Exit(1) }
