"""Operator-authorized one-shot TTS probe of a current approved synthetic snapshot."""
import argparse
import asyncio
from contextlib import closing
from datetime import date
import json
from pathlib import Path
from time import perf_counter

from .analytics import daily_facts
from .config import Settings, ROOT
from .db import connect
from .domain import DomainError
from .voice import SarvamAdapter, TTS_MODEL
from .probe_support import reserve_attempt, record_result


def approved_text(settings, briefing_id):
    if not settings.demo_mode:
        raise DomainError('REAL_DATA_DISABLED','Synthetic demo only.')
    with closing(connect(settings.database_path)) as db:
        db.execute('PRAGMA query_only=ON')
        row=db.execute("SELECT b.* FROM briefing_snapshots b JOIN merchants m ON m.id=b.merchant_id WHERE b.id=? AND b.merchant_id='merch_demo_001' AND m.simulated=1",(briefing_id,)).fetchone()
        if not row:raise DomainError('NOT_FOUND','Approved synthetic snapshot not found.')
        facts=daily_facts(db,row['merchant_id'],date.fromisoformat(row['business_date']),settings.now())
        if facts['facts_hash']!=row['facts_hash']:raise DomainError('STALE_BRIEFING','Sources changed; regenerate briefing first.')
        return '\n\n'.join(slot['text'] for slot in json.loads(row['approved_slots_json'])['slots']),row['language']


def main():
    parser=argparse.ArgumentParser(description='One explicitly authorized approved-snapshot TTS call; no financial write.')
    parser.add_argument('--briefing-id',required=True)
    parser.add_argument('--synthetic',action='store_true',required=True)
    parser.add_argument('--allow-provider-call',action='store_true',required=True)
    parser.add_argument('--sample-id',required=True)
    parser.add_argument('--approval-id',required=True)
    parser.add_argument('--output',type=Path,default=ROOT/'private/approved-briefing-probe.wav')
    args=parser.parse_args()
    asyncio.run(run_probe(args))


async def run_probe(args):
    settings=Settings.environment()
    if not settings.sarvam_api_key:raise SystemExit('Configure backend key privately first; never print it.')
    output=args.output.resolve()
    if not output.is_relative_to(ROOT/'private') or output.exists():raise SystemExit('Output must be a new file within private/.')
    text,language=approved_text(settings,args.briefing_id)
    receipt=reserve_attempt('tts',args.sample_id,args.approval_id,characters=len(text))
    started=perf_counter()
    try:
        audio=await SarvamAdapter(settings.sarvam_api_key).speak(text,language)
    except DomainError as error:
        result={'status':'FAILED_ATTEMPT_CONSUMED','error_category':error.code,'latency_ms':round((perf_counter()-started)*1000)}
        record_result(receipt,result)
        print(json.dumps(result,indent=2));return
    approved_text(settings,args.briefing_id) # Reject if evidence changed while the call was in progress.
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('xb') as handle:handle.write(audio)
    result={'evidence':'AUTHENTICATED_TTS_PROBE_ONLY','status':'PROVIDER_AUDIO_RECEIVED_PLAYBACK_PENDING','sample_id':args.sample_id,'model':TTS_MODEL,'language':language,'characters':len(text),'latency_ms':round((perf_counter()-started)*1000),'audio_bytes':len(audio),'playback_witnessed':False,'output':str(output)}
    record_result(receipt,result)
    print(json.dumps(result,indent=2))


if __name__=='__main__':main()
