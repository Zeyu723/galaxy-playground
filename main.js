const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('cam_preview');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const dockContainer = document.getElementById('dock-container');
const appTitle = document.getElementById('app-title');
const gestureHintEl = document.getElementById('gesture-hint');

const CONFIG = {
  particleCount: 65000,
  particleSize: 0.5,
  cameraZ: 100,
};

const PINCH_T = 0.25;

// 秘钥不在前端保存；改为通过后端代理调用

let scene, camera, renderer, particles, geometry, material;
let targetPositions = [];
let targetColors = [];
let currentShape = 'sun';
let currentGalaxy = 'solar';
let targetQuat;
let lastNormal = null;
let smoothedQuat;
let angularMomentum;
let momentumGain = 1;
let lastFrameTime = performance.now();

let handExpansion = 0.4;
let isHandDetected = false;
let handRotation = { x: 0, y: 0, z: 0 };
let time = 0;

let audioContext, analyser, dataArray;
let isAudioActive = false;
let scaleLocked = false;
let lockedExpansion = 0.4;
let controllingHand = 0;
let lastGestureMode = "";
let camVisible = true;

function updateGestureHint(mode) {
  if (!gestureHintEl) return;
  if (mode === lastGestureMode) return;
  lastGestureMode = mode;
  let html = "";
  if (mode === "none") {
    html = `<div><i class="fas fa-eye-slash mr-1 text-gray-400"></i> 未检测到手</div>`;
  } else if (mode === "single") {
    html = `<div><i class="fas fa-sync mr-1 text-white"></i> 单手旋转</div>`;
  } else if (mode === "locked-rotate") {
    html = `<div><i class="fas fa-hand-rock mr-1 text-purple-400"></i> 捏合锁定</div><div><i class="fas fa-sync mr-1 text-white"></i> 另一手旋转</div>`;
  } else {
    html = `<div><i class="fas fa-arrows-alt-h mr-1 text-blue-400"></i> 双手距离控制缩放</div><div><i class="fas fa-hand-rock mr-1 text-purple-400"></i> 捏合锁定 | <i class="fas fa-sync mr-1"></i> 单手旋转</div>`;
  }
  gestureHintEl.innerHTML = html;
}

function toggleCamPreview() {
  camVisible = !camVisible;
  if (!canvasElement) return;
  if (camVisible) {
    canvasElement.classList.remove('cam-hidden');
    const icon = document.querySelector('#btn-toggle-cam i');
    if (icon) icon.className = 'fas fa-chevron-up';
  } else {
    canvasElement.classList.add('cam-hidden');
    const icon = document.querySelector('#btn-toggle-cam i');
    if (icon) icon.className = 'fas fa-chevron-down';
  }
}

let lastLandmarks = null;


const solarDock = `
  <div class="dock-item active" onclick="changeShape('sun')" data-tooltip="太阳"><i class="fas fa-sun text-yellow-500"></i><span>Sun</span></div>
  <div class="dock-divider"></div>
  <div class="dock-item" onclick="changeShape('mercury')" data-tooltip="水星"><i class="fas fa-circle text-gray-400"></i><span>Mer</span></div>
  <div class="dock-item" onclick="changeShape('venus')" data-tooltip="金星"><i class="fas fa-circle text-yellow-200"></i><span>Ven</span></div>
  <div class="dock-item" onclick="changeShape('earth')" data-tooltip="地球"><i class="fas fa-globe-americas text-blue-400"></i><span>Ear</span></div>
  <div class="dock-item" onclick="changeShape('moon')" data-tooltip="月球"><i class="fas fa-moon text-gray-300"></i><span>Moon</span></div>
  <div class="dock-item" onclick="changeShape('mars')" data-tooltip="火星"><i class="fas fa-circle text-red-500"></i><span>Mar</span></div>
  <div class="dock-divider"></div>
  <div class="dock-item" onclick="changeShape('jupiter')" data-tooltip="木星"><i class="fas fa-circle text-orange-300 transform scale-125"></i><span>Jup</span></div>
  <div class="dock-item" onclick="changeShape('saturn')" data-tooltip="土星"><i class="fas fa-globe text-yellow-600 transform scale-110"></i><span>Sat</span></div>
  <div class="dock-item" onclick="changeShape('uranus')" data-tooltip="天王星"><i class="fas fa-circle text-cyan-300 transform scale-110"></i><span>Ura</span></div>
  <div class="dock-item" onclick="changeShape('neptune')" data-tooltip="海王星"><i class="fas fa-circle text-blue-600 transform scale-110"></i><span>Nep</span></div>
  <div class="dock-item" onclick="changeShape('pluto')" data-tooltip="冥王星"><i class="fas fa-heart text-gray-200 text-xs"></i><span>Plu</span></div>
  <div class="dock-divider"></div>
  <div class="dock-item" onclick="changeShape('solar_system')" data-tooltip="全系概览"><i class="fas fa-solar-system"></i><span>Sys</span></div>
  ${getCommonDockItems()}
`;

const xuqiDock = `
  <div class="dock-item active xuqi-item" onclick="changeShape('xuqi_star')" data-tooltip="琉璃浮光岛 (Floating Islands)">
    <i class="fas fa-gem text-pink-300"></i><span>Isle</span>
  </div>
  <div class="dock-divider"></div>
  <div class="dock-item" onclick="changeShape('crab_nebula')" data-tooltip="光丝巨蟹座 (Constellation)"><i class="fas fa-bezier-curve text-blue-200"></i><span>Crab</span></div>
  <div class="dock-item" onclick="changeShape('binary_0704')" data-tooltip="双星 (07 & 04)"><i class="fas fa-star-half-alt text-yellow-200"></i><span>Dual</span></div>
  <div class="dock-divider"></div>
  <div class="dock-item" onclick="changeShape('mirror_moon')" data-tooltip="镜之月 (Mirror Moon)"><i class="fas fa-circle text-gray-100"></i><span>Mirr</span></div>
  <div class="dock-item" onclick="changeShape('xuqi_rings')" data-tooltip="19光年之环"><i class="fas fa-ring text-purple-300"></i><span>Ring</span></div>
  <div class="dock-divider"></div>
  <div class="dock-item" onclick="changeShape('xuqi_system')" data-tooltip="许琪星系全景"><i class="fas fa-infinity text-pink-400"></i><span>Sys</span></div>
  ${getCommonDockItems()}
`;

