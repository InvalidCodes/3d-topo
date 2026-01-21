/**
 * H5 Knot - 3D Rope Physics Simulation
 * 
 * Uses PROCEDURAL GENERATION for knot shapes (no ASCII parsing)
 * This ensures correct topology every time
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  generateFigure8Knot,
  generateTrefoilKnot,
  generateReefKnot,
  generateOverhandKnot,
  generateRandomKnot,
  generateLissajousKnot,
  generateTorusKnot,
  generateRandomLissajousKnot,
  generateRandomTorusKnot,
  generateRandomDeformedTorusKnot,
  getAvailableKnotParams,
  centerKnot,
} from './knot-generator.js';
import {
  createRopeSystem,
  stepPhysics,
  pullEndpoints,
} from './rope-physics.js';
import {
  generateKnotFromGaussCode,
  KNOWN_GAUSS_CODES,
  rollRandomGaussCode,
} from './gauss-code-generator.js';

// ============ Coordinate Mapping ============

function physToThree(p) {
  // Physics (x, y, z) -> Three.js (x, z, -y)
  return new THREE.Vector3(p.x, p.z, -p.y);
}

// ============ Knot Templates ============

const KNOT_TYPES = {
  figure8: {
    name: 'Figure-8 Knot',
    generator: generateFigure8Knot,
    options: { numPoints: 80, scale: 1.0, zScale: 0.3 },
  },
  trefoil: {
    name: 'Trefoil Knot',
    generator: generateTrefoilKnot,
    options: { numPoints: 100, scale: 1.0, zScale: 0.35 },
  },
  reef: {
    name: 'Reef Knot (2 ropes)',
    generator: generateReefKnot,
    options: { scale: 1.0, zSeparation: 0.2 },
  },
  overhand: {
    name: 'Overhand Knot',
    generator: generateOverhandKnot,
    options: { numPoints: 60, scale: 0.8, zScale: 0.25 },
  },
  random: {
    name: 'Random Knot',
    generator: generateRandomKnot,
    options: { numPoints: 150, scale: 0.6 },
    isRandom: true,
  },
  randomLissajous: {
    name: 'Random Lissajous',
    generator: generateRandomLissajousKnot,
    options: { numPoints: 150, scale: 0.6, zScale: 0.4 },
    isRandom: true,
  },
  randomTorus: {
    name: 'Random Torus',
    generator: generateRandomTorusKnot,
    options: { numPoints: 180, scale: 0.5 },
    isRandom: true,
  },
  randomDeformedTorus: {
    name: 'Random Deformed Torus (open)',
    generator: generateRandomDeformedTorusKnot,
    // Keep defaults conservative for physics stability; dataset generation can raise these offline.
    options: { numPoints: 220, scale: 0.55, maxCrossings: 25 },
    isRandom: true,
  },
  gauss: {
    name: 'Gauss Code',
    generator: null, // handled specially in loadKnot()
    options: { scale: 0.9, zScale: 1.0 },
  },
};

// Current equation display
let currentKnotInfo = null;

// ============ State ============

let scene, camera, renderer, controls;
let ropeSystem = null;
let ropeMeshes = [];
let endpointMarkers = [];
let crossingMarkers = [];
let debugGroup = null;
let running = false;
let tightening = false;
let showDebugGrid = true;
let tightenPhase = 0; // ramp 0..1 for stable tightening

// 图一风格的颜色配色（更饱和、更有质感）
const COLORS = [
  { h: 0.55, s: 0.75, l: 0.58 },  // cyan-blue
  { h: 0.08, s: 0.85, l: 0.62 },  // coral-orange
  { h: 0.80, s: 0.65, l: 0.60 },  // purple
  { h: 0.15, s: 0.90, l: 0.55 },  // gold-yellow
  { h: 0.35, s: 0.70, l: 0.52 },  // green
  { h: 0.95, s: 0.75, l: 0.60 },  // pink
];

// 材质质量设置（图一风格）
const MATERIAL_SETTINGS = {
  metalness: 0.08,
  roughness: 0.55,
  envMapIntensity: 0.4,
};

// Tube 几何体质量设置
const TUBE_QUALITY = {
  tubularSegments: 200,  // 更高分辨率
  radialSegments: 12,    // 更圆滑
  radius: 0.035,         // 略粗一点
};

// ============ Init ============

function init() {
  const container = document.getElementById('view');
  
  scene = new THREE.Scene();
  // 图一风格的深色背景
  scene.background = new THREE.Color(0x0f1220);
  
  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 200);
  camera.position.set(0, 4, 6);
  camera.lookAt(0, 0, 0);
  
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  
  // 图一风格的灯光设置（更柔和的环境光 + 更强的方向光）
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(6, 10, 4);
  scene.add(dirLight);
  
  // 添加补光
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
  fillLight.position.set(-4, 2, -3);
  scene.add(fillLight);
  
  // 图一风格的网格
  const grid = new THREE.GridHelper(20, 40, 0x2a335a, 0x1a2040);
  grid.position.y = -1.2;
  scene.add(grid);
  
  debugGroup = new THREE.Group();
  scene.add(debugGroup);
  
  setupUI();
  loadKnot('figure8');
  
  window.addEventListener('resize', onResize);
  animate();
}

function onResize() {
  const container = document.getElementById('view');
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

// ============ UI ============

function setupUI() {
  const select = document.getElementById('knotType');
  const btnReset = document.getElementById('btnReset');
  const btnSimulate = document.getElementById('btnSimulate');
  const btnTighten = document.getElementById('btnTighten');
  const btnDebug = document.getElementById('btnDebug');
  const btnRandom = document.getElementById('btnRandom');
  const btnExport = document.getElementById('btnExport');
  const gaussSection = document.getElementById('gaussCodeSection');
  const gaussInput = document.getElementById('gaussCodeInput');
  const btnLoadGauss = document.getElementById('btnLoadGauss');
  const btnGaussExamples = document.getElementById('btnGaussExamples');
  let gaussExampleIdx = -1;
  
  function updateGaussVisibility() {
    if (!gaussSection) return;
    gaussSection.style.display = (select.value === 'gauss') ? 'block' : 'none';
  }

  select.addEventListener('change', () => {
    updateGaussVisibility();
    loadKnot(select.value);
  });
  
  btnReset.addEventListener('click', () => {
    running = false;
    tightening = false;
    btnSimulate.textContent = 'Simulate';
    btnTighten.textContent = 'Tighten';
    loadKnot(select.value);
  });
  
  btnSimulate.addEventListener('click', () => {
    running = !running;
    btnSimulate.textContent = running ? 'Pause' : 'Simulate';
  });
  
  btnTighten.addEventListener('click', () => {
    tightening = !tightening;
    btnTighten.textContent = tightening ? 'Stop Tighten' : 'Tighten';
    if (tightening && !running) {
      running = true;
      btnSimulate.textContent = 'Pause';
    }
    if (!tightening) {
      tightenPhase = 0;
    }
  });
  
  if (btnDebug) {
    btnDebug.addEventListener('click', () => {
      showDebugGrid = !showDebugGrid;
      debugGroup.visible = showDebugGrid;
      btnDebug.textContent = showDebugGrid ? 'Hide Grid' : 'Show Grid';
    });
  }
  
  // Random knot generation button
  if (btnRandom) {
    btnRandom.addEventListener('click', () => {
      running = false;
      tightening = false;
      btnSimulate.textContent = 'Simulate';
      btnTighten.textContent = 'Tighten';
      
      if (select.value === 'gauss') {
        // Random Gauss knot (v1): keep crossings modest for stability
        const nCross = 3 + Math.floor(Math.random() * 10); // 3..12
        const seed = (Date.now() >>> 0);
        const tokens = rollRandomGaussCode(nCross, seed);
        const code = tokens.map(t => `${t.id}${t.over ? 'o' : 'u'}`).join(' ');
        if (gaussInput) gaussInput.value = code;
        loadKnot('gauss');
      } else {
        // If user selected a random-capable generator, regenerate that one; otherwise default to 'random'
        const chosen = (KNOT_TYPES[select.value] && KNOT_TYPES[select.value].isRandom) ? select.value : 'random';
        loadKnot(chosen);
        // Keep select in sync
        select.value = chosen;
        updateGaussVisibility();
      }
    });
  }

  // Gauss load/examples
  if (btnLoadGauss) {
    btnLoadGauss.addEventListener('click', () => {
      running = false;
      tightening = false;
      btnSimulate.textContent = 'Simulate';
      btnTighten.textContent = 'Tighten';
      select.value = 'gauss';
      updateGaussVisibility();
      loadKnot('gauss');
    });
  }

  if (btnGaussExamples) {
    btnGaussExamples.addEventListener('click', () => {
      const keys = Object.keys(KNOWN_GAUSS_CODES);
      if (keys.length === 0) return;
      gaussExampleIdx = (gaussExampleIdx + 1) % keys.length;
      const key = keys[gaussExampleIdx];
      const code = KNOWN_GAUSS_CODES[key];
      if (gaussInput) gaussInput.value = code;
      select.value = 'gauss';
      updateGaussVisibility();
      loadKnot('gauss');
    });
  }

  // JSON 导出按钮（图一功能）
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      exportKnotJson();
    });
  }

  // Init visibility + default gauss value
  updateGaussVisibility();
  if (gaussInput && !gaussInput.value) gaussInput.value = KNOWN_GAUSS_CODES.trefoil;
}

function getParams() {
  return {
    substeps: parseInt(document.getElementById('substeps')?.value || 16),
    iterations: parseInt(document.getElementById('iters')?.value || 25),
    bendStiffness: parseFloat(document.getElementById('bend')?.value || 50) / 100,
    collisionEnabled: true,
    tightenStrength: parseFloat(document.getElementById('tight')?.value || 50) / 100,
  };
}

// ============ Knot Loading ============

function loadKnot(type) {
  const knotType = KNOT_TYPES[type];
  if (!knotType) {
    console.error('Unknown knot type:', type);
    return;
  }
  
  console.log('=== Generating knot:', type, '===');
  
  // Generate knot
  let knot;
  if (type === 'gauss') {
    const input = document.getElementById('gaussCodeInput');
    const code = (input?.value || KNOWN_GAUSS_CODES.trefoil || '').trim();
    try {
      knot = generateKnotFromGaussCode(code, { ...knotType.options });
    } catch (e) {
      console.error(e);
      // Fallback to trefoil example if input is invalid
      const fallback = KNOWN_GAUSS_CODES.trefoil;
      if (input) input.value = fallback;
      knot = generateKnotFromGaussCode(fallback, { ...knotType.options });
    }
  } else {
    knot = knotType.generator(knotType.options);
  }
  knot = centerKnot(knot);
  
  // Store and display equation info
  currentKnotInfo = knot;
  updateEquationDisplay(knot);
  
  console.log(`Generated: ${knot.leads.length} leads, ${knot.crossings.length} crossings`);
  if (knot.equation) {
    console.log(`Equation: ${knot.equation}`);
    if (knot.params) {
      console.log(`Params:`, knot.params);
    }
  }
  for (let i = 0; i < knot.leads.length; i++) {
    console.log(`  Lead ${i}: ${knot.leads[i].points.length} points`);
  }
  
  // Create physics system
  ropeSystem = createRopeSystem(knot, { particleSpacing: 0.06, radius: 0.03 });
  
  // Update stats
  updateStats(knot.leads.length, knot.crossings.length, ropeSystem.particles.length);
  
  // Build visualizations
  createDebugVisualization(knot);
  buildRopeMeshes();
}

/**
 * Update equation display in UI
 */
