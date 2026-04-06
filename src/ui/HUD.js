/**
 * HUD — pure HTML/CSS overlay for 21 Spin.
 * Phases: betting | spinning | player_choice | reveal | end
 */

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

#hud * { box-sizing: border-box; }

#hud {
  font-family: 'Press Start 2P', monospace;
  color: #fff;
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;
}

/* ── phase banner ── */
#hud-phase {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 24px;
  background: rgba(0,0,0,0.75);
  border: 2px solid #FFD700;
  border-radius: 999px;
  font-size: 13px;
  letter-spacing: 3px;
  color: #FFD700;
  text-shadow: 0 0 8px #FFD70099;
  white-space: nowrap;
}

/* ── shared panel ── */
.hud-panel {
  position: absolute;
  background: rgba(0,0,0,0.78);
  border: 2px solid #FFD700;
  border-radius: 12px;
  padding: 14px 18px;
}

/* ── player panel (bottom-left) ── */
#hud-player {
  bottom: 24px;
  left: 24px;
  min-width: 220px;
}

/* ── dealer panel (bottom-right) ── */
#hud-dealer {
  bottom: 24px;
  right: 24px;
  min-width: 180px;
  text-align: right;
}

/* ── typography ── */
.hud-label {
  font-size: 7px;
  color: #aaa;
  letter-spacing: 1px;
  margin-bottom: 4px;
}

.hud-value {
  font-size: 28px;
  color: #FFD700;
  line-height: 1;
  margin-bottom: 10px;
}

.hud-value.bust {
  color: #ff3333;
  animation: pulse-bust 0.6s infinite alternate;
}

@keyframes pulse-bust { from { opacity:1; } to { opacity:0.4; } }

.hud-sub {
  font-size: 9px;
  color: #ccc;
  margin-bottom: 10px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.hud-sub span { color: #FFD700; }

/* ── stop buttons ── */
#hud-stops {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
  pointer-events: auto;
}

.btn-stop {
  flex: 1;
  padding: 8px 4px;
  background: #8B0000;
  border: 2px solid #FFD700;
  border-radius: 6px;
  color: #FFD700;
  font-family: 'Press Start 2P', monospace;
  font-size: 8px;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
  min-width: 52px;
}
.btn-stop:hover:not(:disabled) { background: #cc0000; }
.btn-stop:active:not(:disabled) { transform: scale(0.95); }
.btn-stop:disabled { background: #333; border-color: #444; color: #555; cursor: default; }

/* ── bust warning ── */
#hud-bust {
  font-size: 9px;
  color: #ff3333;
  letter-spacing: 2px;
  margin-top: 4px;
  text-align: center;
  display: none;
}

/* ── dealer panel internals ── */
#hud-dealer-total {
  font-size: 26px;
  color: #FFD700;
  margin-bottom: 6px;
}
#hud-dealer-history {
  font-size: 8px;
  color: #aaa;
  margin-bottom: 4px;
  min-height: 14px;
}
#hud-dealer-status {
  font-size: 8px;
  color: #aaa;
  letter-spacing: 2px;
}

/* ── BETTING OVERLAY ── */
#hud-betting {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.88);
  border: 2px solid #FFD700;
  border-radius: 16px;
  padding: 28px 36px;
  text-align: center;
  pointer-events: auto;
  min-width: 300px;
  display: none;
}

#hud-betting-title {
  font-size: 10px;
  color: #FFD700;
  letter-spacing: 3px;
  margin-bottom: 18px;
}

#hud-betting-chips {
  font-size: 8px;
  color: #aaa;
  margin-bottom: 6px;
}

#hud-betting-amount {
  font-size: 32px;
  color: #FFD700;
  margin-bottom: 14px;
}

.bet-adj-row {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-bottom: 20px;
}

