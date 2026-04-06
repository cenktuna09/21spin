// party.js — PartyKit client connection and message handling
export class PartyConnection {
  constructor(roomId) {
    this.roomId = roomId;
    this.socket = null;
    this.listeners = new Map();
    // TODO: connect via PartyKit WebSocket
  }

  on(event, handler) {
    this.listeners.set(event, handler);
  }

  send(type, payload) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, payload }));
    }
  }
}
