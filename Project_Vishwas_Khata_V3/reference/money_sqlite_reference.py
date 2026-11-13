"""Executable *reference oracle* for V2 money/date rules, NOT the app backend.

No LLM, real customer data, external accounts, Paytm API, speech APIs or funds movement.
Use for contract tests before implementing the actual API/domain services.
"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, date, time, timezone
from zoneinfo import ZoneInfo
import hashlib
import json
import sqlite3
import uuid


class DomainError(Exception):
    pass


@dataclass(frozen=True)
class Context:
    merchant_id: str
    actor_id: str = "demo_owner"


def parse_utc(t: str) -> datetime:
    d = datetime.fromisoformat(t.replace("Z", "+00:00"))
    if d.tzinfo is None:
        raise DomainError("timezone offset required")
    return d.astimezone(timezone.utc)


def ist_business_day_bounds(business_date: str) -> tuple[str, str]:
    d = date.fromisoformat(business_date)
    start = datetime.combine(d, time.min, tzinfo=ZoneInfo("Asia/Kolkata"))
    from datetime import timedelta
    stop = start + timedelta(days=1)
    def utc_string(x: datetime) -> str:
        return x.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    return utc_string(start), utc_string(stop)


def new_db(conn: sqlite3.Connection, initial: str, hardening: str) -> None:
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=3000")
    conn.executescript(initial)
    conn.executescript(hardening)
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []


def balance(conn: sqlite3.Connection, merchant: str, customer: str) -> int:
    return conn.execute("SELECT COALESCE(SUM(amount_paise_signed),0) FROM ledger_entries WHERE merchant_id=? AND customer_id=?",(merchant,customer)).fetchone()[0]


def create_draft(conn: sqlite3.Connection, ctx: Context, customer: str, kind: str, amount_paise: int, *, token: str) -> str:
    if kind not in ("CREDIT_GIVEN","REPAYMENT_RECEIVED") or type(amount_paise) is not int or not (0 < amount_paise <= 100_000_000):
        raise DomainError("invalid amount or kind")
    did = f"draft_{token}"
    now = "2026-10-27T04:30:00Z"
    expiry = "2026-10-28T04:30:00Z"
    conn.execute("INSERT INTO ledger_drafts (id,merchant_id,customer_id,entry_type,amount_paise,state,version,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,'AWAITING_CONFIRMATION',1,?,?,?)",(did,ctx.merchant_id,customer,kind,amount_paise,now,now,expiry))
    return did


def confirm(conn: sqlite3.Connection, ctx: Context, draft_id: str, idempotency_key: str, *, expected_version: int = 1, at_utc: datetime | None = None) -> str:
    if not idempotency_key or len(idempotency_key) > 128:
        raise DomainError("idempotency key invalid")
    if type(expected_version) is not int or expected_version <= 0:
        raise DomainError("draft version invalid")
    fingerprint = hashlib.sha256(json.dumps({"merchant":ctx.merchant_id,"draft":draft_id,"version":expected_version,"confirm":True},sort_keys=True).encode()).hexdigest()
    try:
        conn.execute("BEGIN IMMEDIATE")
        dup=conn.execute("SELECT request_hash,entry_id FROM idempotency_records WHERE merchant_id=? AND key=?",(ctx.merchant_id,idempotency_key)).fetchone()
        if dup:
            if dup[0]!=fingerprint:raise DomainError("IDEMPOTENCY_CONFLICT")
            conn.execute("COMMIT")
            return dup[1]
        draft=conn.execute("SELECT customer_id,entry_type,amount_paise,state,version,expires_at FROM ledger_drafts WHERE merchant_id=? AND id=?",(ctx.merchant_id,draft_id)).fetchone()
        if not draft:raise DomainError("DRAFT_NOT_FOUND")
        customer,kind,amount,state,version,expires=draft
        if state=="CONFIRMED":
            prior=conn.execute("SELECT id FROM ledger_entries WHERE merchant_id=? AND draft_id=?",(ctx.merchant_id,draft_id)).fetchone()
            raise DomainError(f"ALREADY_CONFIRMED:{prior[0] if prior else 'MISSING_ENTRY'}")
        if state!="AWAITING_CONFIRMATION" or version != expected_version:
            raise DomainError("STALE_OR_INVALID_STATE")
        if parse_utc(expires) <= (at_utc or datetime.now(timezone.utc)):
            raise DomainError("DRAFT_EXPIRED")
        if kind == "REPAYMENT_RECEIVED" and balance(conn,ctx.merchant_id,customer)<amount:
            raise DomainError("OVERPAYMENT")
        signed = amount if kind=="CREDIT_GIVEN" else -amount
        entry=f"entry_{draft_id}"
        conn.execute("INSERT INTO ledger_entries(id,merchant_id,customer_id,draft_id,entry_type,amount_paise_signed,posted_at,source,actor_id,simulated) VALUES(?,?,?,?,?,?,?,?,?,1)",(entry,ctx.merchant_id,customer,draft_id,kind,signed,"2026-10-27T06:00:00Z","MANUAL",ctx.actor_id))
        changed=conn.execute("UPDATE ledger_drafts SET state='CONFIRMED',updated_at='2026-10-27T06:00:00Z' WHERE merchant_id=? AND id=? AND version=? AND state='AWAITING_CONFIRMATION'",(ctx.merchant_id,draft_id,expected_version)).rowcount
        if changed!=1:raise DomainError("CONFLICT")
        conn.execute("INSERT INTO idempotency_records(merchant_id,key,request_hash,entry_id,created_at) VALUES(?,?,?,?,?)",(ctx.merchant_id,idempotency_key,fingerprint,entry,"2026-10-27T06:00:00Z"))
        conn.execute("INSERT INTO audit_events(id,merchant_id,actor_id,action,entity_type,entity_id,request_id,result,created_at) VALUES(?,?,?,?,?,?,?,?,?)",(str(uuid.uuid4()),ctx.merchant_id,ctx.actor_id,"LEDGER_ENTRY_POSTED","ledger_entry",entry,idempotency_key,"SUCCESS","2026-10-27T06:00:00Z"))
        conn.execute("COMMIT")
        return entry
    except Exception:
        if conn.in_transaction:conn.execute("ROLLBACK")
        raise


def reverse(conn: sqlite3.Connection, ctx: Context, entry_id: str, *, reversal_id: str) -> str:
    """Financially safe reversal of original entry; never updates/deletes original."""
    try:
        conn.execute("BEGIN IMMEDIATE")
        original=conn.execute("SELECT customer_id,entry_type,amount_paise_signed FROM ledger_entries WHERE merchant_id=? AND id=?",(ctx.merchant_id,entry_id)).fetchone()
        if not original: raise DomainError("NOT_FOUND")
        customer,kind,signed=original
        if kind=="REVERSAL":raise DomainError("REVERSAL_OF_REVERSAL_NOT_ALLOWED")
        if conn.execute("SELECT 1 FROM ledger_entries WHERE merchant_id=? AND reverses_entry_id=?",(ctx.merchant_id,entry_id)).fetchone():raise DomainError("ALREADY_REVERSED")
        conn.execute("INSERT INTO ledger_entries(id,merchant_id,customer_id,draft_id,entry_type,amount_paise_signed,reverses_entry_id,posted_at,source,actor_id,reason,simulated) VALUES(?,?,?,?,?,?,?,?,?,?,?,1)",(reversal_id,ctx.merchant_id,customer,None,"REVERSAL",-signed,entry_id,"2026-10-27T07:00:00Z","MANUAL",ctx.actor_id,"Merchant-confirmed correction"))
        conn.execute("COMMIT")
        return reversal_id
    except sqlite3.IntegrityError as e:
        if conn.in_transaction:conn.execute("ROLLBACK")
        raise DomainError(str(e)) from e
    except Exception:
        if conn.in_transaction:conn.execute("ROLLBACK")
        raise


def observed_sales_for_business_day(conn: sqlite3.Connection, merchant: str, business_date: str) -> tuple[str, int | None]:
    start, end=ist_business_day_bounds(business_date)
    count, amount=conn.execute("SELECT COUNT(*), SUM(amount_paise) FROM sales_events WHERE merchant_id=? AND observed_at >= ? AND observed_at < ?",(merchant,start,end)).fetchone()
    return ("SUFFICIENT",int(amount)) if count else ("INSUFFICIENT_DATA",None)
