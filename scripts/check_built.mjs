// Read-only UI smoke of the compiled single-server venue app (session/snapshot creation only).
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../apps/web/package.json',import.meta.url));
const {chromium}=require('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const response=await page.goto('http://127.0.0.1:8000');
  if(response.status()!==200)throw new Error('Compiled app did not load');
  await page.getByTestId('total-outstanding').waitFor();
  const outstanding=await page.getByTestId('total-outstanding').innerText();
  await page.getByRole('button',{name:'Daily briefing',exact:true}).click();
  await page.locator('.briefing-slot').first().waitFor();
  if(await page.locator('.briefing-slot').count()!==4)throw new Error('Four-slot briefing missing');
  if(errors.length)throw new Error('Browser crashed: '+errors.join('; '));
  const ready=await (await page.request.get('http://127.0.0.1:8000/v1/health/ready')).json();
  const evidence={classification:'COMPILED_SINGLE_SERVER_SMOKE',checked_at_utc:new Date().toISOString(),url:'http://127.0.0.1:8000',http_status:response.status(),outstanding_display:outstanding,briefing_slots:4,console_crashes:errors,ready};
  await writeFile(fileURLToPath(new URL('../docs/evidence/built-app.json',import.meta.url)),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
}finally{await browser.close()}
