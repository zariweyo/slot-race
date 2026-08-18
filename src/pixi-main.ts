import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import './style.css';

const WIDTH = 1280;
const HEIGHT = 720;
const TRACK = {
  centerX: WIDTH / 2,
  centerY: 350,
  halfStraight: 300,
  radius: 185,
  laneSpacing: 42,
  roadWidth: 138,
};

const PHYSICS = {
  acceleration: 285,
  coastDrag: 68,
  maxSpeed: 920,
};

const app = new Application();
await app.init({
  width: WIDTH,
  height: HEIGHT,
  background: '#03050c',
  antialias: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});

document.querySelector('#app')?.appendChild(app.canvas);
app.canvas.style.width = '100%';
app.canvas.style.height = '100%';
app.canvas.style.objectFit = 'contain';
app.canvas.style.touchAction = 'none';

const straightLength = TRACK.halfStraight * 2;
const arcLength = Math.PI * TRACK.radius;
const totalLength = straightLength * 2 + arcLength * 2;

function wrapDistance(value: number): number {
  return ((value % totalLength) + totalLength) % totalLength;
}

function sample(distance: number, lane = 0) {
  const d = wrapDistance(distance);
  const offset = lane === 0 ? -TRACK.laneSpacing / 2 : TRACK.laneSpacing / 2;
  const cx = TRACK.centerX;
  const cy = TRACK.centerY;
  const a = TRACK.halfStraight;
  const r = TRACK.radius;
  const rr = r + offset;

  if (d < straightLength) {
    return { x: cx - a + d, y: cy - r - offset, angle: 0 };
  }
  if (d < straightLength + arcLength) {
    const theta = -Math.PI / 2 + (d - straightLength) / r;
    return { x: cx + a + Math.cos(theta) * rr, y: cy + Math.sin(theta) * rr, angle: theta + Math.PI / 2 };
  }
  if (d < straightLength * 2 + arcLength) {
    const local = d - straightLength - arcLength;
    return { x: cx + a - local, y: cy + r + offset, angle: Math.PI };
  }
  const theta = Math.PI / 2 + (d - straightLength * 2 - arcLength) / r;
  return { x: cx - a + Math.cos(theta) * rr, y: cy + Math.sin(theta) * rr, angle: theta + Math.PI / 2 };
}

function drawTrack(): void {
  const g = new Graphics();
  app.stage.addChild(g);

  g.rect(0, 0, WIDTH, HEIGHT).fill({ color: 0x03050c });
  for (let x = 0; x <= WIDTH; x += 48) g.moveTo(x, 0).lineTo(x, HEIGHT);
  for (let y = 0; y <= HEIGHT; y += 48) g.moveTo(0, y).lineTo(WIDTH, y);
  g.stroke({ width: 1, color: 0x1b2c50, alpha: 0.16 });

  const path = (offset: number) => {
    const rr = TRACK.radius + offset;
    g.moveTo(TRACK.centerX - TRACK.halfStraight, TRACK.centerY - rr);
    g.lineTo(TRACK.centerX + TRACK.halfStraight, TRACK.centerY - rr);
    g.arc(TRACK.centerX + TRACK.halfStraight, TRACK.centerY, rr, -Math.PI / 2, Math.PI / 2);
    g.lineTo(TRACK.centerX - TRACK.halfStraight, TRACK.centerY + rr);
    g.arc(TRACK.centerX - TRACK.halfStraight, TRACK.centerY, rr, Math.PI / 2, Math.PI * 1.5);
    g.closePath();
  };

  path(0);
  g.stroke({ width: TRACK.roadWidth + 26, color: 0x10182a, alpha: 1 });
  path(0);
  g.stroke({ width: TRACK.roadWidth, color: 0x0a1020, alpha: 1 });
  path(0);
  g.stroke({ width: TRACK.roadWidth - 26, color: 0x111827, alpha: 1 });

  path(-TRACK.laneSpacing / 2);
  path(TRACK.laneSpacing / 2);
  g.stroke({ width: 5, color: 0x02050a, alpha: 1 });

  path(-TRACK.laneSpacing / 2);
  g.stroke({ width: 1.5, color: 0x8df8ff, alpha: 0.9 });
  path(TRACK.laneSpacing / 2);
  g.stroke({ width: 1.5, color: 0xff73f1, alpha: 0.8 });

  const title = new Text({ text: 'PIXEL VELOCITY // PIXIJS', style: new TextStyle({ fill: '#bffcff', fontSize: 30, fontFamily: 'Arial', fontWeight: '700' }) });
  title.anchor.set(0.5);
  title.position.set(TRACK.centerX, TRACK.centerY - 8);
  title.alpha = 0.62;
  app.stage.addChild(title);
}

