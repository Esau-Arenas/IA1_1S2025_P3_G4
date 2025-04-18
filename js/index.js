let scene, camera, renderer, controls;
let brickTexture, grassTexture;
let paredes = [];
let ancho = 0, alto = 0;
let inicio = [0, 0], fin = [0, 0];
let fbxModel, mixer;

function init() {
    // Escena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Cámara
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(5, 10, 15);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Controles de órbita
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;
    controls.maxDistance = 50;
    controls.maxPolarAngle = Math.PI * 0.9;

    // Luces
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10, 20, 10);
    scene.add(light);

    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    // Texturas
    const textureLoader = new THREE.TextureLoader();
    brickTexture = textureLoader.load('https://images.unsplash.com/photo-1495578942200-c5f5d2137def?fm=jpg&q=60&w=3000&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8YnJpY2slMjB0ZXh0dXJlfGVufDB8fDB8fHww');
    brickTexture.wrapS = THREE.RepeatWrapping;
    brickTexture.wrapT = THREE.RepeatWrapping;
    brickTexture.repeat.set(1, 1);

    grassTexture = textureLoader.load('https://thumbs.dreamstime.com/b/la-imagen-del-detalle-de-superficie-textura-piso-ladrillo-para-el-fondo-102993035.jpg');
    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;

    // Eventos
    window.addEventListener('resize', onWindowResize);
    document.getElementById("jsonInput").addEventListener("change", handleFileUpload);
    document.getElementById("createButton").addEventListener("click", crearLaberinto);

    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (mixer) mixer.update(0.016);
    renderer.render(scene, camera);
}

function crearLaberinto() {
  document.getElementById("modal").style.display = "none";

  // Limpieza selectiva de la escena
  const toRemove = [];
  scene.children.forEach(obj => {
      if (![camera, controls, renderer.domElement].includes(obj) && !obj.isLight) {
          toRemove.push(obj);
      }
  });
  toRemove.forEach(obj => scene.remove(obj));

  // Asegurar luces
  addLightsIfNeeded();

  // Crear suelo con dimensiones exactas
  const floorSize = { width: ancho, height: alto };
  grassTexture.repeat.set(floorSize.width, floorSize.height);
  const floorGeometry = new THREE.PlaneGeometry(floorSize.width, floorSize.height);
  const floorMaterial = new THREE.MeshStandardMaterial({
      map: grassTexture,
      side: THREE.DoubleSide
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0; // Levemente bajo el nivel 0
  floor.receiveShadow = true;
  scene.add(floor);

  // Crear paredes alineadas con el suelo
  const wallHeight = 2; // Altura de las paredes
  const wallGeometry = new THREE.BoxGeometry(1, wallHeight, 1); 

  
  const wallMaterial = new THREE.MeshStandardMaterial({ 
      map: brickTexture,
      color: 0xaaaaaa // Color base para textura
  });

  paredes.forEach(([x, y]) => {
      const wall = new THREE.Mesh(wallGeometry, wallMaterial);
      
      // Posición exacta para alineación perfecta
      wall.position.set(
          x - Math.floor(ancho / 2) + 0.5, 
          1, // Altura basada en tamaño de pared (2 unidades)
          y - Math.floor(alto / 2) + 0.5
      );
      
      wall.castShadow = true;
      wall.receiveShadow = true;
      scene.add(wall);
  });

  // Posicionamiento preciso del modelo
  const [startX, startY] = inicio;
  const modelPosX = startX - Math.floor(ancho / 2) + 0.5;
  const modelPosZ = startY - Math.floor(alto / 2) + 0.5;
  agregarGLB(modelPosX, modelPosZ);

  // Configuración de cámara adaptativa
  setupCamera();
}

function addLightsIfNeeded() {
  if (!scene.children.some(obj => obj.isLight)) {
      // Luz direccional principal
      const mainLight = new THREE.DirectionalLight(0xffffff, 1);
      mainLight.position.set(10, 20, 10);
      mainLight.castShadow = true;
      mainLight.shadow.mapSize.width = 2048;
      mainLight.shadow.mapSize.height = 2048;
      scene.add(mainLight);

      // Luz ambiental
      const ambientLight = new THREE.AmbientLight(0x404040);
      scene.add(ambientLight);

      // Luz de relleno
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
      fillLight.position.set(-10, 10, -10);
      scene.add(fillLight);
  }
}

function setupCamera() {
  const maxDimension = Math.max(ancho, alto);
  const cameraHeight = maxDimension * 1.5;
  const cameraDistance = maxDimension * 1.8;

  camera.position.set(
      cameraDistance,
      cameraHeight,
      cameraDistance
  );
  
  controls.target.set(0, 0, 0);
  controls.maxDistance = maxDimension * 3;
  controls.minDistance = maxDimension * 0.5;
  controls.update();
}

function agregarGLB(posX, posZ) {
  const loader = new THREE.GLTFLoader();

  loader.load(
      '/IA1_1S2025_P3_G4/models/characters/shrek_walk_cycle.glb',
      function (gltf) {
          fbxModel = gltf.scene;
          
          // Escala proporcional al laberinto
          const scale = Math.min(ancho, alto) * 0.12;
          fbxModel.scale.set(scale, scale, scale);
          
          // Posición exacta sobre el suelo
          fbxModel.position.set(
              posX,
              scale * 0.015, // Ajuste para que "toque" el suelo
              posZ
          );
          
          // Configuración de sombras
          fbxModel.traverse(function(node) {
              if (node.isMesh) {
                  node.castShadow = true;
                  node.receiveShadow = true;
              }
          });

          scene.add(fbxModel);
          
          // Animaciones
          if (gltf.animations?.length) {
              mixer = new THREE.AnimationMixer(fbxModel);
              mixer.clipAction(gltf.animations[0]).play();
          }
      },
      undefined,
      function (error) {
          console.error('Error al cargar el modelo:', error);
          createFallbackModel(posX, posZ);
      }
  );
}

function createFallbackModel(posX, posZ) {
  const size = Math.min(ancho, alto) * 0.1;
  const geometry = new THREE.CylinderGeometry(size*0.5, size, size*2, 8);
  const material = new THREE.MeshStandardMaterial({ 
      color: 0x44aa88,
      metalness: 0.2,
      roughness: 0.7
  });
  const model = new THREE.Mesh(geometry, material);
  model.position.set(posX, size, posZ);
  model.rotation.x = Math.PI * 0.5;
  model.castShadow = true;
  scene.add(model);
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const data = JSON.parse(event.target.result);
            ancho = data.ancho;
            alto = data.alto;
            paredes = data.paredes;
            inicio = data.inicio;
            fin = data.fin;
            document.getElementById("createButton").style.display = "inline-block";
        } catch (err) {
            alert("Error al leer el archivo JSON.");
        }
    };
    reader.readAsText(file);
}

// Inicializar la aplicación
init();