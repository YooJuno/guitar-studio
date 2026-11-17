/** Browser-independent pitch detectors. No audio leaves the current device. */
export interface PitchEstimate { frequency: number; confidence: number }
export interface StringEstimate extends PitchEstimate { cents: number }

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const centsBetween = (frequency: number, target: number) => 1200 * Math.log2(frequency / target);

function signalLevel(samples: Float32Array): { mean: number; rms: number } {
  let sum = 0;
  let squares = 0;
  for (const value of samples) {
    if (!Number.isFinite(value)) return { mean: 0, rms: 0 };
    sum += value;
    squares += value * value;
  }
  const mean = sum / samples.length;
  return { mean, rms: Math.sqrt(Math.max(0, squares / samples.length - mean * mean)) };
}

/**
 * YIN cumulative mean normalized difference with parabolic lag interpolation.
 * Box averaging before decimation limits cost and suppresses high-frequency aliases.
 * The confidence is periodicity, not a calibrated accuracy guarantee.
 */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  minHz = 24,
  maxHz = 1400,
): PitchEstimate | null {
  if (samples.length < 256 || !(sampleRate > 0) || !(minHz > 0) || !(maxHz > minHz)) return null;
  const recent = samples.subarray(Math.max(0, samples.length - 16384));
  const { mean, rms } = signalLevel(recent);
  if (rms < 0.002) return null;
  const stride = Math.max(1, Math.floor(sampleRate / 8000));
  const rate = sampleRate / stride;
  const count = Math.floor(recent.length / stride);
  const values = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let j = 0; j < stride; j++) sum += recent[i * stride + j] - mean;
    values[i] = sum / stride;
  }
  const minLag = Math.max(2, Math.floor(rate / maxHz));
  const maxLag = Math.min(Math.ceil(rate / minHz), Math.floor(count / 2) - 1);
  if (maxLag <= minLag) return null;
  const window = count - maxLag;
  const normalized = new Float64Array(maxLag + 1);
  normalized[0] = 1;
  let cumulative = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let difference = 0;
    for (let i = 0; i < window; i++) {
      const delta = values[i] - values[i + lag];
      difference += delta * delta;
    }
    cumulative += difference;
    normalized[lag] = cumulative > 0 ? difference * lag / cumulative : 1;
  }
  let bestLag = -1;
  for (let lag = minLag; lag < maxLag; lag++) {
    if (normalized[lag] < 0.15) {
      while (lag + 1 <= maxLag && normalized[lag + 1] < normalized[lag]) lag++;
      bestLag = lag;
      break;
    }
  }
  if (bestLag < 0) {
    for (let lag = minLag + 1; lag < maxLag; lag++) {
      if (normalized[lag] < normalized[lag - 1] && normalized[lag] <= normalized[lag + 1]
        && (bestLag < 0 || normalized[lag] < normalized[bestLag])) bestLag = lag;
    }
  }
  if (bestLag < 0 || normalized[bestLag] > 0.25) return null;
  let interpolated = bestLag;
  if (bestLag > 0 && bestLag < maxLag) {
    const left = normalized[bestLag - 1];
    const middle = normalized[bestLag];
    const right = normalized[bestLag + 1];
    const denominator = 2 * (left - 2 * middle + right);
    if (Math.abs(denominator) > 1e-12) interpolated += clamp((left - right) / denominator, -0.5, 0.5);
  }
  // Refine around the selected period at the original sample rate. This avoids
  // low-rate parabolic bias becoming audible cents error on high guitar notes.
  const approximatePeriod = interpolated * stride;
  const centerLag = Math.round(approximatePeriod);
  const startLag = Math.max(2, centerLag - stride - 1);
  const endLag = Math.min(recent.length - 32, centerLag + stride + 1);
  const fineWindow = recent.length - endLag;
  const fine = new Float64Array(endLag - startLag + 1);
  let minimum = 0;
  for (let lag = startLag; lag <= endLag; lag++) {
    let difference = 0;
    for (let i = 0; i < fineWindow; i++) {
      const delta = recent[i] - recent[i + lag];
      difference += delta * delta;
    }
    fine[lag - startLag] = difference;
    if (difference < fine[minimum]) minimum = lag - startLag;
  }
  let finalPeriod = startLag + minimum;
  if (minimum > 0 && minimum < fine.length - 1) {
    const denominator = 2 * (fine[minimum - 1] - 2 * fine[minimum] + fine[minimum + 1]);
    if (Math.abs(denominator) > 1e-12) finalPeriod += clamp((fine[minimum - 1] - fine[minimum + 1]) / denominator, -0.5, 0.5);
  }
  const frequency = sampleRate / finalPeriod;
  if (frequency < minHz || frequency > maxHz) return null;
  const residual = fine[minimum] / Math.max(1e-12, 2 * fineWindow * rms * rms);
  return { frequency, confidence: clamp(1 - Math.min(normalized[bestLag], residual), 0, 1) };
}

interface SpectralPeak { frequency: number; amplitude: number }