function updateEquationDisplay(knot) {
  const eqEl = document.getElementById('equationDisplay');
  if (!eqEl) return;
  
  if (knot.equation && knot.params) {
    let html = '';
    
    // Knot name
    html += `<div class="eq-name">${knot.knotName || knot.equation}</div>`;
    
    if (knot.params.type === 'lissajous') {
      // Lissajous equations
      html += `<div class="eq-section">`;
      html += `<div class="eq-formula">x(t) = sin(${knot.params.nx}t + ${(knot.params.phiX * Math.PI).toFixed(2)})</div>`;
      html += `<div class="eq-formula">y(t) = sin(${knot.params.ny}t + ${(knot.params.phiY * Math.PI).toFixed(2)})</div>`;
      html += `<div class="eq-formula">z(t) = sin(${knot.params.nz}t + ${(knot.params.phiZ * Math.PI).toFixed(2)})</div>`;
      html += `</div>`;
      html += `<div class="eq-params">n = (${knot.params.nx}, ${knot.params.ny}, ${knot.params.nz})</div>`;
    } else if (knot.params.type === 'torus') {
      // Torus knot equations
      const { p, q } = knot.params;
      html += `<div class="eq-section">`;
      html += `<div class="eq-formula">x(t) = (R + r·cos(${q}t))·cos(${p}t)</div>`;
      html += `<div class="eq-formula">y(t) = (R + r·cos(${q}t))·sin(${p}t)</div>`;
      html += `<div class="eq-formula">z(t) = r·sin(${q}t)</div>`;
      html += `</div>`;
      html += `<div class="eq-params">(p, q) = (${p}, ${q})</div>`;
    } else if (knot.params.type === 'gauss') {
      html += `<div class="eq-section">`;
      html += `<div class="eq-formula">Gauss tokens: ${String(knot.params.code || '').slice(0, 120)}${String(knot.params.code || '').length > 120 ? '…' : ''}</div>`;
      html += `</div>`;
      html += `<div class="eq-params">crossings = ${knot.params.numCrossings}</div>`;
    }
    
    eqEl.innerHTML = html;
    eqEl.style.display = 'block';
  } else {
    // For non-parametric knots (fixed patterns)
    eqEl.innerHTML = `<div class="eq-name">${KNOT_TYPES[document.getElementById('knotType')?.value]?.name || 'Fixed Pattern'}</div>
                      <div class="eq-formula" style="color: #888;">手工定义的绳结拓扑</div>`;
    eqEl.style.display = 'block';
  }
}

