import * as THREE from 'three';

// ─── Easing ──────────────────────────────────────────────────────────────────
const easeOutBack    = t => { const c = 1.70158; return 1 + (c+1)*Math.pow(t-1,3) + c*Math.pow(t-1,2); };
const easeOutBounce  = t => {
  if (t < 1/2.75)   return 7.5625*t*t;
  if (t < 2/2.75)   return 7.5625*(t-=1.5/2.75)*t+0.75;
  if (t < 2.5/2.75) return 7.5625*(t-=2.25/2.75)*t+0.9375;
  return 7.5625*(t-=2.625/2.75)*t+0.984375;
};
const easeOutCubic   = t => 1 - Math.pow(1-t, 3);
const easeInCubic    = t => t*t*t;
const easeInOutCubic = t => t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
const lerp           = (a, b, t) => a+(b-a)*t;
const clamp01        = t => Math.max(0, Math.min(1, t));
const norm           = (t, s, e) => clamp01((t-s)/(e-s));

// ─── Colours ─────────────────────────────────────────────────────────────────
const C_BOX     = 0xCC1111;
const C_RIBBON  = 0xFFD700;
const C_CONFETTI = [0xFF2244,0x00CCFF,0xFFEE00,0xFF88FF,0x00FF88,0xFF6600,0xFFFFFF,0x88FF00];

// ─── GiftBoxIntro ─────────────────────────────────────────────────────────────
export class GiftBoxIntro {
  constructor(scene, camera, renderer, ringsData, onRingLanded, onComplete, createRingFn) {
    this.scene        = scene;
    this.camera       = camera;
    this.renderer     = renderer;
    this.ringsData    = ringsData;
    this.onRingLanded = onRingLanded;  // (idx) => void, called when each ring card should appear
    this.onComplete   = onComplete;    // () => void, called when all rings done
    this.createRingFn = createRingFn;

    this.phase  = 'idle';
    this.phaseT = 0;
    this.idleT  = 0;
    this._done  = false;
    this._ringLandedFlags = new Array(ringsData.length).fill(false);

    // Scene root — sits slightly below the camera look-at so box is centered
    this.root = new THREE.Group();
    this.root.position.set(0, -0.5, 0);
    this.scene.add(this.root);

    this.walls       = [];    // { pivot, rotAxis, fallDir }
    this.confettiPcs = [];
    this.ringMeshes  = [];
    this.lidGroup    = null;

    this._buildBox();
    this._buildConfetti();
    this._buildRings();
    this._addClickListener();
  }

