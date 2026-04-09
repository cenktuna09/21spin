/**
 * SocketClient — typed socket.io-client wrapper.
 * Extends EventTarget so callers can do:
 *   socketClient.on('card_result', handler)
 */

import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3000';

export default class SocketClient extends EventTarget {
  constructor() {
    super();
    this._socket = null;
    this.id      = null;
  }

  connect() {
    this._socket = io(SERVER_URL, { autoConnect: true });

    // Forward all socket events to EventTarget
    const events = [
      'welcome', 'player_joined', 'player_left',
      'player_moved', 'player_seated', 'player_left_table',
      'phase_changed', 'bet_placed', 'all_bets_in',
      'card_result', 'player_decision',
      'dealer_card', 'round_end',
      'table_full', 'state_sync',
      'your_turn', 'turn_changed', 'round_in_progress',
      'global_bet_deadline', 'queued_for_next_round',
    ];
    for (const name of events) {
      this._socket.on(name, (data) => {
        this.dispatchEvent(Object.assign(new Event(name), { data }));
      });
    }

    this._socket.on('welcome', (data) => {
      this.id = data.yourId;
    });

    this._socket.on('connect', () => {
      console.log('[SocketClient] connected', this._socket.id);
    });
    this._socket.on('disconnect', () => {
      console.log('[SocketClient] disconnected');
    });
  }

  /** Register a typed event handler. Returns `this` for chaining. */
  on(event, handler) {
    this.addEventListener(event, (e) => handler(e.data));
    return this;
  }

  emit(event, data) {
    this._socket?.emit(event, data);
  }

  get connected() {
    return this._socket?.connected ?? false;
  }
}
