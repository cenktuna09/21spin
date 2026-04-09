import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Table } from './game/Table.js';
import SlotColumn from './game/SlotColumn.js';
import { GameState } from './game/GameState.js';
import Dealer from './game/Dealer.js';
import Character from './game/Character.js';
import HUD from './ui/HUD.js';
import JoinScreen from './ui/JoinScreen.js';
import SocketClient from './network/SocketClient.js';
import RemotePlayerManager from './game/RemotePlayerManager.js';
import TableSpawner, { TABLE_POSITIONS, nearestTable, seatColPositions } from './world/TableSpawner.js';

// ── Renderer ─────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// CSS2D renderer for name tags
const css2dRenderer = new CSS2DRenderer();
css2dRenderer.setSize(window.innerWidth, window.innerHeight);
css2dRenderer.domElement.style.position = 'absolute';
css2dRenderer.domElement.style.top = '0';
css2dRenderer.domElement.style.pointerEvents = 'none';
document.getElementById('css2d-labels').appendChild(css2dRenderer.domElement);

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0d0d);
scene.fog = new THREE.Fog(0x0d0d0d, 40, 120);

// ── Camera ────────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 8, 12);
camera.lookAt(0, 0, 0);

// ── Lights ────────────────────────────────────────────────────────────────────
const hemiLight = new THREE.HemisphereLight(0x8899bb, 0x443322, 4);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

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

const fillLight = new THREE.DirectionalLight(0x4466ff, 1.5);
fillLight.position.set(6, 4, 4);
scene.add(fillLight);

// ── Ground ────────────────────────────────────────────────────────────────────
const floorTex = new THREE.TextureLoader().load(
  'https://threejs.org/examples/textures/grid.png'
);
floorTex.wrapS = THREE.RepeatWrapping;
floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(60, 60);
floorTex.colorSpace = THREE.SRGBColorSpace;

const groundMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ map: floorTex, color: 0x444444, roughness: 1, metalness: 0 })
);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.position.y = -3.75;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// ── Tables ────────────────────────────────────────────────────────────────────
const tableSpawner = new TableSpawner(scene);

// ── Characters ────────────────────────────────────────────────────────────────
const playerChar = new Character(scene, new THREE.Vector3(0, -3.75, 6.5), {
  facing: 0, scale: 3.5, controllable: true,
  boundsX: [-50, 50], boundsZ: [-15, 35],
});
const dealerChar = new Character(scene, new THREE.Vector3(0, -3.75, -5.5), {
  facing: Math.PI, scale: 3.5,
});

let _localTotalSpan  = null;
let _dealerTotalSpan = null;

function _makeHeadLabel(name) {
  const div = document.createElement('div');
  div.className = 'player-label';
  div.innerHTML = `<span>${name}</span><span class="plabel-total"></span>`;
  return { obj: new CSS2DObject(div), totalSpan: div.querySelector('.plabel-total') };
}

Promise.all([playerChar.load(), dealerChar.load()]).then(() => {
  const local  = _makeHeadLabel('You');
  local.obj.position.set(0, 2.2, 0);
  playerChar._model.add(local.obj);
  _localTotalSpan = local.totalSpan;

  const dlr = _makeHeadLabel('DEALER');
  dlr.obj.position.set(0, 2.2, 0);
  dealerChar._model.add(dlr.obj);
  _dealerTotalSpan = dlr.totalSpan;

  console.log('[Characters] Loaded');
});

// ── Remote players ────────────────────────────────────────────────────────────
const remoteManager = new RemotePlayerManager(scene);

// ── GameState ─────────────────────────────────────────────────────────────────
const gameState = new GameState();
gameState.addPlayer('dealer', 'Dealer');

// ── Dealer (3D visual) ────────────────────────────────────────────────────────
const dealer = new Dealer(scene, gameState);

// ── Column state ──────────────────────────────────────────────────────────────
// Seat columns for THIS player — updated when player is seated
let columns      = [];
let lockTimers   = [];
let myTableId    = null;   // which table local player is at
let mySeatIndex  = -1;     // which seat local player occupies

// Columns for remote players at MY table: { [playerId]: SlotColumn[] }
const remoteColumns = {};

// ── Dealer visual columns (server-driven, bypasses Dealer.js timer races) ─────
let dealerVisualCols = [];
let _dealerCardCenterX = 0; // set at round start to player's x → dealer always centered in view
const DEALER_COL_Y        =  2.3;
const DEALER_COL_Z_OFFSET = -3.0;  // behind table from player's perspective
const DEALER_COL_SPACING  =  1.5;

