/**
 * GameState — phase machine for 21 Spin.
 *
 * Phases:
 *   betting       → spinning       (deal)
 *   spinning      → player_choice  (twoColumnsLocked)
 *   player_choice → spinning       (hit)      ← 3rd card spin
 *   player_choice → reveal         (pass)
 *   spinning      → reveal         (thirdColumnLocked)
 *   reveal        → end            (finishReveal)
 *   end           → betting        (reset)
 *
 * Events: 'phaseChange', 'scoreUpdate', 'roundEnd'
 */

const REVEAL_SAFETY_TIMEOUT = 15_000;

export class GameState extends EventTarget {
  constructor() {
    super();
    this.phase    = 'betting';
    this.round    = 0;
    this.players  = {};
    this._inHitMode   = false;
    this._revealTimer = null;
  }

  // ── Player registration ────────────────────────────────────────────────────

  addPlayer(id, name = 'Player') {
    this.players[id] = { id, name, score: 0, hand: [], result: null };
  }

  removePlayer(id) { delete this.players[id]; }

  // ── Phase transitions ──────────────────────────────────────────────────────

  /** betting → spinning */
  deal() {
    if (this.phase !== 'betting') return;
    this.round++;
    this._inHitMode = false;
    for (const p of Object.values(this.players)) { p.hand = []; p.result = null; }
    this._setPhase('spinning');
  }

  /**
   * Called after first 2 columns lock.
   * drawnCards: [{ playerId, cards: [{rank,suit,value}] }]
   */
  twoColumnsLocked(drawnCards = []) {
    if (this.phase !== 'spinning' || this._inHitMode) return;
    this._storeCards(drawnCards);
    this._setPhase('player_choice');
  }

  /** player_choice → spinning (3rd card) */
  hit() {
    if (this.phase !== 'player_choice') return;
    this._inHitMode = true;
    this._setPhase('spinning');
  }

  /** player_choice → reveal (skip 3rd card) */
  pass() {
    if (this.phase !== 'player_choice') return;
    this._startReveal();
  }

  /**
   * Called after the 3rd column locks (post-HIT).
   * cards are appended to existing hand.
   */
  thirdColumnLocked(drawnCards = []) {
    if (this.phase !== 'spinning' || !this._inHitMode) return;
    for (const { playerId, cards } of drawnCards) {
      const player = this.players[playerId];
      if (!player) continue;
      player.hand = [...player.hand, ...cards];
      player.result = this._evaluate(player.hand);
      this._emit('scoreUpdate', player.id, {
        hand: player.hand, result: player.result, score: player.score,
      });
    }
    this._startReveal();
  }

  _startReveal() {
    this._setPhase('reveal');
    clearTimeout(this._revealTimer);
    this._revealTimer = setTimeout(() => this._finishRound(), REVEAL_SAFETY_TIMEOUT);
  }

  /** Called by main.js after dealer.play() completes. */
  finishReveal() {
    if (this.phase !== 'reveal') return;
    clearTimeout(this._revealTimer);
    this._finishRound();
  }

  /** Store dealer hand for scoring (called from main after dealer done). */
  setDealerHand(cards) {
    const d = this.players['dealer'];
    if (!d) return;
    d.hand   = cards;
    d.result = this._evaluate(cards);
  }

  /** end → betting */
  reset() {
    clearTimeout(this._revealTimer);
    this._inHitMode = false;
    this._setPhase('betting');
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  _storeCards(drawnCards) {
    for (const { playerId, cards } of drawnCards) {
      const player = this.players[playerId];
      if (!player) continue;
      player.hand   = cards;
      player.result = this._evaluate(cards);
      this._emit('scoreUpdate', player.id, {
        hand: player.hand, result: player.result, score: player.score,
      });
    }
  }

  _finishRound() {
    if (this.phase !== 'reveal') return;

    const playerEntries = Object.values(this.players).filter(p => p.id !== 'dealer');
    const dealerEntry   = this.players['dealer'];

    const results = playerEntries.map(p => {
      const pTotal = p.result?.total ?? 0;
      const dTotal = dealerEntry?.result?.total ?? 0;
      const pBust  = p.result?.bust;
      const dBust  = dealerEntry?.result?.bust;

      let outcome;
      if (pBust) {
        outcome = 'bust';
      } else if (dBust || pTotal > dTotal) {
        outcome = 'win';
      } else if (pTotal === dTotal) {
        outcome = 'push';
      } else {
        outcome = 'lose';
      }

      // Award chips
      const player = this.players[p.id];
      if (player) {
        if (p.result?.total === 21) player.score += 3;
        else if (outcome === 'win')  player.score += 2;
        else if (outcome === 'push') player.score += 1;
      }

      return { ...p, outcome };
    }).sort((a, b) => (b.result?.total ?? 0) - (a.result?.total ?? 0));

    this._setPhase('end');
    this._emit('roundEnd', results, dealerEntry);
  }

  _evaluate(cards) {
    let total = 0, aces = 0;
    for (const { value, rank } of cards) {
      total += value;
      if (rank === 'A') aces++;
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return {
      total,
      bust:      total > 21,
      blackjack: total === 21 && cards.length <= 2,
      soft:      aces > 0 && total <= 21,
    };
  }

  _setPhase(newPhase) {
    const old = this.phase;
    this.phase = newPhase;
    this._emit('phaseChange', newPhase, old);
  }

  _emit(eventName, ...args) {
    this.dispatchEvent(Object.assign(new Event(eventName), { args }));
  }

  on(eventName, handler) {
    this.addEventListener(eventName, e => handler(...e.args));
    return this;
  }

  off(eventName, handler) {
    this.removeEventListener(eventName, handler);
    return this;
  }

  toJSON()     { return { phase: this.phase, round: this.round, players: this.players }; }
  fromJSON(d)  { this.phase = d.phase ?? 'betting'; this.round = d.round ?? 0; this.players = d.players ?? {}; }
}