/** Hann-windowed radix-2 FFT with interpolated log-magnitude peaks. */
function spectralPeaks(samples: Float32Array, sampleRate: number): SpectralPeak[] {
  let size = 1;
  while (size * 2 <= Math.min(samples.length, 32768)) size *= 2;
  if (size < 2048) return [];
  const values = samples.subarray(samples.length - size);
  const { mean, rms } = signalLevel(values);
  if (rms < 0.002) return [];
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  for (let i = 0; i < size; i++) real[i] = (values[i] - mean) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) { const swap = real[i]; real[i] = real[j]; real[j] = swap; }
  }
  for (let length = 2; length <= size; length *= 2) {
    const theta = -2 * Math.PI / length;
    const cosine = Math.cos(theta);
    const sine = Math.sin(theta);
    for (let start = 0; start < size; start += length) {
      let wr = 1;
      let wi = 0;
      for (let j = 0; j < length / 2; j++) {
        const even = start + j;
        const odd = even + length / 2;
        const tr = wr * real[odd] - wi * imaginary[odd];
        const ti = wr * imaginary[odd] + wi * real[odd];
        real[odd] = real[even] - tr;
        imaginary[odd] = imaginary[even] - ti;
        real[even] += tr;
        imaginary[even] += ti;
        const next = wr * cosine - wi * sine;
        wi = wr * sine + wi * cosine;
        wr = next;
      }
    }
  }
  const magnitude = new Float64Array(size / 2);
  let maximum = 0;
  for (let i = 1; i < magnitude.length; i++) {
    magnitude[i] = Math.hypot(real[i], imaginary[i]) * 4 / size;
    maximum = Math.max(maximum, magnitude[i]);
  }
  // Broadband noise creates thousands of accidental local maxima. Reject it
  // before associating peaks with open strings; a tonal frame concentrates energy.
  if (maximum < rms * 0.12) return [];
  const peaks: SpectralPeak[] = [];
  const binHz = sampleRate / size;
  const floor = Math.max(0.00012, maximum * 0.003);
  for (let bin = 2; bin < magnitude.length - 1; bin++) {
    if (magnitude[bin] < floor || magnitude[bin] <= magnitude[bin - 1] || magnitude[bin] <= magnitude[bin + 1]) continue;
    const left = Math.log(Math.max(1e-12, magnitude[bin - 1]));
    const center = Math.log(magnitude[bin]);
    const right = Math.log(Math.max(1e-12, magnitude[bin + 1]));
    const denominator = left - 2 * center + right;
    const offset = Math.abs(denominator) > 1e-12 ? clamp(0.5 * (left - right) / denominator, -0.5, 0.5) : 0;
    peaks.push({ frequency: (bin + offset) * binHz, amplitude: Math.exp(center - 0.25 * (left - right) * offset) });
  }
  return peaks;
}

/**
 * Experimental tuning-aware polyphonic detector, independently implemented from
 * harmonic salience principles. It searches only ±85 cents around each open string.
 * Fundamental evidence is required; shared lower-string harmonics are discounted.
 * It is intentionally conservative about absent strings and overlapping octaves.
 */
export function detectPolyphonic(
  samples: Float32Array,
  sampleRate: number,
  targets: number[],
): Array<StringEstimate | null> {
  const empty = () => targets.map(() => null);
  if (!(sampleRate > 0) || targets.length === 0 || samples.length < 2048) return empty();
  const peaks = spectralPeaks(samples, sampleRate);
  if (!peaks.length) return empty();
  const maximum = Math.max(...peaks.map(peak => peak.amplitude));
  const candidates: Array<{ result: StringEstimate; amplitude: number; harmonics: number } | null> = targets.map(target => {
    if (!(target > 0) || !Number.isFinite(target)) return null;
    const possible = peaks.filter(peak => Math.abs(centsBetween(peak.frequency, target)) <= 85 && peak.amplitude >= maximum * 0.012);
    let best: { result: StringEstimate; amplitude: number; harmonics: number; score: number } | null = null;
    for (const fundamental of possible) {
      let weightedFrequency = fundamental.frequency * fundamental.amplitude;
      let weight = fundamental.amplitude;
      let score = fundamental.amplitude;
      let harmonics = 0;
      for (let harmonic = 2; harmonic <= 7; harmonic++) {
        const expected = fundamental.frequency * harmonic;
        // Limit tolerance to a few cents plus FFT resolution, avoiding neighbouring notes.
        const tolerance = Math.max(sampleRate / 32768 * 1.3, expected * 0.0035);
        let partial: SpectralPeak | undefined;
        for (const peak of peaks) {
          if (Math.abs(peak.frequency - expected) <= tolerance && (!partial || peak.amplitude > partial.amplitude)) partial = peak;
        }
        if (!partial || partial.amplitude < maximum * 0.006) continue;
        harmonics++;
        const partialWeight = partial.amplitude / Math.sqrt(harmonic);
        weightedFrequency += partial.frequency / harmonic * partialWeight;
        weight += partialWeight;
        score += partialWeight;
      }
      const frequency = weightedFrequency / weight;
      const confidence = clamp(0.5 + Math.min(0.25, harmonics * 0.065) + Math.min(0.24, fundamental.amplitude / maximum * 0.5), 0, 0.99);
      if (!best || score > best.score) best = { result: { frequency, cents: centsBetween(frequency, target), confidence }, amplitude: fundamental.amplitude, harmonics, score };
    }
    return best;
  });
  // A low E's fourth partial is also a high E. A partial alone must not be
  // presented as proof of another physical string. When a collision is present,
  // require more amplitude than a conservative lower-string harmonic envelope.
  return candidates.map((candidate, index) => {
    if (!candidate) return null;
    let sharedEvidence = 0;
    for (let lowerIndex = 0; lowerIndex < targets.length; lowerIndex++) {
      const lower = candidates[lowerIndex];
      if (!lower || targets[lowerIndex] >= targets[index]) continue;
      const ratio = candidate.result.frequency / lower.result.frequency;
      const harmonic = Math.round(ratio);
      if (harmonic < 2 || harmonic > 8 || Math.abs(centsBetween(ratio, harmonic)) > 10) continue;
      sharedEvidence += lower.amplitude / harmonic * 1.6;
    }
    if (sharedEvidence > 0 && candidate.amplitude < sharedEvidence * 1.1) return null;
    return { ...candidate.result, confidence: sharedEvidence > 0 ? Math.min(candidate.result.confidence, 0.76) : candidate.result.confidence };
  });
}
