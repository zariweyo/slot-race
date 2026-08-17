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
    const panelGlow = this.add.rectangle(26, 23, 410, 108, 0x00dfff, 0.06).setOrigin(0).setDepth(39);
    panelGlow.setStrokeStyle(5, 0x00dfff, 0.08);

    const panel = this.add.rectangle(28, 25, 405, 104, 0x050914, 0.88).setOrigin(0).setDepth(40);
    panel.setStrokeStyle(1, 0x22dfff, 0.62);

    this.lapText = this.add.text(48, 40, 'LAP 1', this.hudStyle(22, '#dffcff')).setDepth(41);
    this.currentText = this.add.text(48, 75, 'CURRENT 0.000', this.hudStyle(18, '#73f3ff')).setDepth(41);
    this.lastText = this.add.text(222, 42, 'LAST --.---', this.hudStyle(14, '#8a9bb5')).setDepth(41);
    this.bestText = this.add.text(222, 72, 'BEST --.---', this.hudStyle(14, '#ff62eb')).setDepth(41);

    this.speedText = this.add
      .text(GAME_WIDTH - 44, 38, '000', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '50px',
        color: '#e8fdff',
        stroke: '#073649',
        strokeThickness: 7,
      })
      .setOrigin(1, 0)
      .setDepth(41)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.add.text(GAME_WIDTH - 47, 93, 'KM/H', this.hudStyle(13, '#76edff')).setOrigin(1, 0).setDepth(41);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, 67, '', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '29px',
        color: '#ff45e9',
        stroke: '#290728',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(50)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.add
      .text(38, GAME_HEIGHT - 37, 'HOLD TO PUSH THE LIMIT', this.hudStyle(13, '#77ddeb'))
      .setOrigin(0, 1)
      .setDepth(41);
  }

  private createThrottleButton(): void {
    const x = GAME_WIDTH - 155;
    const y = GAME_HEIGHT - 115;

    const aura = this.add.ellipse(0, 0, 238, 126, 0x00dfff, 0.12).setBlendMode(Phaser.BlendModes.ADD);
    const outer = this.add.ellipse(0, 0, 216, 108, 0x06111f, 0.98);
    outer.setStrokeStyle(6, 0x00dfff, 0.76);
    const inner = this.add.ellipse(0, 0, 194, 88, 0x0b1930, 1);
    inner.setStrokeStyle(2, 0xff3be8, 0.72);
    const highlight = this.add.ellipse(-28, -20, 110, 24, 0x72f5ff, 0.18);
    const label = this.add
      .text(0, -3, 'THROTTLE', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '22px',
        color: '#eaffff',
        stroke: '#06445a',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    const hint = this.add.text(0, 25, 'HOLD', this.hudStyle(12, '#ff72eb')).setOrigin(0.5);

    this.throttleButton = this.add.container(x, y, [aura, outer, inner, highlight, label, hint]).setDepth(60);
    this.throttleButton.setSize(230, 120).setInteractive({ useHandCursor: true });
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

    const displaySpeed = Math.round(this.car.getSpeed() * 0.78);
    this.speedText.setText(displaySpeed.toString().padStart(3, '0'));

    if (this.car.isCrashed()) {
      this.statusText.setText('LIMIT BROKEN');
    } else if (this.car.isDrifting()) {
      this.statusText.setText('DRIFT');
    } else {
      this.statusText.setText('');
    }
  }

  private setThrottleVisual(active: boolean): void {
    if (!this.throttleButton) return;
    this.throttleButton.setScale(active ? 0.92 : 1);
    this.throttleButton.setAlpha(active ? 1 : 0.9);
  }

  private hudStyle(size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: 'Arial, sans-serif',
      fontSize: `${size}px`,
      color,
    };
  }
}