const chakraDock = `
  <div class="dock-item active chakra-item" onclick="changeShape('miracle_star')" data-tooltip="神迹星 (核心)">
    <i class="fas fa-star text-cyan-400"></i><span>Miracle</span>
  </div>
  <div class="dock-divider"></div>
  <div class="dock-item" onclick="changeShape('crystal_guard')" data-tooltip="晶卫 (防御)"><i class="fas fa-gem text-blue-200"></i><span>Guard</span></div>
  <div class="dock-item" onclick="changeShape('star_cocoon')" data-tooltip="星茧 (育婴室)"><i class="fas fa-cloud text-pink-400"></i><span>Cocoon</span></div>
  <div class="dock-divider"></div>
  <div class="dock-item" onclick="changeShape('ocean_star')" data-tooltip="海韵星 (潮汐)"><i class="fas fa-water text-blue-500"></i><span>Ocean</span></div>
  <div class="dock-item" onclick="changeShape('glass_star')" data-tooltip="琉璃星 (聚焦)"><i class="fas fa-bullseye text-gray-200"></i><span>Glass</span></div>
  <div class="dock-divider"></div>
  <div class="dock-item" onclick="changeShape('elegy_planet')" data-tooltip="挽歌行星 (暮光)"><i class="fas fa-adjust text-orange-700"></i><span>Elegy</span></div>
  <div class="dock-item" onclick="changeShape('monolith_giant')" data-tooltip="磐石巨星 (监听)"><i class="fas fa-hdd text-blue-900"></i><span>Mono</span></div>
  <div class="dock-divider"></div>
  <div class="dock-item" onclick="changeShape('revelation_nebula')" data-tooltip="启示星云 (边界)"><i class="fas fa-smog text-purple-500"></i><span>Nebula</span></div>
  <div class="dock-item" onclick="changeShape('chakra_system')" data-tooltip="脉轮全系"><i class="fas fa-network-wired"></i><span>Chakra</span></div>
  ${getCommonDockItems()}
`;

function getCommonDockItems() {
  return `
    <div class="dock-divider"></div>
    <div class="dock-item" onclick="toggleAIModal()" data-tooltip="AI 生成"><i class="fas fa-magic text-purple-400"></i><span>AI</span></div>
    <div class="dock-item" onclick="enableAudio()" id="btn-audio" data-tooltip="音频律动"><i class="fas fa-music text-pink-400"></i><span>Viz</span></div>
    <div class="dock-item" onclick="toggleFullScreen()" data-tooltip="全屏"><i class="fas fa-expand text-white"></i><span>Full</span></div>
  `;
}

function initThree() {
  const container = document.getElementById('canvas-container');
  scene = new THREE.Scene();
  scene.fog = null;
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 8000);
  camera.position.z = CONFIG.cameraZ;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  createParticleSystem();
  window.addEventListener('resize', onWindowResize, false);
  animate();
  switchGalaxy('solar');
}

