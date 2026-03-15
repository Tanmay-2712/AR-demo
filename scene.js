import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class SceneManager {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    this.initLights();
    this.currentRing = null;
    this.mode = 'preview';

    // Mask Group for Occlusion
    this.maskGroup = new THREE.Group();
    this.scene.add(this.maskGroup);
    this.masks = [];

    window.addEventListener('resize', () => this.onWindowResize());
    
    // Initial Mode Setup (Ensure everything is framed correctly on startup)
    setTimeout(() => this.setMode('preview'), 100); 
    this.animate();
  }

  initLights() {
    this.studioBackground = new THREE.Color(0x222222);
    this.scene.background = this.studioBackground;
    
    this.grid = new THREE.GridHelper(20, 20, 0x444444, 0x333333);
    this.grid.position.y = -1;
    this.scene.add(this.grid);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    // Dynamic AR High-Intensity Light
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
    this.hemiLight.visible = false;
    this.scene.add(this.hemiLight);

    this.mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
    this.mainLight.position.set(5, 10, 7.5);
    this.scene.add(this.mainLight);

    this.goldFill = new THREE.PointLight(0xD4AF37, 1.5);
    this.goldFill.position.set(0, -2, 2);
    this.scene.add(this.goldFill);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  createProperRing(ringData) {
    const group = new THREE.Group();

    // Standard Torus: hole is in Z direction (0,0,1)
    const bandMat = new THREE.MeshPhysicalMaterial({
      color: ringData.color,
      metalness: 1.0, roughness: 0.1, reflectivity: 1, clearcoat: 1.0
    });
    
    // TORUS Geometry (radius, tube, radialSegments, tubularSegments)
    // Base radius is 0.5 units
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 32, 128), bandMat);
    group.add(band);

    const setting = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.1, 16), bandMat);
    setting.position.set(0, 0.5, 0); // At top of the ring
    group.add(setting);

    const gemMat = new THREE.MeshPhysicalMaterial({
      color: ringData.gemColor || 0xffffff,
      transmission: 0.95, thickness: 0.5, ior: 2.4, iridescence: 0.6
    });
    const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), gemMat);
    gem.position.set(0, 0.6, 0);
    group.add(gem);

    // Prongs
    for (let i = 0; i < 4; i++) {
        const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2), bandMat);
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
        prong.position.set(Math.cos(angle) * 0.12, 0.58, Math.sin(angle) * 0.12);
        prong.lookAt(0, 0.8, 0);
        prong.rotateX(Math.PI / 2);
        group.add(prong);
    }

    // THE MAGIC OCCLUDER: Cylinder aligned with the hole (Z axis)
    // Bigger radius (0.47) and very long to avoid edge artifacts
    const occluder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.47, 0.47, 10, 32),
      new THREE.MeshBasicMaterial({ colorWrite: false })
    );
    occluder.rotation.x = Math.PI / 2; // Point along Z
    occluder.renderOrder = -1; // Draw before ring
    this.ringOccluder = occluder;
    group.add(occluder);

    // DEBUG CENTER
    this.debugPoint = new THREE.Mesh(
      new THREE.SphereGeometry(0.04),
      new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false })
    );
    this.debugPoint.visible = false;
    this.debugPoint.renderOrder = 999;
    group.add(this.debugPoint);

    return group;
  }

  addRing(ringData) {
    if (this.currentRing) this.scene.remove(this.currentRing);
    this.currentRing = this.createProperRing(ringData);
    this.scene.add(this.currentRing);
    this.updateVisibility();
    
    // Apply current mode transforms immediately
    if (this.mode === 'preview') {
      this.currentRing.position.set(0, 0, 0);
      this.currentRing.rotation.set(Math.PI / 6, 0, 0);
      this.currentRing.scale.set(1.2, 1.2, 1.2);
    }
  }

  setMode(mode) {
    this.mode = mode;
    this.updateVisibility();
    
    if (mode === 'preview') {
      this.controls.enabled = true;
      this.scene.background = this.studioBackground;
      if (this.grid) this.grid.visible = true;
      if (this.hemiLight) this.hemiLight.visible = false;
      
      // RESET RING STATE FOR GALLERY
      if (this.currentRing) {
        this.currentRing.position.set(0, 0, 0);
        this.currentRing.rotation.set(Math.PI / 6, 0, 0); // Slight tilt for 3D depth
        this.currentRing.scale.set(1.2, 1.2, 1.2); // Hero scale
      }
      // Ensure AR-specific elements are hidden in preview mode
      this.resetCameraForPreview();
      
      // Ensure specific lighting for preview
      if (this.mainLight) this.mainLight.intensity = 1.8;
      if (this.goldFill) this.goldFill.intensity = 2.0;
    } else {
      this.controls.enabled = false;
      this.scene.background = null;
      if (this.grid) this.grid.visible = false;
      if (this.hemiLight) this.hemiLight.visible = true;
      this.renderer.setClearColor(0x000000, 0); // Force alpha 0
      
      this.camera.position.set(0, 0, 0);
      this.camera.lookAt(0, 0, -1);
    }
  }
  resetCameraForPreview() {
    this.camera.position.set(0, 0.5, 2.8);
    this.camera.lookAt(0, 0, 0);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  updateVisibility() {
    if (!this.currentRing) return;
    const isAR = (this.mode === 'tryon');
    if (this.ringOccluder) this.ringOccluder.visible = isAR;
    if (this.skeletonGroup) this.skeletonGroup.visible = (isAR && this.debugPoint.visible);
  }
  updateAR(results) {
    if (!this.currentRing || this.mode !== 'tryon') return;
    
    // Handle Visibility Toggle
    if (results.visible === false) {
      this.currentRing.visible = false;
      if (this.maskGroup) this.maskGroup.visible = false;
      if (this.skeletonGroup) this.skeletonGroup.visible = false;
      return;
    }
    
    this.currentRing.visible = true;
    const { position, rotation, scale, landmarks, videoParams, isBackFacing } = results;

    // Faster tracking for ultra-responsive feel
    this.currentRing.position.lerp(position, 0.6);
    this.currentRing.quaternion.slerp(rotation, 0.45);
    
    // Smooth scale adjustment
    const targetScale = scale * 0.95; 
    this.currentRing.scale.set(targetScale, targetScale, targetScale);

    if (landmarks) {
      this.updateSkeleton(landmarks, videoParams, isBackFacing);
      this.updateHandMask(landmarks, videoParams);
    }
  }

  updateHandMask(landmarks, params) {
    if (!this.maskGroup) return;
    this.maskGroup.visible = (this.mode === 'tryon');
    if (!this.maskGroup.visible) return;

    const cameraZ = 5;
    const vFOV = 60 * Math.PI / 180;
    const sAspect = window.innerWidth / window.innerHeight;
    const viewH = 2 * Math.tan(vFOV / 2) * cameraZ;
    const viewW = viewH * sAspect;

    const getW = (lm) => {
      const vFOV = 60 * Math.PI / 180;
      const cameraZ = 5;
      const viewH = 2 * Math.tan(vFOV / 2) * cameraZ;
      const aspect = window.innerWidth / window.innerHeight;
      const viewW = viewH * aspect;

      return new THREE.Vector3(
        (lm.x - 0.5) * viewW,
        -(lm.y - 0.5) * viewH,
        -cameraZ + (lm.z * 5)
      );
    };

    const connections = [
      [0,1],[1,2],[2,3],[3,4], [0,5],[5,6],[6,7],[7,8], 
      [0,9],[9,10],[10,11],[11,12], [0,13],[13,14],[14,15],[15,16], 
      [0,17],[17,18],[18,19],[19,20], [5,9],[9,13],[13,17]
    ];

    while (this.masks.length < connections.length) {
      const geom = new THREE.CylinderGeometry(0.06, 0.05, 1, 8);
      const mat = new THREE.MeshBasicMaterial({ colorWrite: false });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.renderOrder = -1;
      this.maskGroup.add(mesh);
      this.masks.push(mesh);
    }

    connections.forEach(([i, j], idx) => {
      const p1 = getW(landmarks[i]);
      const p2 = getW(landmarks[j]);
      const mesh = this.masks[idx];

      const distance = p1.distanceTo(p2);
      mesh.position.copy(p1).lerp(p2, 0.5);
      mesh.scale.set(1, distance, 1);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p2.clone().sub(p1).normalize());
      mesh.visible = true;
    });

    for (let i = connections.length; i < this.masks.length; i++) {
        this.masks[i].visible = false;
    }
  }

  updateSkeleton(landmarks, params, isBackFacing) {
    if (!this.skeletonGroup) {
      this.skeletonGroup = new THREE.Group();
      this.scene.add(this.skeletonGroup);
    }

    this.skeletonGroup.visible = this.debugPoint.visible;
    if (!this.skeletonGroup.visible) return;

    while (this.skeletonGroup.children.length) this.skeletonGroup.remove(this.skeletonGroup.children[0]);

    const cameraZ = 5;
    const vFOV = 60 * Math.PI / 180;
    const sAspect = window.innerWidth / window.innerHeight;
    const viewH = 2 * Math.tan(vFOV / 2) * cameraZ;
    const viewW = viewH * sAspect;

    const getW = (lm) => {
      const vFOV = 60 * Math.PI / 180;
      const cameraZ = 5;
      const viewH = 2 * Math.tan(vFOV / 2) * cameraZ;
      const aspect = window.innerWidth / window.innerHeight;
      const viewW = viewH * aspect;

      return new THREE.Vector3(
        (lm.x - 0.5) * viewW,
        -(lm.y - 0.5) * viewH,
        -cameraZ + (lm.z * 5)
      );
    };

    const connections = [
      [0,1],[1,2],[2,3],[3,4], [0,5],[5,6],[6,7],[7,8], 
      [0,9],[9,10],[10,11],[11,12], [0,13],[13,14],[14,15],[15,16], 
      [0,17],[17,18],[18,19],[19,20], [5,9],[9,13],[13,17]
    ];

    // COLOR LOGIC: Green for Back, Red for Palm
    const debugColor = isBackFacing ? 0x00ff00 : 0xff3333;
    const lineMat = new THREE.LineBasicMaterial({ color: debugColor, depthTest: false, transparent: true, opacity: 0.5 });
    const dotGeom = new THREE.SphereGeometry(0.015, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: debugColor, depthTest: false });

    const landmarkNames = {
      0: 'WRIST', 4: 'THUMB', 8: 'INDEX', 12: 'MIDDLE', 16: 'RING', 20: 'PINKY',
      13: 'MCP', 14: 'PIP', 15: 'DIP'
    };

    const worldPoints = landmarks.map(lm => getW(lm));

    connections.forEach(([i, j]) => {
      const g = new THREE.BufferGeometry().setFromPoints([worldPoints[i], worldPoints[j]]);
      const l = new THREE.Line(g, lineMat);
      l.renderOrder = 999;
      this.skeletonGroup.add(l);
    });

    worldPoints.forEach((pt, i) => {
      const dot = new THREE.Mesh(dotGeom, dotMat);
      dot.position.copy(pt);
      dot.renderOrder = 1000;
      this.skeletonGroup.add(dot);

      const labelText = landmarkNames[i] ? `${i}:${landmarkNames[i]}` : `${i}`;
      const label = this.createTextSprite(labelText);
      label.position.copy(pt);
      label.position.y += 0.04;
      label.renderOrder = 1001;
      this.skeletonGroup.add(label);
    });
  }

  createTextSprite(text) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 128;
    canvas.height = 64;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.roundRect(0, 16, 128, 32, 8);
    ctx.fill();

    ctx.font = 'bold 24px Inter, sans-serif';
    ctx.fillStyle = '#00ff00';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(0.15, 0.075, 1);
    return sprite;
  }

  toggleDebug() {
    this.debugPoint.visible = !this.debugPoint.visible;
    if (this.skeletonGroup) this.skeletonGroup.visible = this.debugPoint.visible;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    
    if (this.currentRing && this.mode === 'preview') {
      this.currentRing.rotation.y += 0.005;
      this.currentRing.position.y = Math.sin(Date.now() * 0.002) * 0.05;
    }
    
    this.renderer.render(this.scene, this.camera);
  }
}
