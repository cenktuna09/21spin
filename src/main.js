import * as THREE from 'three';
import { Table } from './game/Table.js';
import SlotColumn from './game/SlotColumn.js';
import { GameState } from './game/GameState.js';
import Dealer from './game/Dealer.js';
import Character from './game/Character.js';
import HUD from './ui/HUD.js';

// ── Renderer ─────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0d0d);
scene.fog = new THREE.Fog(0x0d0d0d, 20, 60);

// ── Camera ────────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 8, 12);
camera.lookAt(0, 0, 0);

// ── Lights ────────────────────────────────────────────────────────────────────
// 1. HemisphereLight — gökyüzü/zemin ambient dolgu
const hemiLight = new THREE.HemisphereLight(0x8899bb, 0x443322, 4);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

// 2. DirectionalLight — gölge düşüren ana ışık
const dirLight = new THREE.DirectionalLight(0xffffff, 5);
dirLight.position.set(-3, 10, -10);
dirLight.castShadow = true;
dirLight.shadow.camera.top    =  8;
dirLight.shadow.camera.bottom = -8;
dirLight.shadow.camera.left   = -8;
dirLight.shadow.camera.right  =  8;
dirLight.shadow.camera.near   = 0.1;
dirLight.shadow.camera.far    = 40;
dirLight.shadow.mapSize.set(2048, 2048);
scene.add(dirLight);

// 3. Fill light — karşı taraftan yumuşak dolgu
const fillLight = new THREE.DirectionalLight(0x4466ff, 1.5);
fillLight.position.set(6, 4, 4);
scene.add(fillLight);

// ── Ground Plane + Grid ───────────────────────────────────────────────────────
// ── Ground (character feet = y -3.75) ────────────────────────────────────────
const floorTex = new THREE.TextureLoader().load(
  'https://threejs.org/examples/textures/grid.png'
);
floorTex.wrapS = THREE.RepeatWrapping;
floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(30, 30);
floorTex.colorSpace = THREE.SRGBColorSpace;

const groundMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({
    map: floorTex,
    color: 0x444444,
    roughness: 1,
    metalness: 0,
  })
);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.position.y = -3.75;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// OrbitControls removed — camera is driven by character rotation below

// ── Table ─────────────────────────────────────────────────────────────────────
new Table(scene);

// ── Characters ────────────────────────────────────────────────────────────────
const playerChar = new Character(scene, new THREE.Vector3(0, -3.75, 6.5),  { facing: 0,       scale: 3.5, controllable: true });
const dealerChar = new Character(scene, new THREE.Vector3(0, -3.75, -5.5), { facing: Math.PI, scale: 3.5 });

Promise.all([playerChar.load(), dealerChar.load()]).then(() => {
  console.log('[Characters] Loaded');
});


// ── Column positions (player, bottom-centre) ──────────────────────────────────
// 2 base cards centred; 3rd card (HIT) steps to the right
const COL_POS = [
  new THREE.Vector3(-0.7, 2.3, 3.2),
  new THREE.Vector3( 0.7, 2.3, 3.2),
  new THREE.Vector3( 2.1, 2.3, 3.2), // 3rd card on HIT
];

const PLAYER_ID = 'local';
let columns     = [];   // active SlotColumns this round
let lockTimers  = [];

// ── GameState ─────────────────────────────────────────────────────────────────
const gameState = new GameState();
gameState.addPlayer(PLAYER_ID, 'You');
gameState.addPlayer('dealer', 'Dealer');

// ── Dealer ────────────────────────────────────────────────────────────────────
const dealer = new Dealer(scene, gameState);

// ── HUD ───────────────────────────────────────────────────────────────────────
const hud = new HUD(gameState, columns, {
  onDeal: (bet) => startRound(bet),

  onHit: () => {
    gameState.hit();   // player_choice → spinning
    spawnThirdColumn();
  },

  onPass: () => {
    gameState.pass();  // player_choice → reveal
  },

  onStopColumn: (i) => {
    if (columns[i]) columns[i].lock();
  },
});

// ── Round flow ────────────────────────────────────────────────────────────────

