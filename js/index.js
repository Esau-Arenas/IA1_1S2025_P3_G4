// js/index.js

// —— Variables globales ——
let scene, camera, renderer, controls;
let brickTexture, grassTexture;
let paredes = [], ancho = 0, alto = 0;
let inicio = [0,0], fin = [0,0];
let fbxModel, mixer;
let backgroundMusic;
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

  // Inicializar audio
  const listener = new THREE.AudioListener();
  camera.add(listener);
  backgroundMusic = new THREE.Audio(listener);

  animate();

  // En la función init(), después de inicializar los eventos:
  document.getElementById('musicToggle').addEventListener('click', function() {
    if (backgroundMusic.isPlaying) {
      backgroundMusic.pause();
      this.textContent = '🔊 Sonido';
    } else {
      backgroundMusic.play();
      this.textContent = '🔇 Silenciar';
    }
  });
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
  create360BackgroundEXR();
  // Ocultar modal y mostrar controles
  document.getElementById('modal').style.display = 'none';
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
      y - Math.floor(alto/2) + 0.5
    );
    scene.add(w);
  });

  // Marcador de inicio (rojo)
  const startMarker = new THREE.Mesh(
    new THREE.CircleGeometry(0.4, 32),
    new THREE.MeshStandardMaterial({ 
      color: 0xff0000, 
      metalness: 0.3,
      roughness: 0.7
    })
  );
  startMarker.rotation.x = -Math.PI/2;
  startMarker.position.set(
    inicio[0] - Math.floor(ancho/2) + 0.5,
    0.01,
    inicio[1] - Math.floor(alto/2) + 0.5
  );
  scene.add(startMarker);

  // Marcador de fin (verde)
  const endMarker = new THREE.Mesh(
    new THREE.CircleGeometry(0.4, 32),
    new THREE.MeshStandardMaterial({ 
      color: 0x00ff00,
      metalness: 0.3,
      roughness: 0.7
    })
  );
  endMarker.rotation.x = -Math.PI/2;
  endMarker.position.set(
    fin[0] - Math.floor(ancho/2) + 0.5,
    0.01,
    fin[1] - Math.floor(alto/2) + 0.5
  );
  scene.add(endMarker);

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
    // Luz ambiental más cálida y menos intensa
    scene.add(new THREE.AmbientLight(0xfff4e6, 0.5)); // Color cálido, intensidad reducida
    
    // Luz direccional principal (sol) - más suave y cálida
    const d1 = new THREE.DirectionalLight(0xfff4e6, 0.6); // Color cálido, intensidad reducida
    d1.position.set(5, 15, 5); // Posición más baja y centrada
    d1.castShadow = true;
    d1.shadow.mapSize.width = 1024; // Resolución de sombra reducida para mejor rendimiento
    d1.shadow.mapSize.height = 1024;
    d1.shadow.radius = 2; // Suavizado de sombras
    scene.add(d1);
    
    // Eliminamos la segunda luz direccional dura
    // En su lugar, añadimos una luz hemisférica para iluminación ambiental suave
    const hemiLight = new THREE.HemisphereLight(0xfff4e6, 0x445588, 0.4);
    hemiLight.position.set(0, 10, 0);
    scene.add(hemiLight);
  }
}

