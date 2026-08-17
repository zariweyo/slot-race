import Phaser from 'phaser';
import { CAR_PHYSICS, TRACK_CONFIG } from '../config';
import { OvalTrack, type TrackSample } from '../track/OvalTrack';

type TrailPoint = { x: number; y: number };

export class Car extends Phaser.GameObjects.Container {
  private distance = 110;
  private speed = 0;
  private crashed = false;
  private crashTimerMs = 0;
  private invulnerableMs = 0;
  private driftAmount = 0;
  private crashVx = 0;
  private crashVy = 0;
  private crashAngularVelocity = 0;
  private readonly trail: Phaser.GameObjects.Graphics;
  private readonly trailPoints: TrailPoint[] = [];
  private readonly bodyGlow: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly track: OvalTrack,
    private readonly lane = 0,
  ) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setDepth(20);

    this.trail = scene.add.graphics().setDepth(14).setBlendMode(Phaser.BlendModes.ADD);
    this.bodyGlow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.buildLeMansPrototype();
    this.placeOnTrack();
  }

  updateCar(deltaMs: number, throttle: boolean): void {
    const dt = Math.min(deltaMs / 1000, 0.05);

    if (this.crashed) {
      this.updateCrash(deltaMs, dt);
      this.updateTrail();
      return;
    }

    if (throttle) {
      this.speed += CAR_PHYSICS.acceleration * dt;
    } else {
      this.speed -= CAR_PHYSICS.coastDrag * dt;
    }

    this.speed = Phaser.Math.Clamp(this.speed, 0, CAR_PHYSICS.maxSpeed);
    this.distance = Phaser.Math.Wrap(this.distance + this.speed * dt, 0, this.track.totalLength);

    if (this.invulnerableMs > 0) {
      this.invulnerableMs = Math.max(0, this.invulnerableMs - deltaMs);
      this.alpha = Math.floor(this.invulnerableMs / 105) % 2 === 0 ? 0.32 : 1;
    } else {
      this.alpha = 1;
    }

    const sample = this.track.sample(this.distance, this.lane);
    const effectiveRadius = sample.curvature > 0 ? 1 / sample.curvature : TRACK_CONFIG.radius;
    const curveLimit = CAR_PHYSICS.curveBaseLimit * Math.sqrt(effectiveRadius / TRACK_CONFIG.radius);
    const speedRatio = sample.inCurve ? this.speed / curveLimit : 0;

    this.driftAmount = sample.inCurve
      ? Phaser.Math.Clamp(
          (speedRatio - CAR_PHYSICS.driftStartRatio) / (CAR_PHYSICS.offTrackRatio - CAR_PHYSICS.driftStartRatio),
          0,
          1,
        )
      : 0;

    const atAbsoluteLimit = this.speed >= CAR_PHYSICS.maxSpeed * CAR_PHYSICS.crashMinSpeedRatio;
    if (
      sample.inCurve &&
      throttle &&
      atAbsoluteLimit &&
      speedRatio > CAR_PHYSICS.offTrackRatio &&
      this.invulnerableMs <= 0
    ) {
      this.beginCrash(sample);
      this.updateTrail();
      return;
    }

    const lateralSlip = this.driftAmount * 25;
    const yaw = this.driftAmount * 0.48;
    this.setPosition(sample.x + sample.outwardX * lateralSlip, sample.y + sample.outwardY * lateralSlip);
    this.setRotation(sample.angle + yaw);

    this.updateGlow();
    this.updateTrail();
  }

  getDistance(): number {
    return this.distance;
  }

  getSpeed(): number {
    return this.speed;
  }

  isDrifting(): boolean {
    return this.driftAmount > 0.08 && !this.crashed;
  }

  isCrashed(): boolean {
    return this.crashed;
  }

  private beginCrash(sample: TrackSample): void {
    this.crashed = true;
    this.crashTimerMs = 0;
    this.driftAmount = 1;

    const tangentX = Math.cos(sample.angle);
    const tangentY = Math.sin(sample.angle);
    this.crashVx =
      tangentX * this.speed * CAR_PHYSICS.crashForwardRetention +
      sample.outwardX * CAR_PHYSICS.crashOutwardImpulse;
    this.crashVy =
      tangentY * this.speed * CAR_PHYSICS.crashForwardRetention +
      sample.outwardY * CAR_PHYSICS.crashOutwardImpulse;
    this.crashAngularVelocity = CAR_PHYSICS.crashSpin;

    this.setPosition(sample.x + sample.outwardX * 12, sample.y + sample.outwardY * 12);
    this.setRotation(sample.angle + 0.2);
  }

  private updateCrash(deltaMs: number, dt: number): void {
    this.crashTimerMs += deltaMs;

    const dragFactor = Math.pow(CAR_PHYSICS.crashGroundDrag, dt * 10);
    this.crashVx *= dragFactor;
    this.crashVy *= dragFactor;

    this.x += this.crashVx * dt;
    this.y += this.crashVy * dt;
    this.rotation += this.crashAngularVelocity * dt;
    this.crashAngularVelocity *= Math.pow(0.8, dt * 10);

    const t = Phaser.Math.Clamp(this.crashTimerMs / CAR_PHYSICS.respawnDelayMs, 0, 1);
    this.alpha = 1 - t * 0.25;
    this.updateGlow();

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
    const sample = this.track.sample(this.distance, this.lane);
    this.setPosition(sample.x, sample.y);
    this.setRotation(sample.angle);
    this.trailPoints.length = 0;
    this.updateGlow();
  }

  private updateGlow(): void {
    const ratio = Phaser.Math.Clamp(this.speed / CAR_PHYSICS.maxSpeed, 0, 1);
    this.bodyGlow.clear();
    if (ratio < 0.04) return;

    this.bodyGlow.fillStyle(0x00eaff, 0.06 + ratio * 0.12);
    this.bodyGlow.fillEllipse(-8, 0, 95 + ratio * 45, 48 + ratio * 16);
    this.bodyGlow.fillStyle(0x9b4dff, 0.035 + ratio * 0.08);
    this.bodyGlow.fillEllipse(-18, 0, 130 + ratio * 70, 62 + ratio * 20);
  }

  private updateTrail(): void {
    const ratio = Phaser.Math.Clamp(this.speed / CAR_PHYSICS.maxSpeed, 0, 1);
    const desiredPoints = Math.round(2 + ratio * 34);

    this.trailPoints.push({ x: this.x, y: this.y });
    while (this.trailPoints.length > desiredPoints) this.trailPoints.shift();

    this.trail.clear();
    if (this.trailPoints.length < 2 || ratio < 0.05) return;

    for (let i = 1; i < this.trailPoints.length; i += 1) {
      const a = this.trailPoints[i - 1];
      const b = this.trailPoints[i];
      const progress = i / (this.trailPoints.length - 1);
      const alpha = progress * progress * (0.06 + ratio * 0.34);
      const width = 2 + progress * (3 + ratio * 10);

      this.trail.lineStyle(width * 2.8, 0x7b2cff, alpha * 0.2);
      this.trail.beginPath();
      this.trail.moveTo(a.x, a.y);
      this.trail.lineTo(b.x, b.y);
      this.trail.strokePath();

      this.trail.lineStyle(width, 0x00eaff, alpha);
      this.trail.beginPath();
      this.trail.moveTo(a.x, a.y);
      this.trail.lineTo(b.x, b.y);
      this.trail.strokePath();
    }
  }

  private buildLeMansPrototype(): void {
    const shadow = this.scene.add.graphics();
    shadow.fillStyle(0x000000, 0.35);
    shadow.fillEllipse(4, 5, 66, 28);

    const wheels = this.scene.add.graphics();
    wheels.fillStyle(0x05070a, 1);
    wheels.fillRoundedRect(-24, -18, 17, 7, 2);
    wheels.fillRoundedRect(-24, 11, 17, 7, 2);
    wheels.fillRoundedRect(11, -17, 15, 6, 2);
    wheels.fillRoundedRect(11, 11, 15, 6, 2);

    const body = this.scene.add.graphics();
    body.fillStyle(0xeafcff, 1);
    body.beginPath();
    body.moveTo(36, 0);
    body.lineTo(25, -12);
    body.lineTo(7, -15);
    body.lineTo(-8, -13);
    body.lineTo(-26, -15);
    body.lineTo(-34, -10);
    body.lineTo(-34, 10);
    body.lineTo(-26, 15);
    body.lineTo(-8, 13);
    body.lineTo(7, 15);
    body.lineTo(25, 12);
    body.closePath();
    body.fillPath();

    body.fillStyle(0x00d9ff, 1);
    body.fillTriangle(36, 0, 13, -7, 13, 7);
    body.fillRoundedRect(-30, -2.6, 43, 5.2, 2);

    body.fillStyle(0x111827, 1);
    body.fillRoundedRect(-4, -8, 18, 16, 7);
    body.fillStyle(0x8cf7ff, 0.84);
    body.fillRoundedRect(2, -6, 9, 12, 4);

    body.fillStyle(0xff3df2, 1);
    body.fillCircle(25, -8, 3);
    body.fillCircle(25, 8, 3);

    body.fillStyle(0x0c1118, 1);
    body.fillRect(-36, -17, 6, 34);
    body.fillStyle(0x00eaff, 1);
    body.fillRect(-38, -14, 4, 28);

    const number = this.scene.add
      .text(-13, 0, '7', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '12px',
        color: '#08101a',
      })
      .setOrigin(0.5);

    this.add([this.bodyGlow, shadow, wheels, body, number]);
  }
}