function _spawnDealerCard(rank, suit) {
  if (!myTableId) return;
  const tablePos = TABLE_POSITIONS.find(t => t.id === myTableId);
  if (!tablePos) return;
  const col = new SlotColumn(scene, new THREE.Vector3(_dealerCardCenterX, DEALER_COL_Y, tablePos.z + DEALER_COL_Z_OFFSET));
  col.lockWithCard(rank, suit);
  dealerVisualCols.push(col);
  _repositionDealerCols(tablePos);
}

function _repositionDealerCols(tablePos) {
  if (!tablePos) return;
  const N = dealerVisualCols.length;
  const totalWidth = (N - 1) * DEALER_COL_SPACING;
  dealerVisualCols.forEach((col, i) => {
    col.group.position.x = _dealerCardCenterX - totalWidth / 2 + i * DEALER_COL_SPACING;
    col.group.position.y = DEALER_COL_Y;
    col.group.position.z = tablePos.z + DEALER_COL_Z_OFFSET;
  });
}

function _clearDealerVisual() {
  dealerVisualCols.forEach(c => c.dispose());
  dealerVisualCols = [];
}

// ── Network ───────────────────────────────────────────────────────────────────
const socketClient = new SocketClient();

// ── HUD (created after welcome so we have localPlayerId) ─────────────────────
let hud = null;
let localPlayerId = 'local'; // will be updated on 'welcome'

function initHUD() {
  hud = new HUD(gameState, columns, {
    localPlayerId,

    onDeal: (bet) => {
      if (!myTableId) myTableId = _bestTableForBet();
      socketClient.emit('place_bet', { bet, tableId: myTableId });
    },

    onHit: () => {
      socketClient.emit('player_decision', { decision: 'hit' });
      _spawnLocalHitColumn(); // spawn col2 immediately so lockWithCard can fire on card_result
    },

    onPass: () => {
      socketClient.emit('player_decision', { decision: 'pass' });
    },

    onStopColumn: (i) => {
      socketClient.emit('lock_column', { colIndex: i });
      // Lock visually immediately for responsiveness
      if (columns[i]) columns[i].lock();
    },
  });
}

// ── Socket event handlers ─────────────────────────────────────────────────────

socketClient.on('welcome', (data) => {
  localPlayerId = data.yourId;
  gameState.addPlayer(localPlayerId, 'You');
  initHUD();

  // Spawn remote players already in the room
  for (const p of (data.players ?? [])) {
    remoteManager.add(p.id, p.username, { x: p.x ?? 0, y: p.y ?? -3.75, z: p.z ?? 0 });
  }

  // Pre-populate seat info for players already seated at any table
  for (const tableState of (data.tables ?? [])) {
    for (const seat of (tableState.seats ?? [])) {
      if (seat && seat.id !== localPlayerId) {
        _remoteSeatMap[seat.id] = seat.seatIndex;
        _seatTableMap[seat.id]  = tableState.tableId;
        if (!gameState.players[seat.id]) gameState.addPlayer(seat.id, seat.username);
      }
    }
  }

  // Start global betting countdown immediately
  if (data.globalBetDeadline) hud?.startBettingCountdown(data.globalBetDeadline);

  console.log('[welcome] id=', localPlayerId, 'players=', data.players?.length ?? 0);
});

socketClient.on('player_joined', (data) => {
  remoteManager.add(data.id, data.username, { x: data.x ?? 0, y: data.y ?? -3.75, z: data.z ?? 0 });
});

socketClient.on('player_left', (data) => {
  remoteManager.remove(data.id);
  // Clean up remote columns if any
  if (remoteColumns[data.id]) {
    remoteColumns[data.id].forEach(c => c?.dispose());
    delete remoteColumns[data.id];
  }
  hud?.removeTablePlayer(data.id);
});

socketClient.on('player_moved', (data) => {
  if (data.id === localPlayerId) return;
  remoteManager.applyMove(data.id, data);
});

socketClient.on('player_seated', (data) => {
  const { playerId, username, tableId, seatIndex } = data;

  if (playerId === localPlayerId) {
    mySeatIndex = seatIndex;
    myTableId   = tableId;
    // Register local player in gameState
    if (!gameState.players[localPlayerId]) gameState.addPlayer(localPlayerId, 'You');
    hud?.updatePlayerStatus(localPlayerId, 'SEATED');
  } else {
    // Register remote player in gameState (for score tracking)
    if (!gameState.players[playerId]) gameState.addPlayer(playerId, username);
    hud?.updatePlayerStatus(playerId, 'SEATED');
    // Pre-create remote columns (hidden until card_result)
    if (!remoteColumns[playerId]) remoteColumns[playerId] = [null, null, null];
  }
});

