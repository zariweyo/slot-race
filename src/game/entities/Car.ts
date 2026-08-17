import Phaser from 'phaser';
import { CAR_PHYSICS, TRACK_CONFIG } from '../config';
import { OvalTrack, type TrackSample } from '../track/OvalTrack';

const FIXED_STEP_MS = 1000 / 120;

export class Car extends Phaser.GameObjects.Container {
  private distance = 110;
  private previousDistance = 110;
  private renderDistance = 110;
  private accumulatorMs = 0;
  private speed = 0;
  private crashed = false;
  private crashTimerMs = 0;
  private invulnerableMs = 0;
  private crashVx = 0;
  private crashVy = 0;
  private crashAngularVelocity = 0;
  private readonly trail: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, private readonly track: OvalTrack, private readonly lane = 0) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setDepth(20);
    this.trail = scene.add.graphics().setDepth(14).setBlendMode(Phaser.BlendModes.ADD);
    this.buildPhoton();
    this.placeOnTrack();
  }

  updateCar(deltaMs: number, throttle: boolean): void {
    const clampedDelta = Math.min(deltaMs, 50);

    if (this.crashed) {
      this.updateCrash(clampedDelta, clampedDelta / 1000);
      this.drawTrail();
      return;
    }

    this.accumulatorMs += clampedDelta;
    while (this.accumulatorMs >= FIXED_STEP_MS) {
      this.fixedStep(FIXED_STEP_MS / 1000, throttle);
      this.accumulatorMs -= FIXED_STEP_MS;
      if (this.crashed) break;
    }

    if (this.crashed) {
      this.drawTrail();
      return;
    }

    const alpha = this.accumulatorMs / FIXED_STEP_MS;
    this.renderDistance = this.interpolateWrappedDistance(this.previousDistance, this.distance, alpha);
    const sample = this.track.sample(this.renderDistance, this.lane);
    this.setPosition(sample.x, sample.y);
    this.setRotation(sample.angle);
    this.drawTrail();
  }

  getDistance(): number { return this.distance; }
  getSpeed(): number { return this.speed; }
  isDrifting(): boolean { return false; }
  isCrashed(): boolean { return this.crashed; }

  private fixedStep(dt: number, throttle: boolean): void {
    this.previousDistance = this.distance;
    this.speed += (throttle ? CAR_PHYSICS.acceleration : -CAR_PHYSICS.coastDrag) * dt;
    this.speed = Phaser.Math.Clamp(this.speed, 0, CAR_PHYSICS.maxSpeed);
    this.distance = Phaser.Math.Wrap(this.distance + this.speed * dt, 0, this.track.totalLength);

    if (this.invulnerableMs > 0) {
      this.invulnerableMs = Math.max(0, this.invulnerableMs - FIXED_STEP_MS);
      this.alpha = Math.floor(this.invulnerableMs / 105) % 2 === 0 ? 0.32 : 1;
    } else {
      this.alpha = 1;
    }

    const sample = this.track.sample(this.distance, this.lane);
    const effectiveRadius = sample.curvature > 0 ? 1 / sample.curvature : TRACK_CONFIG.radius;
    const curveLimit = CAR_PHYSICS.curveBaseLimit * Math.sqrt(effectiveRadius / TRACK_CONFIG.radius);
    const speedRatio = sample.inCurve ? this.speed / curveLimit : 0;
    const atAbsoluteLimit = this.speed >= CAR_PHYSICS.maxSpeed * CAR_PHYSICS.crashMinSpeedRatio;

    if (
      sample.inCurve &&
      throttle &&
      atAbsoluteLimit &&
      speedRatio > CAR_PHYSICS.offTrackRatio &&
      this.invulnerableMs <= 0
    ) {
      this.beginCrash(sample);
    }
  }

  private interpolateWrappedDistance(from: number, to: number, alpha: number): number {
    const length = this.track.totalLength;
    let delta = to - from;
    if (delta > length / 2) delta -= length;
    if (delta < -length / 2) delta += length;
    return Phaser.Math.Wrap(from + delta * alpha, 0, length);
  }

  private beginCrash(sample: TrackSample): void {
    this.crashed = true;
    this.crashTimerMs = 0;
    this.accumulatorMs = 0;
    this.renderDistance = this.distance;
    const tangentX = Math.cos(sample.angle);
    const tangentY = Math.sin(sample.angle);
    this.crashVx = tangentX * this.speed * CAR_PHYSICS.crashForwardRetention + sample.outwardX * CAR_PHYSICS.crashOutwardImpulse;
    this.crashVy = tangentY * this.speed * CAR_PHYSICS.crashForwardRetention + sample.outwardY * CAR_PHYSICS.crashOutwardImpulse;
    this.crashAngularVelocity = CAR_PHYSICS.crashSpin;
    this.setPosition(sample.x, sample.y);
    this.setRotation(sample.angle);
  }

  private updateCrash(deltaMs: number, dt: number): void {
    this.crashTimerMs += deltaMs;
    const dragFactor = Math.pow(CAR_PHYSICS.crashGroundDrag, dt * 10);
    this.crashVx *= dragFactor;
    this.crashVy *= dragFactor;
    this.x += this.crashVx * dt;
    this.y += this.crashVy * dt;
    this.rotation += this.crashAngularVelocity * dt;
    this.crashAngularVelocity *= Math.pow(0.82, dt * 10);

    const t = Phaser.Math.Clamp(this.crashTimerMs / CAR_PHYSICS.respawnDelayMs, 0, 1);
    this.alpha = 1 - t * 0.24;
    if (t >= 1) {
      this.crashed = false;
      this.crashTimerMs = 0;
      this.speed = CAR_PHYSICS.respawnSpeed;
      this.invulnerableMs = CAR_PHYSICS.respawnBlinkMs;
      this.alpha = 1;
      this.placeOnTrack();
    }
  }

  private placeOnTrack(): void {
    this.previousDistance = this.distance;
    this.renderDistance = this.distance;
    this.accumulatorMs = 0;
    const sample = this.track.sample(this.renderDistance, this.lane);
    this.setPosition(sample.x, sample.y);
    this.setRotation(sample.angle);
    this.drawTrail();
  }

  private drawTrail(): void {
    this.trail.clear();
    if (this.crashed) return;

    const ratio = Phaser.Math.Clamp(this.speed / CAR_PHYSICS.maxSpeed, 0, 1);
    if (ratio < 0.025) return;

    const trailLength = 28 + ratio * 360;
    const segments = 22;
    const points: Phaser.Geom.Point[] = [];

    for (let i = segments; i >= 0; i -= 1) {
      const t = i / segments;
      const sample = this.track.sample(this.renderDistance - trailLength * t, this.lane);
      points.push(new Phaser.Geom.Point(sample.x, sample.y));
    }

    this.trail.lineStyle(22 + ratio * 20, 0x008cff, 0.08 + ratio * 0.08);
    this.tracePoints(points);
    this.trail.lineStyle(10 + ratio * 9, 0x00dfff, 0.18 + ratio * 0.2);
    this.tracePoints(points);
    this.trail.lineStyle(3 + ratio * 4, 0xb8ffff, 0.48 + ratio * 0.38);
    this.tracePoints(points);

    const rear = points.slice(0, Math.ceil(points.length * 0.48));
    this.trail.lineStyle(16 + ratio * 10, 0x214dff, 0.07 + ratio * 0.08);
    this.tracePoints(rear);
  }

  private tracePoints(points: Phaser.Geom.Point[]): void {
    if (points.length < 2) return;
    this.trail.beginPath();
    this.trail.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) this.trail.lineTo(points[i].x, points[i].y);
    this.trail.strokePath();
  }

  private buildPhoton(): void {
    const outerGlow = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    outerGlow.fillStyle(0x00d9ff, 0.13);
    outerGlow.fillEllipse(-5, 0, 78, 38);
    outerGlow.fillStyle(0x6af7ff, 0.2);
    outerGlow.fillEllipse(2, 0, 54, 24);

    const photon = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const outerShape = [
      new Phaser.Geom.Point(36, 0), new Phaser.Geom.Point(22, -8), new Phaser.Geom.Point(5, -13),
      new Phaser.Geom.Point(-12, -12), new Phaser.Geom.Point(-27, -6), new Phaser.Geom.Point(-34, 0),
      new Phaser.Geom.Point(-27, 6), new Phaser.Geom.Point(-12, 12), new Phaser.Geom.Point(5, 13), new Phaser.Geom.Point(22, 8),
    ];
    photon.fillStyle(0x8ffbff, 0.96);
    photon.fillPoints(outerShape, true, true);

    const coreShape = [
      new Phaser.Geom.Point(31, 0), new Phaser.Geom.Point(16, -4.5), new Phaser.Geom.Point(-2, -6),
      new Phaser.Geom.Point(-20, 0), new Phaser.Geom.Point(-2, 6), new Phaser.Geom.Point(16, 4.5),
    ];
    photon.fillStyle(0xffffff, 0.98);
    photon.fillPoints(coreShape, true, true);
    photon.fillStyle(0x1ecfff, 0.82);
    photon.fillCircle(-12, 0, 4.5);
    this.add([outerGlow, photon]);
  }
}
