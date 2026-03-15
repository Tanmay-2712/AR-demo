import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/+esm";
import { OneEuroFilter } from './smoothing.js';

export class ARHandler {
  constructor(videoElement, onResults) {
    this.videoElement = videoElement;
    this.onResults = onResults;
    this.isTracking = false;
    this.landmarker = null;
    this.lastVideoTime = -1;

    // Smoothing filters for position, rotation (quaternion), and scale
    this.filterX = new OneEuroFilter(30, 0.5, 0.01);
    this.filterY = new OneEuroFilter(30, 0.5, 0.01);
    this.filterZ = new OneEuroFilter(30, 0.5, 0.01);
    this.filterScale = new OneEuroFilter(30, 1.0, 0.05);
    
    // Quaternion filters (4 components)
    this.filterQX = new OneEuroFilter(30, 0.1, 0.01);
    this.filterQY = new OneEuroFilter(30, 0.1, 0.01);
    this.filterQZ = new OneEuroFilter(30, 0.1, 0.01);
    this.filterQW = new OneEuroFilter(30, 0.1, 0.01);
  }

  async start() {
    if (this.isTracking) return;
    console.log('Initializing Advanced MediaPipe HandLandmarker...');

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
        numHands: 1,
        minHandDetectionConfidence: 0.7,
        minHandPresenceConfidence: 0.7,
        minTrackingConfidence: 0.7
      });

      console.log('Advanced Landmarker ready. Requesting camera...');
      
      const constraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30 }
        }
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        console.warn('Primary constraints failed, retrying with basic video...');
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      this.videoElement.srcObject = stream;
      this.videoElement.addEventListener('loadeddata', () => {
        console.log('Video stream loaded and playing.');
        this.videoElement.play();
        this.isTracking = true;
        this.predictLoop();
      });

    } catch (err) {
      console.error('AR Startup Failure:', err);
      alert(`Camera Error: ${err.name}\n${err.message}\n\nPlease ensure no other app is using the camera.`);
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
    if (!results.landmarks || results.landmarks.length === 0 || !results.worldLandmarks) {
      this.onResults({ visible: false });
      return;
    }

    const landmarks = results.landmarks[0];
    const worldLandmarks = results.worldLandmarks[0];
    const now = performance.now();

    // MCP and PIP of ring finger (13, 14) from WORLD coordinates for better orientation
    const wMcp = worldLandmarks[13];
    const wPip = worldLandmarks[14];
    const wIndexMcp = worldLandmarks[5];
    const wPinkyMcp = worldLandmarks[17];

    const vMcp = new THREE.Vector3(wMcp.x, wMcp.y, wMcp.z);
    const vPip = new THREE.Vector3(wPip.x, wPip.y, wPip.z);
    const vIndex = new THREE.Vector3(wIndexMcp.x, wIndexMcp.y, wIndexMcp.z);
    const vPinky = new THREE.Vector3(wPinkyMcp.x, wPinkyMcp.y, wPinkyMcp.z);

    // Calculate basis vectors in hand's local coordinate system
    const forward = new THREE.Vector3().subVectors(vPip, vMcp).normalize();
    const side = new THREE.Vector3().subVectors(vIndex, vPinky).normalize();
    let up = new THREE.Vector3().crossVectors(side, forward).normalize();
    
    // Ensure 'up' points towards the back of the hand (relative to wrist origin)
    if (up.dot(new THREE.Vector3(0, 0, -1)) < 0) up.multiplyScalar(-1);
    
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    const rotationMatrix = new THREE.Matrix4().makeBasis(right, up, forward);
    const rawQuaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);

    // Coordinate Mapping for Screen Position (using normalized landmarks)
    const sw = window.innerWidth;
    const sh = window.innerHeight;
    const vFOV = 60 * Math.PI / 180;
    const cameraZ = 5;
    const viewH = 2 * Math.tan(vFOV / 2) * cameraZ;
    const aspect = sw / sh;
    const viewW = viewH * aspect;

    const ringMcp = landmarks[13];
    const ringPip = landmarks[14];
    
    const screenX = ( (ringMcp.x + ringPip.x) / 2 - 0.5 ) * viewW;
    const screenY = -( (ringMcp.y + ringPip.y) / 2 - 0.5 ) * viewH;
    const screenZ = -cameraZ + ( (ringMcp.z + ringPip.z) / 2 * 5 );

    // Apply Smoothing Filters
    const posX = this.filterX.filter(screenX, now);
    const posY = this.filterY.filter(screenY, now);
    const posZ = this.filterZ.filter(screenZ, now);

    const qX = this.filterQX.filter(rawQuaternion.x, now);
    const qY = this.filterQY.filter(rawQuaternion.y, now);
    const qZ = this.filterQZ.filter(rawQuaternion.z, now);
    const qW = this.filterQW.filter(rawQuaternion.w, now);
    const smoothedQuaternion = new THREE.Quaternion(qX, qY, qZ, qW).normalize();

    // Scale calculation (based on finger segment length in world coordinates)
    const fingerLenWorld = vMcp.distanceTo(vPip);
    const rawScale = fingerLenWorld * 12; // Adjusted multiplier for meters-to-scene units
    const smoothedScale = this.filterScale.filter(rawScale, now);

    // Detect if back of hand is facing camera
    const toCamera = new THREE.Vector3(0, 0, 1); // Fixed camera direction
    const isBackFacing = up.dot(toCamera) < 0;

    this.onResults({
      visible: true,
      position: new THREE.Vector3(posX, posY, posZ),
      rotation: smoothedQuaternion,
      scale: smoothedScale,
      landmarks: landmarks,
      isBackFacing: isBackFacing
    });
  }
}