function createParticleSystem() {
  geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(CONFIG.particleCount * 3);
  const colors = new Float32Array(CONFIG.particleCount * 3);
  for (let i = 0; i < CONFIG.particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 200;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 200;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
    colors[i * 3] = 1;
    colors[i * 3 + 1] = 1;
    colors[i * 3 + 2] = 1;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sprite = new THREE.TextureLoader().load('https://threejs.org/examples/textures/sprites/disc.png');
  material = new THREE.PointsMaterial({
    size: CONFIG.particleSize,
    map: sprite,
    sizeAttenuation: true,
    alphaTest: 0.5,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });
  particles = new THREE.Points(geometry, material);
  scene.add(particles);
  particles.rotation.order = 'YXZ';
  targetQuat = particles.quaternion.clone();
  smoothedQuat = particles.quaternion.clone();
  angularMomentum = new THREE.Vector3(0, 0, 0);
  calculateTargetPositions('sun');
}

function setParticleHSL(i, h, s, l, targetColors) {
  const color = new THREE.Color().setHSL(h, s, l);
  targetColors[i * 3] = color.r;
  targetColors[i * 3 + 1] = color.g;
  targetColors[i * 3 + 2] = color.b;
}

function setParticleRGB(i, r, g, b, targetColors) {
  targetColors[i * 3] = r;
  targetColors[i * 3 + 1] = g;
  targetColors[i * 3 + 2] = b;
}

function calculateTargetPositions(shapeType) {
  targetPositions = new Float32Array(CONFIG.particleCount * 3);
  targetColors = new Float32Array(CONFIG.particleCount * 3);

  switch (shapeType) {
    case 'xuqi_star':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const p = Math.random();
        let x, y, z;
        if (p < 0.3) {
          const h = Math.random() * 10;
          const rBase = h * 0.6;
          const theta = Math.random() * Math.PI * 2;
          x = rBase * Math.cos(theta);
          y = h - 4;
          z = rBase * Math.sin(theta);
          if (Math.random() > 0.5) {
            const q = 6;
            const qa = Math.floor(theta / (Math.PI * 2 / q)) * (Math.PI * 2 / q);
            x = rBase * Math.cos(qa);
            z = rBase * Math.sin(qa);
          }
          setParticleHSL(i, 0.5 + Math.random() * 0.1, 0.9, 0.8, targetColors);
        } else if (p < 0.5) {
          const islandIdx = Math.floor(Math.random() * 3);
          const angleOffset = islandIdx * (Math.PI * 2) / 3;
          const dist = 12;
          const r = Math.random() * 3;
          const theta = Math.random() * Math.PI * 2;
          x = dist * Math.cos(angleOffset) + r * Math.cos(theta);
          y = (Math.random() - 0.5) * 3 + Math.sin(time + islandIdx) * 2;
          z = dist * Math.sin(angleOffset) + r * Math.sin(theta);
          setParticleHSL(i, 0.8 + Math.random() * 0.1, 0.8, 0.7, targetColors);
        } else if (p < 0.7) {
          const ribbonIdx = Math.floor(Math.random() * 3);
          const angleStart = ribbonIdx * (Math.PI * 2) / 3;
          const t = Math.random();
          const dist = 12;
          const startX = 0, startZ = 0, startY = 2;
          const endX = dist * Math.cos(angleStart);
          const endZ = dist * Math.sin(angleStart);
          const endY = 0;
          const midX = (startX + endX) / 2;
          const midZ = (startZ + endZ) / 2;
          const midY = 8;
          x = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * midX + t * t * endX;
          y = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * midY + t * t * endY;
          z = (1 - t) * (1 - t) * startZ + 2 * (1 - t) * t * midZ + t * t * endZ;
          x += (Math.random() - 0.5) * 0.5;
          y += (Math.random() - 0.5) * 0.5;
          z += (Math.random() - 0.5) * 0.5;
          setParticleRGB(i, 1.0, 1.0, 0.8, targetColors);
        } else {
          const r = 15 + Math.random() * 10;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos((Math.random() * 2) - 1);
          x = r * Math.sin(phi) * Math.cos(theta);
          y = r * Math.sin(phi) * Math.sin(theta) * 0.6;
          z = r * Math.cos(phi);
          setParticleHSL(i, 0.6 + Math.random() * 0.2, 0.6, 0.2, targetColors);
        }
        targetPositions[i * 3] = x;
        targetPositions[i * 3 + 1] = y;
        targetPositions[i * 3 + 2] = z;
      }
      break;

    case 'crab_nebula':
      const crabStars = [
        { x: 0, y: 0, z: 0 }, { x: 2, y: 3, z: 0 }, { x: -2, y: 3, z: 0 }, { x: 0, y: -2, z: 0 },
        { x: 8, y: 8, z: 2 }, { x: -8, y: 8, z: 2 },
        { x: 6, y: -6, z: -2 }, { x: -6, y: -6, z: -2 },
        { x: 12, y: 12, z: 4 }, { x: -12, y: 12, z: 4 },
        { x: 0, y: 5, z: 0 }, { x: 0, y: -5, z: 0 },
      ];
      const lines = [
        [0, 1], [0, 2], [0, 3], [1, 4], [2, 5], [3, 6], [3, 7], [4, 8], [5, 9], [1, 10], [2, 10],
      ];
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const p = Math.random();
        if (i < 19) {
          const starIdx = i % crabStars.length;
          const s = crabStars[starIdx];
          targetPositions[i * 3] = s.x * 2;
          targetPositions[i * 3 + 1] = s.y * 2;
          targetPositions[i * 3 + 2] = s.z * 2;
          setParticleRGB(i, 1, 1, 1, targetColors);
        } else if (p < 0.6) {
          const lineIdx = Math.floor(Math.random() * lines.length);
          const line = lines[lineIdx];
          const start = crabStars[line[0]];
          const end = crabStars[line[1]];
          const t = Math.random();
          let x = (start.x + (end.x - start.x) * t) * 2;
          let y = (start.y + (end.y - start.y) * t) * 2;
          let z = (start.z + (end.z - start.z) * t) * 2;
          x += (Math.random() - 0.5) * 0.3;
          y += (Math.random() - 0.5) * 0.3;
          z += (Math.random() - 0.5) * 0.3;
          setParticleHSL(i, 0.55, 0.9, 0.6, targetColors);
        } else {
          const r = 25 + Math.random() * 5;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos((Math.random() * 2) - 1);
          targetPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
          targetPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
          targetPositions[i * 3 + 2] = r * Math.cos(phi);
          setParticleHSL(i, 0.6, 0.4, 0.1, targetColors);
        }
      }
      break;

    case 'binary_0704':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const p = Math.random();
        let x, y, z;
        if (p < 0.6) {
          const r = 8;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos((Math.random() * 2) - 1);
          x = r * Math.sin(phi) * Math.cos(theta) - 15;
          y = r * Math.sin(phi) * Math.sin(theta);
          z = r * Math.cos(phi);
          setParticleHSL(i, 0.1, 0.8, 0.8, targetColors);
        } else {
          const r = 5;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos((Math.random() * 2) - 1);
          x = r * Math.sin(phi) * Math.cos(theta) + 20;
          y = r * Math.sin(phi) * Math.sin(theta);
          z = r * Math.cos(phi);
          setParticleHSL(i, 0.0, 0.9, 0.5 + Math.random() * 0.5, targetColors);
        }
        targetPositions[i * 3] = x;
        targetPositions[i * 3 + 1] = y;
        targetPositions[i * 3 + 2] = z;
      }
      break;

    case 'xuqi_rings':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const p = Math.random();
        const angle = Math.random() * Math.PI * 2;
        let r, y, x, z;
        if (p < 0.3) {
          r = 16 + Math.random() * 2;
          y = (Math.random() - 0.5) * 0.5;
          setParticleHSL(i, 0.08, 0.9, 0.6, targetColors);
        } else if (p < 0.6) {
          r = 22 + Math.random() * 3;
          y = (Math.random() - 0.5) * 0.2;
          setParticleHSL(i, angle / (Math.PI * 2), 0.8, 0.7, targetColors);
        } else {
          r = 30 + Math.random() * 10;
          y = (Math.random() - 0.5) * 4;
          setParticleHSL(i, 0.6, 0.4, 0.8, targetColors);
        }
        x = r * Math.cos(angle);
        z = r * Math.sin(angle);
        const tilt = 0.3;
        const yNew = y * Math.cos(tilt) - z * Math.sin(tilt);
        const zNew = y * Math.sin(tilt) + z * Math.cos(tilt);
        targetPositions[i * 3] = x;
        targetPositions[i * 3 + 1] = yNew;
        targetPositions[i * 3 + 2] = zNew;
      }
      break;

    case 'mirror_moon':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const r = 6;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        targetPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        targetPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        targetPositions[i * 3 + 2] = r * Math.cos(phi);
        setParticleRGB(i, 0.9, 0.95, 1.0, targetColors);
      }
      break;

    case 'xuqi_system':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const p = Math.random();
        if (p < 0.2) {
          const r = 5;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos((Math.random() * 2) - 1);
          targetPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
          targetPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
          targetPositions[i * 3 + 2] = r * Math.cos(phi);
          setParticleHSL(i, 0.85, 0.7, 0.7, targetColors);
        } else if (p < 0.6) {
          const r = 10 + Math.random() * 15;
          const angle = Math.random() * Math.PI * 2;
          targetPositions[i * 3] = r * Math.cos(angle);
          targetPositions[i * 3 + 1] = (Math.random() - 0.5);
          targetPositions[i * 3 + 2] = r * Math.sin(angle);
          setParticleHSL(i, 0.6, 0.5, 0.8, targetColors);
        } else {
          const r = 40 + Math.random() * 20;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos((Math.random() * 2) - 1);
          targetPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
          targetPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
          targetPositions[i * 3 + 2] = r * Math.cos(phi);
          setParticleHSL(i, 0.55, 0.4, 0.2, targetColors);
        }
      }
      break;

    case 'sun':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const rBase = 18;
        const r = Math.pow(Math.random(), 0.4) * rBase;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const noise = Math.sin(theta * 15) * Math.cos(phi * 15) * 0.8;
        const finalR = r + (r > rBase * 0.9 ? noise : 0);
        targetPositions[i * 3] = finalR * Math.sin(phi) * Math.cos(theta);
        targetPositions[i * 3 + 1] = finalR * Math.sin(phi) * Math.sin(theta);
        targetPositions[i * 3 + 2] = finalR * Math.cos(phi);
        if (i > CONFIG.particleCount * 0.95) {
          targetPositions[i * 3] *= 1.5;
          targetPositions[i * 3 + 1] *= 1.5;
          targetPositions[i * 3 + 2] *= 1.5;
        }
        const heat = 1 - (r / rBase);
        setParticleHSL(i, 0.02 + heat * 0.12, 1.0, 0.4 + heat * 0.6, targetColors);
      }
      break;

    case 'mercury':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const r = 10;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        targetPositions[i * 3] = x;
        targetPositions[i * 3 + 1] = y;
        targetPositions[i * 3 + 2] = z;
        if (x > 0) {
          const val = x / r;
          setParticleRGB(i, 0.8 * val, 0.3 * val, 0.1, targetColors);
        } else setParticleRGB(i, 0.2, 0.2, 0.3, targetColors);
      }
      break;

    case 'venus':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const r = 12;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        let x = r * Math.sin(phi) * Math.cos(theta);
        let y = r * Math.sin(phi) * Math.sin(theta);
        let z = r * Math.cos(phi);
        x += Math.sin(y * 0.5 + x * 0.5);
        targetPositions[i * 3] = x;
        targetPositions[i * 3 + 1] = y;
        targetPositions[i * 3 + 2] = z;
        setParticleHSL(i, 0.1, 0.8, 0.6 + Math.random() * 0.2, targetColors);
      }
      break;

    case 'earth':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const r = 13;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        const cloudNoise = Math.sin(x * 0.6 + 20) * Math.cos(y * 0.6);
        const geoNoise = Math.sin(x * 0.4) + Math.cos(y * 0.4) + Math.sin(z * 0.4);
        if (cloudNoise > 0.85) {
          targetPositions[i * 3] = x * 1.05;
          targetPositions[i * 3 + 1] = y * 1.05;
          targetPositions[i * 3 + 2] = z * 1.05;
          setParticleRGB(i, 1, 1, 1, targetColors);
        } else if (geoNoise > 0.5) {
          targetPositions[i * 3] = x;
          targetPositions[i * 3 + 1] = y;
          targetPositions[i * 3 + 2] = z;
          setParticleHSL(i, 0.25 + Math.random() * 0.1, 0.6, 0.3, targetColors);
        } else {
          targetPositions[i * 3] = x;
          targetPositions[i * 3 + 1] = y;
          targetPositions[i * 3 + 2] = z;
          setParticleHSL(i, 0.6, 0.8, 0.2 + Math.random() * 0.2, targetColors);
        }
      }
      break;

    case 'moon':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const r = 5;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const finalR = r + (Math.random() - 0.5) * 0.2;
        targetPositions[i * 3] = finalR * Math.sin(phi) * Math.cos(theta);
        targetPositions[i * 3 + 1] = finalR * Math.sin(phi) * Math.sin(theta);
        targetPositions[i * 3 + 2] = finalR * Math.cos(phi);
        const l = 0.3 + Math.random() * 0.4;
        setParticleRGB(i, l, l, l, targetColors);
      }
      break;

    case 'mars':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const r = 9;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        targetPositions[i * 3] = x;
        targetPositions[i * 3 + 1] = y;
        targetPositions[i * 3 + 2] = z;
        if (Math.abs(y) > 8) setParticleRGB(i, 1, 1, 1, targetColors);
        else setParticleHSL(i, 0.02, 0.8, 0.3 + Math.random() * 0.2, targetColors);
      }
      break;

    case 'jupiter':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const r = 22;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        targetPositions[i * 3] = x;
        targetPositions[i * 3 + 1] = y;
        targetPositions[i * 3 + 2] = z;
        const band = Math.sin(y * 0.5) + Math.cos(y * 1.5) * 0.2;
        if (y > -6 && y < -2 && x > 5 && x < 15 && z > 0) setParticleHSL(i, 0.98, 0.8, 0.4, targetColors);
        else if (band > 0.5) setParticleHSL(i, 0.08, 0.6, 0.6, targetColors);
        else if (band > 0) setParticleHSL(i, 0.02, 0.7, 0.4, targetColors);
        else setParticleHSL(i, 0.1, 0.4, 0.7, targetColors);
      }
      break;

    case 'saturn':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const p = Math.random();
        if (p < 0.3) {
          const r = 18;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos((Math.random() * 2) - 1);
          targetPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
          targetPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.9;
          targetPositions[i * 3 + 2] = r * Math.cos(phi);
          setParticleHSL(i, 0.12, 0.8, 0.6, targetColors);
        } else {
          const angle = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * (45 - 22) + 22;
          if (r > 35 && r < 37) {
            targetPositions[i * 3] = 0;
            continue;
          }
          const tilt = 0.47;
          const y = (Math.random() - 0.5) * 0.5;
          targetPositions[i * 3] = r * Math.cos(angle);
          targetPositions[i * 3 + 1] = y * Math.cos(tilt) - r * Math.sin(angle) * Math.sin(tilt);
          targetPositions[i * 3 + 2] = y * Math.sin(tilt) + r * Math.sin(angle) * Math.cos(tilt);
          setParticleHSL(i, 0.1 + Math.sin(r) * 0.02, 0.6, 0.5, targetColors);
        }
      }
      break;

    case 'uranus':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const p = Math.random();
        if (p < 0.7) {
          const r = 16;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos((Math.random() * 2) - 1);
          targetPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
          targetPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
          targetPositions[i * 3 + 2] = r * Math.cos(phi);
          setParticleHSL(i, 0.5, 0.6, 0.7, targetColors);
        } else {
          const angle = Math.random() * Math.PI * 2;
          const r = 20 + Math.random() * 5;
          targetPositions[i * 3] = r * Math.cos(angle);
          targetPositions[i * 3 + 1] = r * Math.sin(angle);
          targetPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
          setParticleHSL(i, 0.5, 0.4, 0.3, targetColors);
        }
      }
      break;

    case 'neptune':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const r = 15;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        targetPositions[i * 3] = x;
        targetPositions[i * 3 + 1] = y;
        targetPositions[i * 3 + 2] = z;
        if (y > 2 && y < 6 && x > 2 && x < 8 && z > 0) setParticleHSL(i, 0.6, 0.9, 0.1, targetColors);
        else if (Math.sin(y * 3 + x) > 0.8) setParticleHSL(i, 0.6, 0.4, 0.8, targetColors);
        else setParticleHSL(i, 0.62, 0.8, 0.3, targetColors);
      }
      break;

    case 'pluto':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const r = 6;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        targetPositions[i * 3] = x;
        targetPositions[i * 3 + 1] = y;
        targetPositions[i * 3 + 2] = z;
        if (x > -2 && x < 3 && y > -2 && y < 3 && z > 2) setParticleHSL(i, 0.1, 0.2, 0.9, targetColors);
        else setParticleHSL(i, 0.05, 0.3, 0.4, targetColors);
      }
      break;

    case 'solar_system':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const p = Math.random();
        if (p < 0.15) {
          const r = Math.random() * 6;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos((Math.random() * 2) - 1);
          targetPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
          targetPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
          targetPositions[i * 3 + 2] = r * Math.cos(phi);
          setParticleHSL(i, 0.1, 1.0, 0.7, targetColors);
        } else {
          const angle = Math.random() * Math.PI * 2;
          const orbit = Math.random();
          let r, h = 0.6;
          if (orbit < 0.1) { r = 10 + Math.random(); h = 0.5; }
          else if (orbit < 0.2) { r = 15 + Math.random(); h = 0.1; }
          else if (orbit < 0.35) { r = 22 + Math.random() * 2; h = 0.6; }
          else if (orbit < 0.45) { r = 30 + Math.random() * 2; h = 0.0; }
          else if (orbit < 0.7) { r = 45 + Math.random() * 5; h = 0.08; }
          else { r = 65 + Math.random() * 8; h = 0.12; }
          targetPositions[i * 3] = r * Math.cos(angle);
          targetPositions[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
          targetPositions[i * 3 + 2] = r * Math.sin(angle);
          setParticleHSL(i, h, 0.8, 0.6, targetColors);
        }
      }
      break;

    case 'miracle_star':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const p = Math.random();
        if (p < 0.35) {
          const r = 10;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos((Math.random() * 2) - 1);
          let x = r * Math.sin(phi) * Math.cos(theta);
          let y = r * Math.sin(phi) * Math.sin(theta);
          let z = r * Math.cos(phi);
          const continent = Math.sin(x * 0.4) + Math.cos(y * 0.4) + Math.sin(z * 0.4);
          if (continent > 0.7) setParticleHSL(i, 0.05, 0.8, 0.5, targetColors);
          else setParticleHSL(i, 0.7, 0.8, 0.2, targetColors);
          targetPositions[i * 3] = x;
          targetPositions[i * 3 + 1] = y;
          targetPositions[i * 3 + 2] = z;
        } else if (p < 0.65) {
          const angle = Math.random() * Math.PI * 2;
          const r = 16 + Math.random() * 6;
          const x = r * Math.cos(angle);
          const z = r * Math.sin(angle);
          const y = (Math.random() - 0.5) * 1.5;
          targetPositions[i * 3] = x;
          targetPositions[i * 3 + 1] = y;
          targetPositions[i * 3 + 2] = z;
          const mix = Math.random();
          setParticleHSL(i, mix < 0.5 ? 0.5 : 0.8, 0.9, 0.7, targetColors);
        } else if (p < 0.85) {
          const angle = Math.random() * Math.PI * 2;
          const r = 30 + Math.random() * 2;
          targetPositions[i * 3] = r * Math.cos(angle);
          targetPositions[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
          targetPositions[i * 3 + 2] = r * Math.sin(angle);
          setParticleHSL(i, 0.12, 0.6, 0.8, targetColors);
        } else {
          if (Math.random() < 0.5) {
            targetPositions[i * 3] = -80 + (Math.random() - 0.5) * 5;
            targetPositions[i * 3 + 1] = 40 + (Math.random() - 0.5) * 5;
            targetPositions[i * 3 + 2] = -100;
            setParticleHSL(i, 0.6, 1.0, 0.9, targetColors);
          } else {
            targetPositions[i * 3] = -75 + (Math.random() - 0.5) * 3;
            targetPositions[i * 3 + 1] = 35 + (Math.random() - 0.5) * 3;
            targetPositions[i * 3 + 2] = -100;
            setParticleHSL(i, 0.05, 0.9, 0.6, targetColors);
          }
        }
      }
      break;

    case 'crystal_guard':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const r = 8;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const quant = 4;
        const qt = Math.floor(theta * quant) / quant * Math.PI * 2;
        const qp = Math.floor(phi * quant) / quant * Math.PI;
        const x = r * Math.sin(qp) * Math.cos(qt);
        const y = r * Math.sin(qp) * Math.sin(qt);
        const z = r * Math.cos(qp);
        targetPositions[i * 3] = x + (Math.random() - 0.5);
        targetPositions[i * 3 + 1] = y + (Math.random() - 0.5);
        targetPositions[i * 3 + 2] = z + (Math.random() - 0.5);
        setParticleHSL(i, 0.55, 0.9, 0.8, targetColors);
      }
      break;

    case 'star_cocoon':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const r = Math.random() * 40;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        const noise = Math.sin(x * 0.2) * Math.cos(y * 0.2) * Math.sin(z * 0.2);
        if (noise > 0) {
          targetPositions[i * 3] = x;
          targetPositions[i * 3 + 1] = y;
          targetPositions[i * 3 + 2] = z;
          setParticleHSL(i, 0.8 + Math.random() * 0.2, 0.8, 0.6, targetColors);
        } else {
          targetPositions[i * 3] = x * 0.5;
          targetPositions[i * 3 + 1] = y * 0.1;
          targetPositions[i * 3 + 2] = z * 0.5;
          setParticleHSL(i, 0.3, 1.0, 0.7, targetColors);
        }
      }
      break;

    case 'ocean_star':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const r = 12;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        targetPositions[i * 3] = x;
        targetPositions[i * 3 + 1] = y;
        targetPositions[i * 3 + 2] = z;
        const bio = Math.sin(x * 0.8 + y * 0.8);
        if (bio > 0.5) setParticleHSL(i, 0.5, 1.0, 0.7, targetColors);
        else setParticleHSL(i, 0.65, 0.9, 0.2, targetColors);
      }
      break;

    case 'glass_star':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const r = 11;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        targetPositions[i * 3] = x;
        targetPositions[i * 3 + 1] = y;
        targetPositions[i * 3 + 2] = z;
        setParticleRGB(i, 0.9, 0.9, 1.0, targetColors);
      }
      break;

    case 'elegy_planet':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const r = 10;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        targetPositions[i * 3] = x;
        targetPositions[i * 3 + 1] = y;
        targetPositions[i * 3 + 2] = z;
        if (x > 0) setParticleHSL(i, 0.1, 0.2, 0.1, targetColors);
        else if (x > -2) setParticleHSL(i, 0.05, 1.0, 0.6, targetColors);
        else setParticleHSL(i, 0.6, 0.2, 0.1, targetColors);
      }
      break;

    case 'monolith_giant':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const r = 18;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        targetPositions[i * 3] = x;
        targetPositions[i * 3 + 1] = y;
        targetPositions[i * 3 + 2] = z;
        if (Math.abs(y) > 15) {
          if (Math.random() > 0.5) setParticleHSL(i, 0.3, 1.0, 0.8, targetColors);
          else setParticleHSL(i, 0.3, 0.5, 0.2, targetColors);
        } else {
          setParticleHSL(i, 0.6, 0.3, 0.2, targetColors);
        }
      }
      break;

    case 'revelation_nebula':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const r = 100 + Math.random() * 50;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        targetPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        targetPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        targetPositions[i * 3 + 2] = r * Math.cos(phi);
        setParticleHSL(i, Math.random() * 0.2 + 0.6, 0.8, 0.3, targetColors);
      }
      break;

    case 'chakra_system':
      for (let i = 0; i < CONFIG.particleCount; i++) {
        const t = i / CONFIG.particleCount * Math.PI * 20;
        const x = Math.sin(t) * (30 + i / 500);
        const y = Math.cos(t * 0.5) * 20;
        const z = Math.cos(t) * (30 + i / 500);
        targetPositions[i * 3] = x;
        targetPositions[i * 3 + 1] = y;
        targetPositions[i * 3 + 2] = z;
        setParticleHSL(i, i / CONFIG.particleCount, 1.0, 0.6, targetColors);
      }
      break;

    case 'ai-generated':
      for (let i = 0; i < CONFIG.particleCount; i++) setParticleRGB(i, 1, 1, 1, targetColors);
      break;
  }
  geometry.attributes.color.needsUpdate = true;
}

