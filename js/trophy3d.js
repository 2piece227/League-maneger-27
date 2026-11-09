// 메인 타이틀 3D 트로피 (three.js). WebGL이나 CDN을 못 쓰면 SVG 트로피가 그대로 남는다.
import * as THREE from 'three';

const wrap = document.querySelector('.trophy-wrap');
const canvas = document.getElementById('trophy-3d');
const titleScreen = document.getElementById('screen-title');

const v = (x, y) => new THREE.Vector2(x, y);
// 6각 단면(각진 면)으로 깎은 회전체
const hex = pts => new THREE.LatheGeometry(pts, 6);
const TAU = Math.PI * 2;

// 정면 문장: 파란 법랑 방패
function emblemTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 320;
  const g = c.getContext('2d');
  const shield = () => {
    g.beginPath();
    g.moveTo(22, 22); g.lineTo(234, 22); g.lineTo(234, 150); g.lineTo(128, 298); g.lineTo(22, 150); g.closePath();
  };
  const grad = g.createLinearGradient(0, 0, 256, 320);
  grad.addColorStop(0, '#2d6bff'); grad.addColorStop(0.55, '#123fb8'); grad.addColorStop(1, '#0a2470');
  shield(); g.fillStyle = grad; g.fill();
  g.lineWidth = 16; g.strokeStyle = '#eef1f6'; g.stroke();
  // 후드를 쓴 인물 실루엣
  g.fillStyle = 'rgba(235,240,255,.92)';
  g.beginPath(); g.moveTo(128, 70); g.lineTo(78, 236); g.lineTo(128, 205); g.lineTo(178, 236); g.closePath(); g.fill();
  g.fillStyle = '#123fb8';
  g.beginPath(); g.arc(128, 118, 20, 0, TAU); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function build() {
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xf5f7fa, metalness: 1, roughness: 0.04, flatShading: true, side: THREE.DoubleSide });
  const lacquer = new THREE.MeshPhysicalMaterial({ color: 0x0d0f14, metalness: 0.3, roughness: 0.25, clearcoat: 1, flatShading: true });
  const gem = new THREE.MeshPhysicalMaterial({ color: 0x1e4bd2, metalness: 0, roughness: 0.04, clearcoat: 1, flatShading: true });
  const enamel = new THREE.MeshPhysicalMaterial({ map: emblemTexture(), transparent: true, alphaTest: 0.5, metalness: 0, roughness: 0.12, clearcoat: 1, side: THREE.DoubleSide });

  const cup = new THREE.Group();
  const hexCyl = (r1, r2, h, y, m) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 6).translate(0, y, 0), m);

  // 받침: 6각 2단 + 검은 테
  cup.add(hexCyl(1.08, 1.2, 0.42, 0.21, chrome));
  cup.add(hexCyl(0.98, 1.02, 0.08, 0.46, chrome));
  cup.add(hexCyl(0.93, 0.93, 0.03, 0.515, lacquer));

  // 기둥: 아래가 넓고 위로 좁아지는 6각 기둥 + 모서리의 검은 홈
  cup.add(new THREE.Mesh(hex([v(0.9, 0.53), v(0.72, 0.75), v(0.55, 1.05), v(0.42, 1.35), v(0.36, 1.58)]), chrome));
  for (let k = 0; k < 6; k++) {
    const a = k * TAU / 6;
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.02, 0.02), lacquer);
    groove.position.set(Math.sin(a) * 0.6, 1.05, Math.cos(a) * 0.6);
    groove.rotation.order = 'YXZ';
    groove.rotation.y = a;
    groove.rotation.x = -Math.atan2(0.54, 1.05);
    cup.add(groove);
  }

  // 칼라: 6각 고리 + 모서리마다 파란 보석
  cup.add(hexCyl(0.46, 0.4, 0.16, 1.62, chrome));
  for (let k = 0; k < 6; k++) {
    const a = k * TAU / 6;
    const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), gem);
    g.scale.set(1, 1.35, 1);
    g.position.set(Math.sin(a) * 0.48, 1.62, Math.cos(a) * 0.48);
    cup.add(g);
  }

  // 컵 몸통 (각진 6면)
  cup.add(new THREE.Mesh(hex([
    v(0.38, 1.68), v(0.68, 1.95), v(0.92, 2.4), v(1.06, 2.9), v(1.1, 3.15), v(0.95, 3.15), v(0.85, 3.05), v(0, 3.02),
  ]), chrome));
  const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), chrome);
  finial.position.y = 3.25;
  cup.add(finial);

  // 문장 3개 (번갈아 가는 면)
  for (let k = 0; k < 3; k++) {
    const a = TAU / 12 + k * TAU / 3;
    const e = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.9), enamel);
    e.rotation.order = 'YXZ';
    e.rotation.y = a;
    e.rotation.x = 0.28;
    e.position.set(Math.sin(a) * 0.9, 2.64, Math.cos(a) * 0.9);
    cup.add(e);
  }

  // 발톱처럼 솟은 6개의 납작한 날 (긴 날·짧은 날 교대)
  const tall = [[0.44, 1.66], [0.82, 1.9], [1.14, 2.35], [1.34, 2.9], [1.44, 3.45], [1.46, 3.95]];
  const short = [[0.44, 1.66], [0.77, 1.88], [1.06, 2.3], [1.24, 2.8], [1.32, 3.25], [1.32, 3.6]];
  const blade = new THREE.Shape();
  blade.moveTo(-0.035, -0.1); blade.lineTo(0.035, -0.1); blade.lineTo(0.035, 0.1); blade.lineTo(-0.035, 0.1); blade.closePath();
  for (let k = 0; k < 6; k++) {
    const a = k * TAU / 6;
    const pts = (k % 2 ? short : tall).map(([r, y]) => new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r));
    const geo = new THREE.ExtrudeGeometry(blade, { steps: 90, bevelEnabled: false, extrudePath: new THREE.CatmullRomCurve3(pts) });
    cup.add(new THREE.Mesh(geo, chrome));
  }

  return cup;
}