socketClient.on('global_bet_deadline', (data) => {
  hud?.startBettingCountdown(data.deadline);
});

socketClient.on('phase_changed', (data) => {
  const { tableId, phase } = data;
  if (tableId !== myTableId) return;

  gameState.receivePhase(phase);

  if (phase === 'betting' && data.betDeadline) {
    hud?.startBettingCountdown(data.betDeadline);
  }

  if (phase === 'spinning') {
    // Capture player's current X so dealer cards appear centered from player's view
    _dealerCardCenterX = playerChar._model?.position.x ?? (TABLE_POSITIONS.find(t => t.id === myTableId)?.x ?? 0);
    _clearDealerVisual(); // wipe previous round's dealer columns
    // Clear stale hands from previous round before new cards arrive
    for (const p of Object.values(gameState.players)) {
      if (p.id !== 'dealer') { p.hand = []; p.result = null; }
    }
    gameState._inHitMode = false;
    _spawnLocalColumns();
    // Clear all head-label totals
    if (_localTotalSpan)  _localTotalSpan.textContent  = '';
    if (_dealerTotalSpan) _dealerTotalSpan.textContent = '';
    for (const pid of Object.keys(_remoteSeatMap)) remoteManager.setHandTotal(pid, 0);
  }

  if (phase === 'end') {
    setTimeout(() => {
      // Clean up columns on end
      _clearLocalColumns();
      _clearRemoteColumns();
    }, 3400);
  }
});

socketClient.on('bet_placed', (data) => {
  if (data.tableId !== myTableId) return;
  hud?.updatePlayerStatus(data.playerId, `BET ${data.bet}`);
  // Deduct bet from local player's displayed chip count
  if (data.playerId === localPlayerId) hud?.onBetConfirmed(data.bet);
});

socketClient.on('card_result', (data) => {
  const { tableId, playerId, colIndex, rank, suit, value } = data;
  if (tableId !== myTableId) return;

  const card = { rank, suit, value };

  if (playerId === localPlayerId) {
    if (columns[colIndex]) columns[colIndex].lockWithCard(rank, suit);
    gameState.receiveCard(localPlayerId, colIndex, card);
    const total = gameState.players[localPlayerId]?.result?.total;
    if (_localTotalSpan && total > 0) _localTotalSpan.textContent = String(total);
  } else {
    if (!remoteColumns[playerId]) remoteColumns[playerId] = [null, null, null];
    _spawnRemoteColumn(playerId, colIndex, rank, suit, card);
    gameState.receiveCard(playerId, colIndex, card);
    const total = gameState.players[playerId]?.result?.total;
    remoteManager.setHandTotal(playerId, total ?? 0);
  }
});

socketClient.on('player_decision', (data) => {
  if (data.tableId !== myTableId) return;
  const label = data.decision === 'hit' ? 'HIT' : 'PASS';
  hud?.updatePlayerStatus(data.playerId, label);
  if (data.playerId === localPlayerId) {
    if (data.decision === 'hit') {
      gameState._inHitMode = true;
    }
  }
});

// Directed to this player only — it's your turn to decide
socketClient.on('your_turn', (data) => {
  if (data.tableId !== myTableId) return;
  hud?.showYourTurn(data.total, data.deadline);
});

// Broadcast to all — shows who is currently deciding
socketClient.on('turn_changed', (data) => {
  if (data.tableId !== myTableId) return;
  hud?.setCurrentTurn(data.currentPlayerId);
});

socketClient.on('round_in_progress', (data) => {
  console.warn('[table] round in progress at', data.tableId, '— cannot join now');
});

socketClient.on('queued_for_next_round', (data) => {
  myTableId = data.tableId;
  hud?.showQueuedState();
});

socketClient.on('dealer_card', (data) => {
  if (data.tableId !== myTableId) return;
  hud?.updateDealerProgress(data.total, data.cardCount);
  _spawnDealerCard(data.rank, data.suit);
  if (_dealerTotalSpan) _dealerTotalSpan.textContent = String(data.total);
});

