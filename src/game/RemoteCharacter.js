/**
 * RemoteCharacter — a non-controllable character for other players.
 * Lerps toward incoming position snapshots.
 * Shows a CSS2DObject name tag above the head.
 */

import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import Character from './Character.js';

const LERP_SPEED = 10; // how fast position catches up per second

export default class RemoteCharacter {
  /**
   * @param {THREE.Scene} scene
   * @param {string} username
   * @param {{ x: number, y: number, z: number }} initPos
   */
  constructor(scene, username, initPos = { x: 0, y: -3.75, z: 0 }) {
    this._scene    = scene;
    this._username = username;

    const pos = new THREE.Vector3(initPos.x, initPos.y, initPos.z);
    this._char = new Character(scene, pos, { facing: 0, scale: 3.5, controllable: false });

    this._targetPos     = pos.clone();
    this._targetFacing  = 0;
    this._targetMove    = 'idle';
    this._labelAttached = false;

    // Build CSS2D name tag (name + hand total below)
    const div = document.createElement('div');
    div.className = 'player-label';
    div.innerHTML = `<span>${username}</span><span class="plabel-total"></span>`;
    this._totalSpan = div.querySelector('.plabel-total');
    this._label = new CSS2DObject(div);
    this._label.position.set(0, 2.2, 0); // above head
  }

  /** Loads the 3D model. Returns a Promise that resolves to `this`. */
  load() {
    return this._char.load().then(() => {
      this._char._model.add(this._label);
      this._labelAttached = true;
      return this;
    });
  }

  /** Called by RemotePlayerManager on every 'player_moved' event. */
  applySnapshot(x, y, z, facing, moveState) {
    this._targetPos.set(x, y, z);
    this._targetFacing = facing;
    if (moveState !== this._targetMove) {
      this._targetMove = moveState;
      if      (moveState === 'run')  this._char.deal();
      else if (moveState === 'walk') this._char.deal();
      else                           this._char.idle();
    }
  }

  /** Called every frame by RemotePlayerManager. */
  update(delta) {
    const model = this._char._model;
    if (!model) return;

    // Lerp position
    model.position.lerp(this._targetPos, Math.min(1, LERP_SPEED * delta));

    // Lerp rotation (shortest path)
    let diff = this._targetFacing - model.rotation.y;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    model.rotation.y += diff * Math.min(1, LERP_SPEED * delta);

    this._char._mixer?.update(delta);
  }

  setHandTotal(total) {
    if (!this._totalSpan) return;
    this._totalSpan.textContent = total > 0 ? String(total) : '';
  }

  dispose() {
    if (this._labelAttached && this._char._model) {
      this._char._model.remove(this._label);
    }
    this._char.dispose();
  }
}
