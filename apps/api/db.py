"""Tracked transactional migrations and short-lived, FK-enabled SQLite connections."""
from contextlib import contextmanager
from pathlib import Path
import hashlib
import sqlite3

from .config import SPEC, ROOT


def connect(path: Path):
    db = sqlite3.connect(path, timeout=2, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA busy_timeout=2000')
    if db.execute('PRAGMA foreign_keys').fetchone()[0] != 1:
        raise RuntimeError('Foreign key protection unavailable')
    return db


@contextmanager
def transaction(path: Path):
    db = connect(path)
    try:
        db.execute('BEGIN IMMEDIATE')
        yield db
        db.commit()
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()


def statements(script):
    buffer = ''
    for line in script.splitlines(keepends=True):
        buffer += line
        if sqlite3.complete_statement(buffer):
            yield buffer
            buffer = ''
    if buffer.strip():
        raise RuntimeError('Incomplete migration statement')


def migration_files():
    return sorted((SPEC / 'schema').glob('*.sql')) + sorted((ROOT / 'apps/api/migrations').glob('*.sql'))


def migrate(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    db = connect(path)
    try:
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL)')
    finally:
        db.close()
    files = migration_files()
    for file in files:
        script = file.read_text(encoding='utf-8')
        digest = hashlib.sha256(script.encode()).hexdigest()
        with transaction(path) as db:
            row = db.execute('SELECT sha256 FROM schema_migrations WHERE name=?', (file.name,)).fetchone()
            if row:
                if row[0] != digest:
                    raise RuntimeError(f'Migration checksum changed: {file.name}')
                continue
            if file.name.startswith('003'):
                bad = db.execute('''SELECT e.id FROM ledger_entries e LEFT JOIN ledger_drafts d
                    ON d.id=e.draft_id AND d.merchant_id=e.merchant_id JOIN merchants m ON m.id=e.merchant_id
                    WHERE e.simulated != m.simulated OR abs(e.amount_paise_signed)>100000000
                    OR (e.entry_type!='REVERSAL' AND (d.id IS NULL OR d.state!='CONFIRMED'
                    OR d.customer_id!=e.customer_id OR d.entry_type!=e.entry_type
                    OR d.amount_paise!=abs(e.amount_paise_signed))) LIMIT 1''').fetchone()
                if bad:
                    raise RuntimeError(f'Historical journal mismatch: {bad[0]}; migration stopped')
            for statement in statements(script):
                db.execute(statement)
            if db.execute('PRAGMA foreign_key_check').fetchone():
                raise RuntimeError('Migration foreign key check failed')
            db.execute('INSERT INTO schema_migrations VALUES (?,?)', (file.name, digest))
    return [f.name for f in files]
