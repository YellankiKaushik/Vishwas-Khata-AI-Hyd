from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
import json
import shutil
import sqlite3
import threading

from fastapi import Request, Response
import pytest

from apps.api import db
from apps.api.config import Settings
from apps.api.domain import balance
from apps.api.main import create_app
from apps.api.manage import seed
from apps.api.models import ConfirmDraft, CreateDraft


MIGRATION = '008_hyd_commitments.sql'
MIGRATIONS = Path(__file__).resolve().parents[1] / 'apps/api/migrations'
CREATED = '2026-11-12T10:00:00.000000Z'
UPDATED = '2026-11-12T10:00:01.000000Z'
TERMINATED = '2026-11-12T10:00:02.000000Z'
LEDGER_HASH = 'a' * 64
REQUEST_HASH = 'b' * 64


def insert_commitment(connection, **overrides):
    row = {
        'id': 'commitment-a',
        'merchant_id': 'merchant-a',
        'customer_id': 'customer-a',
        'expected_date': '2026-11-30',
        'promised_amount_paise': 50000,
        'last_reviewed_ledger_hash': LEDGER_HASH,
        'state': 'ACTIVE',
        'version': 1,
        'actor_id': 'actor-a',
        'last_reason': 'Agreed on a date',
        'created_at': CREATED,
        'updated_at': CREATED,
    } | overrides
    columns = ', '.join(row)
    values = ', '.join('?' for _ in row)
    connection.execute(f'INSERT INTO repayment_commitments ({columns}) VALUES ({values})', tuple(row.values()))


@pytest.fixture
def migrated(tmp_path):
    path = tmp_path / 'commitments.sqlite3'
    assert db.migrate(path)[-1] == MIGRATION
    with db.transaction(path) as connection:
        for suffix in ('a', 'b'):
            merchant = f'merchant-{suffix}'
            connection.execute(
                'INSERT INTO merchants(id, display_name, created_at) VALUES (?, ?, ?)',
                (merchant, merchant, CREATED),
            )
            connection.execute(
                '''INSERT INTO customers(id, merchant_id, display_name, normalized_name, created_at)
                   VALUES (?, ?, ?, ?, ?)''',
                (f'customer-{suffix}', merchant, 'Synthetic customer', 'synthetic customer', CREATED),
            )
    return path


@pytest.fixture
def legacy_migrations(tmp_path, monkeypatch):
    root = tmp_path / 'legacy'
    migrations = root / 'apps/api/migrations'
    migrations.mkdir(parents=True)
    for migration in sorted(MIGRATIONS.glob('*.sql')):
        if migration.name < MIGRATION:
            shutil.copyfile(migration, migrations / migration.name)
    monkeypatch.setattr(db, 'ROOT', root)
    return migrations


@pytest.mark.parametrize('terminal', ['CANCELLED', 'HANDLED'])
def test_each_revision_records_one_immutable_event(migrated, terminal):
    with db.transaction(migrated) as connection:
        insert_commitment(connection)
        connection.execute(
            '''UPDATE repayment_commitments SET version = 2, updated_at = ?,
               expected_date = '2026-12-01', promised_amount_paise = NULL,
               last_reviewed_ledger_hash = ?, actor_id = 'actor-b', last_reason = 'Reviewed'
               WHERE id = 'commitment-a' ''',
            (UPDATED, 'c' * 64),
        )
        connection.execute(
            '''UPDATE repayment_commitments SET version = 3, updated_at = ?,
               state = ?, last_reason = 'Closed after review' WHERE id = 'commitment-a' ''',
            (TERMINATED, terminal),
        )
        events = connection.execute('SELECT * FROM commitment_events ORDER BY new_version').fetchall()
        assert [event['event_type'] for event in events] == ['CREATED', 'UPDATED', terminal]
        assert [event['previous_version'] for event in events] == [None, 1, 2]
        assert [event['new_version'] for event in events] == [1, 2, 3]
        assert events[0]['previous_snapshot_json'] is None
        assert events[1]['previous_snapshot_json'] == events[0]['new_snapshot_json']
        assert events[2]['previous_snapshot_json'] == events[1]['new_snapshot_json']
        assert json.loads(events[1]['new_snapshot_json']) == {
            'customer_id': 'customer-a', 'expected_date': '2026-12-01',
            'promised_amount_paise': None, 'state': 'ACTIVE', 'version': 2,
            'last_reviewed_ledger_hash': 'c' * 64,
        }
        assert (events[1]['reason'], events[1]['actor_id'], events[1]['created_at']) == (
            'Reviewed', 'actor-b', UPDATED,
        )
        with pytest.raises(sqlite3.IntegrityError, match='COMMITMENT_TERMINAL'):
            connection.execute("UPDATE repayment_commitments SET state = 'ACTIVE' WHERE id = 'commitment-a'")
        insert_commitment(connection, id='new-commitment')
        assert connection.execute('SELECT count(*) FROM ledger_entries').fetchone()[0] == 0


