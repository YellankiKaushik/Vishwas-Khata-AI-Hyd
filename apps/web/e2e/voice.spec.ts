import { test, expect } from "./offline-test";
import fs from "node:fs/promises";
import { syntheticMediaPath } from "./media-fixture";
import type { Draft, Entry, Receipt } from "../src/api";
test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--use-file-for-fake-audio-capture=" + syntheticMediaPath(),
    ],
  },
});

async function capturePage(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Record transaction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Type / speak a sentence", exact: true })
    .click();
}
async function record(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Record voice", exact: true }).click();
  await expect(page.getByText(/Recording · 1\./)).toBeVisible();
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/v1/voice/validations")),
    page.getByRole("button", { name: "Stop recording", exact: true }).click(),
  ]);
  expect(response.status()).toBe(200);
  await expect(page.getByText(/Recording validated ·/)).toBeVisible();
  return response.json();
}

test("offline desktop and mobile expose labelled controls and download real PCM WAV without cloud or ledger writes", async ({ page }) => {
  const before = await (await page.request.post('/v1/demo/session')).json();
  expect(before.mode).toBe('LOCAL_SYNTHETIC_ONLY');
  const journal = await (await page.request.get('/v1/ledger/entries')).json();
  let remoteSpeech = 0;
  page.on('request', request => { if (request.url().endsWith('/voice/transcriptions') || request.url().endsWith('/briefings/speech')) remoteSpeech++; });
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await capturePage(page);
    const start = page.getByRole('button', { name: 'Record voice', exact: true });
    await expect(start).toHaveText('Record voice');
    await expect(start).toBeInViewport();
    await expect(start).toBeEnabled();
    await record(page);
    const player = page.getByLabel('Preview synthetic recording');
    await player.evaluate(async (audio: HTMLAudioElement) => { await audio.play(); audio.pause(); });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Save synthetic WAV' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('vishwas-synthetic.wav');
    const raw = await fs.readFile((await download.path())!);
    expect(raw.toString('ascii', 0, 4)).toBe('RIFF');
    expect(raw.toString('ascii', 8, 12)).toBe('WAVE');
    expect(raw.readUInt16LE(20)).toBe(1); // PCM, not renamed WebM
    expect(raw.readUInt16LE(22)).toBe(1);
    expect(raw.readUInt32LE(24)).toBe(16000);
    expect(raw.readUInt16LE(34)).toBe(16);
    expect(raw.readUInt32LE(40)).toBe(raw.length - 44);
    await page.getByRole('button', { name: 'Discard recording', exact: true }).click();
    await expect(player).toHaveCount(0);
    await start.click();
    await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toHaveText('Stop recording');
    await page.getByRole('button', { name: 'Cancel recording / request' }).click();
    await expect(player).toHaveCount(0);
    await page.screenshot({ path: `../../docs/evidence/voice-controls-${width}.png` });
    await page.getByRole('button', { name: 'Close dialog' }).click();
  }
  expect(remoteSpeech).toBe(0);
  expect((await (await page.request.get('/v1/ledger/entries')).json()).items).toEqual(journal.items);
});

test("changing customer or language discards old media and ignores a late fixture transcript", async ({
  page,
}) => {
  await page.route("**/v1/health/ready", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: {
        ...(await response.json()),
        voice_provider: "sarvam",
        voice_live_verified: true,
        stt_verified_languages: ["en-IN"],
      },
    });
  });
  await capturePage(page);
  await record(page);
  await page
    .getByLabel("Customer (select the exact ID)")
    .selectOption("cus_ramesh");
  await expect(page.getByLabel("Preview synthetic recording")).toHaveCount(0);
  await record(page);
  await page
    .getByLabel("Sentence or corrected transcript")
    .fill("My manually corrected sentence");
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/v1/voice/transcriptions", async (route) => {
    await held;
    await route
      .fulfill({
        json: {
          transcript: "Ramesh took 9999 credit",
          source: "FIXTURE",
          language_detected: "en-IN",
          model: "NO-ASR-CLAIM",
          transcription_id: "late-fixture",
        },
      })
      .catch(() => {});
  });
  const request = page.waitForRequest("**/v1/voice/transcriptions");
  await page
    .getByRole("button", { name: "Transcribe recording", exact: true })
    .click();
  await request;
  await page
    .getByLabel("Customer (select the exact ID)")
    .selectOption("cus_priya");
  release();
  await expect(page.getByLabel("Preview synthetic recording")).toHaveCount(0);
  await expect(page.getByLabel("Sentence or corrected transcript")).toHaveValue(
    "My manually corrected sentence",
  );
  await page
    .getByRole("combobox", { name: "Speech language", exact: true })
    .selectOption("te-IN");
  await expect(
    page.getByText("Selected speech language is unverified.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Transcribe recording", exact: true }),
  ).toHaveCount(0);
});