/**
 * Create rope system from procedurally generated knot
 */
function createRopeSystemFromKnot(knot) {
  const particleSpacing = 0.06;
  const radius = 0.03;
  
  const system = {
    particles: [],
    leadRanges: [],
    distConstraints: [],
    bendConstraints: [],
    crossingConstraints: [],
    radius,
    particleSpacing,
    pins: new Map(),
    initialPullAxis: null,
  };
  
  let particleIdx = 0;
  
  for (let leadIdx = 0; leadIdx < knot.leads.length; leadIdx++) {
    const lead = knot.leads[leadIdx];
    const startIdx = particleIdx;
    
    // Resample points at even spacing
    const sampled = resamplePath(lead.points, particleSpacing);
    
    for (const p of sampled) {
      system.particles.push({
        x: p.x,
        y: p.y,
        z: p.z,
        px: p.x,
        py: p.y,
        pz: p.z,
        invMass: 1.0,
      });
      particleIdx++;
    }
    
    const endIdx = particleIdx - 1;
    const head = system.particles[startIdx];
    const tail = system.particles[endIdx];
    const h1 = system.particles[Math.min(startIdx + 1, endIdx)];
    const t1 = system.particles[Math.max(endIdx - 1, startIdx)];
    
    const hdx = h1.x - head.x;
    const hdy = h1.y - head.y;
    const hlen = Math.sqrt(hdx * hdx + hdy * hdy);
    const pullDirStart = hlen > 1e-6 ? { x: hdx / hlen, y: hdy / hlen } : null;
    
    const tdx = tail.x - t1.x;
    const tdy = tail.y - t1.y;
    const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
    const pullDirEnd = tlen > 1e-6 ? { x: tdx / tlen, y: tdy / tlen } : null;
    
    const rangeInfo = { 
      start: startIdx, 
      end: endIdx, 
      leadIdx, 
      isClosed: lead.isClosed || false,
      pullDirStart,
      pullDirEnd,
    };
    system.leadRanges.push(rangeInfo);
    
    // Distance constraints
    for (let i = startIdx; i < endIdx; i++) {
      const rest = dist3D(system.particles[i], system.particles[i + 1]);
      if (rest > 0.001) {
        system.distConstraints.push({ 
          i, 
          j: i + 1, 
          rest,
          minRest: rest * 0.3,  // Allow shrinking for tightening
        });
      }
    }
    
    // For closed curves, also add constraint between last and first
    if (lead.isClosed && sampled.length >= 3) {
      const rest = dist3D(system.particles[endIdx], system.particles[startIdx]);
      if (rest > 0.001) {
        system.distConstraints.push({ 
          i: endIdx, 
          j: startIdx, 
          rest,
          minRest: rest * 0.3,
        });
      }
    }
    
    // Bend constraints
    for (let i = startIdx; i < endIdx - 1; i++) {
      const rest = dist3D(system.particles[i], system.particles[i + 2]);
      if (rest > 0.001) {
        system.bendConstraints.push({ i, j: i + 2, rest });
      }
    }
    
    // Pin endpoints or anchor points
    if (sampled.length >= 2) {
      if (!lead.isClosed) {
        // Open curve: pin start and end
        pinParticle(system, startIdx, true);
        pinParticle(system, endIdx, true);
      } else {
        // Closed curve: pick two opposite points as anchors for tightening
        const numParticles = endIdx - startIdx + 1;
        const anchor1 = startIdx;
        const anchor2 = startIdx + Math.floor(numParticles / 2);
        
        pinParticle(system, anchor1, true);
        pinParticle(system, anchor2, true);
        
        // Store anchor indices for pullEndpoints
        rangeInfo.anchor1 = anchor1;
        rangeInfo.anchor2 = anchor2;
        
        console.log(`Closed curve: anchors at ${anchor1} and ${anchor2}`);
      }
    }
  }
  
  // Build crossing constraints
  buildCrossingConstraintsFromKnot(system, knot);
  
  // Compute initial pull axis
  computeInitialPullAxis(system);
  
  console.log(`Physics: ${system.particles.length} particles, ${system.crossingConstraints.length} crossing constraints`);
  
  return system;
}

