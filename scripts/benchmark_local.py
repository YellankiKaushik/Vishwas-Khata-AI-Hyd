"""Sequential local read timings on an isolated synthetic DB; not a load/SLA benchmark."""
from pathlib import Path
import json,math,os,platform,socket,statistics,subprocess,sys,tempfile,time
import httpx
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from apps.api.config import Settings
from apps.api.manage import seed


def main():
    temp_root=ROOT/'.tmp';temp_root.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='timings-',dir=temp_root) as directory:
        path=Path(directory)/'timings.sqlite3';seed(Settings(database_path=path))
        with socket.socket() as listener:listener.bind(('127.0.0.1',0));port=listener.getsockname()[1]
        url=f'http://127.0.0.1:{port}'
        environment={**os.environ,'DATABASE_PATH':str(path),'DEMO_MODE':'true','VOICE_PROVIDER':'mock','SARVAM_LIVE_VERIFIED':'false','SARVAM_TTS_VERIFIED':'false','VISHWAS_AS_OF':'2026-10-27T17:00:00Z'}
        process=subprocess.Popen([sys.executable,'-m','uvicorn','apps.api.main:app','--host','127.0.0.1','--port',str(port),'--no-access-log'],cwd=ROOT,env=environment,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            with httpx.Client(base_url=url,timeout=5,trust_env=False) as client:
                for _ in range(100):
                    try:
                        if client.get('/v1/health/ready').status_code==200:break
                    except httpx.RequestError:pass
                    time.sleep(.1)
                else:raise RuntimeError('Benchmark server not ready')
                client.post('/v1/demo/session').raise_for_status();results=[]
                for route in ('/v1/customers','/v1/customers/cus_ramesh/balance','/v1/insights/daily?date=2026-10-27'):
                    for _ in range(5):client.get(route).raise_for_status()
                    samples=[]
                    for _ in range(50):
                        started=time.perf_counter();client.get(route).raise_for_status();samples.append((time.perf_counter()-started)*1000)
                    ordered=sorted(samples);results.append({'route':route,'samples':50,'p50_ms':round(statistics.median(samples),3),'p95_ms':round(ordered[math.ceil(.95*len(ordered))-1],3)})
            output={'classification':'MEASURED_LOCAL_SEQUENTIAL_READ_TIMINGS','scope':'One Windows localhost process; synthetic 3 customers, empty journal, 7 sales observations, 3 visits; 5 warmups per route excluded. Not a concurrent load test, vendor latency, SLA or production forecast.','python':platform.python_version(),'platform':platform.system(),'results':results,'vendor_calls':0}
            (ROOT/'docs/evidence/local-timings.json').write_text(json.dumps(output,indent=2),encoding='utf-8');print(json.dumps(output,indent=2))
        finally:process.terminate();process.wait(timeout=5)


if __name__=='__main__':main()
