/**
 * CasinoRoom — manages all tables and all connected players.
 * Routes socket events to the appropriate TableGame.
 */

import TableGame from './TableGame.js';

const GLOBAL_BET_INTERVAL_MS = 10_000; // 10s shared betting window

// Shared with client src/world/TableSpawner.js
export const TABLE_POSITIONS = [
  { id: 'table-1',  x: -20, z:  0 },
  { id: 'table-2',  x: -10, z:  0 },
  { id: 'table-3',  x:   0, z:  0 },
  { id: 'table-4',  x:  10, z:  0 },
  { id: 'table-5',  x:  20, z:  0 },
  { id: 'table-6',  x: -20, z: 20 },
  { id: 'table-7',  x: -10, z: 20 },
  { id: 'table-8',  x:   0, z: 20 },
  { id: 'table-9',  x:  10, z: 20 },
  { id: 'table-10', x:  20, z: 20 },
];

export default class CasinoRoom {
  constructor(io) {
    this.io = io;

    // { socketId: { id, username, x, y, z, facing, moveState, tableId, seatIndex } }
    this._players = {};

    // { tableId: [{ socketId, bet }] } — players waiting for next betting round
    this._pendingBets = {};

    // Create one TableGame per table, intercepting phase_changed to inject deadline + process queue
    this._tables = {};
    for (const t of TABLE_POSITIONS) {
      this._tables[t.id] = new TableGame(
        t.id,
        (event, data) => {
          // When a table enters betting, inject the global deadline and seat any queued players
          if (event === 'phase_changed' && data.phase === 'betting') {
            data = { ...data, betDeadline: this._globalBetDeadline };
            this._processPendingBets(t.id);
          }
          io.to(t.id).emit(event, data);
        },
        {
          sendToPlayer: (playerId, event, data) => io.to(playerId).emit(event, data),
        }
      );
    }

    // Global betting clock — all tables share the same deadline
    this._globalBetDeadline = Date.now() + GLOBAL_BET_INTERVAL_MS;
    this._scheduleGlobalTick();
  }

  _scheduleGlobalTick() {
    this._globalBetDeadline = Date.now() + GLOBAL_BET_INTERVAL_MS;
    this.io.emit('global_bet_deadline', { deadline: this._globalBetDeadline });
    this._globalTimer = setTimeout(() => {
      for (const table of Object.values(this._tables)) {
        table.forceStartRound();
      }
      this._scheduleGlobalTick();
    }, GLOBAL_BET_INTERVAL_MS);
  }

  /** When a table opens a new betting phase, auto-seat and bet all queued players. */
  _processPendingBets(tableId) {
    const pending = this._pendingBets[tableId];
    if (!pending?.length) return;
    this._pendingBets[tableId] = [];
    for (const { socketId, bet } of pending) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (!socket) continue;
      this._onPlaceBet(socket, { bet, tableId });
    }
  }

  // ── Connection lifecycle ───────────────────────────────────────────────────

  handleConnection(socket) {
    console.log(`[+] ${socket.id} connected`);

    socket.on('join',             (d) => this._onJoin(socket, d));
    socket.on('move',             (d) => this._onMove(socket, d));
    socket.on('place_bet',        (d) => this._onPlaceBet(socket, d));
    socket.on('lock_column',      (d) => this._onLockColumn(socket, d));
    socket.on('player_decision',  (d) => this._onPlayerDecision(socket, d));
    socket.on('disconnect',       ()  => this._onDisconnect(socket));
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  _onJoin(socket, { username }) {
    if (!username || typeof username !== 'string') return;
    const name = username.slice(0, 20).trim() || 'Player';

    this._players[socket.id] = {
      id: socket.id, username: name,
      x: 0, y: -3.75, z: 6.5,
      facing: 0, moveState: 'idle',
      tableId: null, seatIndex: -1,
    };

    // Tell this client about everyone + all table states + global bet clock
    socket.emit('welcome', {
      yourId:  socket.id,
      players: Object.values(this._players).filter(p => p.id !== socket.id),
      tables:  Object.values(this._tables).map(t => t.getState()),
      globalBetDeadline: this._globalBetDeadline,
    });

    // Tell everyone else about this new player
    socket.broadcast.emit('player_joined', {
      id: socket.id, username: name,
      x: 0, y: -3.75, z: 6.5, facing: 0, moveState: 'idle',
    });

    console.log(`[join] ${name} (${socket.id})`);
  }

  _onMove(socket, data) {
    const p = this._players[socket.id];
    if (!p) return;
    p.x = data.x ?? p.x;
    p.y = data.y ?? p.y;
    p.z = data.z ?? p.z;
    p.facing    = data.facing    ?? p.facing;
    p.moveState = data.moveState ?? p.moveState;

    socket.broadcast.emit('player_moved', {
      id: socket.id,
      x: p.x, y: p.y, z: p.z,
      facing: p.facing, moveState: p.moveState,
    });
  }

  _onPlaceBet(socket, { bet, tableId }) {
    const p = this._players[socket.id];
    if (!p) return;

    const table = this._tables[tableId];
    if (!table) return;

    // Seat the player if not already at this table
    if (p.tableId !== tableId) {
      // Leave old table
      if (p.tableId && this._tables[p.tableId]) {
        this._tables[p.tableId].leave(socket.id);
        socket.leave(p.tableId);
        this.io.emit('player_left_table', { playerId: socket.id, tableId: p.tableId });
      }

      const seatIndex = table.join(socket.id, p.username, this._getChips(socket.id));
      if (seatIndex === -1) {
        socket.emit('table_full', { tableId });
        return;
      }
      if (seatIndex === -2) {
        // Round in progress — queue this player for next betting window
        if (!this._pendingBets[tableId]) this._pendingBets[tableId] = [];
        const alreadyQueued = this._pendingBets[tableId].some(q => q.socketId === socket.id);
        if (!alreadyQueued) this._pendingBets[tableId].push({ socketId: socket.id, bet });
        socket.emit('queued_for_next_round', { tableId });
        return;
      }

      p.tableId   = tableId;
      p.seatIndex = seatIndex;
      socket.join(tableId);

      this.io.emit('player_seated', {
        playerId: socket.id, username: p.username,
        tableId, seatIndex,
      });

      // Sync current table phase + global deadline to joining player
      socket.emit('phase_changed', {
        tableId, phase: table.phase,
        ...(table.phase === 'betting' ? { betDeadline: this._globalBetDeadline } : {}),
      });
    }

    table.placeBet(socket.id, bet);
  }

  _onLockColumn(socket, { colIndex }) {
    const p = this._players[socket.id];
    if (!p?.tableId) return;
    this._tables[p.tableId]?.lockColumn(socket.id, colIndex);
  }

  _onPlayerDecision(socket, { decision }) {
    const p = this._players[socket.id];
    if (!p?.tableId) return;
    if (decision !== 'hit' && decision !== 'pass') return;
    this._tables[p.tableId]?.playerDecision(socket.id, decision);
  }

  _onDisconnect(socket) {
    const p = this._players[socket.id];
    if (!p) return;

    if (p.tableId && this._tables[p.tableId]) {
      this._tables[p.tableId].leave(socket.id);
      socket.leave(p.tableId);
    }

    // Remove from any pending queue
    for (const queue of Object.values(this._pendingBets)) {
      const idx = queue.findIndex(q => q.socketId === socket.id);
      if (idx !== -1) queue.splice(idx, 1);
    }

    delete this._players[socket.id];
    this.io.emit('player_left', { id: socket.id });
    console.log(`[-] ${socket.id} disconnected`);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _getChips(socketId) {
    return 500;
  }
}