// —— Carga GLB ——
function agregarGLB(x, z) {
  new THREE.GLTFLoader().load(
    './models/characters/shrek_walk_cycle.glb',
    gltf => {
      fbxModel = gltf.scene;
      const s = Math.min(ancho, alto) * 0.10;
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

// bfs paso‑a‑paso
function* bfsGenerator(start, goal) {
  const q = [start];
  const seen = new Set([key(start)]);
  const parent = {};
  while (q.length) {
    const u = q.shift();
    yield u;                                 // cede posición actual
    if (key(u) === key(goal)) break;
    for (const v of getNeighbors(u)) {
      const kv = key(v);
      if (!seen.has(kv)) {
        seen.add(kv);
        parent[kv] = u;
        q.push(v);
      }
    }
  }
  // al final devolver el camino
  const path = [];
  let cur = key(goal);
  while (cur) {
    path.push(cur.split(',').map(Number));
    cur = parent[cur] && key(parent[cur]);
  }
  return path.reverse();
}

// genera pasos de Dijkstra
function* dijkstraGenerator(start, goal) {
  class PQ{constructor(){this.A=[]}
    enqueue(n,p){this.A.push({n,p});this.A.sort((a,b)=>a.p-b.p)}
    dequeue(){return this.A.shift().n}
    isEmpty(){return this.A.length===0}
  }
  const dist = {}, parent = {}, pq = new PQ();
  dist[key(start)] = 0; pq.enqueue(start,0);
  while(!pq.isEmpty()){
    const u = pq.dequeue(), ku = key(u);
    yield u;
    if(ku === key(goal)) break;
    for(const v of getNeighbors(u)){
      const kv = key(v), alt = dist[ku] + 1;
      if(alt < (dist[kv] ?? Infinity)){
        dist[kv] = alt;
        parent[kv] = u;
        pq.enqueue(v, alt);
      }
    }
  }
  // reconstruir camino…
  const path = [], kg = key(goal);
  let cur = kg;
  while(cur){
    path.push(cur.split(',').map(Number));
    cur = parent[cur] && key(parent[cur]);
  }
  return path.reverse();
}

// genera pasos de A*
function* astarGenerator(start, goal) {
  class PQ2{constructor(){this.A=[]}
    enqueue(n,p){this.A.push({n,p});this.A.sort((a,b)=>a.p-b.p)}
    dequeue(){return this.A.shift().n}
    isEmpty(){return this.A.length===0}
  }
  const g = {}, f = {}, parent = {}, open = new PQ2();
  const ks = key(start), kg = key(goal);
  g[ks]=0; f[ks]=heuristic(start,goal); open.enqueue(start,f[ks]);
  while(!open.isEmpty()){
    const u = open.dequeue(), ku = key(u);
    yield u;
    if(ku===kg) break;
    for(const v of getNeighbors(u)){
      const kv = key(v), ng = g[ku] + 1;
      if(ng < (g[kv] ?? Infinity)){
        g[kv] = ng;
        parent[kv] = u;
        f[kv] = ng + heuristic(v,goal);
        open.enqueue(v, f[kv]);
      }
    }
  }
  // reconstruir camino…
  const path = []; let cur = kg;
  while(cur){
    path.push(cur.split(',').map(Number));
    cur = parent[cur] && key(parent[cur]);
  }
  return path.reverse();
}

// antes de arrancar la búsqueda, guarda la celda previa:
let _searchPrev;             
function runSearch() {
  
  // Iniciar música si no está ya reproduciéndose
  if (!backgroundMusic.isPlaying) {
    playBackgroundMusic();
  }

  _searchPrev = [...inicio];
  const algo = document.getElementById('algoSelect').value;
  let gen;
  if (algo === 'dijkstra')    gen = dijkstraGenerator(inicio, fin);
  else if (algo === 'astar')   gen = astarGenerator(inicio, fin);
  else                         gen = bfsGenerator(inicio, fin);
  stepSearch(gen);
}

// itera el generador a velocidad constante
function stepSearch(gen) {
  const { value, done } = gen.next();
  if (!done) {
    const next = value;          // [i,j] del generador
    const prev = _searchPrev;    // última celda visitada

    // 1) Si es pared, la descartamos
    if (paredes.some(p => p[0] === next[0] && p[1] === next[1])) {
      _searchPrev = [...next];
      return setTimeout(() => stepSearch(gen), 150);
    }

    // 2) Reconstruir camino cardinal entre prev y next
    let subPath = bfs(prev, next);
    // eliminar el primer nodo si es la misma posición
    if (subPath.length && key(subPath[0]) === key(prev)) subPath.shift();
    
    // 3) Encolar cada paso del sub‑camino
    subPath.forEach(node => {
      movementQueue.push(gridToWorld(node));
    });

    _searchPrev = [...next];

    // 4) Asegurar animación caminando
    const walk = fbxModel.userData.walkAction;
    if (walk && walk.paused) walk.paused = false;

    return setTimeout(() => stepSearch(gen), 150);
  }
  // al acabar, el personaje queda en la última posición de movementQueue
}

// —— Lógica para lanzar la búsqueda y mover el muñeco ——
/*function runSearch(){
  let path = bfs(inicio, fin);
  const algo = document.getElementById('algoSelect').value;
  if(algo==='dijkstra') path = dijkstra(inicio, fin);
  if(algo==='astar')    path = astar(inicio, fin);
  startMovement(path);
}*/

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

function create360BackgroundEXR() {
  // 1. Usar EXRLoader en lugar de TextureLoader
  const exrLoader = new THREE.EXRLoader();
  
  exrLoader.load(
    './models/meadow_4k.exr',
    (texture) => {
      // 2. Configuración avanzada para HDR
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.encoding = THREE.LinearEncoding; // ¡Importante! Para HDR
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      
      // 3. Crear esfera de fondo
      const geometry = new THREE.SphereGeometry(500, 128, 128);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
        fog: false
      });
      
      const backgroundSphere = new THREE.Mesh(geometry, material);
      backgroundSphere.renderOrder = -1;
      scene.add(backgroundSphere);
      
      // 4. Configurar entorno e iluminación HDR
      setupHDREnvironment(texture);
    },
    undefined,
    (error) => {
      console.error('Error loading EXR:', error);
      loadFallbackBackground();
    }
  );
}

function setupHDREnvironment(exrTexture) {
  scene.environment = exrTexture;
  
  // Ajustes más sutiles para el tonemapping
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5; // Exposición reducida
  
  // Niebla más sutil
  scene.fog = new THREE.FogExp2(0x888899, 0.0005); // Niebla más clara y menos densa
  
  // Iluminación ambiental suave
  const ambientLight = new THREE.AmbientLight(0xfff4e6, 0.4); // Luz cálida y suave
  scene.add(ambientLight);
  
  // Luz direccional muy suave
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.3);
  dirLight.position.set(0, 5, 1); // Posición más baja
  scene.add(dirLight);
}

function playBackgroundMusic() {
  // Cargar música (reemplaza con tu archivo de audio)
  const audioLoader = new THREE.AudioLoader();
  audioLoader.load(
    './sounds/fondo.mp3', // Ruta a tu archivo de música
    function(buffer) {
      backgroundMusic.setBuffer(buffer);
      backgroundMusic.setLoop(true);
      backgroundMusic.setVolume(0.5); // Ajustar volumen (0 a 1)
      backgroundMusic.play();
    },
    function(xhr) {
      console.log((xhr.loaded / xhr.total * 100) + '% cargado');
    },
    function(error) {
      console.error('Error cargando audio:', error);
    }
  );
}

// —— Arrancar la app ——
init();
