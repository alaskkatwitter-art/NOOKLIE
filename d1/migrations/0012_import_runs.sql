-- Operational metadata only. No source rows, passwords, tokens or content here.
CREATE TABLE d1_import_runs (
 id TEXT PRIMARY KEY NOT NULL, source_project TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('copying','verified','failed')),
 manifest TEXT NOT NULL CHECK(json_valid(manifest)),
 started_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 verified_at TEXT
) STRICT;