function resamplePath(points, spacing) {
  if (points.length < 2) return points;
  
  // Calculate total length
  const arcLengths = [0];
  for (let i = 1; i < points.length; i++) {
    arcLengths.push(arcLengths[i-1] + dist3D(points[i-1], points[i]));
  }
  const totalLen = arcLengths[arcLengths.length - 1];
  
  if (totalLen < 0.001) return [points[0]];
  
  const numSamples = Math.max(2, Math.ceil(totalLen / spacing) + 1);
  const sampled = [];
  
  for (let i = 0; i < numSamples; i++) {
    const t = i / (numSamples - 1);
    const targetLen = t * totalLen;
    
    let segIdx = 0;
    while (segIdx < arcLengths.length - 1 && arcLengths[segIdx + 1] < targetLen) {
      segIdx++;
    }
    
    const segStart = arcLengths[segIdx];
    const segEnd = arcLengths[segIdx + 1] || segStart;
    const segLen = segEnd - segStart;
    const localT = segLen > 0.001 ? (targetLen - segStart) / segLen : 0;
    
    const p1 = points[segIdx];
    const p2 = points[Math.min(segIdx + 1, points.length - 1)];
    
    sampled.push({
      x: p1.x + (p2.x - p1.x) * localT,
      y: p1.y + (p2.y - p1.y) * localT,
      z: p1.z + (p2.z - p1.z) * localT,
    });
  }
  
  return sampled;
}

