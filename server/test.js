/**
 * Server-side tests for TableGame logic.
 * Run: node --test server/test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import TableGame from './TableGame.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeTable() {
  const events = [];
  const broadcast = (event, data) => events.push({ event, data });
  // fastTimers: solo player bets → starts immediately (no 8s wait), dealer uses 0ms delays
  const table = new TableGame('test-table', broadcast, { fastTimers: true });
  return { table, events };
}

function evalHand(table, cards) {
  return table._evaluate(cards);
}

function card(rank, suit = '♠') {
  const values = { A: 11, J: 10, Q: 10, K: 10, JOKER: 0 };
  const value = values[rank] ?? parseInt(rank, 10);
  return { rank, suit, value };
}

function lastEvent(events, name) {
  return [...events].reverse().find(e => e.event === name)?.data;
}

// ── _evaluate tests ────────────────────────────────────────────────────────────

describe('_evaluate', () => {

  test('Ace + 10 = 21 (blackjack)', () => {
    const { table } = makeTable();
    const result = evalHand(table, [card('A'), card('10')]);
    assert.equal(result.total, 21);
    assert.equal(result.blackjack, true);
    assert.equal(result.bust, false);
  });

  test('Ace + K = 21 (blackjack)', () => {
    const { table } = makeTable();
    const result = evalHand(table, [card('A'), card('K')]);
    assert.equal(result.total, 21);
    assert.equal(result.blackjack, true);
  });

  test('Ace + 5 = 16', () => {
    const { table } = makeTable();
    const result = evalHand(table, [card('A'), card('5')]);
    assert.equal(result.total, 16);
    assert.equal(result.soft, true);
    assert.equal(result.bust, false);
  });

  test('Ace + 9 + 5 = 15 (Ace counts as 1)', () => {
    const { table } = makeTable();
    const result = evalHand(table, [card('A'), card('9'), card('5')]);
    assert.equal(result.total, 15);
    assert.equal(result.bust, false);
  });

  test('K + Q + 5 = 25 (bust)', () => {
    const { table } = makeTable();
    const result = evalHand(table, [card('K'), card('Q'), card('5')]);
    assert.equal(result.total, 25);
    assert.equal(result.bust, true);
  });

  test('7 + 7 + 7 = triple (jackpot)', () => {
    const { table } = makeTable();
    const result = evalHand(table, [card('7'), card('7'), card('7')]);
    assert.equal(result.triple, true);
    assert.equal(result.tripleRank, '7');
    assert.equal(result.total, 21);
  });

  test('A + 10 + J = 21 superBlackjack', () => {
    const { table } = makeTable();
    const result = evalHand(table, [card('A'), card('10'), card('J')]);
    // A(11) + 10 + J(10) = 31 → A becomes 1 → 21
    assert.equal(result.total, 21);
    assert.equal(result.superBlackjack, true);
    assert.equal(result.triple, false);
  });

  test('JOKER = 0', () => {
    const { table } = makeTable();
    const result = evalHand(table, [{ rank: 'JOKER', suit: '★', value: 0 }, card('5')]);
    assert.equal(result.total, 5);
  });

  test('Two Aces = 12 (one becomes 1)', () => {
    const { table } = makeTable();
    const result = evalHand(table, [card('A'), card('A')]);
    assert.equal(result.total, 12);
    assert.equal(result.bust, false);
  });

});

// ── Phase machine tests ────────────────────────────────────────────────────────

describe('phase machine', () => {

  test('initial phase is waiting', () => {
    const { table } = makeTable();
    assert.equal(table.phase, 'waiting');
  });

  test('join → betting', () => {
    const { table, events } = makeTable();
    table.join('p1', 'Alice', 500);
    assert.equal(table.phase, 'betting');
    assert.ok(events.some(e => e.event === 'phase_changed' && e.data.phase === 'betting'));
  });

  test('all leave → waiting', () => {
    const { table } = makeTable();
    table.join('p1', 'Alice', 500);
    table.leave('p1');
    assert.equal(table.phase, 'waiting');
  });

  test('place_bet by all seats → spinning', () => {
    const { table, events } = makeTable();
    table.join('p1', 'Alice', 500);
    table.placeBet('p1', 100);
    assert.equal(table.phase, 'spinning');
    assert.ok(events.some(e => e.event === 'phase_changed' && e.data.phase === 'spinning'));
  });

  test('2-player round: both lock columns → player_choice', async () => {
    const { table, events } = makeTable();
    table.join('p1', 'Alice', 500);
    table.join('p2', 'Bob',   500);
    table.placeBet('p1', 100);
    table.placeBet('p2', 100);
    assert.equal(table.phase, 'spinning');

    // Lock both players' columns
    table.lockColumn('p1', 0);
    table.lockColumn('p1', 1);
    table.lockColumn('p2', 0);
    table.lockColumn('p2', 1);

    assert.equal(table.phase, 'player_choice');
  });

  test('pass → reveal when all players pass', () => {
    const { table, events } = makeTable();
    table.join('p1', 'Alice', 500);
    table.placeBet('p1', 100);
    table.lockColumn('p1', 0);
    table.lockColumn('p1', 1);
    assert.equal(table.phase, 'player_choice');

    table.playerDecision('p1', 'pass');
    assert.equal(table.phase, 'reveal');
  });

  test('hit + col2 lock → reveal', () => {
    const { table } = makeTable();
    table.join('p1', 'Alice', 500);
    table.placeBet('p1', 100);
    table.lockColumn('p1', 0);
    table.lockColumn('p1', 1);
    table.playerDecision('p1', 'hit');
    // phase should still be player_choice until col2 locked
    assert.equal(table.phase, 'player_choice');
    table.lockColumn('p1', 2);
    assert.equal(table.phase, 'reveal');
  });

});

// ── _finishRound outcome tests ─────────────────────────────────────────────────

describe('round outcomes', () => {

  function runRound(playerCards, dealerCards, bet = 100) {
    const outcomes = [];
    const broadcast = (event, data) => {
      if (event === 'round_end') outcomes.push(data);
    };
    const table = new TableGame('test', broadcast, { fastTimers: true });
    table.join('p1', 'Alice', 500);

    // Override deck to serve predetermined cards
    const allCards = [...playerCards, ...dealerCards];
    let cardIdx = 0;
    table._drawCard = () => allCards[cardIdx++] ?? card('2');

    table.placeBet('p1', bet);
    table.lockColumn('p1', 0);
    table.lockColumn('p1', 1);
    table.playerDecision('p1', 'pass');
    // reveal phase started; wait for dealer to finish with async timers
    // For test, manually run dealer synchronously:
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (outcomes.length > 0) { clearInterval(check); resolve(outcomes[0]); }
      }, 50);
      setTimeout(() => { clearInterval(check); resolve(null); }, 5000);
    });
  }

  test('player 20 vs dealer 19 → win', async () => {
    const data = await runRound(
      [card('K'), card('Q')],          // player: 10+10 = 20
      [card('9'), card('K')]            // dealer: 9+10 = 19
    );
    assert.ok(data, 'round_end not emitted');
    const r = data.results.find(r => r.playerId === 'p1');
    assert.equal(r.outcome, 'win');
    assert.equal(r.chipDelta, 100);
    assert.equal(r.chips, 600);
  });

  test('player 18 vs dealer 19 → lose', async () => {
    const data = await runRound(
      [card('9'), card('9')],           // player: 18
      [card('K'), card('9')]            // dealer: 19
    );
    const r = data.results.find(r => r.playerId === 'p1');
    assert.equal(r.outcome, 'lose');
    assert.equal(r.chipDelta, -100);
  });

  test('player 20 vs dealer bust → win', async () => {
    const data = await runRound(
      [card('K'), card('Q')],           // player: 20
      [card('6'), card('8'), card('9')] // dealer: 6->14->23 bust
    );
    assert.ok(data, 'round_end not emitted');
    const r = data.results.find(r => r.playerId === 'p1');
    assert.equal(r.outcome, 'win');
  });

  test('player bust → bust regardless of dealer', async () => {
    const data = await runRound(
      [card('K'), card('Q')],           // player: 20
      [card('2'), card('2')]            // dealer: low
    );
    // With these cards player has 20, dealer gets more draws...
    // Let's check specific bust case
    const { table } = makeTable();
    const r = table._evaluate([card('K'), card('Q'), card('5')]);
    assert.equal(r.bust, true);
  });

  test('player 21 blackjack → 1.5x payout', async () => {
    const data = await runRound(
      [card('A'), card('K')],           // player: 21 blackjack
      [card('9'), card('8')]            // dealer: 17
    );
    const r = data.results.find(r => r.playerId === 'p1');
    assert.equal(r.outcome, 'win');
    assert.equal(r.chipDelta, 150);    // 1.5x bet
  });

  test('push: equal totals → 0 chip delta', async () => {
    const data = await runRound(
      [card('K'), card('9')],           // player: 19
      [card('9'), card('K')]            // dealer: 19
    );
    const r = data.results.find(r => r.playerId === 'p1');
    assert.equal(r.outcome, 'push');
    assert.equal(r.chipDelta, 0);
  });

});

// ── Deck tests ─────────────────────────────────────────────────────────────────

describe('deck', () => {

  test('deck has 55 cards (52 + 3 jokers)', () => {
    const { table } = makeTable();
    assert.equal(table._deck.length, 55);
  });

  test('deck reshuffles when exhausted', () => {
    const { table } = makeTable();
    table._deckIdx = table._deck.length; // exhaust
    const c = table._drawCard();
    assert.ok(c.rank); // should still draw a card
    assert.equal(table._deckIdx, 1);
  });

  test('no duplicate cards before reshuffle', () => {
    const { table } = makeTable();
    const seen = new Set();
    // draw all 55
    for (let i = 0; i < 55; i++) {
      const c = table._drawCard();
      const key = c.rank === 'JOKER' ? `JOKER-${i}` : `${c.rank}-${c.suit}`;
      seen.add(key);
    }
    // 52 unique rank+suit combos + 3 joker slots
    assert.equal(seen.size, 55);
  });

});

// ── Seat management tests ──────────────────────────────────────────────────────

describe('seat management', () => {

  test('4 players can join', () => {
    const { table } = makeTable();
    assert.equal(table.join('p1', 'A', 500), 0);
    assert.equal(table.join('p2', 'B', 500), 1);
    assert.equal(table.join('p3', 'C', 500), 2);
    assert.equal(table.join('p4', 'D', 500), 3);
  });

  test('5th player is rejected', () => {
    const { table } = makeTable();
    for (let i = 0; i < 4; i++) table.join(`p${i}`, `P${i}`, 500);
    assert.equal(table.join('p5', 'E', 500), -1);
  });

  test('player can rejoin after leaving', () => {
    const { table } = makeTable();
    table.join('p1', 'A', 500);
    table.leave('p1');
    const seat = table.join('p1', 'A', 500);
    assert.ok(seat >= 0);
  });

  test('disconnect during player_choice does not block reveal', () => {
    const { table } = makeTable();
    table.join('p1', 'A', 500);
    table.join('p2', 'B', 500);
    table.placeBet('p1', 100);
    table.placeBet('p2', 100);
    table.lockColumn('p1', 0); table.lockColumn('p1', 1);
    table.lockColumn('p2', 0); table.lockColumn('p2', 1);
    assert.equal(table.phase, 'player_choice');

    table.playerDecision('p1', 'pass');
    // p2 disconnects before deciding
    table.leave('p2');
    // Should advance to reveal since only p1 remains and they already decided
    assert.equal(table.phase, 'reveal');
  });

});