@pytest.mark.parametrize('overrides', [
    {'customer_id': 'customer-b'},
    {'expected_date': '2026-2-01'},
    {'expected_date': '2026-02-30'},
    {'expected_date': '0000-01-01'},
    {'promised_amount_paise': 1.5},
    {'promised_amount_paise': 0},
    {'promised_amount_paise': 100000001},
    {'last_reviewed_ledger_hash': 'z' * 64},
    {'state': 'HANDLED'},
    {'version': 2},
    {'last_reason': ' '},
    {'last_reason': 'a' * 241},
    {'created_at': 'invalid', 'updated_at': 'invalid'},
])
def test_invalid_current_row_produces_no_history(migrated, overrides):
    with closing(db.connect(migrated)) as connection:
        with pytest.raises(sqlite3.IntegrityError):
            insert_commitment(connection, **overrides)
        assert connection.execute('SELECT count(*) FROM repayment_commitments').fetchone()[0] == 0
        assert connection.execute('SELECT count(*) FROM commitment_events').fetchone()[0] == 0


def test_duplicate_active_commitments_are_serialized(migrated):
    ready = threading.Barrier(2, timeout=5)

    def create(identifier):
        ready.wait()
        try:
            with db.transaction(migrated) as connection:
                insert_commitment(connection, id=identifier)
        except sqlite3.IntegrityError as exc:
            assert str(exc) == 'COMMITMENT_ALREADY_EXISTS'
            return False
        return True

    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(create, ('first', 'second'))) == [False, True]
    with closing(db.connect(migrated)) as connection:
        assert connection.execute('SELECT count(*) FROM commitment_events').fetchone()[0] == 1


def test_current_and_history_guards_cover_replace(migrated):
    with db.transaction(migrated) as connection:
        insert_commitment(connection)
        for statement, error in [
            ("UPDATE repayment_commitments SET version = 3, updated_at = ?", 'COMMITMENT_INVALID_REVISION'),
            ("UPDATE repayment_commitments SET version = 2, updated_at = created_at WHERE updated_at < ?",
             'COMMITMENT_INVALID_REVISION'),
            ("UPDATE repayment_commitments SET id = 'renamed', updated_at = ?", 'COMMITMENT_IDENTITY_IMMUTABLE'),
        ]:
            with pytest.raises(sqlite3.IntegrityError, match=error):
                connection.execute(statement, (UPDATED,))
        for statement, error in [
            ('DELETE FROM repayment_commitments', 'COMMITMENT_DELETE_FORBIDDEN'),
            ('INSERT OR REPLACE INTO repayment_commitments SELECT * FROM repayment_commitments',
             'COMMITMENT_ALREADY_EXISTS'),
            ("UPDATE commitment_events SET reason = 'overwritten'", 'COMMITMENT_EVENT_IMMUTABLE'),
            ('DELETE FROM commitment_events', 'COMMITMENT_EVENT_IMMUTABLE'),
            ('INSERT OR REPLACE INTO commitment_events SELECT * FROM commitment_events',
             'COMMITMENT_EVENT_IMMUTABLE'),
        ]:
            with pytest.raises(sqlite3.IntegrityError, match=error):
                connection.execute(statement)
        assert connection.execute('SELECT version FROM repayment_commitments').fetchone()[0] == 1
        assert connection.execute('SELECT count(*) FROM commitment_events').fetchone()[0] == 1


def test_receipts_are_immutable_and_scoped_to_the_event_merchant(migrated):
    with db.transaction(migrated) as connection:
        insert_commitment(connection)
        insert_commitment(connection, id='commitment-b', merchant_id='merchant-b', customer_id='customer-b')
        statement = 'INSERT INTO commitment_operation_receipts VALUES (?, ?, ?, ?, ?, ?)'
        operation = 'commitment-operation-001'
        response = '{"version": 1, "state": "ACTIVE"}'
        for suffix in ('a', 'b'):
            connection.execute(
                statement, (f'merchant-{suffix}', operation, f'commitment-{suffix}:1', REQUEST_HASH, response, CREATED),
            )
        with pytest.raises(sqlite3.IntegrityError, match='FOREIGN KEY constraint failed'):
            connection.execute(
                statement, ('merchant-b', 'another-operation', 'commitment-a:1', REQUEST_HASH, response, CREATED),
            )
        for mutation in (
            "UPDATE commitment_operation_receipts SET response_json = '{}'",
            'DELETE FROM commitment_operation_receipts',
            'INSERT OR REPLACE INTO commitment_operation_receipts SELECT * FROM commitment_operation_receipts',
        ):
            with pytest.raises(sqlite3.IntegrityError, match='COMMITMENT_RECEIPT_IMMUTABLE'):
                connection.execute(mutation)
        assert [row[0] for row in connection.execute(
            'SELECT response_json FROM commitment_operation_receipts ORDER BY merchant_id'
        )] == [response, response]


