import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Table } from './game/Table.js';
import SlotColumn from './game/SlotColumn.js';
import { GameState } from './game/GameState.js';
import Dealer from './game/Dealer.js';
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
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const pointLight = new THREE.PointLight(0xfff5cc, 2.0, 30);
pointLight.position.set(0, 10, 0);
pointLight.castShadow = true;
pointLight.shadow.mapSize.set(1024, 1024);
scene.add(pointLight);
const fillLight = new THREE.PointLight(0x4466ff, 0.5, 20);
fillLight.position.set(-6, 4, -4);
scene.add(fillLight);

// ── Controls ──────────────────────────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minPolarAngle = Math.PI / 8;
controls.maxPolarAngle = Math.PI / 2.2;
controls.minDistance = 5;
controls.maxDistance = 25;
controls.target.set(0, 0, 0);

// ── Table ─────────────────────────────────────────────────────────────────────
new Table(scene);

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
  onDeal: () => startRound(),

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

function startRound() {
  // Clean up previous columns
  lockTimers.forEach(clearTimeout);
  lockTimers = [];
  columns.forEach(c => c.dispose());
  columns.length = 0;

  dealer.dispose();
  gameState.deal(); // betting → spinning

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

// ── Render loop ───────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  columns.forEach(c => c.update(delta));
  dealer.update(delta);
  checkColumns();
  hud.update();
  controls.update();
  renderer.render(scene, camera);
}

animate();