socketClient.on('round_end', (data) => {
  if (data.tableId !== myTableId) return;

  const { results, dealerHand } = data;
  gameState.setDealerHand(dealerHand.cards ?? []);

  // Update chips + emit roundEnd for HUD flash + character animation
  const resultsForState = results.map(r => ({
    ...r,
    id: r.playerId,
    result: r.result ?? { total: 0, bust: false },
  }));
  for (const r of results) {
    const p = gameState.players[r.playerId];
    if (p) p.chips = r.chips;
  }
  hud?.setDealerResult(dealerHand);
  gameState._emit('roundEnd', resultsForState, gameState.players['dealer']);

  // Update player list chips
  for (const r of results) {
    hud?.updatePlayerChips(r.playerId, r.chips);
  }
});

// ── Column helpers ────────────────────────────────────────────────────────────

function _spawnLocalColumns() {
  _clearLocalColumns();
  if (mySeatIndex === -1 || !myTableId) return;

  const tablePos = TABLE_POSITIONS.find(t => t.id === myTableId);
  if (!tablePos) return;

  // Use the seat's y/z but override x with the character's actual position
  // so columns appear directly in front of the player regardless of where they stood
  const refPos = seatColPositions(tablePos, mySeatIndex);
  const cx = playerChar._model?.position.x ?? refPos.col0.x + 0.7;
  columns.push(new SlotColumn(scene, new THREE.Vector3(cx - 0.7, refPos.col0.y, refPos.col0.z)));
  columns.push(new SlotColumn(scene, new THREE.Vector3(cx + 0.7, refPos.col1.y, refPos.col1.z)));
}

function _spawnLocalHitColumn() {
  if (mySeatIndex === -1 || !myTableId) return;
  const tablePos = TABLE_POSITIONS.find(t => t.id === myTableId);
  if (!tablePos) return;
  const refPos = seatColPositions(tablePos, mySeatIndex);
  const cx = playerChar._model?.position.x ?? refPos.col0.x + 0.7;
  columns[2] = new SlotColumn(scene, new THREE.Vector3(cx + 2.1, refPos.col0.y, refPos.col0.z));
}

function _clearLocalColumns() {
  lockTimers.forEach(clearTimeout);
  lockTimers = [];
  columns.forEach(c => c?.dispose());
  columns.length = 0;
}

function _spawnRemoteColumn(playerId, colIndex, rank, suit, card) {
  const tablePos = TABLE_POSITIONS.find(t => t.id === myTableId);
  if (!tablePos) return;
  const seatIdx = _remoteSeatIndex(playerId);
  if (seatIdx === -1) return;

  const pos = seatColPositions(tablePos, seatIdx);
  const positions = [pos.col0, pos.col1, pos.col2];
  const col = new SlotColumn(scene, positions[colIndex]);
  col.lockWithCard(rank, suit);
  if (remoteColumns[playerId]) remoteColumns[playerId][colIndex] = col;
}

function _clearRemoteColumns() {
  for (const cols of Object.values(remoteColumns)) {
    cols.forEach(c => c?.dispose());
    cols.fill(null);
  }
}

// ── Per-frame column check (local player only) ────────────────────────────────

function checkColumns() {
  // In multiplayer all phase transitions are driven by server events.
  // This function is kept for potential future client-side checks.
}

// Helpers
function _remoteSeatIndex(playerId) {
  return _remoteSeatMap[playerId] ?? -1;
}
const _remoteSeatMap  = {}; // { playerId: seatIndex }
const _seatTableMap   = {}; // { playerId: tableId }

/** Pick a table to bet at: prefer a table where other players are already waiting nearby. */
function _bestTableForBet() {
  const myPos = playerChar._model?.position ?? new THREE.Vector3();
  for (const [pid, tid] of Object.entries(_seatTableMap)) {
    if (pid === localPlayerId) continue;
    const tp = TABLE_POSITIONS.find(t => t.id === tid);
    if (!tp) continue;
    if (new THREE.Vector3(tp.x, 0, tp.z).distanceTo(new THREE.Vector3(myPos.x, 0, myPos.z)) < 10) return tid;
  }
  return nearestTable(myPos).id;
}

function _rebuildTablePlayerList() {
  const seatedPlayers = Object.entries(_remoteSeatMap)
    .filter(([id]) => _seatTableMap[id] === myTableId)
    .map(([id]) => ({
      id,
      username: id === localPlayerId ? 'You' : (gameState.players[id]?.name ?? id.slice(0, 8)),
      chips: gameState.players[id]?.chips ?? 500,
    }));
  hud?.setTablePlayers(seatedPlayers, localPlayerId);
}

