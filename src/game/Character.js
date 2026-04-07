/**
 * Character — animated 3D character using Soldier.glb.
 *
 * Animations in Soldier.glb:
 *   [0] Idle   [1] Run   [3] Walk
 *
 * Optional WASD controller (opts.controllable = true):
 *   W / ↑       walk forward
 *   S / ↓       walk backward
 *   A / ←       rotate left
 *   D / →       rotate right
 *   Shift+W     run
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MODEL_PATH   = '/models/Soldier.glb';
const FADE_TIME    = 0.35;
const DEFAULT_SCALE = 1.8;

const WALK_SPEED   = 4.0;  // units/s
const RUN_SPEED    = 9.0;
const ROTATE_SPEED = 2.2;  // rad/s

export default class Character {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Vector3} position
   * @param {object} opts
   *   facing       {number}   Y-rotation in radians
   *   scale        {number}   model scale (default 1.8)
   *   controllable {boolean}  enable WASD movement (default false)
   */
  constructor(scene, position, opts = {}) {
    this.scene        = scene;
    this.position     = position.clone();
    this.facing       = opts.facing       ?? 0;
    this.scale        = opts.scale        ?? DEFAULT_SCALE;
    this.controllable = opts.controllable ?? false;

    /** Set to a ThirdPersonCamera instance to enable camera-relative movement */
    this.tpCamera = null;

    this._mixer   = null;
    this._actions = {};
    this._current = null;
    this._model   = null;
    this._loaded  = false;

    // Movement state
    this._keys      = { w:false, a:false, s:false, d:false, shift:false };
    this._moveState = 'idle';
    this._locked    = false;

    this._move    = new THREE.Vector3(); // reused each frame
    this._forward = new THREE.Vector3();
    this._right   = new THREE.Vector3();

    if (this.controllable) this._bindKeys();
  }

  // ── Load ────────────────────────────────────────────────────────────────────

  load() {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(
        MODEL_PATH,
        (gltf) => {
          this._model = gltf.scene;
          this._model.scale.setScalar(this.scale);
          this._model.position.copy(this.position);
          this._model.rotation.y = this.facing;
          this._model.traverse(n => {
            if (n.isMesh) {
              n.castShadow = true;
              n.receiveShadow = true;
              if (n.material) {
                n.material.roughness = 0.3;
                n.material.metalness = 0.6;
                n.material.needsUpdate = true;
              }
            }
          });
          this.scene.add(this._model);

          this._mixer = new THREE.AnimationMixer(this._model);
          const anims = gltf.animations;
          this._actions = {
            idle: this._mixer.clipAction(anims[0]),
            run:  this._mixer.clipAction(anims[1]),
            walk: this._mixer.clipAction(anims[3]),
          };
          Object.values(this._actions).forEach(a => {
            a.enabled = true;
            a.setEffectiveTimeScale(1);
            a.setEffectiveWeight(0);
            a.play();
          });

          this._loaded = true;
          this.idle();
          resolve(this);
        },
        undefined,
        (err) => { console.error('[Character] load failed', err); reject(err); }
      );
    });
  }

  // ── Game-event animations (lock out movement overrides briefly) ────────────

  idle() {
    this._locked = false;
    this._crossfadeTo('idle', FADE_TIME);
  }

  deal() {
    this._crossfadeTo('walk', FADE_TIME);
    clearTimeout(this._returnTimer);
    const dur = (this._actions.walk.getClip().duration * 1.8) * 1000;
    this._returnTimer = setTimeout(() => { if (!this.controllable) this.idle(); }, dur);
  }

  celebrate() {
    this._locked = true;
    this._crossfadeTo('run', FADE_TIME);
    clearTimeout(this._returnTimer);
    this._returnTimer = setTimeout(() => this.idle(), 2800);
  }

  disappointed() {
    this._locked = true;
    this._actions.walk.timeScale = -1;
    this._crossfadeTo('walk', FADE_TIME);
    clearTimeout(this._returnTimer);
    this._returnTimer = setTimeout(() => {
      this._actions.walk.timeScale = 1;
      this.idle();
    }, 2000);
  }

  // ── Per-frame ────────────────────────────────────────────────────────────────

  update(delta) {
    if (!this._loaded) return;
    if (this.controllable && !this._locked) this._applyMovement(delta);
    this._mixer.update(delta);
  }

  // ── WASD movement ───────────────────────────────────────────────────────────

  _applyMovement(delta) {
    const k       = this._keys;
    const running = (k.w || k.a || k.s || k.d) && k.shift;

    // ── Camera-relative movement (GTA style) ──────────────────────────────────
    if (this.tpCamera) {
      const yaw = this.tpCamera.yaw;

      // Camera forward (projected to XZ) and right vectors
      this._forward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
      this._right.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();

      this._move.set(0, 0, 0);
      if (k.w) this._move.addScaledVector(this._forward,  1);
      if (k.s) this._move.addScaledVector(this._forward, -1);
      if (k.a) this._move.addScaledVector(this._right,   -1);
      if (k.d) this._move.addScaledVector(this._right,    1);

      const len = this._move.length();
      if (len > 0) {
        this._move.normalize();
        const speed = running ? RUN_SPEED : WALK_SPEED;
        this._model.position.addScaledVector(this._move, speed * delta);

        // Model front = -Z at rotation.y=0, so targetY = atan2(-x, -z)
        const targetY = Math.atan2(-this._move.x, -this._move.z);
        const current = this._model.rotation.y;
        // Shortest-path rotation lerp
        let diff = targetY - current;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this._model.rotation.y += diff * Math.min(1, 12 * delta);

        // Clamp to scene bounds
        this._model.position.x = THREE.MathUtils.clamp(this._model.position.x, -9, 9);
        this._model.position.z = THREE.MathUtils.clamp(this._model.position.z, -9, 9);
        this._model.position.y = this.position.y;

        const next = running ? 'run' : 'walk';
        if (this._moveState !== next) { this._moveState = next; this._crossfadeTo(next, 0.2); }
      } else {
        if (this._moveState !== 'idle') { this._moveState = 'idle'; this._crossfadeTo('idle', 0.3); }
      }

    // ── Legacy world-axis movement (no camera) ────────────────────────────────
    } else {
      const moving = k.w || k.s;
      if (k.a) this._model.rotation.y += ROTATE_SPEED * delta;
      if (k.d) this._model.rotation.y -= ROTATE_SPEED * delta;

      if (moving) {
        const speed = running ? RUN_SPEED : WALK_SPEED;
        const sign  = k.w ? -1 : 1;
        this._model.getWorldDirection(this._forward);
        this._model.position.addScaledVector(this._forward, sign * speed * delta);
        this._model.position.x = THREE.MathUtils.clamp(this._model.position.x, -9, 9);
        this._model.position.z = THREE.MathUtils.clamp(this._model.position.z, -9, 9);
        this._model.position.y = this.position.y;
        const next = running ? 'run' : 'walk';
        if (this._moveState !== next) { this._moveState = next; this._crossfadeTo(next, 0.2); }
      } else {
        if (this._moveState !== 'idle') { this._moveState = 'idle'; this._crossfadeTo('idle', 0.3); }
      }
    }
  }

  _bindKeys() {
    const map = {
      w: 'w', arrowup: 'w',
      s: 's', arrowdown: 's',
      a: 'a', arrowleft: 'a',
      d: 'd', arrowright: 'd',
    };
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (k === 'shift') { this._keys.shift = true; return; }
      if (map[k]) { this._keys[map[k]] = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', e => {
      const k = e.key.toLowerCase();
      if (k === 'shift') { this._keys.shift = false; return; }
      if (map[k]) this._keys[map[k]] = false;
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _crossfadeTo(name, duration) {
    if (!this._loaded) return;
    const next = this._actions[name];
    if (!next || this._current === next) return;
    if (this._current) this._current.fadeOut(duration);
    next.reset().setEffectiveWeight(1).fadeIn(duration);
    this._current = next;
  }

  dispose() {
    clearTimeout(this._returnTimer);
    if (this.controllable) {
      // key listeners are anonymous — document them for GC (acceptable for single-instance)
    }
    if (this._model) this.scene.remove(this._model);
    if (this._mixer) this._mixer.stopAllAction();
  }
}