function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  // 반사용 스튜디오 환경: 위가 밝고 아래가 어두운 돔 + 소프트박스
  const env = new THREE.Scene();
  const dome = new THREE.SphereGeometry(30, 32, 16);
  const col = [];
  const pos = dome.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 30;
    const c = new THREE.Color(0x262c3c).lerp(new THREE.Color(0xd4dbe8), Math.min(1, Math.max(0, t * 1.2 + 0.45)) ** 1.5);
    col.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  env.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const box = (w, h, x, y, z, k, color = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  box(4, 10, -7, 2, 9, 5);
  box(3, 9, 8, 1, 8, 3.5);
  box(14, 2, 0, 12, 6, 3, 0xfff0d0);
  box(1, 14, -2.5, 2, 12, 10);
  box(6, 10, -8, 0, -9, 2.5, 0xf0c26a);
  scene.environment = pmrem.fromScene(env, 0.02).texture;
  scene.environmentIntensity = 1.3;

  const key = new THREE.SpotLight(0xfff1d6, 60, 30, Math.PI / 6, 0.5);
  key.position.set(3, 8, 6);
  scene.add(key);
  const rim = new THREE.PointLight(0xf0c26a, 25, 20);
  rim.position.set(-4, 3, -3);
  scene.add(rim);

  const cup = build();
  scene.add(cup);

  const camera = new THREE.PerspectiveCamera(28, 300 / 420, 0.1, 100);
  camera.position.set(0, 2.6, 10.2);
  camera.lookAt(0, 2.0, 0);

  function resize() {
    const w = wrap.clientWidth, h = Math.round(w * 420 / 300);
    if (!w || w > 2000) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(wrap);
  resize();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    if (!titleScreen.classList.contains('active')) return;
    cup.rotation.y += dt * 0.45;
    renderer.render(scene, camera);
  });

  wrap.classList.add('three-ready');
  resize();
}

try {
  init();
} catch (e) {
  console.info('[trophy3d] WebGL 사용 불가 → SVG 트로피 사용', e);
}
