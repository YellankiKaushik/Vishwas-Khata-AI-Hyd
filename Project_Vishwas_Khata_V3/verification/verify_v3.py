"""V3 internal design contract checker. Not a deployed application test/certification."""
from pathlib import Path
import re,sys,json,csv,sqlite3,subprocess,hashlib
import yaml
ROOT=Path(__file__).resolve().parents[1]
checks=[]
def chk(label,fn):
 try:
  result=fn()
  if result is False:raise AssertionError('false')
  checks.append(f'PASS | {label}')
 except Exception as e:
  checks.append(f'FAIL | {label} | {type(e).__name__}: {e}')
  print('\n'.join(checks));sys.exit(1)

master=(ROOT/'DEEP_TECHNICAL_ARCHITECTURE.md').read_text()
print('V3 design-only audit: not a production application or AI service test.')
chk('49 template section headings, no duplicates',lambda: [int(i) for i in re.findall(r'(?m)^# (\d+)\. ',master)]==list(range(49)))
chk('218 subsection dispositions',lambda:len(re.findall(r'(?m)^\| \d+\.\d+ ',(ROOT/'verification/TEMPLATE_SUBSECTION_CROSSWALK.md').read_text()))==218)
chk('V3 version and honest source status',lambda:all(x in master for x in ['**Document version:** 3.0.0','NOT A VERIFIED IMPLEMENTATION','Appendix R','FUTURE','SYNTHETIC']))
chk('Original Hyderabad ideas retained',lambda:all(x in master for x in ['TrustLens','NaamCheck Copilot','DukaanGPT','VyaparMitra','Khata Copilot','Dukaan Digital Twin','ChainBreak','Voice Deepfake Shield']))
chk('V3 substantial technical delta',lambda:len(master.split())>=39000)

spec=yaml.safe_load((ROOT/'contracts/openapi.yaml').read_text())
chk('Valid documented OpenAPI format',lambda:spec['openapi']=='3.1.0' and spec['info']['version']=='0.3.0-proposed')
ops=[];param_pairs=[]
methods={'get','post','put','patch','delete','head','options','trace'}
for path,item in spec['paths'].items():
 assert path.startswith('/v1/'),path
 pvars=set(re.findall(r'{([^{}]+)}',path))
 shared=item.get('parameters',[])
 for meth,content in item.items():
  if meth not in methods:continue
  ops.append(content['operationId'])
  if meth in ('post','patch','put') and not content.get('responses'):raise AssertionError(f'no response {path}')
  merged=shared+content.get('parameters',[])
  seen=set();names=set()
  for p in merged:
   if '$ref' in p:
    assert p['$ref'].startswith('#/components/parameters/'),p
    p=spec['components']['parameters'][p['$ref'].split('/')[-1]]
   ident=(p['name'],p['in']);assert ident not in seen,(path,meth,ident)
   seen.add(ident)
   if p['in']=='path':names.add(p['name']);assert p.get('required') is True
  assert pvars==names,(path,meth,pvars,names)
  param_pairs.append((path,meth))
chk('Unique operation IDs',lambda:len(ops)==len(set(ops)))
chk('23 operation IDs / 22 paths',lambda:len(spec['paths'])==22 and len(ops)==23)
chk('No duplicate query/path parameters',lambda:True)
chk('Every URL placeholder declared',lambda:True)
chk('Every internal contract ref resolves',lambda:all(n in spec['components'][k] for k,n in re.findall(r"\$ref:\s*['\"]?#/components/(schemas|parameters|responses)/([A-Za-z0-9_]+)",(ROOT/'contracts/openapi.yaml').read_text())))
chk('No Paytm API implied',lambda:all('paytm' not in k.lower() for k in spec['paths']))
chk('Observation void/replay design present',lambda:all(p in spec['paths'] for p in ['/v1/observations/sales/{observation_id}/void','/v1/observations/visits/{observation_id}/void']))
prop=spec['components']['schemas']['DailyInsights']['properties']
chk('No false total cash sales in normative API',lambda:'observed_sales_paise' in prop and 'observation_coverage' in prop and 'cash_sales_paise' not in prop)
for obj in ('ObservationSaleCreate','ObservationVisitCreate'):
 chk(f'{obj} requires client_operation_id',lambda obj=obj:'client_operation_id' in spec['components']['schemas'][obj]['required'])

fixture=json.loads((ROOT/'fixtures/demo_dataset.json').read_text())
chk('Fixture synthetic and 500-300 case',lambda:fixture['dataset_classification']=='SYNTHETIC_ONLY' and fixture['expected_demo_checks']['ramesh_after_repayment_paise']==30000)
con=sqlite3.connect(':memory:')
con.execute('PRAGMA foreign_keys=ON')
for filename in ('001_initial.sql','002_integrity_hardening.sql','003_v3_contract_hardening.sql'):
 sql=(ROOT/'schema'/filename).read_text();con.executescript(sql)
 chk(f'apply migration {filename}',lambda:True)
chk('DB foreign keys enabled, checks pass',lambda: con.execute('pragma foreign_keys').fetchone()[0]==1 and con.execute('pragma integrity_check').fetchone()[0]=='ok' and not con.execute('pragma foreign_key_check').fetchall())
triggers={x[0] for x in con.execute("select name from sqlite_master where type='trigger'")}
for name in ('trg_financial_post_matches_draft_v3','trg_confirmed_draft_immutable_v3','trg_confirmed_requires_post_v3','trg_sales_no_update_v3','trg_visits_no_delete_v3','trg_void_source_exists_v3','trg_draft_economic_edits_version_v3'):
 chk(f'trigger {name}',lambda name=name:name in triggers)
con.close()
chk('Six new ADRs',lambda:all(f'ADR-{i:03}' in (ROOT/'adr/ADR-017-to-022.md').read_text() for i in range(17,23)))
cases=(ROOT/'evaluation/ACCEPTANCE_TESTS_V3.md').read_text()
chk('70 app acceptance scenarios identified, unverified',lambda: all(f'T-{i:03}' in cases for i in range(1,71)) and 'NOT RUN' in cases)
with (ROOT/'verification/TRACEABILITY_MATRIX_V3.csv').open() as f:rows=list(csv.DictReader(f))
chk('25 FR trace links',lambda:len(rows)==25 and len(set(x['requirement_id'] for x in rows))==25)
chk('No false source proof in trace links',lambda:all(x['implementation_evidence']=='TBD' for x in rows))
result=subprocess.run([sys.executable,'-m','unittest','discover','-s','tests','-q'],cwd=ROOT,capture_output=True,text=True)
chk('Reference/domain tests pass',lambda:result.returncode==0)
m=re.search(r'Ran (\d+) tests',result.stderr+result.stdout)
chk('38 or more reference test cases',lambda:m and int(m.group(1))>=38)
notes='\n'.join(checks)+f'\nTotal reference tests: {m.group(1) if m else "unreadable"}\n\n'
notes+='SCOPE LIMIT: Static document/contract/migration/SQLite and offline reference tests only. No deployed server, no browser, no authenticated Sarvam, no Paytm API, no data privacy certification, no merchant pilot.\n'
(ROOT/'verification/V3_STATIC_AUDIT_RESULTS.txt').write_text(notes)
print(notes)