test("a retained recording cannot cross a changed authenticated browser session", async ({
  page,
}) => {
  await page.route("**/v1/health/ready", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: {
        ...(await response.json()),
        voice_provider: "sarvam",
        voice_live_verified: true,
        stt_verified_languages: ["en-IN"],
      },
    });
  });
  await capturePage(page);
  await record(page);
  await page
    .getByLabel("Sentence or corrected transcript")
    .fill("Keep this typed sentence");
  expect((await page.request.post("/v1/demo/session")).ok()).toBeTruthy();
  await page
    .getByRole("button", { name: "Transcribe recording", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("shop session changed");
  await expect(page.getByLabel("Sentence or corrected transcript")).toHaveValue(
    "Keep this typed sentence",
  );
});

test("virtual microphone captures codec audio, converts and validates real PCM without a provider", async ({
  page,
}) => {
  let providerRequests = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/voice/transcriptions")) providerRequests++;
  });
  await page.addInitScript(() => {
    const native = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    (window as any).__mediaTracks = [];
    navigator.mediaDevices.getUserMedia = async (args) => {
      const stream = await native(args);
      (window as any).__mediaTracks.push(...stream.getTracks());
      return stream;
    };
  });
  await capturePage(page);
  const metadata = await record(page);
  expect(metadata.channels).toBe(1);
  expect(metadata.sample_rate_hz).toBe(16000);
  expect(metadata.format).toBe("PCM_WAV");
  expect(metadata.provider_called).toBe(false);
  expect(metadata.duration_seconds).toBeGreaterThan(0.5);
  expect(metadata.duration_seconds).toBeLessThan(20);
  expect(
    await page.evaluate(() =>
      (window as any).__mediaTracks.every(
        (t: MediaStreamTrack) => t.readyState === "ended",
      ),
    ),
  ).toBe(true);
  await expect(page.getByLabel("Preview synthetic recording")).toBeVisible();
  await expect(
    page.getByText("Local recording available · cloud transcription unavailable", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Transcribe recording", exact: true }),
  ).toHaveCount(0);
  await fs.writeFile(
    "../../docs/evidence/c1-microphone.json",
    JSON.stringify(
      {
        evidence: "VIRTUAL_DEVICE_BROWSER_PCM_VALIDATION",
        physical_microphone_witnessed: false,
        speech_sample: false,
        ...metadata,
        capture_engine: "Edge MediaRecorder + AudioContext",
        provider_requests: providerRequests,
      },
      null,
      2,
    ),
  );
  expect(providerRequests).toBe(0);
  await page
    .getByRole("button", { name: "Discard recording", exact: true })
    .click();
  await expect(page.getByLabel("Preview synthetic recording")).toHaveCount(0);
  await page.getByRole("button", { name: "Record voice", exact: true }).click();
  await expect(page.getByText(/Recording ·/)).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel recording / request", exact: true })
    .click();
  await expect(page.getByLabel("Preview synthetic recording")).toHaveCount(0);
});

