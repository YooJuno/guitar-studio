let context: AudioContext | null = null;
let voices: OscillatorNode[] = [];
export function stopNotes() {
  voices.forEach(v => { try { v.stop(); } catch { /* already ended */ } }); voices = [];
}
export async function playNotes(frequencies: number[], sequential = false, interval = 0.35) {
  if (!context || context.state === 'closed') context = new AudioContext();
  await context.resume(); stopNotes();
  frequencies.forEach((frequency, i) => {
    const osc = context!.createOscillator(); const gain = context!.createGain();
    const start = context!.currentTime + 0.02 + (sequential ? i * interval : i * 0.025);
    osc.type = 'triangle'; osc.frequency.value = frequency;
    const volume = sequential ? 0.18 : 0.22 / Math.sqrt(frequencies.length);
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + (sequential ? interval * 0.95 : 1.4));
    osc.connect(gain); gain.connect(context!.destination); osc.start(start); osc.stop(start + (sequential ? interval : 1.5));
    voices.push(osc);
  });
}
