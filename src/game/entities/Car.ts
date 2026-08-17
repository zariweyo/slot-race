import Phaser from 'phaser';
import { CAR_PHYSICS, TRACK_CONFIG } from '../config';
import { OvalTrack, type TrackSample } from '../track/OvalTrack';

export class Car extends Phaser.GameObjects.Container {
  private distance = 110;
  private speed = 0;
  private crashed = false;
  private crashTimerMs = 0;
  private invulnerableMs = 0;
  private crashSample: TrackSample | null = null;
  private driftAmount = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly track: OvalTrack,
    private readonly lane = 0,
  ) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setDepth(20);
    this.buildLeMansPrototype();
    this.placeOnTrack();
  }

  updateCar(deltaMs: number, throttle: boolean): void {
    const dt = Math.min(deltaMs / 1000, 0.05);

    if (this.crashed) {
      this.updateCrash(deltaMs);
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
      this.alpha = Math.floor(this.invulnerableMs / 105) % 2 === 0 ? 0.28 : 1;
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

    if (sample.inCurve && speedRatio > CAR_PHYSICS.offTrackRatio && this.invulnerableMs <= 0) {
      this.beginCrash(sample);
      return;
    }

    const slide = this.driftAmount * 14;
    this.setPosition(sample.x + sample.outwardX * slide, sample.y + sample.outwardY * slide);
    this.setRotation(sample.angle - this.driftAmount * 0.22);
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
    this.crashSample = sample;
    this.driftAmount = 1;
  }

  private updateCrash(deltaMs: number): void {
    if (!this.crashSample) return;

    this.crashTimerMs += deltaMs;
    const t = Phaser.Math.Clamp(this.crashTimerMs / CAR_PHYSICS.respawnDelayMs, 0, 1);
    const eased = Phaser.Math.Easing.Quadratic.Out(t);
    const sample = this.crashSample;

    this.setPosition(
      sample.x + sample.outwardX * 125 * eased,
      sample.y + sample.outwardY * 125 * eased,
    );
    this.setRotation(sample.angle + eased * 2.6);
    this.alpha = 1 - eased * 0.45;

    if (t >= 1) {
      this.crashed = false;
      this.crashSample = null;
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
  }

  private buildLeMansPrototype(): void {
    const shadow = this.scene.add.graphics();
    shadow.fillStyle(0x000000, 0.35);
    shadow.fillEllipse(2, 4, 63, 30);

    const wheels = this.scene.add.graphics();
    wheels.fillStyle(0x090a0b, 1);
    wheels.fillRoundedRect(-22, -19, 17, 8, 2);
    wheels.fillRoundedRect(-22, 11, 17, 8, 2);
    wheels.fillRoundedRect(10, -18, 16, 7, 2);
    wheels.fillRoundedRect(10, 11, 16, 7, 2);

    const body = this.scene.add.graphics();
    body.fillStyle(0xeaecef, 1);
    body.beginPath();
    body.moveTo(35, 0);
    body.lineTo(24, -13);
    body.lineTo(5, -16);
    body.lineTo(-8, -14);
    body.lineTo(-25, -16);
    body.lineTo(-32, -11);
    body.lineTo(-32, 11);
    body.lineTo(-25, 16);
    body.lineTo(-8, 14);
    body.lineTo(5, 16);
    body.lineTo(24, 13);
    body.closePath();
    body.fillPath();

    body.fillStyle(0xd7232a, 1);
    body.fillTriangle(35, 0, 14, -7, 14, 7);
    body.fillRect(-29, -3, 43, 6);

    body.fillStyle(0x1d252c, 1);
    body.fillRoundedRect(-5, -9, 17, 18, 7);
    body.fillStyle(0x77a9bd, 0.8);
    body.fillRoundedRect(1, -7, 8, 14, 4);

    body.fillStyle(0xf3c84b, 1);
    body.fillCircle(25, -8, 3.2);
    body.fillCircle(25, 8, 3.2);

    body.fillStyle(0x151719, 1);
    body.fillRect(-34, -18, 6, 36);
    body.fillStyle(0xeaecef, 1);
    body.fillRect(-36, -15, 4, 30);

    const number = this.scene.add
      .text(-13, 0, '7', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '12px',
        color: '#111318',
      })
      .setOrigin(0.5);

    this.add([shadow, wheels, body, number]);
  }
}
