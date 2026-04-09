/**
 * TableGame — server-side game logic for one blackjack table.
 * Authoritative card deck, dealer AI, phase machine, scoring.
 */

const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = ['♠','♥','♦','♣'];
const STAND_THRESHOLD = 17;

const THINK_BASE          = 1200;  // ms before dealer locks
const THINK_JITTER        =  400;
const DECEL_WAIT          =  900;  // ms after lock before card value ready
const COL0_LOCK_MS        =  4000; // auto-lock player col 0
const COL1_LOCK_MS        =  5500; // auto-lock player col 1
const HIT_COL_LOCK_MS     =  4000; // auto-lock col 2 after hit
const END_WAIT_MS         =  3500; // betting phase restart delay
const DECISION_TIMEOUT_MS = 20000; // 20s to hit/pass before auto-pass

function cardValue(rank) {
  if (rank === 'JOKER') return 0;
  if (rank === 'A') return 11;
  if (['J','Q','K'].includes(rank)) return 10;
  return parseInt(rank, 10);
}

function buildDeck() {
  const pool = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      pool.push({ rank, suit, value: cardValue(rank) });
  for (let i = 0; i < 3; i++)
    pool.push({ rank: 'JOKER', suit: '★', value: 0 });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

export default class TableGame {
  /**
   * @param {string} tableId
   * @param {Function} broadcast      (event, data) → io.to(tableId).emit(event, data)
   * @param {{ fastTimers?: boolean, sendToPlayer?: Function }} opts
   *   fastTimers:    pass true in tests for 0ms dealer delays
   *   sendToPlayer:  (playerId, event, data) → io.to(playerId).emit(event, data)
   */
  constructor(tableId, broadcast, opts = {}) {
    this.tableId       = tableId;
    this._broadcast    = broadcast;
    this._sendToPlayer = opts.sendToPlayer ?? (() => {});
    this._fastTimers   = opts.fastTimers ?? false;

    this._phase   = 'waiting';
    this._deck    = buildDeck();
    this._deckIdx = 0;

    // 4 seats: null | { id, username, chips, bet, hand, colsLocked, hitDecision, hitColLocked, done, result }
    this._seats = [null, null, null, null];

    // Turn state (player_choice phase)
    this._turnOrder = [];   // player ids in seat order
    this._turnIndex = 0;    // index into _turnOrder of whose turn it is

    // Timers
    this._decisionTimer   = null; // auto-pass timer for current player's turn
    this._autoLockTimers  = {}; // { playerId: [t0, t1, t2?] }
    this._dealerTimers    = [];

    this._dealerHand = [];
  }

  // ── Public API (called by CasinoRoom) ──────────────────────────────────────

  get phase() { return this._phase; }

  /**
   * Returns seatIndex (0-3), -1 if table full, or -2 if round in progress.
   */
  join(id, username, chips = 500) {
    if (this._phase !== 'waiting' && this._phase !== 'betting') return -2;
    const seat = this._seats.indexOf(null);
    if (seat === -1) return -1;
    this._seats[seat] = { id, username, chips, bet: 0, hand: [], colsLocked: 0,
                          hitDecision: null, hitColLocked: false, done: false, result: null };
    if (this._phase === 'waiting') this._setPhase('betting');
    return seat;
  }

  leave(id) {
    const idx = this._seatOf(id);
    if (idx === -1) return;

    // Check BEFORE nulling the seat whether it was this player's turn
    const wasCurrentTurn = this._phase === 'player_choice' && this._currentTurnPlayer() === id;

    this._cancelAutoLock(id);
    this._seats[idx] = null;

    const stillSeated = this._seats.filter(Boolean);
    if (stillSeated.length === 0) {
      this._cancelAll();
      this._setPhase('waiting');
      return;
    }

    if (this._phase === 'spinning')       this._checkAllColsLocked();
    if (this._phase === 'player_choice') {
      if (wasCurrentTurn) {
        clearTimeout(this._decisionTimer);
        this._decisionTimer = null;
        this._advanceTurn();
      } else {
        this._checkAllDone();
      }
    }
  }

  placeBet(id, bet) {
    if (this._phase !== 'betting') return;
    const seat = this._seatOf(id);
    if (seat === -1) return;
    const chips = this._seats[seat].chips;
    const validBet = Math.max(25, Math.min(bet, chips));
    this._seats[seat].bet = validBet;
    this._broadcast('bet_placed', { tableId: this.tableId, playerId: id, bet: validBet });

    // In test mode (fastTimers), start immediately once all bets are in.
    // In production, CasinoRoom's global tick calls forceStartRound().
    if (this._fastTimers && this._allBetsIn()) this._startRound();
  }

  /**
   * Called by CasinoRoom on each global betting tick.
   * Starts the round if anyone has placed a bet, auto-fills 25 for no-shows.
   */
  forceStartRound() {
    if (this._phase !== 'betting') return;
    const seated = this._seats.filter(Boolean);
    if (seated.length === 0) return;
    // Auto-bet minimum for seated players who didn't bet in time
    for (const s of seated) { if (!s.bet) s.bet = 25; }
    this._startRound();
  }

  lockColumn(id, colIndex) {
    const seatIdx = this._seatOf(id);
    if (seatIdx === -1) return;
    const seat = this._seats[seatIdx];

    if (colIndex === 0 || colIndex === 1) {
      if (this._phase !== 'spinning') return;
      if (seat.colsLocked > colIndex) return; // already locked
      this._assignCard(id, colIndex);
      this._cancelAutoLock(id, colIndex);
      seat.colsLocked = colIndex + 1;
      if (seat.colsLocked === 2) this._checkAllColsLocked();
    }

    if (colIndex === 2) {
      if (this._phase !== 'player_choice') return;
      if (seat.hitDecision !== 'hit') return;
      if (seat.hitColLocked) return;
      this._assignCard(id, 2);
      this._cancelAutoLock(id, 2);
      seat.hitColLocked = true;
      seat.done = true;
      this._advanceTurn();
    }
  }

  playerDecision(id, decision) {
    if (this._phase !== 'player_choice') return;
    const seatIdx = this._seatOf(id);
    if (seatIdx === -1) return;
    const seat = this._seats[seatIdx];
    if (seat.done || seat.hitDecision !== null) return;

    // Validate it is this player's turn
    if (this._currentTurnPlayer() !== id) return;

    clearTimeout(this._decisionTimer);
    this._decisionTimer = null;

    seat.hitDecision = decision;
    this._broadcast('player_decision', { tableId: this.tableId, playerId: id, decision });

    if (decision === 'pass') {
      seat.done = true;
      this._advanceTurn();
    } else if (decision === 'hit') {
      // Start col2 auto-lock timer; turn advances after col2 is locked
      const t = setTimeout(() => this.lockColumn(id, 2), HIT_COL_LOCK_MS);
      if (!this._autoLockTimers[id]) this._autoLockTimers[id] = [];
      this._autoLockTimers[id][2] = t;
    }
  }

  getState() {
    return {
      tableId:  this.tableId,
      phase:    this._phase,
      seats:    this._seats.map((s, i) => s ? {
        id: s.id, username: s.username, chips: s.chips, seatIndex: i,
        bet: s.bet, colsLocked: s.colsLocked, done: s.done,
      } : null),
    };
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _startRound() {
    for (const s of this._seats) {
      if (!s) continue;
      s.hand = []; s.colsLocked = 0; s.hitDecision = null;
      s.hitColLocked = false; s.done = false; s.result = null;
    }
    this._dealerHand = [];
    this._setPhase('spinning');

    for (const [i, seat] of this._seats.entries()) {
      if (!seat) continue;
      const t0 = setTimeout(() => this.lockColumn(seat.id, 0), COL0_LOCK_MS);
      const t1 = setTimeout(() => this.lockColumn(seat.id, 1), COL1_LOCK_MS);
      this._autoLockTimers[seat.id] = [t0, t1];
    }
  }

  _assignCard(playerId, colIndex) {
    const card = this._drawCard();
    const seatIdx = this._seatOf(playerId);
    if (seatIdx === -1) return;
    const seat = this._seats[seatIdx];

    if (colIndex < 2) {
      if (!seat.hand[colIndex]) seat.hand[colIndex] = card;
    } else {
      seat.hand[2] = card;
      seat.result = this._evaluate(seat.hand);
    }

    this._broadcast('card_result', {
      tableId: this.tableId,
      playerId, colIndex,
      rank: card.rank, suit: card.suit, value: card.value,
    });
  }

  _checkAllColsLocked() {
    const seated = this._seats.filter(Boolean);
    if (seated.every(s => s.colsLocked >= 2)) {
      for (const seat of seated) this._cancelAutoLock(seat.id, 0);
      for (const seat of seated) {
        if (seat.hand.length >= 2) seat.result = this._evaluate(seat.hand.slice(0, 2));
      }
      this._setPhase('player_choice');

      // Set up turn order and send first your_turn
      this._setupTurnOrder();
      const firstId = this._turnOrder[0];
      if (firstId) {
        const firstSeat = this._seats.find(s => s?.id === firstId);
        const total    = firstSeat?.result?.total ?? 0;
        const deadline = Date.now() + DECISION_TIMEOUT_MS;
        this._broadcast('turn_changed', { tableId: this.tableId, currentPlayerId: firstId });
        this._sendToPlayer(firstId, 'your_turn', { tableId: this.tableId, total, deadline });
        this._decisionTimer = setTimeout(() => this.playerDecision(firstId, 'pass'), DECISION_TIMEOUT_MS);
      }
    }
  }

  _checkAllDone() {
    const seated = this._seats.filter(Boolean);
    if (seated.every(s => s.done)) {
      for (const seat of seated) {
        seat.result = this._evaluate(seat.hand);
      }
      this._triggerReveal();
    }
  }

  _triggerReveal() {
    this._cancelAutoLockAll();
    this._setPhase('reveal');
    this._runDealer();
  }

  _runDealer() {
    const thinkTime = this._fastTimers ? 0 : THINK_BASE + Math.random() * THINK_JITTER;
    const decelWait = this._fastTimers ? 0 : DECEL_WAIT;
    const t1 = setTimeout(() => {
      const card = this._drawCard();
      const t2 = setTimeout(() => {
        this._dealerHand.push(card);
        const result = this._evaluate(this._dealerHand);
        this._broadcast('dealer_card', {
          tableId: this.tableId,
          rank: card.rank, suit: card.suit, value: card.value,
          total: result.total, cardCount: this._dealerHand.length,
        });

        if (!result.bust && result.total < STAND_THRESHOLD) {
          this._runDealer();
        } else {
          this._finishRound(result);
        }
      }, decelWait);
      this._dealerTimers.push(t2);
    }, thinkTime);
    this._dealerTimers.push(t1);
  }

  _finishRound(dealerResult) {
    const dealerEntry = { ...dealerResult };
    const results = [];

    for (const seat of this._seats) {
      if (!seat) continue;
      const r = seat.result ?? this._evaluate(seat.hand);
      const pTotal = r.total;
      const dTotal = dealerResult.total;
      const pBust  = r.bust;
      const dBust  = dealerResult.bust;

      let outcome;
      if (pBust)                          outcome = 'bust';
      else if (dBust || pTotal > dTotal)  outcome = 'win';
      else if (pTotal === dTotal)         outcome = 'push';
      else                                outcome = 'lose';

      const bet = seat.bet || 100;
      let chipDelta = 0;
      if (r.triple)              chipDelta = bet * 5;
      else if (r.superBlackjack) chipDelta = Math.floor(bet * 2);
      else if (r.blackjack)      chipDelta = Math.floor(bet * 1.5);
      else if (outcome === 'win')  chipDelta = bet;
      else if (outcome === 'push') chipDelta = 0;
      else                         chipDelta = -bet;

      if (r.triple) outcome = 'jackpot';

      seat.chips = Math.max(0, (seat.chips || 500) + chipDelta);

      results.push({
        playerId: seat.id, username: seat.username,
        outcome, chipDelta, chips: seat.chips,
        hand: seat.hand, result: r,
      });
    }

    this._setPhase('end');
    this._broadcast('round_end', { tableId: this.tableId, results, dealerHand: dealerEntry });

    const t = setTimeout(() => {
      if (this._seats.filter(Boolean).length > 0) this._setPhase('betting');
      else this._setPhase('waiting');
    }, END_WAIT_MS);
    this._dealerTimers.push(t);
  }

  _drawCard() {
    if (this._deckIdx >= this._deck.length) {
      this._deck = buildDeck();
      this._deckIdx = 0;
    }
    return this._deck[this._deckIdx++];
  }

  _evaluate(cards) {
    let total = 0, aces = 0;
    for (const { value, rank } of cards) {
      total += value;
      if (rank === 'A') aces++;
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    const triple = cards.length === 3 &&
      cards[0].rank === cards[1].rank && cards[1].rank === cards[2].rank;
    return {
      total,
      bust:           total > 21,
      blackjack:      total === 21 && cards.length === 2,
      superBlackjack: total === 21 && cards.length === 3 && !triple,
      triple,
      tripleRank:     triple ? cards[0].rank : null,
      soft:           aces > 0 && total <= 21,
      cards: [...cards],
    };
  }

  _seatOf(id) {
    return this._seats.findIndex(s => s?.id === id);
  }

  _allBetsIn() {
    return this._seats.filter(Boolean).every(s => s.bet > 0);
  }

  _setPhase(phase) {
    this._phase = phase;
    this._broadcast('phase_changed', { tableId: this.tableId, phase });
    if (phase === 'betting') {
      for (const s of this._seats) { if (s) s.bet = 0; }
    }
  }

  // ── Turn order helpers ─────────────────────────────────────────────────────

  _setupTurnOrder() {
    this._turnOrder = this._seats
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s !== null)
      .map(({ s }) => s.id); // already in seat index order (0→3)
    this._turnIndex = 0;
  }

  _currentTurnPlayer() {
    return this._turnOrder[this._turnIndex] ?? null;
  }

  _advanceTurn() {
    this._turnIndex++;
    if (this._turnIndex >= this._turnOrder.length) {
      // All players have had their turn
      this._checkAllDone();
      return;
    }

    const nextId   = this._turnOrder[this._turnIndex];
    const nextSeat = this._seats.find(s => s?.id === nextId);

    if (!nextSeat || nextSeat.done) {
      // Player disconnected or already done — skip
      this._advanceTurn();
      return;
    }

    const total    = nextSeat.result?.total ?? 0;
    const deadline = Date.now() + DECISION_TIMEOUT_MS;
    this._broadcast('turn_changed', { tableId: this.tableId, currentPlayerId: nextId });
    this._sendToPlayer(nextId, 'your_turn', { tableId: this.tableId, total, deadline });
    this._decisionTimer = setTimeout(() => this.playerDecision(nextId, 'pass'), DECISION_TIMEOUT_MS);
  }

  // ── Timer helpers ──────────────────────────────────────────────────────────

  _cancelAutoLock(id, colIndex) {
    const timers = this._autoLockTimers[id];
    if (!timers) return;
    if (colIndex === undefined) {
      timers.forEach(clearTimeout);
      delete this._autoLockTimers[id];
    } else if (timers[colIndex]) {
      clearTimeout(timers[colIndex]);
      timers[colIndex] = null;
    }
  }

  _cancelAutoLockAll() {
    for (const id of Object.keys(this._autoLockTimers)) this._cancelAutoLock(id);
  }

  _cancelAll() {
    clearTimeout(this._decisionTimer);
    this._decisionTimer = null;
    this._cancelAutoLockAll();
    this._dealerTimers.forEach(clearTimeout);
    this._dealerTimers = [];
  }
}