function dist3D(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function pinParticle(system, idx, pinned) {
  if (idx < 0 || idx >= system.particles.length) return;
  
  if (pinned) {
    const p = system.particles[idx];
    p.invMass = 0;
    system.pins.set(idx, { x: p.x, y: p.y, z: p.z });
  } else {
    system.particles[idx].invMass = 1.0;
    system.pins.delete(idx);
  }
}

function buildCrossingConstraintsFromKnot(system, knot) {
  const minZDiff = system.radius * 4;  // Increased for better separation
  
  for (const crossing of knot.crossings) {
    // Find closest particles to crossing position
    let overIdx = -1, underIdx = -1;
    let minOverDist = Infinity, minUnderDist = Infinity;
    
    for (const range of system.leadRanges) {
      if (range.leadIdx !== crossing.overLeadIdx && range.leadIdx !== crossing.underLeadIdx) {
        continue;
      }
      
      for (let i = range.start; i <= range.end; i++) {
        const p = system.particles[i];
        const dx = p.x - crossing.x;
        const dy = p.y - crossing.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Check if over or under based on z
        if (p.z > 0 && dist < minOverDist) {
          minOverDist = dist;
          overIdx = i;
        }
        if (p.z < 0 && dist < minUnderDist) {
          minUnderDist = dist;
          underIdx = i;
        }
      }
    }
    
    if (overIdx >= 0 && underIdx >= 0 && overIdx !== underIdx) {
      // Mark particles as crossing points (for extra friction)
      system.particles[overIdx].isCrossing = true;
      system.particles[underIdx].isCrossing = true;
      
      // Also mark neighbors for friction zone
      for (let offset = -2; offset <= 2; offset++) {
        const oi = overIdx + offset;
        const ui = underIdx + offset;
        if (oi >= 0 && oi < system.particles.length) {
          system.particles[oi].nearCrossing = true;
        }
        if (ui >= 0 && ui < system.particles.length) {
          system.particles[ui].nearCrossing = true;
        }
      }
      
      system.crossingConstraints.push({
        overIdx,
        underIdx,
        minZDiff,
      });
      console.log(`Crossing constraint: over=${overIdx} under=${underIdx}`);
    }
  }
}

function computeInitialPullAxis(system) {
  let totalDx = 0, totalDy = 0;
  
  for (const range of system.leadRanges) {
    const head = system.particles[range.start];
    const tail = system.particles[range.end];
    totalDx += tail.x - head.x;
    totalDy += tail.y - head.y;
  }
  
  const len = Math.sqrt(totalDx * totalDx + totalDy * totalDy);
  if (len > 0.01) {
    system.initialPullAxis = { x: totalDx / len, y: totalDy / len };
  } else {
    system.initialPullAxis = { x: 1, y: 0 };
  }
}

function updateStats(leads, crossings, particles) {
  const el = document.getElementById('stats');
  if (el) {
    el.innerHTML = `
      <div>Leads: <span class="val">${leads}</span></div>
      <div>Crossings: <span class="val">${crossings}</span></div>
      <div>Particles: <span class="val">${particles}</span></div>
    `;
  }
}

// ============ Debug Visualization ============

function createDebugVisualization(knot) {
  while (debugGroup.children.length > 0) {
    const child = debugGroup.children[0];
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
    debugGroup.remove(child);
  }
  
  // Draw original knot curves
  for (let i = 0; i < knot.leads.length; i++) {
    const lead = knot.leads[i];
    const color = COLORS[i % COLORS.length];
    
    const linePoints = lead.points.map(p => physToThree(p));
    
    if (linePoints.length >= 2) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
      const lineMat = new THREE.LineBasicMaterial({ 
        color, 
        transparent: true,
        opacity: 0.3,
      });
      debugGroup.add(new THREE.Line(lineGeo, lineMat));
    }
  }
  
  // Crossing markers
  for (const c of knot.crossings) {
    const pos = physToThree({ x: c.x, y: c.y, z: 0 });
    
    const markerGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.copy(pos);
    debugGroup.add(marker);
  }
  
  debugGroup.visible = showDebugGrid;
}

