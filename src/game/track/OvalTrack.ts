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

    this.scene.add.rectangle(centerX, centerY, 1280, 720, 0x03050c).setDepth(-40);

    const ambience = this.scene.add.graphics().setDepth(-39).setBlendMode(Phaser.BlendModes.ADD);
    ambience.fillStyle(0x112a4f, 0.16);
    ambience.fillEllipse(centerX, centerY, 1180, 660);
    ambience.fillStyle(0x3a0f57, 0.14);
    ambience.fillEllipse(centerX, centerY + 20, 900, 500);
    ambience.fillStyle(0x091329, 0.95);
    ambience.fillEllipse(centerX, centerY, 720, 320);

    this.drawGrid();

    const outerGlow = this.scene.add.graphics().setDepth(-24).setBlendMode(Phaser.BlendModes.ADD);
    this.strokeTrack(outerGlow, 0, roadWidth + 58, 0x5b1cff, 0.07);
    this.strokeTrack(outerGlow, 0, roadWidth + 36, 0x00cfff, 0.1);

    const border = this.scene.add.graphics().setDepth(-23);
    this.strokeTrack(border, 0, roadWidth + 20, 0x0a1020, 1);
    this.strokeTrack(border, 0, roadWidth + 12, 0x17243e, 1);

    const edgeGlow = this.scene.add.graphics().setDepth(-22).setBlendMode(Phaser.BlendModes.ADD);
    this.strokeTrack(edgeGlow, 0, roadWidth + 10, 0x00eaff, 0.28);
    this.strokeTrack(edgeGlow, 0, roadWidth + 3, 0xff32e6, 0.16);

    const road = this.scene.add.graphics().setDepth(-20);
    this.strokeTrack(road, 0, roadWidth, 0x111827, 1);
    this.strokeTrack(road, 0, roadWidth - 10, 0x0a1020, 1);
    this.strokeTrack(road, 0, roadWidth - 25, 0x0c1425, 1);

    const innerSheen = this.scene.add.graphics().setDepth(-19).setBlendMode(Phaser.BlendModes.ADD);
    this.strokeTrack(innerSheen, 0, roadWidth - 34, 0x184d7a, 0.06);

    this.drawSlotRails();
    this.drawLaneGuides();
    this.drawDirectionArrows();
    this.drawEnergyPosts();
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

  private drawGrid(): void {
    const grid = this.scene.add.graphics().setDepth(-35);
    grid.lineStyle(1, 0x1b2c50, 0.18);
    for (let x = 0; x <= 1280; x += 48) grid.lineBetween(x, 0, x, 720);
    for (let y = 0; y <= 720; y += 48) grid.lineBetween(0, y, 1280, y);
  }

  private drawSlotRails(): void {
    const underglow = this.scene.add.graphics().setDepth(-15).setBlendMode(Phaser.BlendModes.ADD);
    underglow.lineStyle(8, 0x00eaff, 0.12);
    this.traceTrack(underglow, -TRACK_CONFIG.laneSpacing / 2);
    underglow.strokePath();
    underglow.lineStyle(8, 0xff2ee8, 0.09);
    this.traceTrack(underglow, TRACK_CONFIG.laneSpacing / 2);
    underglow.strokePath();

    const rails = this.scene.add.graphics().setDepth(-13);
    rails.lineStyle(4.5, 0x02050a, 1);
    this.traceTrack(rails, -TRACK_CONFIG.laneSpacing / 2);
    rails.strokePath();
    this.traceTrack(rails, TRACK_CONFIG.laneSpacing / 2);
    rails.strokePath();

    const metal = this.scene.add.graphics().setDepth(-12).setBlendMode(Phaser.BlendModes.ADD);
    metal.lineStyle(1.1, 0x8df8ff, 0.82);
    this.traceTrack(metal, -TRACK_CONFIG.laneSpacing / 2 - 2.2);
    metal.strokePath();
    this.traceTrack(metal, -TRACK_CONFIG.laneSpacing / 2 + 2.2);
    metal.strokePath();
    metal.lineStyle(1.1, 0xff73f1, 0.68);
    this.traceTrack(metal, TRACK_CONFIG.laneSpacing / 2 - 2.2);
    metal.strokePath();
    this.traceTrack(metal, TRACK_CONFIG.laneSpacing / 2 + 2.2);
    metal.strokePath();
  }

  private drawLaneGuides(): void {
    const guide = this.scene.add.graphics().setDepth(-14).setBlendMode(Phaser.BlendModes.ADD);
    guide.lineStyle(1.4, 0x55e8ff, 0.18);
    this.traceTrack(guide, -TRACK_CONFIG.laneSpacing / 2 - 12);
    guide.strokePath();
    guide.lineStyle(1.4, 0xff4fe7, 0.14);
    this.traceTrack(guide, TRACK_CONFIG.laneSpacing / 2 + 12);
    guide.strokePath();
  }

  private drawDirectionArrows(): void {
    const rightStart = this.straightLength + 54;
    const leftStart = this.straightLength * 2 + this.arcLength + 54;
    const step = (this.arcLength - 108) / 7;

    for (let i = 0; i < 8; i += 1) {
      this.addAnimatedArrow(rightStart + i * step, 0x00eaff, i * 105);
      this.addAnimatedArrow(leftStart + i * step, 0xff3de8, i * 105);
    }
  }

  private addAnimatedArrow(distance: number, color: number, delay: number): void {
    const sample = this.sampleAtOffset(distance, 0);
    const hex = `#${color.toString(16).padStart(6, '0')}`;

    const glow = this.scene.add
      .text(sample.x, sample.y, '>>>', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '24px',
        color: hex,
        letterSpacing: 2,
      })
      .setOrigin(0.5)
      .setRotation(sample.angle)
      .setAlpha(0.08)
      .setScale(1.5, 1.75)
      .setDepth(-11)
      .setBlendMode(Phaser.BlendModes.ADD);

    const arrow = this.scene.add
      .text(sample.x, sample.y, '>>>', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '18px',
        color: hex,
        letterSpacing: 2,
      })
      .setOrigin(0.5)
      .setRotation(sample.angle)
      .setAlpha(0.18)
      .setDepth(-10)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.scene.tweens.add({
      targets: [arrow, glow],
      alpha: { from: 0.12, to: 1 },
      duration: 150,
      yoyo: true,
      hold: 80,
      repeat: -1,
      repeatDelay: 720,
      delay,
      ease: 'Sine.easeOut',
    });
  }

  private drawEnergyPosts(): void {
    for (let d = 80; d < this.totalLength; d += 120) {
      const outer = this.sampleAtOffset(d, TRACK_CONFIG.roadWidth / 2 + 18);
      const inner = this.sampleAtOffset(d, -TRACK_CONFIG.roadWidth / 2 - 18);
      this.addPost(outer.x, outer.y, outer.angle, 0x00dfff);
      this.addPost(inner.x, inner.y, inner.angle, 0xff35df);
    }
  }

  private addPost(x: number, y: number, angle: number, color: number): void {
    const glow = this.scene.add.graphics().setDepth(-17).setBlendMode(Phaser.BlendModes.ADD);
    glow.fillStyle(color, 0.16);
    glow.fillCircle(x, y, 11);
    glow.fillStyle(color, 0.7);
    glow.fillCircle(x, y, 2.8);

    const tick = this.scene.add.rectangle(x, y, 11, 2, color, 0.8).setRotation(angle).setDepth(-16);
    tick.setBlendMode(Phaser.BlendModes.ADD);
  }

  private drawStartFinish(): void {
    const center = this.sampleAtOffset(70, 0);
    const beam = this.scene.add.graphics().setDepth(-8).setBlendMode(Phaser.BlendModes.ADD);
    beam.lineStyle(10, 0x00eaff, 0.08);
    beam.lineBetween(center.x, center.y - 67, center.x, center.y + 67);
    beam.lineStyle(2, 0xffffff, 0.95);
    beam.lineBetween(center.x, center.y - 67, center.x, center.y + 67);
  }

  private drawScenery(): void {
    this.scene.add
      .text(TRACK_CONFIG.centerX, TRACK_CONFIG.centerY - 15, 'PHOTON CIRCUIT', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '36px',
        color: '#dffcff',
        stroke: '#123a61',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setAlpha(0.72)
      .setDepth(-30)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.scene.add
      .text(TRACK_CONFIG.centerX, TRACK_CONFIG.centerY + 32, 'LIGHT SPEED TEST  //  01', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '12px',
        color: '#7ceeff',
        letterSpacing: 4,
      })
      .setOrigin(0.5)
      .setAlpha(0.6)
      .setDepth(-30);
  }
}
