/**
 * RemotePlayerManager — creates, updates, and removes remote player characters.
 */

import RemoteCharacter from './RemoteCharacter.js';

export default class RemotePlayerManager {
  constructor(scene) {
    this._scene   = scene;
    this._players = new Map(); // id → RemoteCharacter
  }

  /** Add a remote player and start loading their model. */
  add(id, username, initPos) {
    if (this._players.has(id)) return;
    const rc = new RemoteCharacter(this._scene, username, initPos);
    rc.load().catch(err => console.warn('[RemotePlayerManager] load failed', err));
    this._players.set(id, rc);
  }

  remove(id) {
    const rc = this._players.get(id);
    if (!rc) return;
    rc.dispose();
    this._players.delete(id);
  }

  applyMove(id, { x, y, z, facing, moveState }) {
    this._players.get(id)?.applySnapshot(x, y, z, facing, moveState);
  }

  /** Update the hand total shown below the player's name tag. */
  setHandTotal(id, total) {
    this._players.get(id)?.setHandTotal(total);
  }

  /** Returns the current world-space position of a remote character's model, or null. */
  getPosition(id) {
    const rc = this._players.get(id);
    return rc?._char._model?.position ?? null;
  }

  /** Call every frame. */
  update(delta) {
    for (const rc of this._players.values()) rc.update(delta);
  }

  clear() {
    for (const id of [...this._players.keys()]) this.remove(id);
  }
}
