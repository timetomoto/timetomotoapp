// ---------------------------------------------------------------------------
// Crash Detector — accelerometer-based crash pattern recognition
// ---------------------------------------------------------------------------
//
// Pattern: G-spike > 4G  →  2+ seconds of near-zero movement (phone at rest)
// This distinguishes a crash (sudden stop + stationary) from hard braking
// (high G but continued movement) or bumps (high G then movement continues).
//
// At rest, the accelerometer reads ~1G (gravity). A "still" reading is
// defined as |magnitude - 1.0| < STILL_THRESHOLD.
// ---------------------------------------------------------------------------

import { Accelerometer } from 'expo-sensors';

const IMPACT_G        = 4.0;   // G — minimum spike to arm detector
const STILL_THRESHOLD = 0.30;  // deviation from 1G considered "stationary"
const CONFIRM_MS      = 2000;  // ms of stillness required to confirm crash
const RESET_MS        = 5000;  // ms after impact with no stillness → reset

export class CrashDetector {
  private sub: ReturnType<typeof Accelerometer.addListener> | null = null;
  private phase: 'idle' | 'impact' | 'confirming' = 'idle';
  private impactAt  = 0;
  private stillFrom = 0;

  constructor(private readonly onCrash: () => void) {}

  start() {
    if (this.sub) return;
    Accelerometer.setUpdateInterval(100); // 10 Hz
    this.reset();
    this.sub = Accelerometer.addListener(({ x, y, z }) => {
      this.tick(Math.sqrt(x * x + y * y + z * z));
    });
  }

  stop() {
    this.sub?.remove();
    this.sub = null;
    this.reset();
  }

  private reset() {
    this.phase    = 'idle';
    this.impactAt = 0;
    this.stillFrom = 0;
  }

  private tick(g: number) {
    const now    = Date.now();
    const isStill = Math.abs(g - 1.0) < STILL_THRESHOLD;

    if (this.phase === 'idle') {
      if (g > IMPACT_G) {
        this.phase    = 'impact';
        this.impactAt = now;
      }

    } else if (this.phase === 'impact') {
      if (isStill) {
        this.phase     = 'confirming';
        this.stillFrom = now;
      } else if (g > IMPACT_G) {
        // Re-arm on stronger spike
        this.impactAt = now;
      } else if (now - this.impactAt > RESET_MS) {
        // Continued movement after impact — not a crash
        this.reset();
      }

    } else if (this.phase === 'confirming') {
      if (!isStill) {
        // Movement resumed — false alarm
        this.reset();
      } else if (now - this.stillFrom >= CONFIRM_MS) {
        // Confirmed: impact + sustained stillness
        this.reset();
        this.onCrash();
      }
    }
  }
}
