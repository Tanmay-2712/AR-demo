import { SceneManager } from './scene';
import { ARHandler } from './ar-handler';

const ringsData = [
  { id: 1, name: 'Royal Gold', color: 0xD4AF37, gemColor: 0xffffff, image: './assets/gold.png' },
  { id: 2, name: 'Sovereign', color: 0xC0C0C0, gemColor: 0xADD8E6, image: './assets/silver.png' },
  { id: 3, name: 'Rose Bloom', color: 0xE11584, gemColor: 0xffb6c1, image: './assets/rose.png' },
  { id: 4, name: 'Emerald', color: 0xD4AF37, gemColor: 0x50C878, image: './assets/emerald.png' },
  { id: 5, name: 'Sapphire', color: 0xC0C0C0, gemColor: 0x0f52ba, image: './assets/sapphire.png' },
  { id: 6, name: 'Amethyst', color: 0xD4AF37, gemColor: 0x9966cc, image: './assets/amethyst.png' }
];

class App {
  constructor() {
    this.sceneManager = new SceneManager('canvas-container');
    this.arHandler = null; // Lazy init to save performance
    this.arInitialized = false;

    this.initUI();
    this.initGiftBox();
  }

  initUI() {
    const catalogue = document.getElementById('ring-catalogue');
    ringsData.forEach((ring, index) => {
      const card = document.createElement('div');
      card.className = `item-card ${index === 0 ? 'active' : ''}`;
      card.innerHTML = `
        <div class="item-img-container">
          <img class="item-thumb" src="${ring.image}" alt="${ring.name}">
        </div>
        <span class="item-name">${ring.name}</span>
      `;
      card.onclick = () => this.selectRing(ring, card);
      catalogue.appendChild(card);
    });

    // Default ring
    this.sceneManager.addRing(ringsData[0]);

    // Mode Toggles
    document.getElementById('btn-preview').onclick = () => this.setMode('preview');
    document.getElementById('btn-tryon').onclick = () => this.setMode('tryon');
    document.getElementById('btn-debug').onclick = () => this.toggleDebug();
  }

  initGiftBox() {
    const giftBox = document.getElementById('gift-box');
    const introOverlay = document.getElementById('intro-overlay');
    const uiOverlay = document.getElementById('ui-overlay');

    giftBox.onclick = () => {
      giftBox.classList.add('box-open');
      
      if (window.navigator.vibrate) {
        window.navigator.vibrate([100, 50, 100]);
      }

      setTimeout(() => {
        introOverlay.classList.add('fade-out');
        uiOverlay.classList.remove('hidden');
        setTimeout(() => introOverlay.remove(), 1200);
      }, 1000);
    };
  }

  async initAR() {
    if (this.arInitialized) return;
    
    this.arHandler = new ARHandler(
      document.getElementById('ar-video'),
      (results) => this.onARResults(results)
    );
    this.arInitialized = true;
  }

  selectRing(ring, element) {
    if (window.navigator.vibrate) {
      window.navigator.vibrate(20);
    }

    document.querySelectorAll('.item-card').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    
    this.sceneManager.addRing(ring);
    element.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  async setMode(mode) {
    this.sceneManager.setMode(mode);
    
    const btnPreview = document.getElementById('btn-preview');
    const btnTryOn = document.getElementById('btn-tryon');

    if (mode === 'preview') {
      btnPreview.classList.add('active');
      btnTryOn.classList.remove('active');
      if (this.arHandler) this.arHandler.stop();
    } else {
      btnTryOn.classList.add('active');
      btnPreview.classList.remove('active');
      
      // Ensure AR is initialized and started
      await this.initAR();
      await this.arHandler.start();
    }
  }

  onARResults(results) {
    this.sceneManager.updateAR(results);
  }

  // Debug helper
  toggleDebug() {
    this.sceneManager.toggleDebug();
  }
}

// Global debug listener
window.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') {
    if (window.appInstance) window.appInstance.toggleDebug();
  }
});

window.onload = () => {
  window.appInstance = new App();
};