def test_history_rolls_back_with_the_current_row(migrated):
    with pytest.raises(sqlite3.IntegrityError, match='FOREIGN KEY constraint failed'):
        with db.transaction(migrated) as connection:
            insert_commitment(connection)
            connection.execute(
                'INSERT INTO commitment_operation_receipts VALUES (?, ?, ?, ?, ?, ?)',
                ('merchant-b', 'invalid-receipt', 'commitment-a:1', REQUEST_HASH, '{}', CREATED),
            )
    with closing(db.connect(migrated)) as connection:
        assert connection.execute('SELECT count(*) FROM repayment_commitments').fetchone()[0] == 0
        assert connection.execute('SELECT count(*) FROM commitment_events').fetchone()[0] == 0


def test_upgrade_preserves_a_posted_ledger_and_replay_receipt(tmp_path, legacy_migrations):
    settings = Settings(database_path=tmp_path / 'upgrade.sqlite3', as_of='2026-10-27T17:00:00Z')
    seed(settings)
    app = create_app(settings)
    handlers = {
        route.path: route.endpoint for route in app.routes if 'POST' in (getattr(route, 'methods', None) or ())
    }
    request = Request({'type': 'http', 'state': {'request_id': 'migration-test'}})
    with closing(db.connect(settings.database_path)) as connection:
        merchant = connection.execute('SELECT id FROM merchants').fetchone()[0]
    draft = handlers['/v1/ledger/drafts'](
        CreateDraft(transcript='Ramesh took 500 credit', language='en-IN'),
        request, Response(status_code=201), client_operation_id=None, mid=merchant,
    )
    confirm = handlers['/v1/ledger/drafts/{draft_id}/confirm']
    body = ConfirmDraft(expected_version=draft['version'], confirm=True)
    response = Response(status_code=201)
    posted = confirm(draft['draft_id'], body, request, response, 'migration-post-001', mid=merchant)
    assert response.status_code == 201
    assert posted['outstanding_balance_paise'] == 50000

    queries = [
        "SELECT * FROM schema_migrations WHERE name < '008' ORDER BY name",
        'SELECT * FROM ledger_entries ORDER BY id',
        'SELECT * FROM confirmation_receipts ORDER BY merchant_id, entry_id',
        'SELECT * FROM audit_events ORDER BY id',
    ]
    with closing(db.connect(settings.database_path)) as connection:
        before = [connection.execute(query).fetchall() for query in queries]
    assert len(before[0]) == 7
    shutil.copyfile(MIGRATIONS / MIGRATION, legacy_migrations / MIGRATION)
    assert db.migrate(settings.database_path)[-1] == MIGRATION
    assert db.migrate(settings.database_path)[-1] == MIGRATION
    with closing(db.connect(settings.database_path)) as connection:
        assert [connection.execute(query).fetchall() for query in queries] == before
        assert connection.execute('SELECT count(*) FROM schema_migrations').fetchone()[0] == 8
        assert connection.execute('SELECT count(*) FROM repayment_commitments').fetchone()[0] == 0
        assert connection.execute('PRAGMA foreign_key_check').fetchall() == []
        assert balance(connection, merchant, 'cus_ramesh') == 50000
    response = Response(status_code=201)
    replayed = confirm(draft['draft_id'], body, request, response, 'migration-post-001', mid=merchant)
    assert response.status_code == 200
    assert replayed == posted


def test_failed_migration_rolls_back_and_can_retry(tmp_path, legacy_migrations):
    path = tmp_path / 'retry.sqlite3'
    assert len(db.migrate(path)) == 7
    target = legacy_migrations / MIGRATION
    sql = (MIGRATIONS / MIGRATION).read_text(encoding='utf-8')
    target.write_text(sql + '\nINSERT INTO missing_table VALUES (1);\n', encoding='utf-8')
    with pytest.raises(sqlite3.OperationalError, match='no such table: missing_table'):
        db.migrate(path)
    with closing(db.connect(path)) as connection:
        assert connection.execute("SELECT name FROM sqlite_master WHERE name LIKE '%commitment%'").fetchall() == []
        assert connection.execute('SELECT count(*) FROM schema_migrations').fetchone()[0] == 7
    target.write_text(sql, encoding='utf-8')
    assert db.migrate(path)[-1] == MIGRATION