drawTrack();

const trail = new Graphics();
app.stage.addChild(trail);

const photon = new Container();
const photonGlow = new Graphics();
photonGlow.ellipse(-4, 0, 42, 21).fill({ color: 0x00dfff, alpha: 0.16 });
const photonShape = new Graphics();
photonShape.poly([
  38, 0, 22, -8, 5, -13, -12, -12, -28, -6, -35, 0,
  -28, 6, -12, 12, 5, 13, 22, 8,
]).fill({ color: 0x8ffbff, alpha: 0.96 });
photonShape.poly([31, 0, 16, -4.5, -2, -6, -20, 0, -2, 6, 16, 4.5]).fill({ color: 0xffffff, alpha: 0.98 });
photon.addChild(photonGlow, photonShape);
app.stage.addChild(photon);

const hudStyle = new TextStyle({ fill: '#dffcff', fontSize: 18, fontFamily: 'monospace' });
const hud = new Text({ text: '', style: hudStyle });
hud.position.set(28, 24);
app.stage.addChild(hud);

const note = new Text({ text: 'HOLD SCREEN / SPACE TO ACCELERATE', style: new TextStyle({ fill: '#77ddeb', fontSize: 13, fontFamily: 'Arial' }) });
note.position.set(28, HEIGHT - 36);
app.stage.addChild(note);

let distance = 110;
let speed = 0;
let throttle = false;
let elapsed = 0;
let frames = 0;
let fps = 0;
let maxFrame = 0;
let frameWindow = 0;

window.addEventListener('keydown', (e) => { if (e.code === 'Space') throttle = true; });
window.addEventListener('keyup', (e) => { if (e.code === 'Space') throttle = false; });
app.canvas.addEventListener('pointerdown', () => { throttle = true; });
window.addEventListener('pointerup', () => { throttle = false; });

function drawTrail(): void {
  trail.clear();
  const ratio = Math.max(0, Math.min(1, speed / PHYSICS.maxSpeed));
  if (ratio < 0.025) return;

  const length = 28 + ratio * 360;
  const points: number[] = [];
  const segments = 22;
  for (let i = segments; i >= 0; i -= 1) {
    const t = i / segments;
    const p = sample(distance - length * t, 0);
    points.push(p.x, p.y);
  }

  trail.poly(points).stroke({ width: 28 + ratio * 12, color: 0x008cff, alpha: 0.10 });
  trail.poly(points).stroke({ width: 13 + ratio * 7, color: 0x00dfff, alpha: 0.28 });
  trail.poly(points).stroke({ width: 4 + ratio * 3, color: 0xc8ffff, alpha: 0.82 });
}

app.ticker.add((ticker) => {
  const dt = Math.min(ticker.deltaMS / 1000, 0.05);
  speed += (throttle ? PHYSICS.acceleration : -PHYSICS.coastDrag) * dt;
  speed = Math.max(0, Math.min(PHYSICS.maxSpeed, speed));
  distance = wrapDistance(distance + speed * dt);

  const p = sample(distance, 0);
  photon.position.set(p.x, p.y);
  photon.rotation = p.angle;
  drawTrail();

  frames += 1;
  elapsed += ticker.deltaMS;
  frameWindow += ticker.deltaMS;
  maxFrame = Math.max(maxFrame, ticker.deltaMS);
  if (elapsed >= 500) {
    fps = (frames * 1000) / elapsed;
    frames = 0;
    elapsed = 0;
  }
  if (frameWindow >= 5000) {
    frameWindow = 0;
    maxFrame = ticker.deltaMS;
  }

  hud.text = `PIXIJS\nFPS ${fps.toFixed(1)}\nFRAME ${ticker.deltaMS.toFixed(1)} ms\nMAX ${maxFrame.toFixed(1)} ms\nSPEED ${Math.round(speed * 0.78)}`;
});
