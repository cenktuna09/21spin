import * as THREE from 'three';

export class Table {
  constructor(scene) {
    this.scene = scene;
    this._build();
  }

  _build() {
    // Green felt surface
    const feltGeometry = new THREE.BoxGeometry(14, 0.2, 9);
    const feltMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a6b3a,
      roughness: 0.9,
      metalness: 0.0,
    });
    this.felt = new THREE.Mesh(feltGeometry, feltMaterial);
    this.felt.receiveShadow = true;
    this.felt.position.set(0, 0, 0);
    this.scene.add(this.felt);

    // Table rim / border
    const rimGeometry = new THREE.BoxGeometry(14.6, 0.35, 9.6);
    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b1e08,
      roughness: 0.7,
      metalness: 0.1,
    });
    this.rim = new THREE.Mesh(rimGeometry, rimMaterial);
    this.rim.position.set(0, -0.08, 0);
    this.rim.receiveShadow = true;
    this.rim.castShadow = true;
    this.scene.add(this.rim);

    // Table legs
    const legGeometry = new THREE.CylinderGeometry(0.2, 0.25, 3.5, 8);
    const legMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a1204,
      roughness: 0.8,
      metalness: 0.15,
    });
    const legPositions = [
      [-6.5, -2, -4],
      [6.5, -2, -4],
      [-6.5, -2, 4],
      [6.5, -2, 4],
    ];
    legPositions.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeometry, legMaterial);
      leg.position.set(x, y, z);
      leg.castShadow = true;
      this.scene.add(leg);
    });
  }
}