// ============ Rope Mesh Building ============

function buildRopeMeshes() {
  for (const mesh of ropeMeshes) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  }
  for (const marker of endpointMarkers) {
    scene.remove(marker);
    marker.geometry.dispose();
    if (marker.material) marker.material.dispose();
  }
  for (const marker of crossingMarkers) {
    scene.remove(marker);
    marker.geometry.dispose();
    if (marker.material) marker.material.dispose();
  }
  ropeMeshes = [];
  endpointMarkers = [];
  crossingMarkers = [];
  
  if (!ropeSystem) return;
  
  for (let i = 0; i < ropeSystem.leadRanges.length; i++) {
    const range = ropeSystem.leadRanges[i];
    const colorConfig = COLORS[i % COLORS.length];
    
    const mesh = createRopeMesh(range.start, range.end, colorConfig, i);
    ropeMeshes.push(mesh);
    scene.add(mesh);
    
    // Endpoint markers（金色端点）
    const markerGeo = new THREE.SphereGeometry(0.055, 16, 16);
    const markerMat = new THREE.MeshStandardMaterial({ 
      color: 0xffd700, 
      emissive: 0x886600,
      metalness: 0.3,
      roughness: 0.4,
    });
    
    const headMarker = new THREE.Mesh(markerGeo, markerMat);
    const tailMarker = new THREE.Mesh(markerGeo, markerMat.clone());
    
    headMarker.position.copy(physToThree(ropeSystem.particles[range.start]));
    tailMarker.position.copy(physToThree(ropeSystem.particles[range.end]));
    
    scene.add(headMarker);
    scene.add(tailMarker);
    endpointMarkers.push(headMarker, tailMarker);
  }
}

