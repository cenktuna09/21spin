/**
 * ThirdPersonCamera — GTA V-style follow camera.
 *
 * - Click canvas → Pointer Lock → mouse controls camera yaw/pitch
 * - ESC unlocks mouse (Three.js canvas gets focus back)
 * - Camera smoothly lerps behind the target character
 * - Exposes `yaw` so Character can derive camera-relative movement direction
 */

import * as THREE from 'three';

const DISTANCE     = 7;    // units behind character
const HEIGHT_PIVOT = 2.0;  // look-at point above character origin
const PITCH_MIN    = -0.15; // look slightly up
const PITCH_MAX    =  0.65; // look down
const LERP_SPEED   = 10;   // camera catch-up speed (higher = snappier)
const MOUSE_SENS   = 0.0022;

export class ThirdPersonCamera {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLElement} canvas
   */
  constructor(camera, canvas) {
    this.camera  = camera;
    this.canvas  = canvas;
    this.yaw     = 0; // start behind player (+Z side, same as original camera)
    this.pitch   = 0.25;    // slight downward tilt

    this._target  = null;   // THREE.Object3D (character model)
    this._locked  = false;
    this._curPos  = camera.position.clone();
    this._lookAt  = new THREE.Vector3();
    this._tmpPos  = new THREE.Vector3();

    this._setupPointerLock();
    this._buildHint();
  }

  /** @param {THREE.Object3D} model — Character._model */
  setTarget(model) {
    this._target = model;
  }

  enable()  { this._enabled = true; }
  disable() { this._enabled = false; document.exitPointerLock(); }

  update(delta) {
    if (!this._target) return;

    const tPos = this._target.position;

    // Ideal camera position: orbit around target using yaw/pitch
    const sinY = Math.sin(this.yaw),   cosY = Math.cos(this.yaw);
    const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);

    this._tmpPos.set(
      tPos.x + DISTANCE * sinY * cosP,
      tPos.y + HEIGHT_PIVOT + DISTANCE * sinP,
      tPos.z + DISTANCE * cosY * cosP
    );

    // Smooth lerp
    const t = 1 - Math.pow(0.0001, delta * LERP_SPEED * 0.1);
    this._curPos.lerp(this._tmpPos, t);
    this.camera.position.copy(this._curPos);

    // Always look at the pivot point above character
    this._lookAt.set(tPos.x, tPos.y + HEIGHT_PIVOT, tPos.z);
    this.camera.lookAt(this._lookAt);
  }

  // ── Pointer Lock ────────────────────────────────────────────────────────────

  _setupPointerLock() {
    this.canvas.addEventListener('click', () => {
      this.canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this._locked = document.pointerLockElement === this.canvas;
      const hint = document.getElementById('tpc-hint');
      if (hint) hint.style.display = this._locked ? 'none' : 'block';
    });

    document.addEventListener('mousemove', (e) => {
      if (!this._locked) return;
      this.yaw   -= e.movementX * MOUSE_SENS;
      this.pitch  = THREE.MathUtils.clamp(
        this.pitch + e.movementY * MOUSE_SENS,
        PITCH_MIN, PITCH_MAX
      );
    });
  }

  // ── On-screen hint ─────────────────────────────────────────────────────────

  _buildHint() {
    if (document.getElementById('tpc-hint')) return;
    const div = document.createElement('div');
    div.id = 'tpc-hint';
    div.style.cssText = `
      position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
      background:rgba(0,0,0,0.7); border:1px solid #FFD700; border-radius:8px;
      padding:8px 16px; color:#FFD700; font-family:'Press Start 2P',monospace;
      font-size:8px; pointer-events:none; z-index:200; letter-spacing:1px;
      text-align:center; line-height:1.8;
    `;
    div.textContent = 'CLICK TO CONTROL CAMERA\nWASD MOVE  SHIFT RUN  ESC UNLOCK';
    document.body.appendChild(div);
  }
}
