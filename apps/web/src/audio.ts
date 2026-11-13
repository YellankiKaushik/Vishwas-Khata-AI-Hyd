// Browser codec → mono 16kHz PCM WAV. The server independently validates bytes and duration.
export async function pcmWav(blob: Blob): Promise<Blob> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (
      !Number.isFinite(decoded.duration) ||
      decoded.duration <= 0 ||
      decoded.duration > 20
    )
      throw new Error(
        "Recording is longer than 20 seconds. Please try a shorter sentence.",
      );
    const offline = new OfflineAudioContext(
      1,
      Math.ceil(decoded.duration * 16000),
      16000,
    );
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const buffer = await offline.startRendering();
    return encodePcm16(buffer.getChannelData(0), 16000);
  } finally {
    await context.close();
  }
}

export function encodePcm16(samples: Float32Array, sampleRate = 16000): Blob {
  if (
    !Number.isInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 48000 ||
    !samples.length ||
    samples.length / sampleRate > 20
  )
    throw new Error("Invalid PCM recording length or sample rate.");
  const bytes = new ArrayBuffer(44 + samples.length * 2),
    view = new DataView(bytes);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++)
      view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Number.isFinite(samples[i])
      ? Math.max(-1, Math.min(1, samples[i]))
      : 0;
    view.setInt16(
      44 + i * 2,
      sample < 0 ? sample * 32768 : sample * 32767,
      true,
    );
  }
  return new Blob([bytes], { type: "audio/wav" });
}
