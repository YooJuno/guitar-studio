import type { PitchEstimate } from "./pitch";

export interface TrackedPitch extends PitchEstimate {
  /** A held result is historical evidence, never a current in-tune indication. */
  held: boolean;
  ageMs: number;
}
export interface PitchTrackerOptions {
  holdMs?: number;
  attackConfidence?: number;
  sustainConfidence?: number;
  minimumLevel?: number;
}

/** Confidence hysteresis and logarithmic smoothing, independent of browser/audio APIs. */
export class PitchTracker {
  private last: PitchEstimate | null = null;
  private lastValidAt = -Infinity;
  private lastFrameAt = -Infinity;
  private noiseFloor = 0.00005;
  private pending: PitchEstimate | null = null;
  private readonly holdMs: number;
  private readonly attackConfidence: number;
  private readonly sustainConfidence: number;
  private readonly minimumLevel: number;

  constructor(options: PitchTrackerOptions = {}) {
    this.holdMs = options.holdMs ?? 720;
    this.attackConfidence = options.attackConfidence ?? 0.9;
    this.sustainConfidence = options.sustainConfidence ?? 0.8;
    this.minimumLevel = options.minimumLevel ?? 0.00012;
  }

  reset(): void {
    this.last = null;
    this.pending = null;
    this.lastValidAt = -Infinity;
    this.lastFrameAt = -Infinity;
    this.noiseFloor = 0.00005;
  }

  update(
    estimate: PitchEstimate | null,
    nowMs: number,
    level: number,
  ): TrackedPitch | null {
    if (!Number.isFinite(nowMs)) return null;
    const elapsed = Math.max(1, Math.min(250, nowMs - this.lastFrameAt));
    this.lastFrameAt = nowMs;
    const age = nowMs - this.lastValidAt;
    const usable =
      estimate &&
      Number.isFinite(estimate.frequency) &&
      estimate.frequency > 0 &&
      Number.isFinite(estimate.confidence);
    const distance =
      usable && this.last
        ? Math.abs(1200 * Math.log2(estimate.frequency / this.last.frequency))
        : Infinity;
    const continuing = !!this.last && age <= this.holdMs && distance < 65;
    const threshold = continuing
      ? this.sustainConfidence
      : this.attackConfidence;
    // A quiet periodic tail can continue below the acquisition threshold. If it
    // sits inside an observed noise floor, demand stronger periodic evidence.
    const required =
      level < this.noiseFloor * 1.25 ? Math.max(threshold, 0.96) : threshold;
    const accepted =
      usable &&
      Number.isFinite(level) &&
      level >= this.minimumLevel &&
      estimate.confidence >= required;
    if (accepted) {
      const jump = !!this.last && distance > 90;
      // Strong new notes replace the prior note immediately. Weaker jumps need
      // a second matching frame so a single noisy estimate does not move it.
      if (
        jump &&
        estimate.confidence < 0.94 &&
        !(
          this.pending &&
          Math.abs(
            1200 * Math.log2(estimate.frequency / this.pending.frequency),
          ) < 35
        )
      ) {
        this.pending = estimate;
      } else {
        const smooth = this.last && continuing;
        const alpha =
          1 - Math.exp(-elapsed / (estimate.confidence >= 0.95 ? 65 : 110));
        const frequency = smooth
          ? Math.exp(
              Math.log(this.last!.frequency) +
                alpha * Math.log(estimate.frequency / this.last!.frequency),
            )
          : estimate.frequency;
        this.last = { frequency, confidence: estimate.confidence };
        this.lastValidAt = nowMs;
        this.pending = null;
        return { ...this.last, held: false, ageMs: 0 };
      }
    } else {
      this.pending = null;
      if (!this.last || age > this.holdMs) {
        const finiteLevel = Number.isFinite(level) ? Math.max(0, level) : 0;
        const speed = finiteLevel < this.noiseFloor ? 0.3 : 0.08;
        this.noiseFloor +=
          speed * (Math.min(0.02, finiteLevel) - this.noiseFloor);
      }
    }
    if (!this.last || age > this.holdMs) {
      this.last = null;
      return null;
    }
    return {
      ...this.last,
      confidence: this.last.confidence * Math.exp(-age / 1000),
      held: true,
      ageMs: Math.max(0, age),
    };
  }
}