function startRound(bet = 100) {
  // Clean up previous columns
  lockTimers.forEach(clearTimeout);
  lockTimers = [];
  columns.forEach(c => c.dispose());
  columns.length = 0;

  dealer.dispose();
  gameState.deal(bet); // betting → spinning

  // Spawn 2 base player columns
  columns.push(new SlotColumn(scene, COL_POS[0]));
  columns.push(new SlotColumn(scene, COL_POS[1]));

  // Auto-lock fallback (player can stop early via STOP buttons)
  lockTimers = columns.map((col, i) =>
    setTimeout(() => col.lock(), 3000 + i * 1400)
  );
}

function spawnThirdColumn() {
  const col = new SlotColumn(scene, COL_POS[2]);
  columns.push(col);
  // Auto-lock after 4s if player doesn't stop it
  const t = setTimeout(() => col.lock(), 4000);
  lockTimers.push(t);
}

// ── Character reactions ───────────────────────────────────────────────────────
gameState.on('phaseChange', (phase) => {
  if (phase === 'spinning') dealerChar.deal();
  if (phase === 'reveal')   dealerChar.deal();
  if (phase === 'betting')  { playerChar.idle(); dealerChar.idle(); }
});

gameState.on('roundEnd', (results, _dealerEntry) => {
  const local = results.find(r => r.id === 'local');
  if (!local) return;
  if (local.outcome === 'jackpot' || local.result?.superBlackjack || local.result?.blackjack || local.outcome === 'win') {
    playerChar.celebrate();
    dealerChar.disappointed();
  } else if (local.outcome === 'bust' || local.outcome === 'lose') {
    playerChar.disappointed();
    dealerChar.celebrate();
  }
});

// ── Phase change handler ──────────────────────────────────────────────────────
gameState.on('phaseChange', (phase) => {
  if (phase === 'reveal') {
    dealer.play(
      // onDone
      (dealerResult) => {
        hud.setDealerResult(dealerResult);
        gameState.setDealerHand(dealerResult.cards);
        gameState.finishReveal();
      },
      // onProgress — each card drawn
      (total, cardCount) => {
        hud.updateDealerProgress(total, cardCount);
      }
    );
  }

  if (phase === 'end') {
    setTimeout(() => gameState.reset(), 3500); // reset → betting
  }
});

// ── Per-frame column checks ───────────────────────────────────────────────────

function checkColumns() {
  const phase  = gameState.phase;
  const inHit  = gameState._inHitMode;

  if (phase === 'spinning' && !inHit) {
    // Waiting for first 2 columns to lock
    if (columns.length >= 2 && columns[0].getValue() && columns[1].getValue()) {
      const cards = [columns[0].getValue(), columns[1].getValue()];
      gameState.twoColumnsLocked([{ playerId: PLAYER_ID, cards }]);
    }
  }

  if (phase === 'spinning' && inHit) {
    // Waiting for 3rd column
    const col3 = columns[2];
    if (col3 && col3.getValue()) {
      gameState.thirdColumnLocked([{ playerId: PLAYER_ID, cards: [col3.getValue()] }]);
    }
  }
}

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Mouse-driven camera pitch ─────────────────────────────────────────────────
// 0 = top of screen (look up), 1 = bottom (look down), 0.5 = neutral
let _mouseNormY = 0.5;
window.addEventListener('mousemove', (e) => {
  _mouseNormY = e.clientY / window.innerHeight;
});

// ── Render loop ───────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
clock.start();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  columns.forEach(c => c.update(delta));
  dealer.update(delta);
  playerChar.update(delta);
  dealerChar.update(delta);
  checkColumns();
  hud.update();

  // Camera follows player character rotation — fixed offset in local space
  if (playerChar._model) {
    const m = playerChar._model;
    const offset = new THREE.Vector3(0, 9, 6);
    offset.applyEuler(new THREE.Euler(0, m.rotation.y, 0));
    camera.position.copy(m.position).add(offset);
    // Mouse Y → pitch clamped to ±5 degrees (tan(5°) × ~10 cam dist ≈ 0.875)
    const MAX_PITCH_SHIFT = Math.tan(5 * Math.PI / 180) * 10;
    const rawShift = (0.5 - _mouseNormY) * 14;
    const pitchShift = Math.max(-MAX_PITCH_SHIFT, Math.min(MAX_PITCH_SHIFT, rawShift));
    const look = m.position.clone();
    look.y += 1 + pitchShift;
    look.x -= Math.sin(m.rotation.y) * 6;
    look.z -= Math.cos(m.rotation.y) * 6;
    camera.lookAt(look);
  }

  renderer.render(scene, camera);
}

animate();