function createRopeMesh(startIdx, endIdx, colorConfig, colorIndex = 0) {
  const points = [];
  
  for (let i = startIdx; i <= endIdx; i++) {
    points.push(physToThree(ropeSystem.particles[i]));
  }
  
  if (points.length < 2) {
    return new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01));
  }
  
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.3);
  
  // 使用图一风格的高质量 TubeGeometry
  const tubularSegments = Math.max(TUBE_QUALITY.tubularSegments, points.length * 4);
  const geometry = new THREE.TubeGeometry(
    curve, 
    tubularSegments, 
    TUBE_QUALITY.radius, 
    TUBE_QUALITY.radialSegments, 
    false
  );
  
  // 图一风格的材质（HSL 颜色，更好的光照响应）
  const color = new THREE.Color().setHSL(
    colorConfig.h, 
    colorConfig.s, 
    colorConfig.l
  );
  
  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: MATERIAL_SETTINGS.metalness,
    roughness: MATERIAL_SETTINGS.roughness,
    envMapIntensity: MATERIAL_SETTINGS.envMapIntensity,
  });
  
  return new THREE.Mesh(geometry, material);
}

function updateRopeMeshes() {
  if (!ropeSystem) return;
  
  for (let i = 0; i < ropeSystem.leadRanges.length; i++) {
    const range = ropeSystem.leadRanges[i];
    const mesh = ropeMeshes[i];
    if (!mesh) continue;
    
    const points = [];
    for (let j = range.start; j <= range.end; j++) {
      points.push(physToThree(ropeSystem.particles[j]));
    }
    
    if (points.length < 2) continue;
    
    mesh.geometry.dispose();
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.3);
    // 使用图一风格的高质量参数
    const tubularSegments = Math.max(TUBE_QUALITY.tubularSegments, points.length * 4);
    mesh.geometry = new THREE.TubeGeometry(
      curve, 
      tubularSegments, 
      TUBE_QUALITY.radius, 
      TUBE_QUALITY.radialSegments, 
      false
    );
    
    const headMarker = endpointMarkers[i * 2];
    const tailMarker = endpointMarkers[i * 2 + 1];
    
    if (headMarker && tailMarker) {
      headMarker.position.copy(physToThree(ropeSystem.particles[range.start]));
      tailMarker.position.copy(physToThree(ropeSystem.particles[range.end]));
    }
  }
}

// ============ Animation Loop ============

let lastTime = 0;
let frameCount = 0;
let fpsTime = 0;

function animate(time = 0) {
  requestAnimationFrame(animate);
  
  const dt = Math.min(0.033, (time - lastTime) / 1000);
  lastTime = time;
  
  frameCount++;
  if (time - fpsTime > 1000) {
    const fps = Math.round(frameCount * 1000 / (time - fpsTime));
    const fpsEl = document.getElementById('fps');
    if (fpsEl) fpsEl.textContent = `FPS: ${fps}`;
    frameCount = 0;
    fpsTime = time;
  }
  
  const statusEl = document.getElementById('physicsStatus');
  if (statusEl) {
    if (tightening) {
      statusEl.textContent = 'Tightening';
      statusEl.className = 'status-tightening';
    } else if (running) {
      statusEl.textContent = 'Running';
      statusEl.className = 'status-running';
    } else {
      statusEl.textContent = 'Paused';
      statusEl.className = '';
    }
  }
  
  if (running && ropeSystem) {
    const params = getParams();
    
    stepPhysics(ropeSystem, dt, {
      substeps: params.substeps,
      iterations: params.iterations,
      bendStiffness: params.bendStiffness,
      collisionEnabled: params.collisionEnabled,
      damping: 0.08,  // Higher damping for stability
      segmentCollisionEnabled: true,
      segmentCollisionStride: 3,
      segmentSegmentCollisionEnabled: true,
      // Slight compliance improves stability under strong tightening + contacts
      distCompliance: 1e-6,
    });
    
    if (tightening) {
      // Ramp tightening strength to avoid explosive impulses
      tightenPhase = Math.min(1, tightenPhase + dt * 0.8);
      const ramp = tightenPhase * tightenPhase; // smoother start
      pullEndpoints(ropeSystem, params.tightenStrength * ramp);
    } else {
      tightenPhase = 0;
    }
    
    updateRopeMeshes();
  }
  
  controls.update();
  renderer.render(scene, camera);
}

