import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { Car } from '../entities/Car';
import { LapTimer } from '../systems/LapTimer';
import { OvalTrack } from '../track/OvalTrack';

export class GameScene extends Phaser.Scene {
  private track!: OvalTrack;
  private car!: Car;
  private lapTimer = new LapTimer();
  private throttlePointer = false;
  private spaceKey?: Phaser.Input.Keyboard.Key;

  private lapText!: Phaser.GameObjects.Text;
  private currentText!: Phaser.GameObjects.Text;
  private lastText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private throttleButton!: Phaser.GameObjects.Container;

  constructor() {
    super('game');
  }

  create(): void {
    this.track = new OvalTrack(this);
    this.track.draw();

    this.car = new Car(this, this.track, 0);
    this.lapTimer.start(this.time.now, this.car.getDistance());

    this.createHud();
    this.createThrottleButton();

    this.spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.on('pointerup', () => {
      this.throttlePointer = false;
      this.setThrottleVisual(false);
    });
    this.input.on('gameout', () => {
      this.throttlePointer = false;
      this.setThrottleVisual(false);
    });
  }

  update(_time: number, delta: number): void {
    const throttle = this.throttlePointer || this.spaceKey?.isDown === true;
    this.car.updateCar(delta, throttle);

    const now = this.time.now;
    this.lapTimer.update(now, this.car.getDistance(), this.track.totalLength);
    this.refreshHud(now);

    if (!this.throttlePointer) {
      this.setThrottleVisual(this.spaceKey?.isDown === true);
    }
  }

  private createHud(): void {
    const panel = this.add.rectangle(28, 25, 405, 104, 0x090c0f, 0.84).setOrigin(0).setDepth(40);
    panel.setStrokeStyle(1, 0x697078, 0.55);

    this.lapText = this.add.text(48, 40, 'LAP 1', this.hudStyle(22, '#ffffff')).setDepth(41);
    this.currentText = this.add.text(48, 75, 'CURRENT 0.000', this.hudStyle(18, '#eef1f4')).setDepth(41);
    this.lastText = this.add.text(222, 42, 'LAST --.---', this.hudStyle(14, '#aeb5bf')).setDepth(41);
    this.bestText = this.add.text(222, 72, 'BEST --.---', this.hudStyle(14, '#f3c84b')).setDepth(41);

    this.speedText = this.add
      .text(GAME_WIDTH - 44, 38, '000', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '48px',
        color: '#ffffff',
        stroke: '#0b0d10',
        strokeThickness: 6,
      })
      .setOrigin(1, 0)
      .setDepth(41);

    this.add.text(GAME_WIDTH - 47, 91, 'KM/H', this.hudStyle(13, '#b8bec7')).setOrigin(1, 0).setDepth(41);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, 67, '', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '27px',
        color: '#ffdb55',
        stroke: '#101216',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(50);

    this.add
      .text(38, GAME_HEIGHT - 37, 'SPACE / HOLD BUTTON TO ACCELERATE', this.hudStyle(13, '#aeb5bf'))
      .setOrigin(0, 1)
      .setDepth(41);
  }

  private createThrottleButton(): void {
    const x = GAME_WIDTH - 155;
    const y = GAME_HEIGHT - 115;
    const shadow = this.add.ellipse(4, 8, 214, 106, 0x000000, 0.38);
    const face = this.add.ellipse(0, 0, 214, 106, 0xd5242b, 1);
    face.setStrokeStyle(7, 0x711116, 1);
    const highlight = this.add.ellipse(-20, -20, 120, 28, 0xff6970, 0.42);
    const label = this.add
      .text(0, -3, 'ACCELERATE', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
        stroke: '#6b0d12',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const hint = this.add.text(0, 25, 'HOLD', this.hudStyle(12, '#ffd9da')).setOrigin(0.5);

    this.throttleButton = this.add.container(x, y, [shadow, face, highlight, label, hint]).setDepth(60);
    this.throttleButton.setSize(220, 116).setInteractive({ useHandCursor: true });
    this.throttleButton.on('pointerdown', () => {
      this.throttlePointer = true;
      this.setThrottleVisual(true);
    });
    this.throttleButton.on('pointerout', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) {
        this.throttlePointer = false;
        this.setThrottleVisual(false);
      }
    });
  }

  private refreshHud(now: number): void {
    this.lapText.setText(`LAP ${this.lapTimer.getLapNumber()}`);
    this.currentText.setText(`CURRENT ${LapTimer.format(this.lapTimer.getCurrentLapMs(now))}`);
    this.lastText.setText(`LAST ${LapTimer.format(this.lapTimer.getLastLapMs())}`);
    this.bestText.setText(`BEST ${LapTimer.format(this.lapTimer.getBestLapMs())}`);

    const displaySpeed = Math.round(this.car.getSpeed() * 0.72);
    this.speedText.setText(displaySpeed.toString().padStart(3, '0'));

    if (this.car.isCrashed()) {
      this.statusText.setText('OFF TRACK');
    } else if (this.car.isDrifting()) {
      this.statusText.setText('DRIFT');
    } else {
      this.statusText.setText('');
    }
  }

  private setThrottleVisual(active: boolean): void {
    if (!this.throttleButton) return;
    this.throttleButton.setScale(active ? 0.94 : 1);
    this.throttleButton.setAlpha(active ? 0.92 : 1);
  }

  private hudStyle(size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: 'Arial, sans-serif',
      fontSize: `${size}px`,
      color,
    };
  }
}
