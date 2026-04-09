/**
 * JoinScreen — username entry overlay shown before the game starts.
 */

const STYLES = `
#join-screen {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  font-family: 'Press Start 2P', monospace;
}

#join-screen.hidden { display: none; }

#join-box {
  background: rgba(0,0,0,0.88);
  border: 2px solid #FFD700;
  border-radius: 16px;
  padding: 40px 48px;
  text-align: center;
  min-width: 340px;
}

#join-title {
  font-size: 22px;
  color: #FFD700;
  text-shadow: 0 0 20px #FFD70099;
  margin-bottom: 6px;
  letter-spacing: 4px;
}

#join-subtitle {
  font-size: 8px;
  color: #888;
  margin-bottom: 32px;
  letter-spacing: 2px;
}

#join-input {
  width: 100%;
  padding: 12px 16px;
  background: rgba(255,215,0,0.08);
  border: 2px solid #FFD700;
  border-radius: 8px;
  color: #FFD700;
  font-family: 'Press Start 2P', monospace;
  font-size: 14px;
  text-align: center;
  outline: none;
  margin-bottom: 20px;
  letter-spacing: 2px;
}

#join-input::placeholder { color: #555; }
#join-input:focus { border-color: #ffe033; background: rgba(255,215,0,0.12); }

#join-btn {
  width: 100%;
  padding: 14px;
  background: #FFD700;
  border: none;
  border-radius: 8px;
  color: #000;
  font-family: 'Press Start 2P', monospace;
  font-size: 13px;
  cursor: pointer;
  letter-spacing: 2px;
  transition: background 0.15s, transform 0.1s;
}
#join-btn:hover  { background: #ffe033; }
#join-btn:active { transform: scale(0.97); }
#join-btn:disabled { background: #555; color: #888; cursor: default; }

#join-error {
  font-size: 8px;
  color: #ff4444;
  margin-top: 12px;
  min-height: 16px;
}
`;

export default class JoinScreen {
  constructor(onJoin) {
    this._onJoin = onJoin;
    this._inject();
    this._build();
  }

  _inject() {
    if (document.getElementById('join-styles')) return;
    const s = document.createElement('style');
    s.id = 'join-styles';
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  _build() {
    this._el = document.getElementById('join-screen');
    if (!this._el) return;

    this._el.innerHTML = `
      <div id="join-box">
        <div id="join-title">21 SPIN</div>
        <div id="join-subtitle">ONLINE CASINO</div>
        <input id="join-input" type="text" maxlength="16" placeholder="ENTER USERNAME" autocomplete="off" spellcheck="false" />
        <button id="join-btn">JOIN TABLE</button>
        <div id="join-error"></div>
      </div>
    `;

    const input = this._el.querySelector('#join-input');
    const btn   = this._el.querySelector('#join-btn');
    const error = this._el.querySelector('#join-error');

    const submit = () => {
      const name = input.value.trim();
      if (!name) { error.textContent = 'USERNAME REQUIRED'; return; }
      error.textContent = '';
      btn.disabled = true;
      btn.textContent = 'CONNECTING...';
      this._onJoin(name);
    };

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    input.focus();
  }

  show() { this._el?.classList.remove('hidden'); }
  hide() { this._el?.classList.add('hidden'); }
}
