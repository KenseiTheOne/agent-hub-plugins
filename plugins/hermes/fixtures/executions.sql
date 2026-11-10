-- Synthetic executions.db shaped like Hermes (cron/executions.py): the same columns, made-up values.
CREATE TABLE executions (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL, source TEXT NOT NULL, process_id TEXT NOT NULL, pid INTEGER NOT NULL,
  process_started_at INTEGER,
  status TEXT NOT NULL CHECK(status IN ('claimed','running','completed','failed','unknown')),
  handoff_pending INTEGER NOT NULL DEFAULT 0, handoff_started_at REAL,
  claimed_at TEXT NOT NULL, started_at TEXT, finished_at TEXT, error TEXT,
  delivery_outcome TEXT, scheduled_instant TEXT, progress_at TEXT);
CREATE TABLE cron_incidents (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, error_sig TEXT NOT NULL, state TEXT NOT NULL,
  failure_type TEXT NOT NULL DEFAULT 'unknown', first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, acked_at TEXT,
  alerted_at TEXT, closed_at TEXT, error TEXT NOT NULL, output_file TEXT);
INSERT INTO executions (id, job_id, source, process_id, pid, status, claimed_at, started_at, finished_at, error) VALUES
 ('e01','aaaa11112222','tick','p1',100,'completed','2026-10-30T22:00:20+01:00','2026-10-30T22:00:21+01:00','2026-10-30T22:01:21+01:00',NULL),
 ('e02','aaaa11112222','tick','p1',100,'completed','2026-10-31T22:00:20+01:00','2026-10-31T22:00:21+01:00','2026-10-31T22:01:25+01:00',NULL),
 ('e03','aaaa11112222','tick','p1',100,'failed','2026-11-01T22:00:20+01:00','2026-11-01T22:00:21+01:00','2026-11-01T22:20:21+01:00','СИНТЕТИЧЕСКАЯ-ОШИБКА-НЕ-ВЫВОДИТЬ'),
 ('e04','aaaa11112222','tick','p1',100,'completed','2026-11-02T22:00:20+01:00','2026-11-02T22:00:21+01:00','2026-11-02T22:01:27+01:00',NULL),
 ('e05','aaaa11112222','tick','p1',100,'completed','2026-11-03T22:00:20+01:00','2026-11-03T22:00:21+01:00','2026-11-03T22:01:37+01:00',NULL),
 ('e11','bbbb33334444','tick','p1',100,'completed','2026-11-02T09:30:20+01:00','2026-11-02T09:30:21+01:00','2026-11-02T09:30:33+01:00',NULL),
 ('e12','bbbb33334444','tick','p1',100,'completed','2026-11-03T09:30:20+01:00','2026-11-03T09:30:21+01:00','2026-11-03T09:30:35+01:00',NULL),
 ('e13','bbbb33334444','tick','p1',100,'failed','2026-11-04T09:30:20+01:00','2026-11-04T09:30:21+01:00','2026-11-04T09:30:40+01:00','СИНТЕТИЧЕСКАЯ-ОШИБКА-НЕ-ВЫВОДИТЬ');