test("denied permission keeps the editable sentence and typed path", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("denied for test", "NotAllowedError");
    };
  });
  await capturePage(page);
  await page
    .getByLabel("Sentence or corrected transcript")
    .fill("Ramesh took 500 rupees credit");
  await page.getByRole("button", { name: "Record voice", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("permission was denied");
  await expect(page.getByLabel("Sentence or corrected transcript")).toHaveValue(
    "Ramesh took 500 rupees credit",
  );
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("₹500", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel this draft" }).click();
});

test("fixture transcript is corrected before a draft; provider failure retains text", async ({
  page,
}) => {
  await page.route("**/v1/health/ready", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: {
        ...(await response.json()),
        voice_provider: "sarvam",
        voice_live_verified: true,
        stt_verified_languages: ["en-IN"],
      },
    });
  });
  await capturePage(page);
  await record(page);
  await page.route(
    "**/v1/voice/transcriptions",
    (route) =>
      route.fulfill({
        status: 200,
        json: {
          transcription_id: "fixture-only",
          transcript: "Ramesh took 500 rupees credit",
          language_detected: "en-IN",
          source: "FIXTURE",
          provider: "MOCK_TRANSPORT",
          model: "fixture-no-ASR-claim",
        },
      }),
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Transcribe recording", exact: true })
    .click();
  await expect(
    page.getByText("Fixture transcript · test only", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Sentence or corrected transcript")
    .fill("Ramesh took 450 rupees credit");
  await page
    .getByRole("button", { name: "Transcribe recording", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "not passed an authenticated probe",
  );
  await expect(page.getByLabel("Sentence or corrected transcript")).toHaveValue(
    "Ramesh took 450 rupees credit",
  );
  const before = await (await page.request.get("/v1/ledger/entries")).json();
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("₹450", { exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/v1/ledger/entries")).json()).items.length,
  ).toBe(before.items.length);
  await page.getByRole("button", { name: "Cancel this draft" }).click();
});

test("closing while microphone permission is pending stops a late stream and makes no upload", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const native = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = () =>
      new Promise((resolve) => {
        (window as any).__releasePermission = async () => {
          const stream = await native({ audio: true });
          (window as any).__lateTracks = stream.getTracks();
          resolve(stream);
        };
      });
  });
  await capturePage(page);
  let uploads = 0;
  page.on("request", (r) => {
    if (r.url().includes("/voice/validations")) uploads++;
  });
  await page.getByRole("button", { name: "Record voice", exact: true }).click();
  await expect(
    page.getByText("Waiting for microphone permission…"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.evaluate(() => (window as any).__releasePermission());
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__lateTracks?.every(
          (t: MediaStreamTrack) => t.readyState === "ended",
        ),
      ),
    )
    .toBe(true);
  expect(uploads).toBe(0);
});

test("late permission rejection cannot stop a newer recording", async ({ page }) => {
  await page.addInitScript(() => {
    const native = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let calls = 0;
    navigator.mediaDevices.getUserMedia = async (args) => {
      if (++calls === 1) return new Promise<MediaStream>((_, reject) => {
        (window as any).__rejectOldPermission = () => reject(new DOMException("old denial", "NotAllowedError"));
      });
      const stream = await native(args);
      (window as any).__newTracks = stream.getTracks();
      return stream;
    };
  });
  await capturePage(page);
  await page.getByRole("button", { name: "Record voice", exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__rejectOldPermission)).toBe("function");
  await page.getByRole("button", { name: "Cancel recording / request", exact: true }).click();
  await page.getByRole("button", { name: "Record voice", exact: true }).click();
  await expect(page.getByText(/Recording · 1\./)).toBeVisible();
  await page.evaluate(() => (window as any).__rejectOldPermission());
  await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__newTracks.every((track: MediaStreamTrack) => track.readyState === "live"))).toBe(true);
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect(page.getByText(/Recording validated ·/)).toBeVisible();
});

test("discarding a playing local preview pauses and detaches its media source", async ({ page }) => {
  await capturePage(page);
  await record(page);
  const player = page.getByLabel("Preview synthetic recording");
  await player.evaluate(async (audio: HTMLAudioElement) => {
    (window as any).__discardedPreview = audio;
    await audio.play();
  });
  await page.getByRole("button", { name: "Discard recording", exact: true }).click();
  expect(await page.evaluate(() => ({ paused: (window as any).__discardedPreview.paused, source: (window as any).__discardedPreview.getAttribute("src") }))).toEqual({ paused: true, source: null });
});

