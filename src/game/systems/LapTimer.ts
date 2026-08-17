export class LapTimer {
  private lapStartedAt = 0;
  private previousDistance = 0;
  private lapsCompleted = 0;
  private lastLapMs: number | null = null;
  private bestLapMs: number | null = null;

  start(now: number, initialDistance: number): void {
    this.lapStartedAt = now;
    this.previousDistance = initialDistance;
  }

  update(now: number, distance: number, trackLength: number): void {
    const crossedStart = this.previousDistance > trackLength * 0.82 && distance < trackLength * 0.18;

    if (crossedStart) {
      const lapMs = now - this.lapStartedAt;
      if (lapMs > 1000) {
        this.lapsCompleted += 1;
        this.lastLapMs = lapMs;
        this.bestLapMs = this.bestLapMs === null ? lapMs : Math.min(this.bestLapMs, lapMs);
        this.lapStartedAt = now;
      }
    }

    this.previousDistance = distance;
  }

  getLapNumber(): number {
    return this.lapsCompleted + 1;
  }

  getCurrentLapMs(now: number): number {
    return Math.max(0, now - this.lapStartedAt);
  }

  getLastLapMs(): number | null {
    return this.lastLapMs;
  }

  getBestLapMs(): number | null {
    return this.bestLapMs;
  }

  static format(ms: number | null): string {
    if (ms === null) return '--.---';
    return (ms / 1000).toFixed(3);
  }
}
