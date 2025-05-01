// js/index.js

// —— Variables globales ——
let scene, camera, renderer, controls;
let brickTexture, grassTexture;
let paredes = [], ancho = 0, alto = 0;
let inicio = [0,0], fin = [0,0];
let fbxModel, mixer;

const clock = new THREE.Clock();

// Cola de movimiento
let movementQueue = [];
let movementTarget = null;
let movementDir    = null;
const movementSpeed = 2; // unidades/segundo

// —— Inicialización ——
function init() {
  // Escena
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);

  // Cámara
  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.set(5,10,15);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // OrbitControls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 5;
  controls.maxDistance = 50;
  controls.maxPolarAngle = Math.PI * 0.9;

  // Luces
  addLightsIfNeeded();

  // Texturas
  const tl = new THREE.TextureLoader();
  brickTexture = tl.load('https://images.unsplash.com/photo-1495578942200-c5f5d2137def?fm=jpg&q=60&w=3000');
  brickTexture.wrapS = brickTexture.wrapT = THREE.RepeatWrapping;
  brickTexture.repeat.set(1,1);

  grassTexture = tl.load('https://thumbs.dreamstime.com/b/la-imagen-del-detalle-de-superficie-textura-piso-ladrillo-para-el-fondo-102993035.jpg');
  grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;

  // Eventos
  window.addEventListener('resize', onWindowResize);
  document.getElementById('jsonInput'   ).addEventListener('change', handleFileUpload);
  document.getElementById('createButton').addEventListener('click', crearLaberinto);
  document.getElementById('runButton'   ).addEventListener('click', runSearch);
  document.getElementById('resetButton' ).addEventListener('click', resetMovement);

  animate();
}

// —— Render loop ——
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  
  // Actualizar animaciones
  if (mixer) {
    mixer.update(delta);
    
    // Debug: Mostrar estado de la animación
    if (fbxModel?.userData?.walkAction) {
      const action = fbxModel.userData.walkAction;
      console.log(`Animación: ${action.paused ? 'Pausada' : 'Reproduciendo'}, Tiempo: ${action.time.toFixed(2)}`);
    }
  }
  
  // Actualizar movimiento
  updateMovement(delta);
  
  // Actualizar controles de cámara
  controls.update();
  
  renderer.render(scene, camera);
}

// —— Ventana redimensionada ——
function onWindowResize() {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// —— Crear laberinto ——
function crearLaberinto() {
  // Ocultar modal y mostrar controles
  document.getElementById('modal'   ).style.display = 'none';
  document.getElementById('controls').style.display = 'block';

  // Limpiar escena (menos luces y cámara)
  scene.children
    .filter(o => !o.isLight && o.type!=='Camera')
    .forEach(o => scene.remove(o));

  // Suelo
  grassTexture.repeat.set(ancho, alto);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ancho, alto),
    new THREE.MeshStandardMaterial({ map: grassTexture, side: THREE.DoubleSide })
  );
  floor.rotation.x = -Math.PI/2;
  scene.add(floor);

  // Paredes
  const wallGeo = new THREE.BoxGeometry(1,2,1);
  const wallMat = new THREE.MeshStandardMaterial({ map: brickTexture, color:0xaaaaaa });
  paredes.forEach(([x,y]) => {
    const w = new THREE.Mesh(wallGeo, wallMat);
    w.position.set(
      x - Math.floor(ancho/2) + 0.5,
      1,
      y - Math.floor(alto /2) + 0.5
    );
    scene.add(w);
  });

  // Carga y posiciona el modelo
  const [sx,sy] = inicio;
  agregarGLB(sx - Math.floor(ancho/2)+0.5, sy - Math.floor(alto/2)+0.5);

  // Cámara adaptativa
  const m = Math.max(ancho,alto);
  camera.position.set(m*1.8, m*1.5, m*1.8);
  controls.target.set(0,0,0);
  controls.update();
}

// —— Luces ——
function addLightsIfNeeded() {
  if (!scene.children.some(o=>o.isLight)) {
    const d1 = new THREE.DirectionalLight(0xffffff,1);
    d1.position.set(10,20,10);
    scene.add(d1);
    scene.add(new THREE.AmbientLight(0x404040));
    const d2 = new THREE.DirectionalLight(0xffffff,0.5);
    d2.position.set(-10,10,-10);
    scene.add(d2);
  }
}

