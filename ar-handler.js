import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/+esm";

export class ARHandler {
  constructor(videoElement, onResults) {
    this.videoElement = videoElement;
    this.onResults = onResults;
    this.isTracking = false;
    this.landmarker = null;
    this.lastVideoTime = -1;
  }

  async start() {
    if (this.isTracking) return;
    console.log('Initializing MediaPipe Tasks Landmarker v0.10.0...');

    try {
      this.videoElement.style.display = 'block';
      
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );

      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1
      });

      console.log('Landmarker ready, starting camera...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: 1280, 
          height: 720, 
          facingMode: 'environment' 
        } 
      });

      this.videoElement.srcObject = stream;
      this.videoElement.addEventListener('loadeddata', () => {
        this.videoElement.play();
        this.isTracking = true;
        this.predictLoop();
      });

    } catch (err) {
      console.error('AR Startup Failure:', err);
      alert(`Critical AR Error: ${err.message}`);
    }
  }

  stop() {
    this.isTracking = false;
    this.videoElement.style.display = 'none';
    if (this.videoElement.srcObject) {
      this.videoElement.srcObject.getTracks().forEach(track => track.stop());
      this.videoElement.srcObject = null;
    }
  }

  predictLoop() {
    if (!this.isTracking) return;

    if (this.videoElement.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.videoElement.currentTime;
      const results = this.landmarker.detectForVideo(this.videoElement, performance.now());
      this.processResults(results);
    }

    requestAnimationFrame(() => this.predictLoop());
  }

  processResults(results) {
    if (!results.landmarks || results.landmarks.length === 0) {
      this.onResults({ visible: false });
      return;
    }

    const landmarks = results.landmarks[0];
    const handedness = (results.handedness && results.handedness[0] && results.handedness[0][0]) 
                       ? results.handedness[0][0].label : "Right";
    
    // MCP and PIP of ring finger (13, 14)
    const mcp = landmarks[13];
    const pip = landmarks[14];

    // Knuckles for palm plane (5, 17)
    const indexMcp = landmarks[5];
    const pinkyMcp = landmarks[17];

    const sw = window.innerWidth;
    const sh = window.innerHeight;

    const getW = (lm) => {
      // COORDINATE MAPPING: 
      // MediaPipe (0,0) is TOP-LEFT. 
      // Three.js (0,0) is CENTER.
      // lm.x/y/z are normalized [0,1].
      
      // We map to "View Space" first
      const vFOV = 60 * Math.PI / 180;
      const cameraZ = 5;
      const viewH = 2 * Math.tan(vFOV / 2) * cameraZ;
      const aspect = sw / sh;
      const viewW = viewH * aspect;

      // X-Axis Orientation Check: 
      // If we are in environment mode, we don't flip. 
      // If in front mode, we flip (1 - lm.x). 
      // Given the user reported "mirrored again", let's provide a stable screen-centric mapping.
      const worldX = (lm.x - 0.5) * viewW;
      const worldY = -(lm.y - 0.5) * viewH;
      const worldZ = -cameraZ + (lm.z * 5); // Z is depth relative to hand

      return new THREE.Vector3(worldX, worldY, worldZ);
    };

    const w1 = getW(mcp);
    const w2 = getW(pip);
    const wIndex = getW(indexMcp);
    const wPinky = getW(pinkyMcp);

    // 1. FORWARD: Along the finger
    const forward = new THREE.Vector3().subVectors(w2, w1).normalize();

    // 2. SIDE: Across the knuckles
    const side = new THREE.Vector3().subVectors(wIndex, wPinky).normalize();

    // 3. UP: Normal to the hand plane
    // For Right hand, (side x forward) points UP (back of hand).
    // For Left hand, we might need to flip if we want the same "UP" behavior.
    let up = new THREE.Vector3().crossVectors(side, forward).normalize();
    
    // Handedness Correction: 
    // If the cross product points 'down' (into the palm), flip it.
    // We check against the Z-axis (pointing away from camera).
    if (up.z > 0) up.multiplyScalar(-1);

    // 4. RIGHT: Completing the basis
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();

    const rotationMatrix = new THREE.Matrix4().makeBasis(right, up, forward);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);

    // POSITION: Midpoint of finger segment
    const worldPos = new THREE.Vector3().addVectors(w1, w2).multiplyScalar(0.5);
    // Add offset based on the 'up' vector to sit on the skin surface
    worldPos.add(up.clone().multiplyScalar(0.08));

    // SCALE: Based on finger length
    const fingerLen = w1.distanceTo(w2);
    const ringScale = fingerLen * 0.45;

    // Detect if back of hand is facing camera
    const toCamera = new THREE.Vector3().copy(worldPos).negate().normalize();
    const isBackFacing = up.dot(toCamera) > 0;

    this.onResults({
      visible: true,
      position: worldPos,
      rotation: quaternion,
      scale: ringScale,
      landmarks: landmarks,
      isBackFacing: isBackFacing,
      videoParams: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }
    });
  }
}