// Patch player_seated to fill _remoteSeatMap
socketClient.on('player_seated', (data) => {
  _remoteSeatMap[data.playerId] = data.seatIndex;
  _seatTableMap[data.playerId]  = data.tableId;
  _rebuildTablePlayerList();
});

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  css2dRenderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Mouse-driven camera pitch ─────────────────────────────────────────────────
let _mouseNormY = 0.5;
window.addEventListener('mousemove', (e) => {
  _mouseNormY = e.clientY / window.innerHeight;
});

// ── Movement sender (20 Hz) ───────────────────────────────────────────────────
let _moveTimer = 0;

// ── Render loop ───────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
clock.start();

// Character reactions wired to gameState events
gameState.on('phaseChange', (phase) => {
  if (phase === 'spinning') dealerChar.deal();
  if (phase === 'reveal')   dealerChar.deal();
  if (phase === 'betting')  { playerChar.idle(); dealerChar.idle(); }
});

gameState.on('roundEnd', (results) => {
  const local = results.find(r => r.id === localPlayerId || r.playerId === localPlayerId);
  if (!local) return;
  if (['jackpot','win'].includes(local.outcome) || local.result?.superBlackjack || local.result?.blackjack) {
    playerChar.celebrate();
    dealerChar.disappointed();
  } else if (['bust','lose'].includes(local.outcome)) {
    playerChar.disappointed();
    dealerChar.celebrate();
  }
});

gameState.on('phaseChange', (phase) => {
  if (phase === 'end') {
    setTimeout(() => gameState.receivePhase('betting'), 3500);
  }
});

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  // Update columns
  columns.forEach(c => c?.update(delta));
  for (const cols of Object.values(remoteColumns)) cols.forEach(c => c?.update(delta));
  dealerVisualCols.forEach(c => c?.update(delta));

  // Track local player X — columns follow the character
  if (playerChar._model && columns.length > 0) {
    const cx = playerChar._model.position.x;
    if (columns[0]) columns[0].group.position.x = cx - 0.7;
    if (columns[1]) columns[1].group.position.x = cx + 0.7;
    if (columns[2]) columns[2].group.position.x = cx + 2.1;
  }

  // Track remote player X — their columns follow their character
  for (const [pid, cols] of Object.entries(remoteColumns)) {
    const pos = remoteManager.getPosition(pid);
    if (!pos) continue;
    if (cols[0]) cols[0].group.position.x = pos.x - 0.7;
    if (cols[1]) cols[1].group.position.x = pos.x + 0.7;
    if (cols[2]) cols[2].group.position.x = pos.x + 2.1;
  }

  // Update characters
  playerChar.update(delta);
  dealerChar.update(delta);
  remoteManager.update(delta);

  checkColumns();
  hud?.update();

  // Movement broadcast (20 Hz)
  _moveTimer += delta;
  if (_moveTimer >= 0.05 && playerChar._model && socketClient.connected) {
    socketClient.emit('move', {
      x: playerChar._model.position.x,
      y: playerChar._model.position.y,
      z: playerChar._model.position.z,
      facing: playerChar._model.rotation.y,
      moveState: playerChar._moveState,
    });
    _moveTimer = 0;
  }

  // Camera follows player
  if (playerChar._model) {
    const m = playerChar._model;
    const offset = new THREE.Vector3(0, 9, 6);
    offset.applyEuler(new THREE.Euler(0, m.rotation.y, 0));
    camera.position.copy(m.position).add(offset);
    const MAX_PITCH_SHIFT = Math.tan(5 * Math.PI / 180) * 10;
    const pitchShift = Math.max(-MAX_PITCH_SHIFT, Math.min(MAX_PITCH_SHIFT, (0.5 - _mouseNormY) * 14));
    const look = m.position.clone();
    look.y += 1 + pitchShift;
    look.x -= Math.sin(m.rotation.y) * 6;
    look.z -= Math.cos(m.rotation.y) * 6;
    camera.lookAt(look);
  }

  renderer.render(scene, camera);
  css2dRenderer.render(scene, camera);
}

animate();

// ── Join screen ───────────────────────────────────────────────────────────────
const joinScreen = new JoinScreen((username) => {
  socketClient.connect();
  socketClient.on('welcome', () => joinScreen.hide());
  socketClient.emit('join', { username });
  // Fallback: hide after 3s if no welcome (e.g. server offline)
  setTimeout(() => joinScreen.hide(), 3000);
});

