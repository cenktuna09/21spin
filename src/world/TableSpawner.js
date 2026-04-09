/**
 * TableSpawner — places 10 blackjack tables in the 3D world.
 *
 * Seat layout per table (4 seats across front edge, relative to table centre):
 *   Seat 0  x=-4.5   Seat 1  x=-1.5   Seat 2  x=+1.5   Seat 3  x=+4.5
 *
 * Column positions per seat (relative to table centre):
 *   col0: seatX-0.7,  col1: seatX+0.7,  col2(hit): seatX+2.1
 *   all at y=2.3, z=3.2
 */

import * as THREE from 'three';
import { Table } from '../game/Table.js';

// Keep in sync with server/CasinoRoom.js TABLE_POSITIONS
export const TABLE_POSITIONS = [
  { id: 'table-1',  x: -20, z:  0 },
  { id: 'table-2',  x: -10, z:  0 },
  { id: 'table-3',  x:   0, z:  0 },
  { id: 'table-4',  x:  10, z:  0 },
  { id: 'table-5',  x:  20, z:  0 },
  { id: 'table-6',  x: -20, z: 20 },
  { id: 'table-7',  x: -10, z: 20 },
  { id: 'table-8',  x:   0, z: 20 },
  { id: 'table-9',  x:  10, z: 20 },
  { id: 'table-10', x:  20, z: 20 },
];

const SEAT_X      = [-4.5, -1.5, 1.5, 4.5];
const COL_Y       = 2.3;
const COL_Z_LOCAL = 3.2;   // relative to table centre z
const CHAR_Y      = -3.75;
const CHAR_Z_LOCAL = 6.5;  // relative to table centre z

/**
 * Returns world-space column positions for a given table and seat.
 * @param {{ x: number, z: number }} tablePos
 * @param {number} seatIndex 0-3
 * @returns {{ col0: THREE.Vector3, col1: THREE.Vector3, col2: THREE.Vector3 }}
 */
export function seatColPositions(tablePos, seatIndex) {
  const sx = tablePos.x + SEAT_X[seatIndex];
  const z  = tablePos.z + COL_Z_LOCAL;
  return {
    col0: new THREE.Vector3(sx - 0.7, COL_Y, z),
    col1: new THREE.Vector3(sx + 0.7, COL_Y, z),
    col2: new THREE.Vector3(sx + 2.1, COL_Y, z),
  };
}

/**
 * Returns world-space character position for a given table and seat.
 */
export function seatCharPosition(tablePos, seatIndex) {
  return new THREE.Vector3(
    tablePos.x + SEAT_X[seatIndex],
    CHAR_Y,
    tablePos.z + CHAR_Z_LOCAL,
  );
}

/**
 * Returns the nearest table to a world-space position.
 * @param {THREE.Vector3} worldPos
 * @returns {{ id, x, z, dist }}
 */
export function nearestTable(worldPos) {
  return TABLE_POSITIONS
    .map(t => ({ ...t, dist: new THREE.Vector3(t.x, 0, t.z).distanceTo(worldPos) }))
    .sort((a, b) => a.dist - b.dist)[0];
}

export default class TableSpawner {
  constructor(scene) {
    this._scene = scene;
    this._tables = [];
    this._spawn();
  }

  _spawn() {
    for (const tp of TABLE_POSITIONS) {
      // Table top is at y=0; we position the group at the table's world coords
      const table = new Table(this._scene, { x: tp.x, y: 0, z: tp.z });
      this._tables.push({ id: tp.id, table, pos: tp });
    }
  }
}
