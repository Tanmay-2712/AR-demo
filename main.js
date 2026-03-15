import * as THREE from 'three';
import { SceneManager } from './scene.js';
import { GiftBoxIntro } from './gift-box-intro.js';
import { ARHandler } from './ar-handler.js';

const ringsData = [
  { id: 1, name: 'Heritage Solitaire', style: 'solitaire', color: 0xD4AF37, gemColor: 0xffffff, cut: 'diamond', image: './assets/gold.png' },
  { id: 2, name: 'Celestial Halo',     style: 'halo',      color: 0xC0C0C0, gemColor: 0xffffff, cut: 'round',   image: './assets/silver.png' },
  { id: 3, name: 'Royal Trinity',      style: 'three-stone',color: 0xE5C100, gemColor: 0xff4444, cut: 'diamond', image: './assets/rose.png' },
  { id: 4, name: 'Emerald Empress',    style: 'halo',      color: 0xD4AF37, gemColor: 0x50C878, cut: 'emerald', image: './assets/emerald.png' },
  { id: 5, name: 'Azure Eternity',     style: 'pave',      color: 0xC0C0C0, gemColor: 0x0f52ba, cut: 'round',   image: './assets/sapphire.png' },
  { id: 6, name: 'Amethyst Queen',     style: 'solitaire', color: 0xE11584, gemColor: 0x9966cc, cut: 'cushion', image: './assets/amethyst.png' }
];

class App {
  constructor() {
    this.sceneManager  = new SceneManager('canvas-container');
    this.introPlaying  = true;
    this._cardEls      = [];   // catalogue card DOM elements

    this.arHandler = new ARHandler(
      document.getElementById('ar-video'),
      (results) => this.sceneManager.updateAR(results)
    );
    this.arHandler.start();

    // Catalogue is empty until rings fly in
    this._startIntro();
  }

  _startIntro() {
    // Position camera for the gift box reveal
    this.sceneManager.camera.position.set(0, 1.2, 3.8);
    this.sceneManager.camera.lookAt(0, 0.3, 0);
    this.sceneManager.controls.enabled = false;

    const intro = new GiftBoxIntro(
      this.sceneManager.scene,
      this.sceneManager.camera,
      this.sceneManager.renderer,
      ringsData,
      (idx) => this._onRingLanded(idx),   // called per ring as it lands
      () => this._onIntroComplete(),       // called when all rings landed
      (ringData) => this.sceneManager.createRingMesh(ringData)
    );
    this.sceneManager.introAnimator = intro;

    // Perfectly centered "Tap on box" hint
    const hint = document.createElement('div');
    hint.id = 'tap-hint';
    hint.textContent = '✦  Tap Box to Reveal  ✦';
    hint.style.cssText = `position:absolute;bottom:45px;left:0;width:100%;
      color:rgba(229,193,0,0.85);font-size:12px;letter-spacing:0.3em;text-transform:uppercase;
      pointer-events:none;z-index:300;animation:pulse 2s ease-in-out infinite;font-family:Inter,sans-serif;
      text-align: center;`;
    document.getElementById('app').appendChild(hint);

    const hintTimer = setInterval(() => {
      if (this.sceneManager.introAnimator?.phase !== 'idle') {
        hint.style.transition = 'opacity 0.4s'; hint.style.opacity = '0';
        setTimeout(() => hint.remove(), 400);
        clearInterval(hintTimer);
      }
    }, 100);
  }

  // Called each time a ring lands — adds its catalogue card with a pop animation
  _onRingLanded(idx) {
    const ring = ringsData[idx];
    const catalogue = document.getElementById('ring-catalogue');

    const card = document.createElement('div');
    card.className = 'item-card';
    card.style.cssText = 'opacity:0;transform:translateY(30px) scale(0.8);transition:all 0.5s cubic-bezier(0.23,1,0.32,1);';
    card.innerHTML = `
      <div class="item-img-container">
        <img class="item-thumb" src="${ring.image}" alt="${ring.name}">
      </div>
      <span class="item-name">${ring.name}</span>
    `;

    card.onclick = () => {
      if (this.introPlaying) return;
      this._selectRing(ring, card);
    };

    catalogue.appendChild(card);
    this._cardEls.push(card);

    // Trigger the pop-in animation on next frame
    requestAnimationFrame(() => {
      card.style.opacity = '1';
      card.style.transform = 'translateY(0) scale(1)';
    });

    // Show the bottom UI panel if not visible yet
    const ui = document.getElementById('ui-overlay');
    if (ui.classList.contains('hidden')) {
      ui.classList.remove('hidden');
      ui.style.opacity = '0';
      requestAnimationFrame(() => {
        ui.style.transition = 'opacity 0.5s ease';
        ui.style.opacity = '1';
      });
    }
  }

  // Called when all rings have landed
  _onIntroComplete() {
    this.introPlaying = false;

    // Keep the title visible as requested
    const title = document.getElementById('intro-title');
    if (title) {
      title.style.transition = 'all 0.6s ease';
      // Maybe slightly reposition or scale it instead of hiding? 
      // For now, just keeping it as is.
    }

    // Activate first ring in the catalogue
    if (this._cardEls.length > 0) {
      this._cardEls[0].classList.add('active');
    }

    // Re-enable camera controls and preview first ring without resetting the whole scene
    this.sceneManager.controls.enabled = true;
    this.sceneManager.setMode('preview');
    this.sceneManager.addRing(ringsData[0]);

    if (window.navigator.vibrate) window.navigator.vibrate([80, 40, 80]);
  }

  _selectRing(ring, element) {
    if (window.navigator.vibrate) window.navigator.vibrate(20);
    document.querySelectorAll('.item-card').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    this.sceneManager.addRing(ring);
    element.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
}

window.addEventListener('keydown', (e) => {
  if ((e.key === 'd' || e.key === 'D') && window.appInstance) {
    window.appInstance.sceneManager.toggleDebug();
  }
});

window.onload = () => { window.appInstance = new App(); };
