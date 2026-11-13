// Actual runtime recording on an isolated synthetic database. No provider, fixtures-as-ASR or main reset.
import {createRequire} from 'node:module';
import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const policy=JSON.parse(await fs.readFile(path.join(root,'docs/completion/ARTIFACT_FREEZE.json'),'utf8'));
if(policy.final_assets_allowed!==true || !process.argv.includes('--release-assets'))throw new Error('DEFERRED UNTIL APPLICATION FREEZE: explicit release phase and --release-assets required.');
const require=createRequire(path.join(root,'apps/web/package.json'));
const {chromium}=require('playwright');
const output=path.join(root,'docs/finale/assets');await fs.mkdir(output,{recursive:true});
const temp=path.join(root,'.tmp/finale-recording-'+Date.now());await fs.mkdir(temp,{recursive:true});
const processApi=spawn(path.join(root,'.venv/Scripts/python.exe'),[path.join(root,'scripts/e2e_server.py')],{cwd:root,env:{...process.env,DATABASE_PATH:path.join(temp,'video.sqlite3'),VOICE_PROVIDER:'mock',SARVAM_LIVE_VERIFIED:'false',SARVAM_TTS_VERIFIED:'false',DEMO_MODE:'true',VISHWAS_AS_OF:'2026-10-27T17:00:00Z'},stdio:['ignore','ignore','pipe'],windowsHide:true});
let serverErrors='';processApi.stderr.on('data',b=>{serverErrors+=b.toString()});
const url='http://127.0.0.1:8001';let browser,context;
try{
  for(let i=0;i<100;i++){try{const r=await fetch(url+'/v1/health/ready');if(r.ok)break}catch{}if(i===99)throw new Error('Recording API not ready: '+serverErrors);await new Promise(r=>setTimeout(r,100))}
  browser=await chromium.launch({channel:'msedge',headless:true});
  context=await browser.newContext({viewport:{width:1600,height:900},recordVideo:{dir:temp,size:{width:1600,height:900}}});
  const page=await context.newPage();const crashes=[];page.on('pageerror',e=>crashes.push(e.message));
  await page.goto(url);await page.getByTestId('total-outstanding').waitFor();
  if(await page.getByTestId('total-outstanding').innerText()!=='₹0')throw new Error('Video database must start empty');
  const started=Date.now();const shots=[];
  async function caption(title,body,hold=0){
    shots.push({at_seconds:Math.round((Date.now()-started)/1000),title,body});console.log(title);
    await page.evaluate(({title,body})=>{let el=document.getElementById('finale-caption');if(!el){el=document.createElement('div');el.id='finale-caption'}el.style.cssText='position:fixed;bottom:14px;left:255px;right:24px;padding:15px 22px;background:#103541f5;color:white;border:1px solid #78c7c7;border-radius:8px;z-index:2147483647;pointer-events:none;box-shadow:0 4px 20px #0002;font-family:Segoe UI,Arial,sans-serif';const small=document.createElement('div');small.textContent='RECORDED DEMO • SYNTHETIC DATA • TYPED OFFLINE PATH';small.style.cssText='font-size:10px;letter-spacing:1.2px;color:#9adbd8';const h=document.createElement('div');h.textContent=title;h.style.cssText='font-size:23px;font-weight:600;margin-top:5px';const p=document.createElement('div');p.textContent=body;p.style.cssText='font-size:16px;line-height:1.5;margin-top:3px;color:#d0e4e7';el.replaceChildren(small,h,p);(document.querySelector('dialog[open]')||document.body).appendChild(el)},{title,body});
    if(hold)await new Promise(r=>setTimeout(r,hold*1000));
  }
  async function until(seconds){const wait=seconds*1000-(Date.now()-started);if(wait>0)await new Promise(r=>setTimeout(r,wait))}
  await caption('Vishwas Khata · Team Tic Tac Tech','A merchant copilot for clear everyday credit records. Independent hackathon prototype.',8);
  await caption('An empty, synthetic khata','Declared replay clock: 27 October 2026. No Paytm feed, bank settlement or real customer data.',4);
  await page.getByRole('button',{name:'Record transaction',exact:true}).click();await page.getByRole('button',{name:'Type / speak a sentence',exact:true}).click();
  await caption('Speak locally, or type in this offline demonstration','Two English Sarvam probes passed separately. This recording makes no provider calls. Physical witness pending.',7);
  await page.getByLabel('Customer (select the exact ID)').selectOption('cus_ramesh');await page.getByLabel('Sentence or corrected transcript').pressSequentially('Ramesh took 500 rupees credit',{delay:50});
  await caption('Ramesh took ₹500 credit','The sentence proposes a draft. It has no authority to write money.',5);
  await page.getByRole('button',{name:'Review draft',exact:true}).click();await page.getByRole('dialog').getByText('₹500',{exact:true}).waitFor();
  await caption('Check customer ID, transaction type and exact amount','The merchant must explicitly confirm. Credit increases receivables; it is not verified revenue.',8);
  const [credit]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/confirm')),page.getByRole('button',{name:'Confirm and post',exact:true}).click()]);if(credit.status()!==201)throw new Error('Credit failed');const creditResult=await credit.json();
  await page.getByRole('button',{name:'Dismiss receipt'}).click();await caption('One confirmed entry: ₹500 outstanding','Journal, confirmed draft, retry record and audit commit atomically.',6);
  await page.getByRole('button',{name:'Record transaction',exact:true}).click();await page.getByRole('button',{name:'Type / speak a sentence',exact:true}).click();await page.getByLabel('Customer (select the exact ID)').selectOption('cus_ramesh');await page.getByLabel('Sentence or corrected transcript').pressSequentially('Ramesh returned 200 rupees',{delay:50});
  await caption('Now record a ₹200 repayment','The merchant reviews this separate repayment before approving it.',5);
  await page.getByRole('button',{name:'Review draft',exact:true}).click();await page.getByRole('dialog').getByText('₹200',{exact:true}).waitFor();await caption('Repayment received · ₹200','This reduces receivables; it does not prove UPI or bank settlement.',6);
  const [repayment]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/confirm')),page.getByRole('button',{name:'Confirm and post',exact:true}).click()]);if(repayment.status()!==201)throw new Error('Repayment failed');const repaymentResult=await repayment.json();await page.getByRole('button',{name:'Dismiss receipt'}).click();
  await page.reload();await page.getByTestId('total-outstanding').waitFor();if(await page.getByTestId('total-outstanding').innerText()!=='₹300')throw new Error('Persistent balance incorrect');
  await caption('Refresh: the receivable stays ₹300','₹500 credit − ₹200 repayment. The persistent signed journal is the source of truth.',7);
  await page.getByRole('button',{name:'Your journal',exact:true}).click();await page.getByRole('button',{name:'Verify last retry'}).click();await page.getByText('Replay verified:',{exact:false}).waitFor();
  if(await page.locator('.journal-row').count()!==2)throw new Error('Duplicate entry during video');await caption('Retry the original confirmation: still two entries','The same idempotency key returns the original entry ID. Retrying does not post more money.',8);
  await page.getByRole('button',{name:'Daily briefing',exact:true}).click();await page.locator('.briefing-slot').first().waitFor();await caption('Four useful sections, grounded in records','Recorded activity; documentation readiness; recorded visit gap; an honest what-if boundary.',7);
  await page.locator('.briefing-slot').nth(2).scrollIntoViewIfNeeded();await caption('Priya: no visit recorded in 12 days','Three recorded dates show a 4-day median interval and an 8-day threshold. Missing logs do not prove churn.',10);
  await page.locator('.briefing-slot').nth(3).scrollIntoViewIfNeeded();await caption('No invented sales forecast','The what-if section says data is insufficient because a confirmed hourly baseline is missing.',7);
  await page.getByText('Inspect supporting facts & sources').click();await page.locator('.source-details').scrollIntoViewIfNeeded();await caption('Inspect the evidence behind the words','IST business-day windows, journal IDs, observation IDs and a facts hash remain visible.',8);
  await page.getByRole('button',{name:'Overview',exact:true}).click();await page.evaluate(()=>scrollTo(0,0));await caption('AI can assist. The merchant approves.','Offline core verified. Live Sarvam remains gated by credits, explicit authorization and measured samples.',5);
  await until(135);
  const video=page.video();await context.close();context=null;const raw=await video.path();
  const final=path.join(output,'vishwas-khata-demo.mp4');
  const encode=spawnSync('ffmpeg',['-y','-i',raw,'-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-an','-movflags','+faststart',final],{cwd:root,encoding:'utf8',windowsHide:true});if(encode.status!==0)throw new Error('Video encoding failed: '+encode.stderr.slice(-1500));
  const probe=spawnSync('ffprobe',['-v','quiet','-print_format','json','-show_format','-show_streams',final],{encoding:'utf8',windowsHide:true});if(probe.status!==0)throw new Error('Video probe failed');
  const metadata=JSON.parse(probe.stdout);const balance=await (await fetch(url+'/v1/health/ready')).json();
  await fs.writeFile(path.join(root,'docs/evidence/finale-video.json'),JSON.stringify({classification:'ACTUAL_BROWSER_OPERATION_RECORDING',recorded_at_utc:new Date().toISOString(),synthetic_replay_clock:'2026-10-27T17:00:00Z',audio:'SILENT_CAPTIONED; NOT SARVAM OR MICROPHONE AUDIO',physical_microphone:false,provider_calls:0,credit:creditResult,repayment:repaymentResult,journal_rows:2,outstanding_paise:30000,console_crashes:crashes,shots,ready:balance,video:metadata},null,2));
  if(crashes.length)throw new Error('Browser errors during recording: '+crashes.join('; '));console.log('Recorded and verified '+final);
}finally{if(context)await context.close();if(browser)await browser.close();processApi.kill()}