function switchGalaxy(galaxy) {
  currentGalaxy = galaxy;
  document.querySelectorAll('.galaxy-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${galaxy}`).classList.add('active');
  if (galaxy === 'chakra') {
    appTitle.innerHTML = 'CHAKRA<span class="text-white text-opacity-50 font-light">.GALAXY</span>';
    appTitle.className = "text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 tracking-wider drop-shadow-lg";
    dockContainer.innerHTML = chakraDock;
    changeShape('miracle_star');
  } else if (galaxy === 'xuqi') {
    appTitle.innerHTML = 'XUQI<span class="text-white text-opacity-50 font-light">.0704</span>';
    appTitle.className = "text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-400 tracking-wider drop-shadow-lg";
    dockContainer.innerHTML = xuqiDock;
    changeShape('xuqi_star');
  } else {
    appTitle.innerHTML = 'SOLAR<span class="text-white text-opacity-50 font-light">.SYSTEM</span>';
    appTitle.className = "text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-orange-400 to-red-500 tracking-wider drop-shadow-lg";
    dockContainer.innerHTML = solarDock;
    changeShape('sun');
  }
}

function changeShape(shape) {
  currentShape = shape;
  if (shape !== 'audio_sphere') {
    isAudioActive = false;
    const btn = document.getElementById('btn-audio');
    if (btn) btn.classList.remove('active');
  }
  calculateTargetPositions(shape);
  document.querySelectorAll('.dock-item').forEach(btn => btn.classList.remove('active'));
  const items = document.querySelectorAll('.dock-item');
  items.forEach(item => {
    if (item.getAttribute('onclick').includes(`'${shape}'`)) {
      item.classList.add('active');
    }
  });
}

function animate() {
  requestAnimationFrame(animate);
  time += 0.01;
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  if (isHandDetected) {
    const inv = smoothedQuat.clone().invert();
    const dq = targetQuat.clone().multiply(inv);
    const w = THREE.MathUtils.clamp(dq.w, -1, 1);
    let angle = 2 * Math.acos(w);


    const MIN_ANGLE = 0.9 * Math.PI / 180; // 死区过滤噪声
    // 噪声过滤：小角度直接当作 0
    // const MIN_ANGLE = 0.004; // 约 1~2 度，可以自己调
    if (angle < MIN_ANGLE) {
      angle = 0;
    }

    const s = Math.sqrt(Math.max(0, 1 - w * w));
    let axis = new THREE.Vector3();
    if (s < 1e-5) axis.set(0, 1, 0); else axis.set(dq.x / s, dq.y / s, dq.z / s);


    if (angle > Math.PI) { 
      angle = 2 * Math.PI - angle; 
      axis.multiplyScalar(-1); 
    }

  // 比较柔一点的参数
  const stiffness = 6.0 * momentumGain;  // 先用 2，感觉不够再慢慢加
  const damping   = 0.93;                // 越接近 1 越丝滑但也更“黏”

    angularMomentum.multiplyScalar(damping);
    angularMomentum.add(axis.clone().multiplyScalar(angle * stiffness));//不动原始 axis，只用其副本.
    //axis 不止用于本帧旋转，还用于建立下一帧的旋转参考方向：

    let mag = angularMomentum.length();
    const step = Math.min(0.12, mag) * dt;
    const axisN = mag > 1e-6 ? angularMomentum.clone().normalize() : axis;
    const inc = new THREE.Quaternion().setFromAxisAngle(axisN, step);
    
    smoothedQuat.multiply(inc); // ← 用惯性更新 smoothedQuat
    smoothedQuat.normalize();              // 防止数值漂移

    // 把 slerp 改成非常小的纠偏（或者直接去掉）
    smoothedQuat.slerp(targetQuat, 0.02);  // 只有 2% 校正
    particles.quaternion.copy(smoothedQuat);
  } else {
    angularMomentum.multiplyScalar(0.9);
    const idle = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.001);
    smoothedQuat.multiply(idle);
    particles.quaternion.copy(smoothedQuat);
  }
  let audioScale = 1.0;
  if (isAudioActive && !scaleLocked) {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let j = 0; j < dataArray.length; j++) sum += dataArray[j];
    audioScale = 1 + (sum / dataArray.length) / 150;
  }
  const pos = particles.geometry.attributes.position.array;
  const cols = particles.geometry.attributes.color.array;
  const moveSpeed = 0.05;
  const totalScale = (0.2 + handExpansion * 4.0) * audioScale;
  for (let i = 0; i < CONFIG.particleCount; i++) {
    const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
    let tx = targetPositions[i * 3], ty = targetPositions[i * 3 + 1], tz = targetPositions[i * 3 + 2];
    if (currentGalaxy === 'chakra') {
      if (currentShape === 'star_cocoon') {
        const dist = Math.sqrt(tx * tx + ty * ty + tz * tz);
        if (dist < 10) {
          const pulse = Math.sin(time * 3) * 0.2 + 1;
          tx *= pulse; ty *= pulse; tz *= pulse;
        }
      }
      if (currentShape === 'revelation_nebula') {
        const breath = Math.sin(time * 0.5) * 0.05 + 1;
        tx *= breath; ty *= breath; tz *= breath;
      }
    }
    if (currentGalaxy === 'xuqi') {
      if (currentShape === 'xuqi_star') {
        if (Math.sqrt(tx * tx + tz * tz) < 6) {
          ty += Math.sin(time) * 0.05;
        } else if (Math.sqrt(tx * tx + tz * tz) > 10) {
          ty += Math.sin(time + 2) * 0.05;
        }
      }
      if (currentShape === 'binary_0704') {
        if (tx > 10) {
          const pulse = Math.sin(time * 5) * 0.1 + 1;
          tx *= pulse; ty *= pulse; tz *= pulse;
        }
      }
    }
    if (isAudioActive) {
      const idx = i % dataArray.length;
      const val = dataArray[idx] / 255;
      const noise = val * 2.0;
      tx *= (1 + noise * 0.1);
      ty *= (1 + noise * 0.1);
      tz *= (1 + noise * 0.1);
    }
    pos[i * 3] += (tx * totalScale - px) * moveSpeed;
    pos[i * 3 + 1] += (ty * totalScale - py) * moveSpeed;
    pos[i * 3 + 2] += (tz * totalScale - pz) * moveSpeed;
    cols[i * 3] += (targetColors[i * 3] - cols[i * 3]) * 0.05;
    cols[i * 3 + 1] += (targetColors[i * 3 + 1] - cols[i * 3 + 1]) * 0.05;
    cols[i * 3 + 2] += (targetColors[i * 3 + 2] - cols[i * 3 + 2]) * 0.05;
  }
  particles.geometry.attributes.position.needsUpdate = true;
  particles.geometry.attributes.color.needsUpdate = true;
  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function toggleFullScreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(console.log);
  else if (document.exitFullscreen) document.exitFullscreen().catch(console.log);
}