// ============ JSON Export (图一功能) ============

/**
 * 收集当前绳结的中心线点集
 */
function collectCenterlinePoints() {
  if (!ropeSystem) return [];
  
  const centerlines = [];
  for (let i = 0; i < ropeSystem.leadRanges.length; i++) {
    const range = ropeSystem.leadRanges[i];
    const points = [];
    for (let j = range.start; j <= range.end; j++) {
      const p = ropeSystem.particles[j];
      // 使用物理坐标系 (x, y, z)
      points.push([p.x, p.y, p.z]);
    }
    centerlines.push({
      component: i,
      closed: range.isClosed || false,
      points,
    });
  }
  return centerlines;
}

/**
 * 收集当前绳结的完整数据用于导出
 */
function collectKnotData() {
  if (!ropeSystem || !currentKnotInfo) {
    return null;
  }
  
  const centerlines = collectCenterlinePoints();
  const knotType = document.getElementById('knotType')?.value || 'unknown';
  const timestamp = new Date().toISOString();
  
  // 计算端点
  const endpoints = [];
  for (let i = 0; i < ropeSystem.leadRanges.length; i++) {
    const range = ropeSystem.leadRanges[i];
    const head = ropeSystem.particles[range.start];
    const tail = ropeSystem.particles[range.end];
    endpoints.push({
      lead: i,
      head: [head.x, head.y, head.z],
      tail: [tail.x, tail.y, tail.z],
    });
  }
  
  // 构建导出数据（兼容图一的 JSON schema）
  const data = {
    version: 2,
    createdAt: timestamp,
    generator: 'tie_knot_simulator',
    knotType,
    knotName: currentKnotInfo.knotName || KNOT_TYPES[knotType]?.name || knotType,
    
    // 参数方程信息（如果有）
    equation: currentKnotInfo.equation || null,
    params: currentKnotInfo.params || null,
    
    // 几何数据
    observations: {
      centerlines,
      crossings: currentKnotInfo.crossings || [],
    },
    
    // 物理系统状态
    physics: {
      particleCount: ropeSystem.particles.length,
      leadCount: ropeSystem.leadRanges.length,
      crossingConstraints: ropeSystem.crossingConstraints?.length || 0,
      tubeRadius: TUBE_QUALITY.radius,
    },
    
    // 端点信息
    topology: {
      type: centerlines.some(c => c.closed) ? 'closed' : 'open',
      endpoints,
    },
    
    // 标签（用于 benchmark）
    labels: {
      topology: centerlines.some(c => c.closed) ? 'closed' : 'open',
      num_leads: ropeSystem.leadRanges.length,
      num_crossings: currentKnotInfo.crossings?.length || 0,
      knot_type: knotType,
      knot_family: currentKnotInfo.params?.type || 'manual',
    },
    
    // 物理参数快照
    physicsParams: getParams(),
  };
  
  // 添加 Gauss code 信息（如果有）
  if (currentKnotInfo.params?.type === 'gauss') {
    data.labels.gauss_code = currentKnotInfo.params.code || '';
    data.labels.gauss_crossings = currentKnotInfo.params.numCrossings || 0;
  }
  
  return data;
}

/**
 * 下载 JSON 文件
 */
function downloadJson(obj, filename) {
  const text = JSON.stringify(obj, null, 2);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * 导出当前绳结为 JSON
 */
function exportKnotJson() {
  const data = collectKnotData();
  if (!data) {
    console.warn('No knot data to export');
    return;
  }
  
  const knotType = data.knotType || 'knot';
  const timestamp = Date.now();
  const filename = `${knotType}_${timestamp}.json`;
  
  downloadJson(data, filename);
  console.log(`Exported: ${filename}`);
}

// ============ Start ============

init();
