"""Explicit operator-run synthetic Sarvam probe. Never run without authorized provider access."""
import argparse
import asyncio
import json
from pathlib import Path
from time import perf_counter
import hashlib
from datetime import datetime, timezone

from .config import Settings
from .voice import SarvamAdapter, validate_speech_input, STT_MODEL
from .probe_support import reserve_attempt, record_result
from .domain import DomainError


def main():
    parser=argparse.ArgumentParser(description='One authorized synthetic WAV to Sarvam STT probe; no ledger write.')
    parser.add_argument('audio',type=Path)
    parser.add_argument('--language',choices=['en-IN','hi-IN','te-IN'],required=True)
    parser.add_argument('--synthetic',action='store_true',required=True)
    parser.add_argument('--allow-provider-call',action='store_true',required=True)
    parser.add_argument('--sample-id',required=True)
    parser.add_argument('--approval-id',required=True)
    args=parser.parse_args()
    asyncio.run(run_probe(args))


async def run_probe(args):
    settings=Settings.environment()
    if not settings.sarvam_api_key:
        raise SystemExit('Set backend SARVAM_API_KEY securely in the environment first.')
    raw=args.audio.read_bytes();duration=validate_speech_input(raw)
    receipt=reserve_attempt('stt',args.sample_id,args.approval_id,duration=duration)
    started=perf_counter()
    try:
        response=await SarvamAdapter(settings.sarvam_api_key).transcribe(raw,args.language)
        result={'evidence':'AUTHENTICATED_STT_PROBE_ONLY','sample_id':args.sample_id,'recorded_at':datetime.now(timezone.utc).isoformat(),
                'model':STT_MODEL,'requested_language':args.language,'latency_ms':round((perf_counter()-started)*1000),
                'input_sha256':hashlib.sha256(raw).hexdigest(),'duration_seconds':duration,'response':response,
                'human_correction':None,'physical_microphone_witnessed':False,'ledger_written':False,'status':'REQUIRES_HUMAN_FIELD_REVIEW'}
    except DomainError as error:
        result={'sample_id':args.sample_id,'status':'FAILED_ATTEMPT_CONSUMED','error_category':error.code,
                'latency_ms':round((perf_counter()-started)*1000),'ledger_written':False}
    output=record_result(receipt,result)
    print(json.dumps({'result_file':str(output),'status':result['status'],'latency_ms':result['latency_ms'],'automatic_retries':0},indent=2))


if __name__=='__main__':main()
