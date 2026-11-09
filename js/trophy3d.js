// 메인 타이틀 3D 트로피 (three.js). WebGL이나 CDN을 못 쓰면 SVG 트로피가 그대로 남는다.
import * as THREE from 'three';

const wrap = document.querySelector('.trophy-wrap');
const canvas = document.getElementById('trophy-3d');
const titleScreen = document.getElementById('screen-title');

const v = (x, y) => new THREE.Vector2(x, y);
const lathe = (pts, seg = 160) => new THREE.LatheGeometry(pts, seg);

// 띠에 새겨진 문양 텍스처
function engraveTexture() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c9ced8';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#3a3f4a';
  g.lineWidth = 5;
  const w = 64;
  for (let x = 0; x < c.width; x += w) {
    g.beginPath();
    g.moveTo(x, 64); g.lineTo(x + w / 2, 10); g.lineTo(x + w, 64); g.lineTo(x + w / 2, 118); g.closePath();
    g.stroke();
    g.fillStyle = '#3a3f4a';
    g.beginPath(); g.arc(x + w / 2, 64, 7, 0, Math.PI * 2); g.fill();
  }
  g.fillRect(0, 0, c.width, 6);
  g.fillRect(0, c.height - 6, c.width, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function build() {
  const silver = new THREE.MeshPhysicalMaterial({ color: 0xe8ebf0, metalness: 1, roughness: 0.24, clearcoat: 0.4, clearcoatRoughness: 0.1, side: THREE.DoubleSide });
  const inner = new THREE.MeshPhysicalMaterial({ color: 0xaab0bb, metalness: 1, roughness: 0.3, side: THREE.DoubleSide });
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xd8b25a, metalness: 1, roughness: 0.22 });
  const lacquer = new THREE.MeshPhysicalMaterial({ color: 0x0d0f14, metalness: 0.2, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
  const band = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: engraveTexture(), metalness: 1, roughness: 0.28, side: THREE.DoubleSide });

  const cup = new THREE.Group();

  // 볼 바깥면 → 입술 → 안쪽면
  cup.add(new THREE.Mesh(lathe([
    v(0, 1.97), v(0.2, 2.0), v(0.5, 2.12), v(0.85, 2.35), v(1.1, 2.65), v(1.25, 2.95),
    v(1.32, 3.25), v(1.345, 3.45), v(1.35, 3.5),
  ]), silver));
  cup.add(new THREE.Mesh(lathe([
    v(1.35, 3.5), v(1.3, 3.5), v(1.285, 3.35), v(1.2, 3.0), v(1.03, 2.7), v(0.72, 2.45), v(0.32, 2.3), v(0, 2.27),
  ]), inner));
  cup.add(new THREE.Mesh(new THREE.TorusGeometry(1.33, 0.035, 24, 200).rotateX(Math.PI / 2).translate(0, 3.5, 0), silver));

  // 문양 띠 + 금색 테
  cup.add(new THREE.Mesh(lathe([v(1.262, 2.93), v(1.29, 3.05), v(1.315, 3.17), v(1.333, 3.27)]), band));
  cup.add(new THREE.Mesh(new THREE.TorusGeometry(1.262, 0.022, 16, 200).rotateX(Math.PI / 2).translate(0, 2.93, 0), gold));
  cup.add(new THREE.Mesh(new THREE.TorusGeometry(1.333, 0.022, 16, 200).rotateX(Math.PI / 2).translate(0, 3.27, 0), gold));

  // 목 · 손잡이 마디 · 줄기
  cup.add(new THREE.Mesh(lathe([
    v(0.62, 0.5), v(0.56, 0.54), v(0.38, 0.66), v(0.22, 0.9), v(0.15, 1.2), v(0.15, 1.42),
    v(0.28, 1.47), v(0.31, 1.55), v(0.28, 1.63), v(0.16, 1.7), v(0.16, 1.85), v(0.22, 2.0),
  ]), silver));
  cup.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 16, 120).rotateX(Math.PI / 2).translate(0, 1.55, 0), gold));

  // 받침대
  const cyl = (r1, r2, h, y, m) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 160).translate(0, y, 0), m);
  cup.add(cyl(0.66, 0.74, 0.1, 0.45, silver));
  cup.add(cyl(0.86, 0.9, 0.3, 0.25, lacquer));
  cup.add(new THREE.Mesh(new THREE.TorusGeometry(0.885, 0.012, 12, 200).rotateX(Math.PI / 2).translate(0, 0.3, 0), gold));
  cup.add(cyl(0.98, 1.0, 0.1, 0.05, silver));

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
    const c = new THREE.Color(0x1a2238).lerp(new THREE.Color(0x8d97ad), Math.max(0, t * 0.5 + 0.5) ** 1.6);
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
  camera.position.set(0, 2.3, 9.2);
  camera.lookAt(0, 1.78, 0);

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