// —— Carga GLB ——
function agregarGLB(x, z) {
  new THREE.GLTFLoader().load(
    '/models/characters/shrek_walk_cycle.glb',
    gltf => {
      fbxModel = gltf.scene;
      const s = Math.min(ancho, alto) * 0.12;
      fbxModel.scale.set(s, s, s);
      fbxModel.position.set(x, s * 0.015, z);
      
      // Configuración de sombras
      fbxModel.traverse(n => {
        if (n.isMesh) {
          n.castShadow = true;
          n.receiveShadow = true;
        }
      });
      
      scene.add(fbxModel);
      
      // Configuración específica para animación Mixamo
      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(fbxModel);
        
        // Identificar y usar específicamente la animación mixamo.com
        const mixamoAnimation = gltf.animations.find(a => a.name.includes('mixamo.com'));
        if (!mixamoAnimation) {
          console.error('No se encontró la animación mixamo.com');
          return;
        }
        
        // Configurar la acción de caminar
        const walkAction = mixer.clipAction(mixamoAnimation);
        walkAction.clampWhenFinished = false;
        walkAction.loop = THREE.LoopRepeat;
        
        // Almacenar referencia
        fbxModel.userData.walkAction = walkAction;
        
        // Iniciar pausada
        walkAction.play();
        walkAction.paused = true;
        
        console.log('Animación mixamo.com cargada correctamente');
      }
      
    },
    undefined,
    error => console.error('Error cargando modelo:', error)
  );
}
// —— Leer JSON de laberinto ——
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const rdr = new FileReader();
  rdr.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result);
      const { ancho: a, alto: h, inicio: ini, fin: f, paredes: murs } = d;

      // ← Validación: inicio/fin no pueden caer en pared
      const isEnPared = pos => murs.some(p => p[0] === pos[0] && p[1] === pos[1]);
      if (isEnPared(ini) || isEnPared(f)) {
        alert('Error: la posición de inicio o fin está en una pared.');
        return;
      }

      // asignar valores globales sólo si pasa la validación
      ancho   = a;
      alto    = h;
      paredes = murs;
      inicio  = ini;
      fin     = f;

      document.getElementById('createButton').style.display = 'inline-block';
    } catch {
      alert('JSON inválido');
    }
  };
  rdr.readAsText(file);
}

// —— Algoritmos de búsqueda ——
const key = ([x,y]) => `${x},${y}`;
function getNeighbors([x,y]) {
  return [[1,0],[-1,0],[0,1],[0,-1]]
    .map(([dx,dy]) => [x+dx,y+dy])
    .filter(([nx,ny]) =>
      nx>=0 && nx<ancho && ny>=0 && ny<alto &&
      !paredes.some(p=>p[0]===nx&&p[1]===ny)
    );
}

function bfs(start, goal) {
  const q = [start], seen = new Set([key(start)]), parent = {};
  while(q.length){
    const u = q.shift();
    if(key(u)===key(goal)) break;
    for(const v of getNeighbors(u)){
      const kv = key(v);
      if(!seen.has(kv)){
        seen.add(kv);
        parent[kv]=u;
        q.push(v);
      }
    }
  }
  const path=[], kg=key(goal);
  let cur=kg;
  while(cur){
    path.push(cur.split(',').map(Number));
    cur = parent[cur]? key(parent[cur]): null;
  }
  return path.reverse();
}

function dijkstra(start, goal){
  class PQ{constructor(){this.A=[]}
    enqueue(n,p){this.A.push({n,p});this.A.sort((a,b)=>a.p-b.p)}
    dequeue(){return this.A.shift().n}
    isEmpty(){return this.A.length===0}
  }
  const dist={}, parent={}, pq=new PQ();
  dist[key(start)]=0; pq.enqueue(start,0);
  while(!pq.isEmpty()){
    const u = pq.dequeue(), ku=key(u);
    if(ku===key(goal)) break;
    for(const v of getNeighbors(u)){
      const kv=key(v), alt=dist[ku]+1;
      if(alt < (dist[kv] ?? Infinity)){
        dist[kv]=alt; parent[kv]=u;
        pq.enqueue(v,alt);
      }
    }
  }
  const path=[], kg=key(goal);
  let cur2=kg;
  while(cur2){
    path.push(cur2.split(',').map(Number));
    cur2 = parent[cur2]? cur2=key(parent[cur2]): null;
  }
  return path.reverse();
}

