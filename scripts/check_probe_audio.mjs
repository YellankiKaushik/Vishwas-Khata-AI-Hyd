// Replay ONE already-returned authorized TTS artifact through the real compiled UI.
// No Sarvam call: browser response interception supplies the recorded vendor WAV.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../apps/web/package.json',import.meta.url));
const {chromium}=require('playwright');
const root=fileURLToPath(new URL('..',import.meta.url));
const audio=await readFile(path.join(root,'private/approved-briefing-probe.wav'));
const approved=JSON.parse(await readFile(path.join(root,'.tmp/f3-current-briefing.json'),'utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  const crashes=[];let replayRequests=0;
  page.on('pageerror',e=>crashes.push(e.message));
  await page.route('**/v1/health/ready',async route=>{
    const response=await route.fetch();
    await route.fulfill({json:{...(await response.json()),tts_live_verified:true,tts_verified_languages:['en-IN']}});
  });
  await page.route('**/v1/briefings/speech',route=>{
    replayRequests++;return route.fulfill({contentType:'audio/wav',body:audio});
  });
  await page.goto('http://127.0.0.1:8000');
  await page.getByTestId('total-outstanding').waitFor();
  const balance=await page.getByTestId('total-outstanding').innerText();
  await page.getByRole('button',{name:'Daily briefing',exact:true}).click();
  await page.locator('.briefing-slot').first().waitFor();
  const actual=await page.locator('.briefing-slot > p').allTextContents();
  if(actual.join('\n\n')!==approved.text)throw new Error('Recorded audio text is not the current visible briefing');
  await page.getByRole('button',{name:'Listen to briefing',exact:true}).click();
  const player=page.getByLabel('Approved daily briefing audio');await player.waitFor();
  const media=await player.evaluate(async node=>{
    if(node.readyState<1)await new Promise((resolve,reject)=>{node.onloadedmetadata=resolve;node.onerror=reject;});
    const initialPaused=node.paused;
    await node.play();const playing=!node.paused;
    node.pause();const paused=node.paused;
    node.currentTime=0;await node.play();
    return {duration_seconds:node.duration,initialPaused,playing,paused,replayed:!node.paused};
  });
  await page.evaluate(()=>{
    const note=document.createElement('p');note.textContent='RECORDED SARVAM PROBE AUDIO REPLAY • NO NEW PROVIDER CALL • HUMAN AUDIBLE WITNESS PENDING';
    note.style.cssText='position:fixed;bottom:12px;left:15%;background:#123440;color:white;padding:12px;z-index:9999';document.body.append(note);
  });
  await page.screenshot({path:path.join(root,'docs/evidence/f3-recorded-audio-browser.png')});
  await page.getByRole('button',{name:'Overview',exact:true}).click();
  if(await page.getByTestId('total-outstanding').innerText()!==balance)throw new Error('Audio must not change ledger');
  if(crashes.length || replayRequests!==1 || !media.playing || !media.paused || !media.replayed)throw new Error('Playback verification failed');
  const result={classification:'ACTUAL_PROVIDER_WAV_REPLAY_THROUGH_COMPILED_UI',
    note:'Health status and speech response intercepted only in this test browser. Normal backend flags remain false; no live-enabled app or human hearing claim.',
    input_audio:'private/approved-briefing-probe.wav',approved_text_characters:approved.characters,
    facts_hash:approved.facts_hash,media,recorded_audio_response_replays:replayRequests,
    new_provider_requests:0,human_audible_witness:false,balance_unchanged:true,crashes};
  await writeFile(path.join(root,'docs/evidence/f3-browser-audio.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}finally{await browser.close();}