.btn-bet-adj {
  padding: 6px 10px;
  background: rgba(255,215,0,0.1);
  border: 2px solid #FFD700;
  border-radius: 6px;
  color: #FFD700;
  font-family: 'Press Start 2P', monospace;
  font-size: 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-bet-adj:hover { background: rgba(255,215,0,0.25); }
.btn-bet-adj:disabled { opacity: 0.3; cursor: default; }

#btn-deal {
  width: 100%;
  padding: 14px;
  background: #FFD700;
  border: none;
  border-radius: 8px;
  color: #000;
  font-family: 'Press Start 2P', monospace;
  font-size: 14px;
  cursor: pointer;
  letter-spacing: 2px;
  transition: background 0.15s, transform 0.1s;
}
#btn-deal:hover { background: #ffe033; }
#btn-deal:active { transform: scale(0.97); }

/* ── PLAYER CHOICE OVERLAY (HIT / PASS) ── */
#hud-choice {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0,0,0,0.88);
  border: 2px solid #FFD700;
  border-radius: 14px;
  padding: 20px 28px;
  text-align: center;
  pointer-events: auto;
  display: none;
  min-width: 260px;
}

#hud-choice-title {
  font-size: 8px;
  color: #aaa;
  letter-spacing: 2px;
  margin-bottom: 8px;
}

#hud-choice-total {
  font-size: 36px;
  color: #FFD700;
  margin-bottom: 16px;
  line-height: 1;
}

.choice-btns {
  display: flex;
  gap: 12px;
}

#btn-hit {
  flex: 1;
  padding: 12px 8px;
  background: #006600;
  border: 2px solid #00cc44;
  border-radius: 8px;
  color: #00ff66;
  font-family: 'Press Start 2P', monospace;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}
#btn-hit:hover { background: #008800; }
#btn-hit:active { transform: scale(0.96); }

#btn-pass {
  flex: 1;
  padding: 12px 8px;
  background: #660000;
  border: 2px solid #FFD700;
  border-radius: 8px;
  color: #FFD700;
  font-family: 'Press Start 2P', monospace;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}
#btn-pass:hover { background: #880000; }
#btn-pass:active { transform: scale(0.96); }

