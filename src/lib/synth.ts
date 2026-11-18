import { claimAudioSession } from "./audio-session";

let context: AudioContext | null = null;
let voices: OscillatorNode[] = [];
let generation = 0;
let releaseSession: (() => void) | null = null;
export function stopNotes() {
  generation++;
  const release = releaseSession;
  releaseSession = null;
  release?.();
  const stopping = voices;
  voices = [];
  stopping.forEach((v) => {
    try {
      v.stop();
    } catch {
      /* already ended */
    }
  });
}
export async function playNotes(
  frequencies: number[],
  sequential = false,
  interval = 0.35,
) {
  stopNotes();
  const token = generation;
  const release = claimAudioSession("playback");
  releaseSession = release;
  try {
    if (!context || context.state === "closed") context = new AudioContext();
    await context.resume();
    if (token !== generation) return;
    const notes = frequencies.filter(
      (frequency) => Number.isFinite(frequency) && frequency > 0,
    );
    if (!notes.length) {
      stopNotes();
      return;
    }
    notes.forEach((frequency, i) => {
      const osc = context!.createOscillator();
      const gain = context!.createGain();
      const start =
        context!.currentTime + 0.02 + (sequential ? i * interval : i * 0.025);
      osc.type = "triangle";
      osc.frequency.value = frequency;
      const volume = sequential ? 0.18 : 0.22 / Math.sqrt(notes.length);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        start + (sequential ? interval * 0.95 : 1.4),
      );
      osc.connect(gain);
      gain.connect(context!.destination);
      osc.onended = () => {
        const index = voices.indexOf(osc);
        if (index >= 0) voices.splice(index, 1);
        osc.disconnect();
        gain.disconnect();
        if (token === generation && voices.length === 0) {
          if (releaseSession === release) releaseSession = null;
          release();
        }
      };
      osc.start(start);
      osc.stop(start + (sequential ? interval : 1.5));
      voices.push(osc);
    });
  } catch (error) {
    if (token === generation) stopNotes();
    throw error;
  }
}
