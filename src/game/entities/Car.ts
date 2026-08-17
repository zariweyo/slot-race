import Phaser from 'phaser';
import { CAR_PHYSICS, TRACK_CONFIG } from '../config';
import { OvalTrack, type TrackSample } from '../track/OvalTrack';

export class Car extends Phaser.GameObjects.Container {
  private distance = 110;
  private speed = 0;
  private crashed = false;
  private crashTimerMs = 0;
  private invulnerableMs = 0;
  private crashVx = 0;
  private crashVy = 0;
  private crashAngularVelocity = 0;
  private readonly tail: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, private readonly track: OvalTrack, private readonly lane = 0) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setDepth(20);
    this.tail = scene.add.graphics().setDepth(14).setBlendMode(Phaser.BlendModes.ADD);
    this.buildPhoton();
    this.placeOnTrack();
  }

  updateCar(deltaMs: number, throttle: boolean): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    if (this.crashed) { this.updateCrash(deltaMs, dt); this.drawTail(); return; }
    this.speed += (throttle ? CAR_PHYSICS.acceleration : -CAR_PHYSICS.coastDrag) * dt;
    this.speed = Phaser.Math.Clamp(this.speed, 0, CAR_PHYSICS.maxSpeed);
    this.distance = Phaser.Math.Wrap(this.distance + this.speed * dt, 0, this.track.totalLength);

    if (this.invulnerableMs > 0) {
      this.invulnerableMs = Math.max(0, this.invulnerableMs - deltaMs);
      this.alpha = Math.floor(this.invulnerableMs / 105) % 2 === 0 ? 0.32 : 1;
    } else this.alpha = 1;

    const sample = this.track.sample(this.distance, this.lane);
    const effectiveRadius = sample.curvature > 0 ? 1 / sample.curvature : TRACK_CONFIG.radius;
    const curveLimit = CAR_PHYSICS.curveBaseLimit * Math.sqrt(effectiveRadius / TRACK_CONFIG.radius);
    const speedRatio = sample.inCurve ? this.speed / curveLimit : 0;
    const atAbsoluteLimit = this.speed >= CAR_PHYSICS.maxSpeed * CAR_PHYSICS.crashMinSpeedRatio;

    if (sample.inCurve && throttle && atAbsoluteLimit && speedRatio > CAR_PHYSICS.offTrackRatio && this.invulnerableMs <= 0) {
      this.beginCrash(sample); this.drawTail(); return;
    }

    this.setPosition(sample.x, sample.y);
    this.setRotation(sample.angle);
    this.drawTail();
  }

  getDistance(): number { return this.distance; }
  getSpeed(): number { return this.speed; }
  isDrifting(): boolean { return false; }
  isCrashed(): boolean { return this.crashed; }

  private beginCrash(sample: TrackSample): void {
    this.crashed = true;
    this.crashTimerMs = 0;
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
    const sample = this.track.sample(this.distance, this.lane);
    this.setPosition(sample.x, sample.y);
    this.setRotation(sample.angle);
    this.drawTail();
  }

  private drawTail(): void {
    this.tail.clear();
    if (this.crashed) return;
    const ratio = Phaser.Math.Clamp(this.speed / CAR_PHYSICS.maxSpeed, 0, 1);
    if (ratio < 0.03) return;
    const tailLength = 14 + ratio * 210;
    const segments = Math.round(8 + ratio * 28);
    for (let i = segments; i > 0; i -= 1) {
      const t0 = i / segments;
      const t1 = (i - 1) / segments;
      const a = this.track.sample(this.distance - tailLength * t0, this.lane);
      const b = this.track.sample(this.distance - tailLength * t1, this.lane);
      const progress = 1 - t0;
      const alpha = 0.035 + progress * progress * (0.18 + ratio * 0.5);
      const width = 1.5 + progress * (2.5 + ratio * 8);
      this.tail.lineStyle(width * 3.2, 0x00bfff, alpha * 0.14);
      this.tail.beginPath(); this.tail.moveTo(a.x, a.y); this.tail.lineTo(b.x, b.y); this.tail.strokePath();
      this.tail.lineStyle(width, 0x54f7ff, alpha);
      this.tail.beginPath(); this.tail.moveTo(a.x, a.y); this.tail.lineTo(b.x, b.y); this.tail.strokePath();
    }
  }

  private buildPhoton(): void {
    const outerGlow = this.scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    outerGlow.fillStyle(0x00d9ff, 0.12);
    outerGlow.fillEllipse(-5, 0, 78, 38);
    outerGlow.fillStyle(0x6af7ff, 0.18);
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
