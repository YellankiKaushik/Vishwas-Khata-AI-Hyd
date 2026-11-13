import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, X, Download, RefreshCw } from "lucide-react";
import { api, ApiError } from "./api";
import { pcmWav } from "./audio";
import { captureLocale } from "./locales";

type Phase =
  | "idle"
  | "permission"
  | "recording"
  | "converting"
  | "validating"
  | "ready"
  | "transcribing"
  | "error";
type Metadata = {
  duration_seconds: number;
  size_bytes: number;
  sample_rate_hz: number;
  channels: number;
  format: string;
  provider_called: false;
};
export type Transcript = {
  transcription_id: string;
  transcript: string;
  language_detected: string;
  source: "LIVE_VENDOR" | "FIXTURE" | "MANUAL";
  provider?: string;
  model?: string;
  warnings?: string[];
};
type Clip = {
  wav: Blob;
  url: string;
  capturedMime: string;
  duration: number;
  context: string;
};
const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

export function VoiceCapture({
  language,
  providerAvailable,
  onTranscript,
  onActivity,
}: {
  language: string;
  providerAvailable: boolean;
  onTranscript: (value: Transcript) => void;
  onActivity: (active: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const locale = captureLocale(language);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [clip, setClip] = useState<Clip | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [result, setResult] = useState<Transcript | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const objectUrl = useRef("");
  const generation = useRef(0);
  const alive = useRef(true);
  const player = useRef<HTMLAudioElement | null>(null);
  const attachPlayer = useCallback((node: HTMLAudioElement | null) => {
    if (!node && player.current) {
      player.current.pause();
      player.current.removeAttribute("src");
      player.current.load();
    }
    player.current = node;
  }, []);
  const active = [
    "permission",
    "recording",
    "converting",
    "validating",
    "transcribing",
  ].includes(phase);
  const supported =
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof AudioContext !== "undefined" &&
    typeof OfflineAudioContext !== "undefined" &&
    window.isSecureContext;

  function stopTracks() {
    if (timer.current) clearInterval(timer.current);
    if (deadline.current) clearTimeout(deadline.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }
  function release() {
    generation.current++;
    abort.current?.abort();
    player.current?.pause();
    if (recorder.current) {
      recorder.current.onstop = null;
      if (recorder.current.state !== "inactive") recorder.current.stop();
      recorder.current = null;
    }
    stopTracks();
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = "";
    }
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      release();
    };
  }, []);
  useEffect(() => {
    onActivity(active);
    return () => onActivity(false);
  }, [active, onActivity]);
  function discard() {
    release();
    setClip(null);
    setMetadata(null);
    setResult(null);
    setElapsed(0);
    setError("");
    setPhase("idle");
  }

  async function validate(next: Clip, token: number) {
    setPhase("validating");
    setError("");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const data = new FormData();
      data.append("audio", next.wav, "synthetic-recording.wav");
      data.append("capture_context", next.context);
      const checked = await api<Metadata>("/voice/validations", {
        method: "POST",
        body: data,
        signal: controller.signal,
      });
      if (!alive.current || generation.current !== token) return;
      setMetadata(checked);
      setPhase("ready");
    } catch (e) {
      if (alive.current && generation.current === token) {
        setError((e as Error).message + " Your typed sentence is unchanged.");
        setPhase("error");
      }
    }
  }

  async function start() {
    discard();
    if (!supported) {
      setError(
        "This browser cannot record here. Use a current browser on localhost/HTTPS, or type the sentence.",
      );
      setPhase("error");
      return;
    }
    const token = generation.current;
    setPhase("permission");
    try {
      const controller = new AbortController();
      abort.current = controller;
      const context = await api<{ capture_context: string }>("/voice/status", {
        signal: controller.signal,
      });
      if (!alive.current || generation.current !== token) return;
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (!alive.current || generation.current !== token) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const mime = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const recording = mime
        ? new MediaRecorder(media, { mimeType: mime })
        : new MediaRecorder(media);
      recorder.current = recording;
      const chunks: BlobPart[] = [];
      recording.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recording.onerror = () => {
        if (alive.current && generation.current === token) {
          release();
          setError(
            "Recording stopped unexpectedly. Try again or type the sentence.",
          );
          setPhase("error");
        }
      };
      recording.onstop = () => {
        if (!alive.current || generation.current !== token) return;
        stopTracks();
        setPhase("converting");
        void (async () => {
          try {
            const wav = await pcmWav(
              new Blob(chunks, { type: recording.mimeType }),
            );
            if (!alive.current || generation.current !== token) return;
            const url = URL.createObjectURL(wav);
            objectUrl.current = url;
            const next = {
              wav,
              url,
              capturedMime: recording.mimeType,
              duration: (wav.size - 44) / 32000,
              context: context.capture_context,
            };
            setClip(next);
            await validate(next, token);
          } catch (e) {
            if (alive.current && generation.current === token) {
              setError((e as Error).message);
              setPhase("error");
            }
          }
        })();
      };
      recording.start(250);
      setPhase("recording");
      const started = performance.now();
      timer.current = setInterval(
        () => setElapsed(Math.min(19, (performance.now() - started) / 1000)),
        100,
      );
      deadline.current = setTimeout(
        () => recording.state === "recording" && recording.stop(),
        19000,
      );
    } catch (e) {
      if (!alive.current || generation.current !== token) return;
      stopTracks();
      setError(
        (e as DOMException).name === "NotAllowedError"
          ? "Microphone permission was denied. Allow it in browser settings and retry, or type below."
          : e instanceof ApiError
            ? e.message
            : "No usable microphone was found. Connect one and retry, or type below.",
      );
      setPhase("error");
    }
  }

  async function transcribe() {
    if (!clip || !metadata || !providerAvailable) return;
    const token = generation.current;
    setError("");
    setPhase("transcribing");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const data = new FormData();
      data.append("audio", clip.wav, "synthetic-recording.wav");
      data.append("language_hint", language);
      data.append("capture_context", clip.context);
      const value = await api<Transcript>("/voice/transcriptions", {
        method: "POST",
        body: data,
        signal: controller.signal,
      });
      if (!alive.current || generation.current !== token) return;
      const current = await api<{ capture_context: string }>("/voice/status", {
        signal: controller.signal,
      });
      if (!alive.current || generation.current !== token) return;
      if (current.capture_context !== clip.context)
        throw new Error(
          "The shop session changed. Discard this recording and record again. Typed input is unchanged.",
        );
      if (
        typeof value.transcript !== "string" ||
        !value.transcript.trim() ||
        value.transcript.length > 500 ||
        !["LIVE_VENDOR", "FIXTURE", "MANUAL"].includes(value.source)
      )
        throw new Error("Invalid transcript response. Type or retry.");
      setResult(value);
      onTranscript(value);
      setPhase("ready");
    } catch (e) {
      if (!alive.current || generation.current !== token) return;
      setError(
        e instanceof ApiError && e.status === 0
          ? "Transcription response unavailable. The recording and typed sentence are retained. A deliberate retry may make another provider request."
          : (e as Error).message,
      );
      setPhase("error");
    }
  }
  return (
    <section className="voice-workflow" aria-label="Voice capture">
      <div className="voice-capture">
        <button
          type="button"
          className={`local-record-button primary ${phase === "recording" ? "recording" : ""}`}
          aria-label={phase === "recording" ? "Stop recording" : "Record voice"}
          onClick={() =>
            phase === "recording" ? recorder.current?.stop() : void start()
          }
          disabled={active && phase !== "recording"}
        >
          {phase === "recording" ? <Square /> : <Mic />}
          {phase === "recording" ? "Stop recording" : "Record voice"}
        </button>
        <div>
          <strong>
            {phase === "recording"
              ? `Recording · ${elapsed.toFixed(1)} / 19 seconds`
              : phase === "permission"
                ? "Waiting for microphone permission…"
                : "Speak, check, then confirm."}
          </strong>
          <span>
            {providerAvailable
              ? "Sarvam transcription enabled · synthetic speech only"
              : "Local recording available · cloud transcription unavailable"}
          </span>
        </div>
      </div>
      <p className="caption">
        Record invented customer details only. Changing customer or language
        discards the recording. Audio stays in memory; transcription requires
        your separate click.
      </p>
      <p className="caption" lang={locale.lang}>{locale.hint}</p>
      <div role="status" aria-live="polite" className="media-status">
        {phase === "converting"
          ? "Preparing PCM recording…"
          : phase === "validating"
            ? "Validating recording with the local server…"
            : phase === "transcribing"
              ? "Transcribing with the configured provider…"
              : metadata
                ? `Recording validated · ${metadata.duration_seconds.toFixed(1)} seconds · ${(metadata.size_bytes / 1024).toFixed(1)} KB`
                : !supported
                  ? "Recording unsupported here. Typed entry is available."
                  : ""}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {clip && (
        <>
          <p className="caption">Preview audio using Play below, or save the PCM WAV recording.</p>
          <audio
            ref={attachPlayer}
            controls
            preload="metadata"
            src={clip.url}
            aria-label="Preview synthetic recording"
          />
          <details className="media-details">
            <summary>Recording format and privacy</summary>
            <p>
              Captured {clip.capturedMime}; converted to mono, 16-bit PCM WAV at
              16 kHz. Local duration {clip.duration.toFixed(2)} seconds. No
              audio is saved by the server or in browser storage.
            </p>
          </details>
        </>
      )}
      <div className="button-row media-actions">
        {active && (
          <button type="button" className="secondary" onClick={discard}>
            <X size={15} />
            Cancel recording / request
          </button>
        )}
        {clip && !active && (
          <>
            <button type="button" className="secondary" onClick={discard}>
              Discard recording
            </button>
            <a
              className="secondary"
              href={clip.url}
              download="vishwas-synthetic.wav"
            >
              <Download size={15} />
              Save synthetic WAV
            </a>
            {!metadata ? (
              <button
                type="button"
                className="secondary"
                onClick={() => void validate(clip, generation.current)}
              >
                <RefreshCw size={15} />
                Validate recording
              </button>
            ) : providerAvailable ? (
              <button
                type="button"
                className="primary"
                onClick={() => void transcribe()}
              >
                Transcribe recording
              </button>
            ) : (
              <span className="caption">
                Transcription disabled until an authorized provider probe
                passes.
              </span>
            )}
          </>
        )}
      </div>
      {result && (
        <div className="notice transcript-provenance">
          {result.source === "LIVE_VENDOR"
            ? "Sarvam transcript · review required"
            : result.source === "FIXTURE"
              ? "Fixture transcript · test only"
              : "Manual transcript"}{" "}
          · detected language: {result.language_detected || "unknown"} ·{" "}
          {result.model || "no model claimed"}. Correct customer, amount and
          type below; nothing has been posted.
          {result.warnings?.filter((warning) => typeof warning === "string").map((warning, index) => (
            <p key={index}>{warning}</p>
          ))}
        </div>
      )}
    </section>
  );
}
