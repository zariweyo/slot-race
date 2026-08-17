import Phaser from 'phaser';
import { TRACK_CONFIG } from '../config';

export type TrackSample = {
  x: number;
  y: number;
  angle: number;
  curvature: number;
  outwardX: number;
  outwardY: number;
  inCurve: boolean;
};

export class OvalTrack {
  readonly totalLength: number;

  private readonly straightLength: number;
  private readonly arcLength: number;

  constructor(private readonly scene: Phaser.Scene) {
    this.straightLength = TRACK_CONFIG.halfStraight * 2;
    this.arcLength = Math.PI * TRACK_CONFIG.radius;
    this.totalLength = this.straightLength * 2 + this.arcLength * 2;
  }

  draw(): void {
    const { centerX, centerY, roadWidth } = TRACK_CONFIG;

    this.scene.add.rectangle(centerX, centerY, 1280, 720, 0x162018).setDepth(-20);

    const grass = this.scene.add.graphics().setDepth(-19);
    grass.fillStyle(0x1f5a31, 1);
    grass.fillRoundedRect(70, 65, 1140, 570, 36);
    grass.fillStyle(0x184626, 1);
    grass.fillRoundedRect(195, 150, 890, 400, 90);

    const shadow = this.scene.add.graphics().setDepth(-10);
    this.strokeTrack(shadow, 0, roadWidth + 18, 0x050607, 0.55);

    const road = this.scene.add.graphics().setDepth(-9);
    this.strokeTrack(road, 0, roadWidth, 0x30343a, 1);
    this.strokeTrack(road, 0, roadWidth - 8, 0x22262b, 1);

    this.drawKerbs(-roadWidth / 2 + 3);
    this.drawKerbs(roadWidth / 2 - 3);

    const rails = this.scene.add.graphics().setDepth(-6);
    rails.lineStyle(3, 0x0b0d10, 0.95);
    this.traceTrack(rails, -TRACK_CONFIG.laneSpacing / 2);
    rails.strokePath();
    this.traceTrack(rails, TRACK_CONFIG.laneSpacing / 2);
    rails.strokePath();

    const laneGlow = this.scene.add.graphics().setDepth(-7);
    laneGlow.lineStyle(1, 0x656b72, 0.35);
    this.traceTrack(laneGlow, -TRACK_CONFIG.laneSpacing / 2 - 4);
    laneGlow.strokePath();
    this.traceTrack(laneGlow, TRACK_CONFIG.laneSpacing / 2 - 4);
    laneGlow.strokePath();

    this.drawStartFinish();
    this.drawScenery();
  }

  sample(distance: number, lane = 0): TrackSample {
    const laneOffset = lane === 0 ? -TRACK_CONFIG.laneSpacing / 2 : TRACK_CONFIG.laneSpacing / 2;
    return this.sampleAtOffset(distance, laneOffset);
  }

  private sampleAtOffset(distance: number, offset: number): TrackSample {
    const { centerX: cx, centerY: cy, halfStraight: a, radius: r } = TRACK_CONFIG;
    const d = Phaser.Math.Wrap(distance, 0, this.totalLength);
    const effectiveRadius = r + offset;

    if (d < this.straightLength) {
      return {
        x: cx - a + d,
        y: cy - r - offset,
        angle: 0,
        curvature: 0,
        outwardX: 0,
        outwardY: -1,
        inCurve: false,
      };
    }

    if (d < this.straightLength + this.arcLength) {
      const local = d - this.straightLength;
      const theta = -Math.PI / 2 + local / r;
      return {
        x: cx + a + Math.cos(theta) * effectiveRadius,
        y: cy + Math.sin(theta) * effectiveRadius,
        angle: theta + Math.PI / 2,
        curvature: 1 / effectiveRadius,
        outwardX: Math.cos(theta),
        outwardY: Math.sin(theta),
        inCurve: true,
      };
    }

    if (d < this.straightLength * 2 + this.arcLength) {
      const local = d - this.straightLength - this.arcLength;
      return {
        x: cx + a - local,
        y: cy + r + offset,
        angle: Math.PI,
        curvature: 0,
        outwardX: 0,
        outwardY: 1,
        inCurve: false,
      };
    }

    const local = d - this.straightLength * 2 - this.arcLength;
    const theta = Math.PI / 2 + local / r;
    return {
      x: cx - a + Math.cos(theta) * effectiveRadius,
      y: cy + Math.sin(theta) * effectiveRadius,
      angle: theta + Math.PI / 2,
      curvature: 1 / effectiveRadius,
      outwardX: Math.cos(theta),
      outwardY: Math.sin(theta),
      inCurve: true,
    };
  }

  private strokeTrack(
    graphics: Phaser.GameObjects.Graphics,
    offset: number,
    width: number,
    color: number,
    alpha: number,
  ): void {
    graphics.lineStyle(width, color, alpha);
    this.traceTrack(graphics, offset);
    graphics.strokePath();
  }

  private traceTrack(graphics: Phaser.GameObjects.Graphics, offset: number): void {
    const { centerX: cx, centerY: cy, halfStraight: a, radius: r } = TRACK_CONFIG;
    const rr = r + offset;

    graphics.beginPath();
    graphics.moveTo(cx - a, cy - rr);
    graphics.lineTo(cx + a, cy - rr);
    graphics.arc(cx + a, cy, rr, -Math.PI / 2, Math.PI / 2, false);
    graphics.lineTo(cx - a, cy + rr);
    graphics.arc(cx - a, cy, rr, Math.PI / 2, Math.PI * 1.5, false);
    graphics.closePath();
  }

  private drawKerbs(offset: number): void {
    const step = 24;
    for (let d = 0, i = 0; d < this.totalLength; d += step, i += 1) {
      const sample = this.sampleAtOffset(d, offset);
      const tile = this.scene.add
        .rectangle(sample.x, sample.y, 15, 9, i % 2 === 0 ? 0xf4f4f4 : 0xd9272e)
        .setRotation(sample.angle)
        .setDepth(-5);
      tile.setAlpha(0.95);
    }
  }

  private drawStartFinish(): void {
    const startDistance = 70;
    const center = this.sampleAtOffset(startDistance, 0);
    const rows = 8;
    const cell = 8;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        const offset = (row - (rows - 1) / 2) * cell;
        const x = center.x;
        const y = center.y + offset;
        this.scene.add
          .rectangle(x + (col - 0.5) * cell, y, cell, cell, (row + col) % 2 === 0 ? 0xffffff : 0x111111)
          .setDepth(-3);
      }
    }
  }

  private drawScenery(): void {
    this.scene.add
      .text(TRACK_CONFIG.centerX, TRACK_CONFIG.centerY - 18, 'SLOT\nRACE', {
        align: 'center',
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '54px',
        color: '#f4f4f4',
        stroke: '#0e1711',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setAlpha(0.9)
      .setDepth(-12);

    this.scene.add
      .text(TRACK_CONFIG.centerX, TRACK_CONFIG.centerY + 78, 'LE MANS PROTOTYPE • TEST TRACK 01', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        color: '#b9c3ba',
        letterSpacing: 2,
      })
      .setOrigin(0.5)
      .setDepth(-12);
  }
}
