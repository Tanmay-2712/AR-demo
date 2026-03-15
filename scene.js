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
    this.controls.enableRotate = false; // Disable camera rotation manually to handle ring rotation instead
    this.controls.enablePan = false;    // Disable right-click panning

    this.initLights();
    this.currentRing = null;
    this.mode = 'preview';
    this.introAnimator = null; // set externally to drive intro animation
    this._lastTime = performance.now();

    // Interaction State for Ring Rotation
    this.isDragging = false;
    this.previousMousePosition = { x: 0, y: 0 };
    this.ringRotationSpeed = 0.01;
    this.initInteraction();

    // Mask Group for Occlusion
    this.maskGroup = new THREE.Group();
    this.scene.add(this.maskGroup);
    this.masks = [];

    window.addEventListener('resize', () => this.onWindowResize());
    
    // Mode is set externally (by main.js) after intro completes
    this.animate();
  }

  initInteraction() {
    const handleStart = (x, y, e) => {
      // If intro is active and idle, check if we clicked the box
      if (this.introAnimator && this.introAnimator.phase === 'idle') {
        const mouse = new THREE.Vector2(
          (x / window.innerWidth) * 2 - 1,
          -(y / window.innerHeight) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);
        const intersects = raycaster.intersectObjects(this.scene.children, true);
        
        const hitBox = intersects.some(hit => hit.object.userData.isBoxPart);
        if (hitBox) {
          this.introAnimator._startOpening();
          return;
        }
      }

      if (this.mode !== 'preview') return;
      this.isDragging = true;
      this.previousMousePosition = { x, y };
    };

    const handleMove = (x, y) => {
      if (!this.isDragging || !this.currentRing || this.mode !== 'preview') return;
      
      const deltaX = x - this.previousMousePosition.x;
      const deltaY = y - this.previousMousePosition.y;

      // Rotate around Y axis for horizontal movement
      this.currentRing.rotation.y += deltaX * this.ringRotationSpeed;
      // Rotate around X axis for vertical movement
      this.currentRing.rotation.x += deltaY * this.ringRotationSpeed;

      this.previousMousePosition = { x, y };
    };

    const handleEnd = () => {
      this.isDragging = false;
    };

    this.renderer.domElement.addEventListener('mousedown', (e) => handleStart(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', handleEnd);

    this.renderer.domElement.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) handleStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) handleMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchend', handleEnd);
  }

  initLights() {
    this.studioBackground = null; // Let CSS gradient show through
    this.scene.background = null;
    
    // Grid removed as requested
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // Subtle ambient
    this.scene.add(ambientLight);

    // Key Light
    this.mainLight = new THREE.DirectionalLight(0xffffff, 2.5);
    this.mainLight.position.set(4, 6, 5);
    this.scene.add(this.mainLight);

    // Fill Light (Warm)
    const filler = new THREE.DirectionalLight(0xffccaa, 1.2);
    filler.position.set(-4, 2, 3);
    this.scene.add(filler);

    // Rim Light (Cool)
    const rim = new THREE.DirectionalLight(0xaabbff, 1.5);
    rim.position.set(0, 4, -8);
    this.scene.add(rim);

    // Subtle Point Light for gem pop
    const gemPop = new THREE.PointLight(0xffffff, 2.0, 5);
    gemPop.position.set(0, 2, 1);
    this.scene.add(gemPop);

    // Studio "Softbox"
    const areaLight = new THREE.RectAreaLight(0xffffff, 8.0, 6, 6);
    areaLight.position.set(0, 8, 2);
    areaLight.lookAt(0, 0, 0);
    this.scene.add(areaLight);

    // Floor Plane (Infinity Cove)

    this.scene.environment = this._createEnvMap();
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Public wrapper for external use (e.g. gift box intro)
  createRingMesh(ringData) {
    return this.createProperRing(ringData);
  }

  createProperRing(ringData) {
    const group = new THREE.Group();
    const style = ringData.style || 'solitaire';

    // METAL MATERIAL - Luxury setting
    const bandMat = new THREE.MeshPhysicalMaterial({
      color: ringData.color,
      metalness: 1.0, 
      roughness: 0.05, 
      reflectivity: 1.0, 
      clearcoat: 1.0,
      clearcoatRoughness: 0.05
    });

    // Ring Band
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 32, 128), bandMat);
    group.add(band);

    // GEM MATERIAL
    const gemMat = new THREE.MeshPhysicalMaterial({
      color: ringData.gemColor || 0xffffff,
      transmission: 0.98,
      thickness: 0.8,
      ior: 2.417, // Diamond IOR
      iridescence: 0.5,
      reflectivity: 1.0,
      metalness: 0,
      roughness: 0,
      opacity: 1,
      transparent: true
    });

    // STYLE-SPECIFIC LOGIC
    if (style === 'solitaire') {
      this._addSolitaireSetting(group, ringData, bandMat, gemMat);
    } else if (style === 'halo') {
      this._addHaloSetting(group, ringData, bandMat, gemMat);
    } else if (style === 'three-stone') {
      this._addThreeStoneSetting(group, ringData, bandMat, gemMat);
    } else if (style === 'pave') {
      this._addPaveSetting(group, ringData, bandMat, gemMat);
    }

    // THE MAGIC OCCLUDER: Cylinder aligned with the hole (Z axis)
    const occluder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.47, 0.47, 10, 32),
      new THREE.MeshBasicMaterial({ colorWrite: false })
    );
    occluder.rotation.x = Math.PI / 2;
    occluder.renderOrder = -1;
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

  // Generate a synthetic environment map for high-end reflections
  _createEnvMap() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Create a "studio" gradient
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.2, '#bbbbbb');
    grad.addColorStop(1, '#111111');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Add some "lights"
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(size * 0.2, size * 0.2, size * 0.3, size * 0.1);
    ctx.fillRect(size * 0.6, size * 0.7, size * 0.2, size * 0.2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  }

  _getGemGeo(cut, size) {
    if (cut === 'emerald') {
      return new THREE.BoxGeometry(size * 1.2, size * 0.8, size * 1.5);
    } else if (cut === 'cushion') {
      return new THREE.IcosahedronGeometry(size, 2); // Smoother
    } else if (cut === 'diamond') {
      return new THREE.ConeGeometry(size, size * 1.5, 8); // Traditional diamond shape point down
    }
    return new THREE.OctahedronGeometry(size, 0); // Default round-ish cut
  }

  _addSolitaireSetting(group, data, bMat, gMat) {
    const setting = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.15, 16), bMat);
    setting.position.set(0, 0.52, 0);
    group.add(setting);

    const gem = new THREE.Mesh(this._getGemGeo(data.cut, 0.18), gMat);
    gem.position.set(0, 0.62, 0);
    if (data.cut === 'diamond') gem.rotation.x = Math.PI; 
    group.add(gem);
  }

  _addHaloSetting(group, data, bMat, gMat) {
    const mainGem = new THREE.Mesh(this._getGemGeo(data.cut, 0.16), gMat);
    mainGem.position.set(0, 0.62, 0);
    group.add(mainGem);

    // Halo ring
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 16, 64), bMat);
    halo.position.set(0, 0.6, 0);
    halo.rotation.x = Math.PI / 2;
    group.add(halo);

    // Small halo gems
    const smallGemMat = gMat.clone();
    smallGemMat.thickness = 0.2;
    for (let i = 0; i < 12; i++) {
        const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), smallGemMat);
        const angle = (i / 12) * Math.PI * 2;
        gem.position.set(Math.cos(angle) * 0.2, 0.62, Math.sin(angle) * 0.2);
        group.add(gem);
    }
  }

  _addThreeStoneSetting(group, data, bMat, gMat) {
    // Center gem
    const centerGem = new THREE.Mesh(this._getGemGeo(data.cut, 0.18), gMat);
    centerGem.position.set(0, 0.62, 0);
    group.add(centerGem);

    // Side gems
    const sideGemGeo = this._getGemGeo(data.cut, 0.12);
    const s1 = new THREE.Mesh(sideGemGeo, gMat);
    s1.position.set(0.18, 0.55, 0);
    s1.rotation.z = -0.3;
    group.add(s1);

    const s2 = new THREE.Mesh(sideGemGeo, gMat);
    s2.position.set(-0.18, 0.55, 0);
    s2.rotation.z = 0.3;
    group.add(s2);
  }

  _addPaveSetting(group, data, bMat, gMat) {
    const mainGem = new THREE.Mesh(this._getGemGeo(data.cut, 0.18), gMat);
    mainGem.position.set(0, 0.62, 0);
    group.add(mainGem);

    // Band gems
    const smallGemMat = gMat.clone();
    for (let i = 0; i < 20; i++) {
        const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.025, 0), smallGemMat);
        const angle = (i / 20) * Math.PI * 0.6 - (Math.PI * 0.3); // Top half only
        const r = 0.54;
        gem.position.set(Math.cos(angle + Math.PI/2) * r, Math.sin(angle + Math.PI/2) * r, 0);
        group.add(gem);
    }
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
    const { position, rotation, scale, landmarks, isBackFacing } = results;

    // Direct assignment as smoothing is handled in the handler
    this.currentRing.position.copy(position);
    this.currentRing.quaternion.copy(rotation);
    this.currentRing.scale.set(scale, scale, scale);

    if (landmarks) {
      this.updateSkeleton(landmarks, null, isBackFacing);
      this.updateHandMask(landmarks);
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

    const now = performance.now();
    const dt = Math.min((now - this._lastTime) / 1000, 0.05); // cap dt at 50ms
    this._lastTime = now;

    // Drive intro animation if active
    if (this.introAnimator) {
      const done = this.introAnimator.update(dt);
      if (done) this.introAnimator = null;
    }

    this.controls.update();
    
    if (this.currentRing && this.mode === 'preview') {
      this.currentRing.position.y = Math.sin(Date.now() * 0.002) * 0.04;
    }
    
    this.renderer.render(this.scene, this.camera);
  }
}