/* ── round flash ── */
#hud-round-flash {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.4s;
}
#hud-round-flash.show { opacity: 1; }
#hud-round-flash-inner {
  font-size: clamp(18px, 3.5vw, 34px);
  color: #FFD700;
  text-shadow: 0 0 30px #FFD700, 0 0 60px #FFD70066;
  text-align: center;
  line-height: 1.7;
}
`;

export default class HUD {
  /**
   * @param {GameState} gameState
   * @param {SlotColumn[]} columns  shared mutable array
   * @param {object} opts
   *   onDeal()        → main spawns columns + gameState.deal()
   *   onHit()         → main spawns 3rd column + gameState.hit()
   *   onPass()        → gameState.pass()
   *   onStopColumn(i) → columns[i].lock()
   */
  constructor(gameState, columns, opts = {}) {
    this.gameState  = gameState;
    this.columns    = columns;
    this.onDeal     = opts.onDeal     ?? null;
    this.onHit      = opts.onHit      ?? null;
    this.onPass     = opts.onPass     ?? null;
    this.onStopCol  = opts.onStopColumn ?? null;

    this._chips       = gameState.players['local']?.chips ?? 500;
    this._bet         = 100;
    this._hand        = [];
    this._result      = null;
    this._dealerResult = null;
    this._dealerHistory = []; // running totals per card

    this._injectStyles();
    this._buildDOM();
    this._bindGameState();
    // Show betting UI immediately
    this._onPhaseChange('betting', null);
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('hud-styles')) return;
    const s = document.createElement('style');
    s.id = 'hud-styles';
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  // ── DOM ────────────────────────────────────────────────────────────────────

  _buildDOM() {
    const root = document.getElementById('hud');
    root.innerHTML = '';

    // Phase banner
    this._phaseBanner = this._el('div', { id: 'hud-phase' }, 'BETTING');
    root.appendChild(this._phaseBanner);

    // Flash overlay
    this._flashOverlay = this._el('div', { id: 'hud-round-flash' });
    this._flashInner   = this._el('div', { id: 'hud-round-flash-inner' });
    this._flashOverlay.appendChild(this._flashInner);
    root.appendChild(this._flashOverlay);

    // ── Betting overlay ──
    this._bettingEl = this._el('div', { id: 'hud-betting' });
    this._bettingEl.innerHTML = `
      <div id="hud-betting-title">PLACE YOUR BET</div>
      <div id="hud-betting-chips">${this._chips} CHIPS</div>
      <div id="hud-betting-amount">${this._bet}</div>
      <div class="bet-adj-row">
        <button class="btn-bet-adj" data-delta="-50">-50</button>
        <button class="btn-bet-adj" data-delta="-25">-25</button>
        <button class="btn-bet-adj" data-delta="+25">+25</button>
        <button class="btn-bet-adj" data-delta="+50">+50</button>
      </div>
      <button id="btn-deal">SPIN!</button>
    `;
    this._bettingEl.querySelectorAll('.btn-bet-adj').forEach(btn => {
      btn.addEventListener('click', () => this._adjustBet(parseInt(btn.dataset.delta)));
    });
    this._bettingEl.querySelector('#btn-deal').addEventListener('click', () => {
      if (this.onDeal) this.onDeal(this._bet);
    });
    root.appendChild(this._bettingEl);
    this._bettingAmountEl = this._bettingEl.querySelector('#hud-betting-amount');
    this._bettingChipsEl  = this._bettingEl.querySelector('#hud-betting-chips');

    // ── HIT / PASS overlay ──
    this._choiceEl = this._el('div', { id: 'hud-choice' });
    this._choiceEl.innerHTML = `
      <div id="hud-choice-title">HIT OR PASS?</div>
      <div id="hud-choice-total">0</div>
      <div class="choice-btns">
        <button id="btn-hit">HIT</button>
        <button id="btn-pass">PASS</button>
      </div>
    `;
    this._choiceEl.querySelector('#btn-hit').addEventListener('click', () => {
      this._choiceEl.style.display = 'none';
      if (this.onHit) this.onHit();
    });
    this._choiceEl.querySelector('#btn-pass').addEventListener('click', () => {
      this._choiceEl.style.display = 'none';
      if (this.onPass) this.onPass();
    });
    this._choiceTotalEl = this._choiceEl.querySelector('#hud-choice-total');
    root.appendChild(this._choiceEl);

    // ── Player panel ──
    this._playerPanel = this._el('div', { id: 'hud-player', class: 'hud-panel' });
    this._playerPanel.innerHTML = `
      <div class="hud-label">HAND TOTAL</div>
      <div class="hud-value" id="hud-total">0</div>
      <div class="hud-sub">
        <span id="hud-chips">${this._chips}</span> CHIPS &nbsp;|&nbsp; BET <span id="hud-bet">${this._bet}</span>
      </div>
      <div id="hud-stops"></div>
      <div id="hud-bust">⚠ BUST RISK</div>
    `;
    this._totalEl = this._playerPanel.querySelector('#hud-total');
    this._stopsEl = this._playerPanel.querySelector('#hud-stops');
    this._bustEl  = this._playerPanel.querySelector('#hud-bust');
    root.appendChild(this._playerPanel);

    // ── Dealer panel ──
    this._dealerPanel = this._el('div', { id: 'hud-dealer', class: 'hud-panel' });
    this._dealerPanel.innerHTML = `
      <div class="hud-label">DEALER</div>
      <div id="hud-dealer-total">?</div>
      <div id="hud-dealer-history"></div>
      <div id="hud-dealer-status">WAITING...</div>
    `;
    this._dealerTotalEl   = this._dealerPanel.querySelector('#hud-dealer-total');
    this._dealerHistoryEl = this._dealerPanel.querySelector('#hud-dealer-history');
    this._dealerStatusEl  = this._dealerPanel.querySelector('#hud-dealer-status');
    root.appendChild(this._dealerPanel);
  }

  // ── GameState binding ──────────────────────────────────────────────────────

  _bindGameState() {
    this.gameState.on('phaseChange',  (phase, old) => this._onPhaseChange(phase, old));
    this.gameState.on('scoreUpdate',  (id, info)   => { if (id === 'local') this._onScoreUpdate(info); });
    this.gameState.on('roundEnd',     (results, dealer) => this._onRoundEnd(results, dealer));
  }

  _onPhaseChange(phase, _old) {
    const labels = {
      betting:       'BETTING',
      spinning:      'SPINNING',
      player_choice: 'HIT OR PASS?',
      reveal:        'REVEAL',
      end:           'END',
    };
    this._phaseBanner.textContent = labels[phase] ?? phase.toUpperCase();

    // Visibility logic
    this._bettingEl.style.display    = phase === 'betting'       ? 'block' : 'none';
    this._choiceEl.style.display     = phase === 'player_choice' ? 'block' : 'none';
    this._playerPanel.style.display  = phase === 'betting'       ? 'none'  : 'block';
    this._dealerPanel.style.display  = ['reveal', 'end'].includes(phase) ? 'block' : 'none';

    if (phase === 'spinning') {
      this._renderStopButtons();
    }

    if (phase === 'player_choice') {
      const total = this._result?.total ?? 0;
      this._choiceTotalEl.textContent = total;
    }

    if (phase === 'reveal') {
      // Reset dealer display for fresh reveal
      this._dealerTotalEl.textContent   = '?';
      this._dealerHistoryEl.textContent = '';
      this._dealerStatusEl.textContent  = 'DRAWING...';
      this._dealerHistory = [];
    }

    if (phase === 'betting') {
      // Reset for next round
      this._totalEl.textContent      = '0';
      this._totalEl.className        = 'hud-value';
      this._bustEl.style.display     = 'none';
      this._dealerTotalEl.textContent   = '?';
      this._dealerHistoryEl.textContent = '';
      this._dealerStatusEl.textContent  = 'WAITING...';
      this._hand   = [];
      this._result = null;
      this._dealerResult = null;
      this._dealerHistory = [];
      // Sync chips from GameState
      const localPlayer = this.gameState.players['local'];
      if (localPlayer) this._chips = localPlayer.chips;
      this._refreshBettingUI();
    }
  }

  _onScoreUpdate(info) {
    this._hand   = info.hand ?? [];
    this._result = info.result;
    this._refreshPlayerScore();
  }

  _onRoundEnd(results, dealerEntry) {
    const local = results.find(r => r.id === 'local');
    if (!local) return;

    const { outcome } = local;
    const total = local.result?.total ?? 0;

    let headline, sub;
    const delta = local.chipDelta ?? 0;
    const sign  = delta > 0 ? '+' : '';

    if (outcome === 'jackpot') {
      const rank = local.result?.tripleRank ?? '???';
      headline = `★ TRIPLE ${rank}! ★`; sub = `${sign}${delta} JACKPOT!`;
    } else if (local.result?.superBlackjack && outcome !== 'bust') {
      headline = 'SUPER 21 SPIN!'; sub = `${sign}${delta} chips (2x)`;
    } else if (local.result?.blackjack && outcome !== 'bust') {
      headline = '21 SPIN!'; sub = `${sign}${delta} chips (1.5x)`;
    } else if (outcome === 'bust') {
      headline = 'BUST!'; sub = `${delta} chips`;
    } else if (outcome === 'win') {
      headline = 'WIN!'; sub = `${sign}${delta} chips`;
    } else if (outcome === 'push') {
      headline = 'PUSH'; sub = `Both ${total}`;
    } else {
      headline = 'LOSE'; sub = `${delta} chips`;
    }

    this._flash(`${headline}\n${sub}`);
    this._chips = local.chips ?? this._chips;
    this._refreshSubLine();
  }

  // ── Player score display ───────────────────────────────────────────────────

  _refreshPlayerScore() {
    const total = this._result?.total ?? 0;
    this._totalEl.textContent = total;
    this._totalEl.className   = 'hud-value' + (total > 21 ? ' bust' : '');
    this._bustEl.style.display = (total > 18 && total <= 21) ? 'block' : 'none';
  }

  _refreshSubLine() {
    const chips = this._playerPanel.querySelector('#hud-chips');
    const bet   = this._playerPanel.querySelector('#hud-bet');
    if (chips) chips.textContent = this._chips;
    if (bet)   bet.textContent   = this._bet;
  }

  _refreshBettingUI() {
    this._bettingChipsEl.textContent = `${this._chips} CHIPS`;
    this._bettingAmountEl.textContent = this._bet;
    // Disable adj buttons if bet would go out of range
    this._bettingEl.querySelectorAll('.btn-bet-adj').forEach(btn => {
      const delta = parseInt(btn.dataset.delta);
      const next  = this._bet + delta;
      btn.disabled = next < 25 || next > this._chips;
    });
  }

  // ── Stop buttons ───────────────────────────────────────────────────────────

  _renderStopButtons() {
    this._stopsEl.innerHTML = '';
    const phase = this.gameState.phase;
    if (phase !== 'spinning') return;

    const inHit = this.gameState._inHitMode;
    const targets = inHit
      ? [{ col: this.columns[2], label: 'STOP 3', i: 2 }]
      : this.columns.slice(0, 2).map((col, i) => ({ col, label: `STOP ${i + 1}`, i }));

    for (const { col, label, i } of targets) {
      if (!col) continue;
      const locked = col.getValue() !== null;
      const btn = this._el('button', { class: 'btn-stop' }, label);
      if (locked) { btn.disabled = true; btn.textContent = `LOCK ${i + 1}`; }
      btn.addEventListener('click', () => {
        if (this.onStopCol) this.onStopCol(i);
        btn.disabled = true;
        btn.textContent = `LOCK ${i + 1}`;
      });
      this._stopsEl.appendChild(btn);
    }
  }

  // ── Dealer progress (called by main.js on each dealer card) ───────────────

  updateDealerProgress(total, cardCount) {
    this._dealerHistory.push(total);
    this._dealerTotalEl.textContent   = total;
    this._dealerHistoryEl.textContent = this._dealerHistory.join(' → ');
    this._dealerStatusEl.textContent  = cardCount === 1 ? 'DRAWING...' : `CARD ${cardCount}`;
  }

  setDealerResult(result) {
    this._dealerResult = result;
    this._dealerTotalEl.textContent  = result?.total ?? '?';
    this._dealerStatusEl.textContent = result?.bust ? 'BUST!' : 'STAND';
  }

  // ── Bet adjustment ─────────────────────────────────────────────────────────

  _adjustBet(delta) {
    const next = this._bet + delta;
    if (next < 25 || next > this._chips) return;
    this._bet = next;
    this._bettingAmountEl.textContent = this._bet;
    this._refreshBettingUI();
  }

  // ── Round flash ────────────────────────────────────────────────────────────

  _flash(text) {
    this._flashInner.textContent = text;
    this._flashOverlay.classList.add('show');
    setTimeout(() => this._flashOverlay.classList.remove('show'), 2500);
  }

  // ── Per-frame update (sync stop button states) ─────────────────────────────

  update() {
    if (this.gameState.phase !== 'spinning') return;
    const btns = this._stopsEl.querySelectorAll('.btn-stop');
    this.columns.forEach((col, i) => {
      if (!btns[i]) return;
      if (col.getValue() !== null && !btns[i].disabled) {
        btns[i].disabled    = true;
        btns[i].textContent = `LOCK ${i + 1}`;
      }
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _el(tag, attrs = {}, text) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else el.setAttribute(k, v);
    }
    if (text !== undefined) el.textContent = text;
    return el;
  }
}
