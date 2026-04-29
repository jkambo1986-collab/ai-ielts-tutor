/**
 * AudioWorkletProcessor that captures mic audio, converts to 16-bit PCM,
 * and posts each chunk back to the main thread along with a per-chunk RMS
 * energy reading (used for VAD-based inactivity detection and the live
 * mic-level meter).
 *
 * Loaded by the speaking engine hook via `audioContext.audioWorklet.addModule`.
 *
 * NOTE: This file is served as-is (no bundling). Keep it dependency-free.
 */

class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Accumulator so we emit ~4096-sample chunks regardless of the
    // browser's buffer size (typically 128 samples per process).
    this._buffer = new Float32Array(0);
    this._chunkSize = 2048;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channelData = input[0];
    if (!channelData) return true;

    // Append channelData to our running buffer
    const merged = new Float32Array(this._buffer.length + channelData.length);
    merged.set(this._buffer, 0);
    merged.set(channelData, this._buffer.length);
    this._buffer = merged;

    while (this._buffer.length >= this._chunkSize) {
      const chunk = this._buffer.slice(0, this._chunkSize);
      this._buffer = this._buffer.slice(this._chunkSize);

      // Compute RMS for VAD / mic meter
      let sumSq = 0;
      for (let i = 0; i < chunk.length; i++) {
        sumSq += chunk[i] * chunk[i];
      }
      const rms = Math.sqrt(sumSq / chunk.length);

      // Convert to 16-bit PCM
      const pcm = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      this.port.postMessage(
        { pcm: pcm.buffer, rms },
        [pcm.buffer],
      );
    }

    return true;
  }
}

registerProcessor('pcm-recorder', PCMRecorderProcessor);
