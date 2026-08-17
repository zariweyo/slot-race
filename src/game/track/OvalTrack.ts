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

    this.scene.add.rectangle(centerX, centerY, 1280, 720, 0x111713).setDepth(-30);

    const ground = this.scene.add.graphics().setDepth(-29);
    ground.fillStyle(0x274b31, 1);
    ground.fillRect(0, 0, 1280, 720);
    ground.fillStyle(0x31593a, 0.9);
    ground.fillEllipse(centerX, centerY, 1110, 610);
    ground.fillStyle(0x23452d, 1);
    ground.fillEllipse(centerX, centerY, 720, 330);

    const service = this.scene.add.graphics().setDepth(-18);
    this.strokeTrack(service, 0, roadWidth + 52, 0x6b7073, 0.42);
    this.strokeTrack(service, 0, roadWidth + 34, 0xb8b9b7, 0.22);

    const outerShadow = this.scene.add.graphics().setDepth(-17);
    this.strokeTrack(outerShadow, 0, roadWidth + 14, 0x000000, 0.38);

    const road = this.scene.add.graphics().setDepth(-16);
    this.strokeTrack(road, 0, roadWidth, 0x3a3d40, 1);
    this.strokeTrack(road, 0, roadWidth - 6, 0x2d3033, 1);
    this.strokeTrack(road, 0, roadWidth - 18, 0x292c2f, 1);

    const asphaltDetail = this.scene.add.graphics().setDepth(-15);
    asphaltDetail.lineStyle(1.5, 0x555b60, 0.14);
    this.traceTrack(asphaltDetail, -roadWidth * 0.26);
    asphaltDetail.strokePath();
    this.traceTrack(asphaltDetail, roadWidth * 0.26);
    asphaltDetail.strokePath();

    this.drawKerbs(-roadWidth / 2 + 1);
    this.drawKerbs(roadWidth / 2 - 1);
    this.drawRunoffMarkers();
    this.drawSlotRails();
    this.drawRubberMarks();
    this.drawStartFinish();
    this.drawBarriers();
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
      return { x: cx - a + d, y: cy - r - offset, angle: 0, curvature: 0, outwardX: 0, outwardY: -1, inCurve: false };
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
      return { x: cx + a - local, y: cy + r + offset, angle: Math.PI, curvature: 0, outwardX: 0, outwardY: 1, inCurve: false };
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

  private strokeTrack(graphics: Phaser.GameObjects.Graphics, offset: number, width: number, color: number, alpha: number): void {
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

  private drawSlotRails(): void {
    const rails = this.scene.add.graphics().setDepth(-10);
    rails.lineStyle(5, 0x111315, 0.95);
    this.traceTrack(rails, -TRACK_CONFIG.laneSpacing / 2);
    rails.strokePath();
    this.traceTrack(rails, TRACK_CONFIG.laneSpacing / 2);
    rails.strokePath();

    const metal = this.scene.add.graphics().setDepth(-9);
    metal.lineStyle(1.2, 0x9aa0a5, 0.72);
    this.traceTrack(metal, -TRACK_CONFIG.laneSpacing / 2 - 2.1);
    metal.strokePath();
    this.traceTrack(metal, -TRACK_CONFIG.laneSpacing / 2 + 2.1);
    metal.strokePath();
    this.traceTrack(metal, TRACK_CONFIG.laneSpacing / 2 - 2.1);
    metal.strokePath();
    this.traceTrack(metal, TRACK_CONFIG.laneSpacing / 2 + 2.1);
    metal.strokePath();
  }

  private drawKerbs(offset: number): void {
    const step = 20;
    for (let d = 0, i = 0; d < this.totalLength; d += step, i += 1) {
      const sample = this.sampleAtOffset(d, offset);
      this.scene.add
        .rectangle(sample.x, sample.y, 13, 5.5, i % 2 === 0 ? 0xf4f5f5 : 0xd72832)
        .setRotation(sample.angle)
        .setDepth(-8)
        .setAlpha(0.98);
    }
  }

  private drawRunoffMarkers(): void {
    const markers = this.scene.add.graphics().setDepth(-12);
    markers.lineStyle(2, 0xe7e8e8, 0.42);
    this.traceTrack(markers, -TRACK_CONFIG.roadWidth / 2 - 17);
    markers.strokePath();
    this.traceTrack(markers, TRACK_CONFIG.roadWidth / 2 + 17);
    markers.strokePath();
  }

  private drawRubberMarks(): void {
    const rubber = this.scene.add.graphics().setDepth(-11);
    rubber.lineStyle(7, 0x101214, 0.13);
    this.traceTrack(rubber, -TRACK_CONFIG.laneSpacing / 2 + 5);
    rubber.strokePath();
    rubber.lineStyle(5, 0x0b0c0d, 0.1);
    this.traceTrack(rubber, TRACK_CONFIG.laneSpacing / 2 - 5);
    rubber.strokePath();
  }

  private drawBarriers(): void {
    const barrier = this.scene.add.graphics().setDepth(-14);
    barrier.lineStyle(7, 0xd8dbdc, 0.72);
    this.traceTrack(barrier, -TRACK_CONFIG.roadWidth / 2 - 36);
    barrier.strokePath();
    this.traceTrack(barrier, TRACK_CONFIG.roadWidth / 2 + 36);
    barrier.strokePath();

    const barrierShadow = this.scene.add.graphics().setDepth(-15);
    barrierShadow.lineStyle(11, 0x080a0b, 0.26);
    this.traceTrack(barrierShadow, -TRACK_CONFIG.roadWidth / 2 - 39);
    barrierShadow.strokePath();
    this.traceTrack(barrierShadow, TRACK_CONFIG.roadWidth / 2 + 39);
    barrierShadow.strokePath();
  }

  private drawStartFinish(): void {
    const center = this.sampleAtOffset(70, 0);
    const cell = 7;
    const rows = 18;
    const cols = 2;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        this.scene.add
          .rectangle(center.x + (col - 0.5) * cell, center.y + (row - (rows - 1) / 2) * cell, cell, cell, (row + col) % 2 === 0 ? 0xf2f2f2 : 0x111111)
          .setDepth(-5);
      }
    }
  }

  private drawScenery(): void {
    this.scene.add
      .text(TRACK_CONFIG.centerX, TRACK_CONFIG.centerY - 12, 'SLOT RACE', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '42px',
        color: '#eef0ef',
        stroke: '#17311f',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setAlpha(0.82)
      .setDepth(-20);

    this.scene.add
      .text(TRACK_CONFIG.centerX, TRACK_CONFIG.centerY + 40, 'TEST CIRCUIT 01', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        color: '#b9c3ba',
        letterSpacing: 4,
      })
      .setOrigin(0.5)
      .setDepth(-20);

    const pit = this.scene.add.graphics().setDepth(-21);
    pit.fillStyle(0x1b2320, 0.82);
    pit.fillRoundedRect(TRACK_CONFIG.centerX - 125, TRACK_CONFIG.centerY + 88, 250, 54, 10);
    pit.lineStyle(2, 0x5b6761, 0.7);
    pit.strokeRoundedRect(TRACK_CONFIG.centerX - 125, TRACK_CONFIG.centerY + 88, 250, 54, 10);
  }
}
