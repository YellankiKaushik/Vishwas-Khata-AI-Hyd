import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";

/** Scope this component to one current snapshot. Navigation unmounts and aborts it. */
export function BriefingAudio({
  briefingId,
  enabled,
}: {
  briefingId: string;
  enabled: boolean;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const objectUrl = useRef("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const attachAudio = useCallback((node: HTMLAudioElement | null) => {
    if (!node && audio.current) {
      audio.current.pause();
      audio.current.removeAttribute("src");
      audio.current.load();
    }
    audio.current = node;
  }, []);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
      audio.current?.pause();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );
  async function prepare() {
    if (!enabled) {
      setError(
        "Live narration is not individually verified for this language. The four text sections remain available.",
      );
      return;
    }
    const token = ++generation.current;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/v1/briefings/speech", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefing_id: briefingId }),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(25000)]),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(
          payload.error?.message ||
            "Speech unavailable. Read the text briefing.",
        );
      }
      if (!response.headers.get("content-type")?.startsWith("audio/wav"))
        throw new Error("Invalid speech format. Read the text briefing.");
      const blob = await response.blob();
      if (generation.current !== token) return;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob);
      setUrl(objectUrl.current);
    } catch (e) {
      if (generation.current === token)
        setError(
          (e as Error).name === "AbortError"
            ? "Speech request stopped. Text remains available."
            : (e as Error).message,
        );
    } finally {
      if (generation.current === token) setBusy(false);
    }
  }
  return (
    <div className="briefing-audio">
      <button
        className="secondary"
        disabled={busy || !briefingId}
        onClick={() => void prepare()}
      >
        <Volume2 size={17} />
        {busy
          ? "Preparing approved audio…"
          : enabled
            ? "Listen to briefing"
            : "Audio unavailable · details"}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {url && (
        <>
          <p className="caption" role="status">
            Audio ready. Use Play to listen; the visible text remains
            authoritative.
          </p>
          <audio
            ref={attachAudio}
            controls
            preload="metadata"
            src={url}
            aria-label="Approved daily briefing audio"
            onError={() =>
              setError(
                "Audio playback failed. Read the visible briefing or check the output device.",
              )
            }
          />
          <button
            className="text-button"
            onClick={() => {
              if (!audio.current) return;
              audio.current.currentTime = 0;
              void audio.current
                .play()
                .catch(() =>
                  setError(
                    "Playback needs permission or an output device. Use the audio controls or read the text.",
                  ),
                );
            }}
          >
            Replay approved audio
          </button>
        </>
      )}
    </div>
  );
}
