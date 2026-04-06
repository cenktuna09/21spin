/**
 * Dealer — AI dealer for 21 Spin.
 *
 * Layout:
 *   - Dealer's cards sit at top of table (z = -3), centred on x = 0
 *   - Each additional card spreads the group so it stays centred
 *
 * Fix vs v1: all drawn columns are kept alive (not disposed on hit).
 * They are repositioned to stay centred after each new card.
 */

import SlotColumn from './SlotColumn.js';
import * as THREE from 'three';

const DEALER_CENTER   = new THREE.Vector3(0, 2.3, -3.0); // top of table, centred
const COL_SPACING     = 1.5;  // gap between dealer columns
const STAND_THRESHOLD = 17;

const THINK_BASE   = 1800; // ms before locking
const THINK_JITTER =  600;
const DECEL_WAIT   = 1300; // ms after lock() before card value is ready

export default class Dealer {
  constructor(scene, gameState) {
    this.scene     = scene;
    this.gameState = gameState;

    this._lockedColumns = []; // all drawn + snapped columns (kept visible)
    this._activeColumn  = null; // currently spinning column
    this._hand   = [];
    this._result = null;
    this._onDone = null;
    this._timers = [];
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * @param {Function} onDone       called with (result) when dealer stands/busts
   * @param {Function} onProgress   called with (total, cardCount) after each card
   */
  play(onDone, onProgress) {
    this._clearTimers();
    this.dispose();
    this._hand       = [];
    this._result     = null;
    this._onDone     = onDone ?? null;
    this._onProgress = onProgress ?? null;

    this._spawnActive();
    this._drawNext();
  }

  get result() { return this._result; }

  update(delta) {
    for (const col of this._lockedColumns) col.update(delta);
    if (this._activeColumn) this._activeColumn.update(delta);
  }

  dispose() {
    this._clearTimers();
    for (const col of this._lockedColumns) col.dispose();
    this._lockedColumns = [];
    if (this._activeColumn) {
      this._activeColumn.dispose();
      this._activeColumn = null;
    }
    this._hand   = [];
    this._result = null;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _spawnActive() {
    // New spinning column placed at dealer centre (will be repositioned once locked)
    this._activeColumn = new SlotColumn(this.scene, DEALER_CENTER.clone());
  }

  _drawNext() {
    const thinkTime = THINK_BASE + Math.random() * THINK_JITTER;

    const t1 = setTimeout(() => {
      if (!this._activeColumn) return;
      this._activeColumn.lock();

      const t2 = setTimeout(() => {
        if (!this._activeColumn) return;
        const card = this._activeColumn.getValue();
        if (!card) return;

        // Move active → locked list (keep it visible)
        this._lockedColumns.push(this._activeColumn);
        this._activeColumn = null;
        this._hand.push(card);
        this._result = this._evaluate(this._hand);

        if (this._onProgress) this._onProgress(this._result.total, this._hand.length);

        const shouldHit = this._result.total < STAND_THRESHOLD && !this._result.bust;

        if (shouldHit) {
          // Spawn next spinner, recentre all columns
          this._spawnActive();
          this._repositionAll();
          this._drawNext();
        } else {
          // Stand — recentre locked cards, done
          this._repositionAll();
          if (this._onDone) this._onDone(this._result);
        }
      }, DECEL_WAIT);

      this._timers.push(t2);
    }, thinkTime);

    this._timers.push(t1);
  }

  /**
   * Recentre all columns (locked + active spinner) around DEALER_CENTER.x.
   * Called every time the set of columns changes.
   */
  _repositionAll() {
    const all = [
      ...this._lockedColumns,
      ...(this._activeColumn ? [this._activeColumn] : []),
    ];
    const N = all.length;
    const totalWidth = (N - 1) * COL_SPACING;
    all.forEach((col, i) => {
      col.group.position.x = DEALER_CENTER.x - totalWidth / 2 + i * COL_SPACING;
      col.group.position.y = DEALER_CENTER.y;
      col.group.position.z = DEALER_CENTER.z;
    });
  }

  _evaluate(cards) {
    let total = 0, aces = 0;
    for (const { value, rank } of cards) {
      total += value;
      if (rank === 'A') aces++;
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return { total, bust: total > 21, soft: aces > 0 && total <= 21, cards: [...cards] };
  }

  _clearTimers() {
    this._timers.forEach(clearTimeout);
    this._timers = [];
  }
}
