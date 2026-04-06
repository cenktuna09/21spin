import * as THREE from 'three';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];
const RED_SUITS = new Set(['♥', '♦']);

const CARD_W = 0.6;
const CARD_H = 0.9;
const CARD_D = 0.02;
const CARD_GAP = 1.05; // vertical spacing between card centres
const VISIBLE_CARDS = 3; // cards in the strip (must be odd so centre snaps cleanly)
const SPIN_SPEED = 6.0; // units per second at full speed
const DECEL_RATE = 8.0; // deceleration (units/s²)

const STATE = { SPINNING: 'SPINNING', LOCKED: 'LOCKED' };

// Build a CanvasTexture for one card face
function makeCardTexture(rank, suit) {
  const W = 128, H = 192;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Border
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, W - 4, H - 4);

  const color = RED_SUITS.has(suit) ? '#cc0000' : '#111111';
  ctx.fillStyle = color;

  // Corner rank + suit (top-left)
  ctx.font = 'bold 22px serif';
  ctx.textAlign = 'left';
  ctx.fillText(rank, 8, 28);
  ctx.font = 'bold 18px serif';
  ctx.fillText(suit, 8, 48);

  // Corner rank + suit (bottom-right, rotated 180°)
  ctx.save();
  ctx.translate(W, H);
  ctx.rotate(Math.PI);
  ctx.font = 'bold 22px serif';
  ctx.textAlign = 'left';
  ctx.fillText(rank, 8, 28);
  ctx.font = 'bold 18px serif';
  ctx.fillText(suit, 8, 48);
  ctx.restore();

  // Centre suit (large)
  ctx.font = `bold ${rank === '10' ? 44 : 52}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(suit, W / 2, H / 2);

  // Centre rank label
  ctx.font = 'bold 28px serif';
  ctx.fillStyle = color;
  ctx.fillText(rank, W / 2, H / 2 + 42);

  return new THREE.CanvasTexture(canvas);
}

// Card back texture
function makeBackTexture() {
  const W = 128, H = 192;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1a3a8c';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, W - 12, H - 12);
  // simple cross-hatch
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  for (let i = 0; i < W; i += 12) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
  }
  for (let j = 0; j < H; j += 12) {
    ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(W, j); ctx.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}

function cardValue(rank) {
  if (rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  return parseInt(rank, 10);
}

export default class SlotColumn {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Vector3} position  world-space centre of the column
   */
  constructor(scene, position) {
    this.scene = scene;
    this.state = STATE.SPINNING;
    this._speed = SPIN_SPEED;
    this._lockedCard = null;

    // Root group that we shift for the wrap illusion
    this.group = new THREE.Group();
    this.group.position.copy(position);
    scene.add(this.group);

    // Clip plane so cards outside the window are hidden
    // (we use a local render-order trick instead — simpler without renderer clipping)

    // Generate a shuffled deck pool for the strip
    this._pool = this._buildPool();
    this._poolIndex = 0;

    // Create card meshes
    this._cards = [];
    const backTex = makeBackTexture();
    const geo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D);

    for (let i = 0; i < VISIBLE_CARDS; i++) {
      const { rank, suit } = this._nextCard();
      const faceMat = new THREE.MeshStandardMaterial({
        map: makeCardTexture(rank, suit),
        roughness: 0.3,
        metalness: 0.0,
      });
      const backMat = new THREE.MeshStandardMaterial({
        map: backTex,
        roughness: 0.4,
      });
      // BoxGeometry face order: +x,-x,+y,-y,+z(front),-z(back)
      const materials = [backMat, backMat, backMat, backMat, faceMat, backMat];
      const mesh = new THREE.Mesh(geo, materials);

      // Position: i=0 at top, centre at VISIBLE_CARDS/2
      const startY = (VISIBLE_CARDS - 1) * 0.5 * CARD_GAP - i * CARD_GAP;
      mesh.position.set(0, startY, 0);
      mesh.castShadow = false;
      mesh.receiveShadow = false;

      this.group.add(mesh);
      this._cards.push({ mesh, rank, suit });
    }

    // Scroll offset accumulator
    this._scrollY = 0;
  }

  // Build a repeating pool of all 52 cards, shuffled
  _buildPool() {
    const pool = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        pool.push({ rank, suit });
      }
    }
    // Fisher-Yates
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  }

  _nextCard() {
    const c = this._pool[this._poolIndex % this._pool.length];
    this._poolIndex++;
    return c;
  }

  // Replace a card mesh's face texture with a new rank/suit
  _reassignCard(cardObj, rank, suit) {
    cardObj.rank = rank;
    cardObj.suit = suit;
    const faceMat = new THREE.MeshStandardMaterial({
      map: makeCardTexture(rank, suit),
      roughness: 0.3,
    });
    // face material is index 4 (BoxGeometry +z face)
    cardObj.mesh.material[4].dispose();
    cardObj.mesh.material[4] = faceMat;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  lock() {
    if (this.state === STATE.LOCKED) return;
    this.state = STATE.LOCKED;
    // Deceleration will happen in update(); snap handled when speed reaches 0
  }

  getValue() {
    if (!this._lockedCard) return null;
    const { rank, suit } = this._lockedCard;
    return { rank, suit, value: cardValue(rank) };
  }

  /** Call every frame with delta time in seconds */
  update(delta) {
    if (this.state === STATE.LOCKED && this._speed === 0) return;

    // Decelerate when locked
    if (this.state === STATE.LOCKED) {
      this._speed = Math.max(0, this._speed - DECEL_RATE * delta);
    }

    const dy = this._speed * delta;
    this._scrollY += dy;

    // Shift all cards down
    for (const card of this._cards) {
      card.mesh.position.y -= dy;
    }

    // Wrap: if a card goes below the bottom threshold, move it to the top
    const bottomLimit = -(VISIBLE_CARDS - 1) * 0.5 * CARD_GAP - CARD_GAP;
    const topY = (VISIBLE_CARDS - 1) * 0.5 * CARD_GAP + CARD_GAP;

    for (const card of this._cards) {
      if (card.mesh.position.y < bottomLimit) {
        card.mesh.position.y += VISIBLE_CARDS * CARD_GAP;
        const { rank, suit } = this._nextCard();
        this._reassignCard(card, rank, suit);
      }
    }

    // Snap when fully stopped
    if (this.state === STATE.LOCKED && this._speed === 0) {
      this._snap();
    }
  }

  _snap() {
    // Find the card closest to y=0 (centre of the column = the "drawn" card)
    let closest = null;
    let minDist = Infinity;
    for (const card of this._cards) {
      const d = Math.abs(card.mesh.position.y);
      if (d < minDist) { minDist = d; closest = card; }
    }

    // Nudge all cards so the closest snaps exactly to y=0
    const offset = closest.mesh.position.y;
    for (const card of this._cards) {
      card.mesh.position.y -= offset;
    }

    this._lockedCard = { rank: closest.rank, suit: closest.suit };
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