  // ─── BUILD BOX ─────────────────────────────────────────────────────────────
  _buildBox() {
    const S  = 1.4;
    const hs = S / 2;
    const W  = 0.05; // wall thickness

    const mBox = new THREE.MeshPhysicalMaterial({ 
      color: C_BOX, 
      metalness: 0.15, 
      roughness: 0.35, 
      clearcoat: 1.0, 
      clearcoatRoughness: 0.1,
      side: THREE.DoubleSide 
    });
    const mRib = new THREE.MeshPhysicalMaterial({ 
      color: C_RIBBON, 
      metalness: 0.9, 
      roughness: 0.1, 
      clearcoat: 1.0, 
      reflectivity: 1.0,
      side: THREE.DoubleSide 
    });

    // ── Base plate ─────────────────────────────────────────────────────────
    const base = new THREE.Mesh(new THREE.BoxGeometry(S, W, S), mBox);
    base.position.y = W / 2;
    base.userData.isBoxPart = true;
    this.root.add(base);

    // Single ribbon band running front-to-back on the base
    const bRib = new THREE.Mesh(new THREE.BoxGeometry(0.18, W + 0.02, S + 0.02), mRib);
    bRib.position.y = W / 2;
    this.root.add(bRib);

    // Track all materials for the fade-out
    this._allMaterials = [mBox, mRib];

    // ── Walls ───────────────────────────────────────────────────────────────
    // ALL walls use the SAME slab shape: Box(S, S, W) - wide, tall, thin.
    // Each wall pivot sits at the bottom edge of that wall in world space.
    // meshRy rotates the slab inside the pivot so it faces outward correctly.
    //
    // Fall directions (right-hand rule):
    //   Front (+Z edge): pivot.rotation.x += PI/2  (top falls toward +Z)
    //   Back  (-Z edge): pivot.rotation.x -= PI/2  (top falls toward -Z)
    //   Right (+X edge): pivot.rotation.z -= PI/2  (top falls toward +X)
    //   Left  (-X edge): pivot.rotation.z += PI/2  (top falls toward -X)

    const wallDefs = [
      { px: 0,   pz:  hs, meshRy:  0,           fallAxis:'x', fallDir: 1, hasRib: true  }, // Front
      { px: 0,   pz: -hs, meshRy:  Math.PI,      fallAxis:'x', fallDir:-1, hasRib: true  }, // Back
      { px:  hs, pz:  0,  meshRy: -Math.PI / 2,  fallAxis:'z', fallDir:-1, hasRib: false }, // Right
      { px: -hs, pz:  0,  meshRy:  Math.PI / 2,  fallAxis:'z', fallDir: 1, hasRib: false }, // Left
    ];

    wallDefs.forEach(def => {
      const pivot = new THREE.Group();
      pivot.position.set(def.px, W, def.pz);
      this.root.add(pivot);

      // Slab — bottom at y=0 in pivot space (the hinge), top at y=S
      const slab = new THREE.Mesh(new THREE.BoxGeometry(S, S, W), mBox);
      slab.rotation.y = def.meshRy;
      slab.position.y = S / 2;
      slab.userData.isBoxPart = true;
      pivot.add(slab);

      // Vertical ribbon strip (only on walls that align with the base ribbon)
      if (def.hasRib) {
        const vRib = new THREE.Mesh(new THREE.BoxGeometry(0.18, S + 0.01, W + 0.02), mRib);
        vRib.rotation.y = def.meshRy;
        vRib.position.y = S / 2;
        pivot.add(vRib);
      }

      pivot.userData = { axis: def.fallAxis, dir: def.fallDir };
      this.walls.push(pivot);
    });

    // ── Lid ─────────────────────────────────────────────────────────────────
    this.lidGroup = new THREE.Group();
    this.lidGroup.position.set(0, W + S, 0);
    this.root.add(this.lidGroup);

    // Lid body
    const lidBody = new THREE.Mesh(new THREE.BoxGeometry(S + 0.1, W * 2, S + 0.1), mBox);
    lidBody.position.y = W;
    this.lidGroup.add(lidBody);

    // Lid ribbon (single band aligning with base/front/back)
    // Adding minor thickness/width offsets to prevent z-fighting
    const lR1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, W * 2 + 0.04, S + 0.12), mRib);
    lR1.position.y = W; // lidBody is at W, but lR1 is taller (W*2.04 vs W*2)
    this.lidGroup.add(lR1);

    // Bow (Knot + Loops + Tails)
    const bowKnot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.2), mRib);
    bowKnot.position.y = W * 2 + 0.08;
    this.lidGroup.add(bowKnot);

    for (let i = 0; i < 2; i++) {
        // Loops
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.04, 16, 32), mRib);
        loop.rotation.set(Math.PI / 2, 0, i * Math.PI / 2);
        loop.scale.set(1.2, 0.8, 1.0); // Elongate the loops
        loop.position.y = W * 2 + 0.18;
        this.lidGroup.add(loop);

        // Tails
        const tailGeo = new THREE.PlaneGeometry(0.18, 0.5);
        const tail = new THREE.Mesh(tailGeo, mRib);
        const angle = (i === 0 ? 0.3 : 0.8) * Math.PI;
        tail.rotation.set(-Math.PI * 0.4, 0, angle);
        tail.position.set(Math.cos(angle) * 0.25, W * 2 + 0.05, Math.sin(angle) * 0.25);
        this.lidGroup.add(tail);
    }

    this._lidStartY = this.lidGroup.position.y;
  }

  // ─── BUILD CONFETTI ────────────────────────────────────────────────────────
  _buildConfetti() {
    for (let i = 0; i < 220; i++) {
      const roll = Math.random();
      let geo;
      if      (roll < 0.5)  geo = new THREE.PlaneGeometry(0.06 + Math.random()*0.08, 0.03 + Math.random()*0.04);
      else if (roll < 0.75) geo = new THREE.CircleGeometry(0.04 + Math.random()*0.03, 6);
      else                  geo = new THREE.BoxGeometry(0.04, 0.04, 0.01);

      const mat  = new THREE.MeshBasicMaterial({ color: C_CONFETTI[Math.floor(Math.random()*C_CONFETTI.length)], side:THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;

      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(Math.random() * 0.65);
      const dist  = 2.2 + Math.random() * 4.5;

      mesh.userData = {
        origin:    new THREE.Vector3(0, 0.8, 0),
        target:    new THREE.Vector3(dist*Math.sin(phi)*Math.cos(theta), 0.8+dist*Math.cos(phi), dist*Math.sin(phi)*Math.sin(theta)),
        delay:     Math.random() * 0.3,
        duration:  0.5 + Math.random() * 0.5,
        gravity:  -(4.5 + Math.random()*2.5),
        spinAxis:  new THREE.Vector3(Math.random()-.5, Math.random()-.5, Math.random()-.5).normalize(),
        spinSpeed: (Math.random()-.5) * 20,
      };
      this.root.add(mesh);
      this.confettiPcs.push(mesh);
    }
  }

  // ─── BUILD RINGS ──────────────────────────────────────────────────────────
  _buildRings() {
    this.ringsData.forEach((rd, idx) => {
      const mesh = this.createRingFn(rd);
      mesh.visible = false;
      mesh.traverse(c => { if (c.isMesh && c.material && c.material.colorWrite === false) c.visible = false; });

      // Rings start slightly above the base plate so they don't clip through it
      const startAngle = (idx / this.ringsData.length) * Math.PI * 2;
      const startRadius = 0.12;
      const startPos = new THREE.Vector3(Math.cos(startAngle) * startRadius, 0.22, Math.sin(startAngle) * startRadius);
      mesh.position.copy(startPos);
      mesh.scale.set(0.01, 0.01, 0.01); 

      // Hover position: Much closer to camera (Z+) and slightly lower for diagonal feel
      const hRadius = 0.9 + Math.random() * 0.3;
      const hoverPos = new THREE.Vector3(Math.cos(startAngle) * hRadius, 1.2 + Math.random() * 0.4, 1.5 + Math.random() * 0.8);

      this.ringMeshes.push({
        mesh,
        startPos,
        hoverPos
      });
      this.root.add(mesh);
    });
  }

  // ─── CLICK LISTENER: No longer uses global window listener for logic ─────
  // Interaction is now managed by SceneManager via raycasting
  _addClickListener() {} 
  _removeClickListener() {}

  _startOpening() {
    this.phase  = 'squish';
    this.phaseT = 0;
  }

  // ─── MAIN UPDATE ──────────────────────────────────────────────────────────
  update(dt) {
    if (this._done) return true;
    this.phaseT += dt;
    this.idleT  += dt;

    switch (this.phase) {
      case 'idle':  this._doIdle();  break;
      case 'squish': if (this._doSquish())    { this.phase='burst'; this.phaseT=0; } break;
      case 'burst':  if (this._doBurst())     { this.phase='land';  this.phaseT=0; } break;
      case 'land':   if (this._doRingsLand()) { this._finalize(); } break;
    }
    return false;
  }

  // ── IDLE: gentle float + rock ───────────────────────────────────────────
  _doIdle() {
    const t = this.idleT;
    this.root.children[0] && (this.root.rotation.y = Math.sin(t*0.9) * 0.06);
    if (this.lidGroup) this.lidGroup.position.y = this._lidStartY + Math.sin(t*2.0)*0.01;
    // Float the entire box group (walls + base together)
    this.walls.forEach(w => { /* keep walls still so they look solid */ });
  }

  // ── SQUISH: dramatic compress before burst ──────────────────────────────
  _doSquish() {
    const dur = 0.55;
    const p   = norm(this.phaseT, 0, dur);
    const sq  = Math.sin(p * Math.PI * 3) * (1 - p);
    // Scale the root so walls + lid squish together
    this.root.scale.set(1 - sq*0.2, 1 + sq*0.4, 1 - sq*0.2);
    return this.phaseT >= dur;
  }

  // ── BURST: lid, walls, confetti, rings all at once ──────────────────────
  _doBurst() {
    const dur = 2.2;
    const t   = this.phaseT;
    this.root.scale.set(1, 1, 1);

    // 1. Lid flies off
    const pLid = clamp01(t / 0.7);
    const eLid = easeOutBack(pLid);
    this.lidGroup.position.set(lerp(0,3.5,eLid), lerp(this._lidStartY, this._lidStartY+5.5, easeOutBack(clamp01(pLid*1.5))), lerp(0,-3,eLid));
    this.lidGroup.rotation.set(lerp(0,Math.PI*3,eLid), lerp(0,Math.PI*2.5,eLid), lerp(0,Math.PI*1.5,eLid));

    // 2. Walls fall in their OWN directions
    //    Front: pivot at (0,y,+hs) → rotate around X by +PI/2 → top goes toward +Z ✓
    //    Back:  pivot at (0,y,−hs) → rotate around X by −PI/2 → top goes toward −Z ✓
    //    Right: pivot at (+hs,y,0) → rotate around Z by −PI/2 → top goes toward +X ✓
    //    Left:  pivot at (−hs,y,0) → rotate around Z by +PI/2 → top goes toward −X ✓
    const pW = easeOutBounce(norm(t, 0, 1.1));
    this.walls.forEach(wall => {
      const angle = (Math.PI / 2) * wall.userData.dir * pW;
      if (wall.userData.axis === 'x') {
        wall.rotation.x = angle;
      } else {
        wall.rotation.z = angle;
      }
    });

    // 3. Confetti burst
    this.confettiPcs.forEach(mesh => {
      const d = mesh.userData.delay, dur2 = mesh.userData.duration;
      const cp = norm(t, d, d+dur2);
      if (cp > 0 && !mesh.visible) mesh.visible = true;
      if (cp <= 0) return;
      mesh.position.lerpVectors(mesh.userData.origin, mesh.userData.target, easeOutCubic(Math.min(cp,1)));
      const gravT = Math.max(0, t - d - dur2*0.4);
      mesh.position.y += 0.5 * mesh.userData.gravity * gravT * gravT;
      mesh.rotateOnAxis(mesh.userData.spinAxis, mesh.userData.spinSpeed * 0.016);
      const fp = norm(t, d+dur2, d+dur2+0.5);
      mesh.material.transparent = true;
      mesh.material.opacity = 1 - fp;
      if (fp >= 1) mesh.visible = false;
    });

    // 4. Rings rise from the base to hover
    this.ringMeshes.forEach(({ mesh, startPos, hoverPos }, idx) => {
      const rp = easeOutBack(norm(t, idx * 0.08, idx * 0.08 + 1.0));
      if (rp > 0 && !mesh.visible) mesh.visible = true;
      if (rp <= 0) return;
      mesh.position.lerpVectors(startPos, hoverPos, rp);
      const s = lerp(0.01, 0.22, rp);
      mesh.scale.set(s, s, s);
      mesh.rotation.y += (5 + idx) * 0.016;
    });

    return t >= dur;
  }

  // ── RINGS LAND into the catalogue ───────────────────────────────────────
  _doRingsLand() {
    const dur = 2.0; 
    const t   = this.phaseT;
    let allDone = true;

    this.ringMeshes.forEach(({ mesh, hoverPos }, idx) => {
      const startT  = idx * 0.2;
      const ringDur = 0.8;
      const p = easeInOutCubic(norm(t, startT, startT + ringDur));

      if (p <= 0) { allDone = false; return; }

      // Landing: fly from hover towards camera then down to UI
      const ey = lerp(hoverPos.y, -3.5 - idx * 0.1, easeInCubic(p));
      const ez = lerp(hoverPos.z, 2.5, p); // Move even more towards camera during landing
      mesh.position.set(lerp(hoverPos.x, 0, p), ey, ez);
      mesh.rotation.y += 8 * p * 0.016;
      const s = lerp(0.22, 0.05, p);
      mesh.scale.set(s, s, s);

      // Fire onRingLanded when the ring is almost at the bottom (leaving view)
      // 0.75 feels like the sweet spot where it "lands" into the UI shelf
      if (p >= 0.75 && !this._ringLandedFlags[idx]) {
        this._ringLandedFlags[idx] = true;
        if (this.onRingLanded) this.onRingLanded(idx);
      } else if (p < 1) {
        allDone = false;
      }
    });

    return allDone || this.phaseT >= dur;
  }

  // ── DONE: fade out the entire box then fire onComplete ──────────────────
  _finalize() {
    this._done = true;

    // Fade all materials to transparent over 600ms
    if (this._allMaterials) {
      this._allMaterials.forEach(m => { m.transparent = true; });
    }
    const startTime  = performance.now();
    const fadeDur    = 600;
    const fadeStep   = () => {
      const elapsed = performance.now() - startTime;
      const alpha   = Math.max(0, 1 - elapsed / fadeDur);
      if (this._allMaterials) {
        this._allMaterials.forEach(m => { m.opacity = alpha; });
      }
      if (alpha > 0) {
        requestAnimationFrame(fadeStep);
      } else {
        this.scene.remove(this.root);
        if (this.onComplete) this.onComplete();
      }
    };
    requestAnimationFrame(fadeStep);
  }

  dispose() {
    this._removeClickListener();
    this.scene.remove(this.root);
  }
}