test("recorded real STT response replay requires deliberate transcription, customer review and confirmation", async ({ page }) => {
  // Replays the two actual 31 October response texts locally. No fresh provider call.
  const baseline = await page.request.get('/v1/health/ready');
  expect(baseline.ok()).toBe(true);
  const health = await baseline.json();
  await baseline.dispose();
  expect(health).toMatchObject({ voice_provider: 'mock', voice_live_verified: false });
  const replayHealth = JSON.stringify({
    ...health,
    voice_provider: 'sarvam',
    voice_live_verified: true,
    stt_verified_languages: ['en-IN'],
  });
  await page.route('**/v1/health/ready', route =>
    route.fulfill({ contentType: 'application/json', body: replayHealth }),
  );
  await page.goto('/');
  await expect(page.getByTestId('total-outstanding')).toBeVisible();
  const created = await page.request.post('/v1/customers', { data: { display_name: 'Ramesh' } });
  expect(created.status()).toBe(201);
  const cid = (await created.json()).id; // Distinguish the new isolated demo identity explicitly.
  await page.reload(); // Load the new customer into the real picker; no client-side invented option.
  await expect(page.getByTestId('total-outstanding')).toBeVisible();
  let transcriptions = 0;
  const responses = ['Ramesh took ₹500 credit.', 'Ramesh returned ₹200.'];
  await page.route('**/v1/voice/transcriptions', route => {
    const transcript = responses[transcriptions++];
    return route.fulfill({ json: { transcription_id: 'recorded-response-' + transcriptions, transcript, language_detected: 'en-IN', source: 'FIXTURE', provider: 'RECORDED_VENDOR_RESPONSE_REPLAY', model: 'saaras:v4' } });
  });
  const amounts = ['₹500', '₹200'];
  const balances = [50000, 30000];
  for (const [index, expectedAmount] of amounts.entries()) {
    await page.getByRole('button', { name: 'Record transaction', exact: true }).click();
    await page.getByRole('button', { name: 'Type / speak a sentence', exact: true }).click();
    await page.getByLabel('Customer (select the exact ID)').selectOption(cid);
    const beforeResponse = await page.request.get('/v1/ledger/entries');
    expect(beforeResponse.status()).toBe(200);
    const before: Entry[] = (await beforeResponse.json()).items;
    await record(page);
    expect(transcriptions).toBe(index);
    const player = page.getByLabel('Preview synthetic recording');
    await player.evaluate(async (audio: HTMLAudioElement) => { await audio.play(); audio.pause(); });
    await page.getByRole('button', { name: 'Transcribe recording', exact: true }).click();
    await expect(page.getByLabel('Sentence or corrected transcript')).toHaveValue(responses[index]);
    // Explicit merchant edit verifies the correction path, even though recognized fields are correct.
    await page.getByLabel('Sentence or corrected transcript').fill(index === 0 ? 'Ramesh took 500 rupees credit' : 'Ramesh returned 200 rupees');
    const [draftResponse] = await Promise.all([
      page.waitForResponse(response => response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/v1/ledger/drafts'),
      page.getByRole('button', { name: 'Review draft', exact: true }).click(),
    ]);
    expect(draftResponse.status()).toBe(201);
    const draft: Draft = await draftResponse.json();
    expect(draft.proposed.customer_id).toBe(cid);
    const review = page.getByRole('dialog', { name: 'Review your entry' });
    await expect(review.getByText(expectedAmount, { exact: true })).toBeVisible();
    expect((await (await page.request.get('/v1/ledger/entries')).json()).items).toHaveLength(before.length);

    const [confirmation] = await Promise.all([
      page.waitForResponse(response => response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `/v1/ledger/drafts/${draft.draft_id}/confirm`),
      review.getByRole('button', { name: 'Confirm and post', exact: true }).click(),
    ]);
    // The local API returns 201 for a new posting and 200 for an idempotent replay.
    expect(confirmation.status()).toBe(201);
    const receipt: Receipt = await confirmation.json();
    expect(receipt).toMatchObject({
      customer_id: cid,
      draft_id: draft.draft_id,
      outstanding_balance_paise: balances[index],
    });
    const confirmationRequest = confirmation.request();
    const key = await confirmationRequest.headerValue('idempotency-key');
    expect(key).toBeTruthy();
    const replay = await page.request.post(`/v1/ledger/drafts/${draft.draft_id}/confirm`, {
      headers: { 'Idempotency-Key': key! },
      data: confirmationRequest.postDataJSON(),
    });
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual(receipt);
    await expect.poll(async () => {
      const response = await page.request.get(`/v1/customers/${cid}/balance`);
      expect(response.status()).toBe(200);
      return (await response.json()).outstanding_balance_paise;
    }).toBe(receipt.outstanding_balance_paise);

    const afterResponse = await page.request.get('/v1/ledger/entries');
    expect(afterResponse.status()).toBe(200);
    const after: Entry[] = (await afterResponse.json()).items;
    const priorIds = new Set(before.map(entry => entry.entry_id));
    expect(after).toHaveLength(before.length + 1);
    expect(after.filter(entry => !priorIds.has(entry.entry_id))).toEqual([
      expect.objectContaining({ entry_id: receipt.entry_id, customer_id: cid, draft_id: draft.draft_id }),
    ]);
    await expect(review).toBeHidden();
  }
  expect(transcriptions).toBe(2);
  expect((await (await page.request.get(`/v1/customers/${cid}/balance`)).json()).outstanding_balance_paise).toBe(30000);
});