function enableAudio() {
  if (isAudioActive) return;
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    navigator.mediaDevices.getUserMedia({ audio: true }).then(s => {
      const src = audioContext.createMediaStreamSource(s);
      src.connect(analyser);
      isAudioActive = true;
      document.getElementById('btn-audio').classList.add('active');
    }).catch(e => alert("Mic denied"));
  } catch (e) { console.log(e); }
}

function toggleAIModal() { document.getElementById('ai-modal').classList.toggle('hidden'); }

// --- AI 生成核心函数 (请复制并替换原有的 generateAIShape) ---
async function generateAIShape() {
    const promptInput = document.getElementById('ai-prompt');
    const prompt = promptInput.value.trim();
    const btn = document.getElementById('btn-generate');
    const errorEl = document.getElementById('ai-error');
    
    if (!prompt) return;

    // 1. UI 状态更新
    const originalText = btn.innerText;
    btn.innerText = "正在联络宇宙...";
    btn.disabled = true;
    if (errorEl) errorEl.classList.add('hidden');

    try {
        // 2. 请求本地后端 (不再直接请求 Google)
        // 注意：确保你的 server.js 正在 localhost:3000 上运行
        const response = await fetch('http://localhost:3000/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Server connection failed');
        }

        const data = await response.json();
        const code = data.code;

        if (!code) throw new Error("AI 返回了空指令");

        console.log("AI Code Received:", code); // 调试用

        // 3. 构造执行函数
        // 注入数学函数，让 AI 生成的代码更简洁易跑
        const loopFunction = new Function('particleCount', 'targetPositions', 'targetColors', 'time', 
            `
            const sin = Math.sin; const cos = Math.cos; const tan = Math.tan; const PI = Math.PI;
            const random = Math.random; const sqrt = Math.sqrt; const pow = Math.pow; const abs = Math.abs;
            
            for(let i=0; i<particleCount; i++){ 
                ${code} 
            }
            `
        );
        
        // 4. 准备数据容器
        targetPositions = new Float32Array(CONFIG.particleCount * 3);
        targetColors = new Float32Array(CONFIG.particleCount * 3);
        
        // 初始化默认颜色 (白色)，防止 AI 没写颜色代码导致全黑
        for(let i=0; i<CONFIG.particleCount*3; i++) targetColors[i] = 1.0;

        // 5. 执行 AI 代码计算坐标
        loopFunction(CONFIG.particleCount, targetPositions, targetColors, time);
        
        // 6. 智能上色 (如果 AI 代码里没有涉及到 targetColors)
        if (!code.includes('targetColors')) {
            const colorizer = buildPromptColorizer(prompt);
            for (let i = 0; i < CONFIG.particleCount; i++) {
                const x = targetPositions[i*3], y = targetPositions[i*3+1], z = targetPositions[i*3+2];
                const r = Math.sqrt(x*x + y*y + z*z);
                const col = colorizer(x, y, z, r);
                targetColors[i*3] = col[0];
                targetColors[i*3+1] = col[1];
                targetColors[i*3+2] = col[2];
            }
        }
        
        // 7. 应用结果并更新状态
        currentShape = 'ai-generated';
        geometry.attributes.color.needsUpdate = true;
        
        // 关闭 UI 并重置导航状态
        document.querySelectorAll('.dock-item').forEach(b => b.classList.remove('active'));
        toggleAIModal();
        
        // 顶部提示
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');
        if(statusText) statusText.innerText = "AI 创造完成";
        if(statusDot) statusDot.className = "w-2 h-2 rounded-full bg-purple-500 animate-pulse";

    } catch (e) { 
        console.error("生成出错:", e); 
        if (errorEl) {
            errorEl.innerText = `生成失败: ${e.message}`;
            errorEl.classList.remove('hidden');
        }
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// --- 辅助函数：根据提示词关键词生成配色方案 (请把这个也复制进去) ---
function buildPromptColorizer(p) {
    const s = (p || "").toLowerCase();
    const has = (kw) => s.indexOf(kw) >= 0;
    const c = {
        blue: [0.2, 0.6, 1.0], purple: [0.7, 0.3, 1.0], amber: [1.0, 0.7, 0.2],
        gold: [1.0, 0.9, 0.5], red: [1.0, 0.2, 0.2], green: [0.2, 0.9, 0.5],
        pink: [1.0, 0.5, 0.8], cyan: [0.2, 1.0, 1.0], white: [1.0, 1.0, 1.0]
    };
    
    // 确定主色调
    let base = c.white;
    if (has("火") || has("red") || has("sun") || has("fire")) base = c.red;
    else if (has("水") || has("water") || has("ice") || has("blue") || has("sea")) base = c.blue;
    else if (has("草") || has("nature") || has("green") || has("forest")) base = c.green;
    else if (has("紫") || has("purple") || has("magic") || has("void")) base = c.purple;
    else if (has("金") || has("gold") || has("star")) base = c.gold;
    else if (has("粉") || has("pink") || has("love") || has("rose")) base = c.pink;
    
    const secondary = (has("暗") || has("dark") || has("black")) ? [0.1, 0.1, 0.2] : c.cyan;

    return (x,y,z,r) => {
        // 根据距离中心的远近进行颜色渐变
        const t = Math.min(1, r / 40); 
        return [
            base[0] * (1-t) + secondary[0] * t,
            base[1] * (1-t) + secondary[1] * t,
            base[2] * (1-t) + secondary[2] * t
        ];
    };
}

function initMediaPipe() {
  if (typeof Hands === 'undefined') { setTimeout(initMediaPipe, 1000); return; }
  const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
  hands.setOptions({ selfieMode: true, maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  hands.onResults(onResults);
  if (videoElement) {
    if (!window.isSecureContext) {
      statusDot.className = "w-2 h-2 rounded-full bg-red-500";
      statusText.innerText = "请通过本地服务器打开（localhost/https），file 模式无法访问摄像头";
      return;
    }
    const cam = new Camera(videoElement, { onFrame: async () => { await hands.send({ image: videoElement }); }, width: 320, height: 240 });
    cam.start().then(() => {
      statusDot.className = "w-2 h-2 rounded-full bg-green-500";
      statusText.innerText = "系统就绪";
    }).catch((e) => {
      statusDot.className = "w-2 h-2 rounded-full bg-red-500";
      const name = (e && e.name) || "";
      if (name === "NotAllowedError") statusText.innerText = "已拒绝摄像头权限，请在浏览器地址栏允许访问";
      else if (name === "NotFoundError") statusText.innerText = "未检测到摄像头设备";
      else if (name === "SecurityError") statusText.innerText = "安全上下文受限，请使用 https 或 localhost";
      else statusText.innerText = "摄像头启动失败：" + (e && e.message ? e.message : "未知错误");
      console.error(e);
    });
  }
}

function calculateRotation(lm) {
  const p0 = lm[0], p5 = lm[5], p17 = lm[17];
  const vA = { x: p5.x - p0.x, y: p5.y - p0.y, z: p5.z - p0.z };
  const vB = { x: p5.x - p17.x, y: p5.y - p17.y, z: p5.z - p17.z };
  let normal = { x: vA.y * vB.z - vA.z * vB.y, y: vA.z * vB.x - vA.x * vB.z, z: vA.x * vB.y - vA.y * vB.x };
  if (lastNormal) {
    const dot = normal.x * lastNormal.x + normal.y * lastNormal.y + normal.z * lastNormal.z;
    if (dot < 0) { normal = { x: -normal.x, y: -normal.y, z: -normal.z }; }
  }
  lastNormal = normal;
  const yaw = Math.atan2(normal.x, normal.z);
  const pitch = Math.atan2(normal.y, -normal.z);
  const p9 = lm[9];
  const angleRad = Math.atan2(p9.y - p0.y, p9.x - p0.x);
  const roll = angleRad + Math.PI / 2;
  return { yaw: -yaw * 1.5, pitch: (pitch - 0.5) * 1.5, roll: roll };
}

// --- Improved Gesture Logic with Quaternion ---
function calculatePalmQuaternion(lm) {
    // Invert X for mirrored webcam
    const v0 = new THREE.Vector3(-lm[0].x, lm[0].y, lm[0].z);
    const v5 = new THREE.Vector3(-lm[5].x, lm[5].y, lm[5].z);
    const v17 = new THREE.Vector3(-lm[17].x, lm[17].y, lm[17].z);
    
    // xAxis: Pinky to Index (Side)
    let xAxis = new THREE.Vector3().subVectors(v5, v17).normalize();
    // zAxis: Normal of palm (Up x Side approx) -> Actually (Index-Wrist) x (Pinky-Wrist)
    let zAxis = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(v5, v0), new THREE.Vector3().subVectors(v17, v0)).normalize();
    
    // Stabilize zAxis flipping
    if (lastNormal) {
        if (zAxis.dot(lastNormal) < 0) { zAxis.negate(); xAxis.negate(); } // Flip if suddenly inverted
    }
    lastNormal = zAxis.clone();

    const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
    const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    return new THREE.Quaternion().setFromRotationMatrix(m);
}

function getPinchOpen(lm) {
  const thumb = lm[4], index = lm[8];
  const dist = Math.sqrt(Math.pow(thumb.x - index.x, 2) + Math.pow(thumb.y - index.y, 2));
  const palmSize = Math.sqrt(Math.pow(lm[0].x - lm[9].x, 2) + Math.pow(lm[0].y - lm[9].y, 2));
  const open = (dist / Math.max(palmSize, 0.01) - 0.2) * 0.8;
  return { open, palmSize };
}


function smoothLandmarks(lm) {
  if (!lastLandmarks) {
    // 第一次直接拷贝
    lastLandmarks = lm.map(p => ({ x: p.x, y: p.y, z: p.z }));
    return lm;
  }
  const alpha = 0.2; // 越小越平滑，0.2～0.5 之间自己试
  for (let i = 0; i < lm.length; i++) {
    lm[i].x = alpha * lm[i].x + (1 - alpha) * lastLandmarks[i].x;
    lm[i].y = alpha * lm[i].y + (1 - alpha) * lastLandmarks[i].y;
    lm[i].z = alpha * lm[i].z + (1 - alpha) * lastLandmarks[i].z;
  }
  lastLandmarks = lm.map(p => ({ x: p.x, y: p.y, z: p.z }));
  return lm;
}

function onResults(results) {
  const ctx = document.getElementById('cam_preview').getContext('2d');
  ctx.save();
  ctx.clearRect(0, 0, 160, 120);
  ctx.drawImage(results.image, 0, 0, 160, 120);
  if (results.multiHandLandmarks.length > 0) {
    isHandDetected = true;
    if (results.multiHandLandmarks.length === 1) {
      // const lm = results.multiHandLandmarks[0];

      let lm = results.multiHandLandmarks[0];
      lm = smoothLandmarks(lm);  // 先平滑，再算四元数
      const q = calculatePalmQuaternion(lm);
      targetQuat.copy(q);
      momentumGain = 1;
      updateGestureHint("single");
      const thumb = lm[4], index = lm[8];
      const dist = Math.sqrt(Math.pow(thumb.x - index.x, 2) + Math.pow(thumb.y - index.y, 2));
      const palmSize = Math.sqrt(Math.pow(lm[0].x - lm[9].x, 2) + Math.pow(lm[0].y - lm[9].y, 2));
      const open = (dist / Math.max(palmSize, 0.01) - 0.2) * 0.8;
      handExpansion += (Math.max(0, Math.min(1.5, open + (Math.max(palmSize, 0.01) - 0.15) * 3)) - handExpansion) * 0.1;
    } else {
      const h1 = results.multiHandLandmarks[0], h2 = results.multiHandLandmarks[1];
      const o1 = getPinchOpen(h1);
      const o2 = getPinchOpen(h2);
      const p1 = o1.open < PINCH_T;
      const p2 = o2.open < PINCH_T;
      if (p1 ^ p2) {
        if (!scaleLocked) lockedExpansion = handExpansion;
        scaleLocked = true;
        handExpansion = lockedExpansion;
        controllingHand = p1 ? 1 : 0;
        const ctrl = controllingHand === 0 ? h1 : h2;
        const qc = calculatePalmQuaternion(ctrl);
        targetQuat.copy(qc);
        momentumGain = 1;
        updateGestureHint("locked-rotate");
      } else {
        scaleLocked = false;
        const dist = Math.sqrt(Math.pow(h1[0].x - h2[0].x, 2) + Math.pow(h1[0].y - h2[0].y, 2));
        handExpansion += ((dist * 2 - 0.2) - handExpansion) * 0.1;
        const q1 = calculatePalmQuaternion(h1);
        const q2 = calculatePalmQuaternion(h2);
        const qm = q1.clone();
        qm.slerp(q2, 0.5);
        targetQuat.copy(qm);
        momentumGain = 0.6;
        updateGestureHint("dual-scale");
      }
    }
  } else {
    isHandDetected = false;
    updateGestureHint("none");
  }
  ctx.restore();
}

window.addEventListener('load', () => { initThree(); initMediaPipe(); });