function heuristic([x1,y1],[x2,y2]){
  return Math.abs(x1-x2)+Math.abs(y1-y2);
}

function astar(start, goal){
  class PQ2{constructor(){this.A=[]}
    enqueue(n,p){this.A.push({n,p});this.A.sort((a,b)=>a.p-b.p)}
    dequeue(){return this.A.shift().n}
    isEmpty(){return this.A.length===0}
  }
  const g={}, f={}, parent={}, open=new PQ2();
  const ks=key(start), kg=key(goal);
  g[ks]=0; f[ks]=heuristic(start,goal); open.enqueue(start,f[ks]);
  while(!open.isEmpty()){
    const u=open.dequeue(), ku=key(u);
    if(ku===kg) break;
    for(const v of getNeighbors(u)){
      const kv=key(v), tg=g[ku]+1;
      if(tg < (g[kv] ?? Infinity)){
        parent[kv]=u; g[kv]=tg; f[kv]=tg+heuristic(v,goal);
        open.enqueue(v,f[kv]);
      }
    }
  }
  const path=[]; let cur3=kg;
  while(cur3){
    path.push(cur3.split(',').map(Number));
    cur3 = parent[cur3]? key(parent[cur3]): null;
  }
  return path.reverse();
}

// —— Lógica para lanzar la búsqueda y mover el muñeco ——
function runSearch(){
  let path = bfs(inicio, fin);
  const algo = document.getElementById('algoSelect').value;
  if(algo==='dijkstra') path = dijkstra(inicio, fin);
  if(algo==='astar')    path = astar(inicio, fin);
  startMovement(path);
}

function gridToWorld([i,j]){
  // mismo cálculo que para paredes/modelo
  const x = i - Math.floor(ancho/2) + 0.5;
  const z = j - Math.floor(alto /2) + 0.5;
  return new THREE.Vector3(x, fbxModel.position.y, z);
}

function startMovement(path){
  if (!fbxModel || !path.length) return;
  
  movementQueue = path.map(gridToWorld);
  movementTarget = null;
  
  // Activar animación mixamo de caminar
  if (fbxModel.userData.walkAction) {
    fbxModel.userData.walkAction.paused = false;
    fbxModel.userData.walkAction.setEffectiveTimeScale(1.5); // Velocidad normal
    console.log('Animación de caminar iniciada');
  }
}

function resetMovement(){
  movementQueue = [];
  movementTarget = null;
  
  const [ix, iy] = inicio;
  const pos = gridToWorld([ix, iy]);
  fbxModel.position.copy(pos);
  fbxModel.rotation.set(0, 0, 0);
  
  // Pausar animación al resetear
  if (fbxModel.userData.walkAction) {
    fbxModel.userData.walkAction.paused = true;
  }
}

function updateMovement(delta){
  if (!fbxModel) return;

  // Actualizar movimiento si hay objetivos
  if (movementTarget || movementQueue.length > 0) {
    if (!movementTarget && movementQueue.length > 0) {
      movementTarget = movementQueue.shift();
      const lookAtPos = movementTarget.clone();
      lookAtPos.y = fbxModel.position.y;
      fbxModel.lookAt(lookAtPos);
    }

    if (movementTarget) {
      const step = movementSpeed * delta;
      const direction = movementTarget.clone().sub(fbxModel.position).normalize();
      const distance = fbxModel.position.distanceTo(movementTarget);

      if (step >= distance) {
        fbxModel.position.copy(movementTarget);
        movementTarget = null;
      } else {
        fbxModel.position.add(direction.multiplyScalar(step));
      }
    }
  } 
  // Desactivar animación cuando no hay movimiento
  else if (fbxModel.userData.walkAction && !fbxModel.userData.walkAction.paused) {
    fbxModel.userData.walkAction.paused = true;
    console.log('Animación de caminar pausada');
  }
}

// Función para transiciones suaves entre animaciones
function fadeToAction(action, duration) {
  const currentAction = fbxModel.userData.animations[fbxModel.userData.currentAnimation];
  
  if (currentAction) {
    currentAction.fadeOut(duration);
  }
  
  action
    .reset()
    .setEffectiveTimeScale(1)
    .setEffectiveWeight(1)
    .fadeIn(duration)
    .play();
}

// —— Arrancar la app ——
init();
