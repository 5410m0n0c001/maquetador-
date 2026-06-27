/* 
   Universal Venue Floor Plan Builder — 3D Visualizer Engine
   Primavera Events Group — Three.js procedural renderer
*/

window.Visualizer3D = (function () {
  'use strict';

  // ─── Constants ───────────────────────────────────────────
  var SCALE = 15; // match Editor2D scale (pixels per meter)
  
  var COLORS = {
    floorIndoor: 0xe2e8f0,
    floorOutdoor: 0x021526, // Midnight Navy
    walls: 0x475569,
    tableCloth: 0xffffff,
    woodDark: 0x3e2723,
    woodLight: 0x8d6e63,
    grass: 0x166534,
    water: 0x0284c7,
    gold: 0xd4af37,
    metal: 0x94a3b8,
    ledOn: 0x8b5cf6,
    limo: 0x1f2937,
    pink: 0xf472b6,
    orange: 0xf97316,
    white: 0xffffff
  };

  // ─── Internal State ───────────────────────────────────────
  var _scene = null;
  var _camera = null;
  var _renderer = null;
  var _controls = null;
  var _container = null;
  
  var _active3dElements = {}; // id -> THREE.Group
  var _currentElements = [];
  var _selectedId = null;
  var _animationFrameId = null;
  
  var _selectionRing = null;
  var _terrainMesh = null;
  var _gridHelper = null;
  var _terrain = { w: 50, h: 60 };
  var _getState = null;
  var _perimeterWalls = null;

  function _getLayerVisibility(category) {
    if (_getState) {
      var state = _getState();
      if (state && state.layers) {
        return state.layers[category] !== false;
      }
    }
    return true;
  }

  // Helper to convert hex string to number
  function parseColor(hex) {
    if (!hex) return 0xffffff;
    return parseInt(hex.replace('#', '0x'));
  }

  // 🌸 COLOR MAP AND MATERIAL HELPERS FOR TABLEWARE & LINENS
  var _colorMap = {
    blanco: 0xffffff,
    marfil: 0xfffff0,
    negro: 0x18181b,
    caqui: 0xc3b091,
    azul_marino: 0x0f172a,
    arena: 0xe5e5e5,
    chocolate: 0x3b2314,
    dorado: 0xd4af37,
    palo_de_rosa: 0xd39e9e,
    rojo: 0xb91c1c,
    verde: 0x15803d,
    amarillo: 0xeab308,
    champagne: 0xf7e7ce,
    verde_olivo: 0x556b2f,
    azul_rey: 0x0f52ba,
    azul_cielo: 0x87ceeb,
    azul_turquesa: 0x30d5c8,
    rosa_baby: 0xffb7c5,
    rosa_blush: 0xde5d83,
    rosa_brillante: 0xff69b4,
    fuchsia: 0xff00ff,
    corrugado_ivory: 0xfffff4,
    corrugado_verde_olivo: 0x6b8e23,
    verde_bandera: 0x006400,
    verde_navidad: 0x0b6623,
    shedron: 0xa0522d,
    beige: 0xf5f5dc,
    durazno: 0xffcbd1,
    lila: 0xc8a2c8,
    morado: 0x800080,
    salmon: 0xfa8072,
    rosa_mexicano: 0xe4007f,
    hueso: 0xf5f5f5,
    transparente: 0xffffff,
    ambar: 0xffbf00,
    uva: 0x5d3fd3,
    azul: 0x2563eb,
    plateado: 0xc0c0c0,
    gold_rose: 0xb76e79
  };

  function getHexColor(name, defaultHex) {
    if (!name) return defaultHex || 0xffffff;
    var key = name.toLowerCase();
    if (_colorMap[key] !== undefined) return _colorMap[key];
    if (key.indexOf('#') === 0) return parseInt(key.replace('#', '0x'));
    return defaultHex || 0xffffff;
  }

  var _materialsCache = {};

  function _getPlatoBaseMaterial(style) {
    if (!style || style === 'ninguno') return null;
    var cacheKey = 'base_' + style;
    if (_materialsCache[cacheKey]) return _materialsCache[cacheKey];

    var mat;
    if (style === 'cristal_aperlado') {
      mat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.1,
        metalness: 0.1,
        transmission: 0.8,
        transparent: true,
        opacity: 0.7
      });
    } else if (style === 'vintage' || style === 'romano') {
      mat = new THREE.MeshStandardMaterial({
        color: 0xeadbc8,
        roughness: 0.5,
        metalness: 0.1
      });
    } else if (style === 'concha_dorado' || style === 'plateado') {
      mat = new THREE.MeshStandardMaterial({
        color: (style === 'plateado') ? 0xd1d5db : 0xd4af37,
        metalness: 0.9,
        roughness: 0.2
      });
    } else if (style === 'chocolate') {
      mat = new THREE.MeshStandardMaterial({
        color: 0x3b2314,
        roughness: 0.6
      });
    } else if (style === 'gotico') {
      mat = new THREE.MeshStandardMaterial({
        color: 0x1c1917,
        roughness: 0.4,
        metalness: 0.2
      });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.3
      });
    }
    _materialsCache[cacheKey] = mat;
    return mat;
  }

  function _getPlatoTrincheMaterial(style) {
    var cacheKey = 'trinche_' + style;
    if (_materialsCache[cacheKey]) return _materialsCache[cacheKey];

    var mat;
    if (style === 'negro') {
      mat = new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.5
      });
    } else if (style === 'entremes_blanco') {
      mat = new THREE.MeshStandardMaterial({
        color: 0xfafafa,
        roughness: 0.4
      });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.3
      });
    }
    _materialsCache[cacheKey] = mat;
    return mat;
  }

  function _getCutleryMaterial(color) {
    var cacheKey = 'cutlery_' + color;
    if (_materialsCache[cacheKey]) return _materialsCache[cacheKey];

    var hex = getHexColor(color, 0xc0c0c0);
    var mat = new THREE.MeshStandardMaterial({
      color: hex,
      metalness: 0.9,
      roughness: 0.2
    });
    _materialsCache[cacheKey] = mat;
    return mat;
  }

  function _getGlasswareMaterial(style, color) {
    var cacheKey = 'glass_' + style + '_' + color;
    if (_materialsCache[cacheKey]) return _materialsCache[cacheKey];

    var hex = getHexColor(color, 0xffffff);
    var mat = new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.9,
      opacity: 1.0,
      transparent: true,
      thickness: 0.02
    });
    _materialsCache[cacheKey] = mat;
    return mat;
  }

  function _getNapkinMaterial(color) {
    var cacheKey = 'napkin_' + color;
    if (_materialsCache[cacheKey]) return _materialsCache[cacheKey];

    var hex = getHexColor(color, 0xffffff);
    var mat = new THREE.MeshStandardMaterial({
      color: hex,
      roughness: 0.7
    });
    _materialsCache[cacheKey] = mat;
    return mat;
  }

  function _create3DGlassware(style, glassMat) {
    var gGroup = new THREE.Group();
    if (style === 'cubero') {
      var cup = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.12, 12), glassMat);
      cup.position.y = 0.06;
      cup.castShadow = true;
      gGroup.add(cup);
    } else if (style === 'old_fashion') {
      var cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12), glassMat);
      cup.position.y = 0.04;
      cup.castShadow = true;
      gGroup.add(cup);
    } else if (style === 'tequilero') {
      var cup = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.05, 10), glassMat);
      cup.position.y = 0.025;
      cup.castShadow = true;
      gGroup.add(cup);
    } else if (style === 'flauta') {
      var base = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.004, 12), glassMat);
      base.position.y = 0.002;
      gGroup.add(base);
      var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.07, 8), glassMat);
      stem.position.y = 0.039;
      gGroup.add(stem);
      var bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.018, 0.08, 12), glassMat);
      bowl.position.y = 0.114;
      gGroup.add(bowl);
    } else if (style === 'martinera') {
      var base = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 12), glassMat);
      base.position.y = 0.002;
      gGroup.add(base);
      var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.08, 8), glassMat);
      stem.position.y = 0.044;
      gGroup.add(stem);
      var bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.003, 0.05, 12, 1, true), glassMat);
      bowl.position.y = 0.109;
      gGroup.add(bowl);
    } else if (style === 'romana') {
      var base = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 12), glassMat);
      base.position.y = 0.002;
      gGroup.add(base);
      var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 8), glassMat);
      stem.position.y = 0.029;
      gGroup.add(stem);
      var bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.07, 12), glassMat);
      bowl.position.y = 0.089;
      gGroup.add(bowl);
    } else {
      var base = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.004, 12), glassMat);
      base.position.y = 0.002;
      gGroup.add(base);
      var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 8), glassMat);
      stem.position.y = 0.034;
      gGroup.add(stem);
      var bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.02, 0.065, 12), glassMat);
      bowl.position.y = 0.096;
      gGroup.add(bowl);
    }
    return gGroup;
  }

  function _addTablewareRadial(group, tableRadius, numSeats, config) {
    if (numSeats <= 0) return;

    var baseMat = _getPlatoBaseMaterial(config.platoBase);
    var trincheMat = _getPlatoTrincheMaterial(config.platoTrinche);
    var cutleryMat = _getCutleryMaterial(config.cubiertos);
    var glassMat = _getGlasswareMaterial(config.cristal, config.copasColor);
    var napkinMat = _getNapkinMaterial(config.servilletaColor);

    var plateRadius = tableRadius - 0.12;
    var tableSurfaceY = 0.775;

    for (var i = 0; i < numSeats; i++) {
      var angle = (i * 2 * Math.PI) / numSeats;
      var px = Math.sin(angle) * plateRadius;
      var pz = Math.cos(angle) * plateRadius;

      var tablewareGroup = new THREE.Group();
      tablewareGroup.position.set(px, tableSurfaceY, pz);
      tablewareGroup.rotation.y = angle;

      var currentY = 0.003;
      if (config.platoBase && config.platoBase !== 'ninguno') {
        var baseGeom = new THREE.CylinderGeometry(0.14, 0.14, 0.006, 16);
        var baseMesh = new THREE.Mesh(baseGeom, baseMat);
        baseMesh.position.y = currentY;
        baseMesh.castShadow = true;
        tablewareGroup.add(baseMesh);
        currentY += 0.006;
      }

      if (config.platoTrinche && config.platoTrinche !== 'ninguno') {
        var trincheGeom = (config.platoTrinche === 'cuadrado_blanco')
          ? new THREE.BoxGeometry(0.2, 0.006, 0.2)
          : new THREE.CylinderGeometry(0.1, 0.1, 0.006, 16);
        var trincheMesh = new THREE.Mesh(trincheGeom, trincheMat);
        trincheMesh.position.y = currentY;
        trincheMesh.castShadow = true;
        tablewareGroup.add(trincheMesh);
        currentY += 0.006;
      }

      if (config.servilletaColor) {
        var napkinGeom;
        var napkinMesh;
        var ny = currentY;
        if (config.servilletaDoblez === 'loto') {
          napkinGeom = new THREE.ConeGeometry(0.04, 0.06, 6);
          napkinMesh = new THREE.Mesh(napkinGeom, napkinMat);
          napkinMesh.position.y = ny + 0.03;
        } else if (config.servilletaDoblez === 'abanico') {
          napkinGeom = new THREE.BoxGeometry(0.08, 0.06, 0.015);
          napkinMesh = new THREE.Mesh(napkinGeom, napkinMat);
          napkinMesh.position.y = ny + 0.03;
        } else if (config.servilletaDoblez === 'piramide') {
          napkinGeom = new THREE.ConeGeometry(0.04, 0.06, 4);
          napkinMesh = new THREE.Mesh(napkinGeom, napkinMat);
          napkinMesh.position.y = ny + 0.03;
        } else if (config.servilletaDoblez === 'capullo') {
          napkinGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8);
          napkinMesh = new THREE.Mesh(napkinGeom, napkinMat);
          napkinMesh.position.y = ny + 0.025;
        } else {
          napkinGeom = new THREE.BoxGeometry(0.07, 0.004, 0.07);
          napkinMesh = new THREE.Mesh(napkinGeom, napkinMat);
          napkinMesh.position.y = ny + 0.002;
        }
        napkinMesh.castShadow = true;
        tablewareGroup.add(napkinMesh);
      }

      var forkGeom = new THREE.BoxGeometry(0.012, 0.003, 0.14);
      var fork = new THREE.Mesh(forkGeom, cutleryMat);
      fork.position.set(-0.13, 0.0015, 0);
      fork.castShadow = true;
      tablewareGroup.add(fork);

      var knifeGeom = new THREE.BoxGeometry(0.01, 0.003, 0.14);
      var knife = new THREE.Mesh(knifeGeom, cutleryMat);
      knife.position.set(0.13, 0.0015, 0);
      knife.castShadow = true;
      tablewareGroup.add(knife);

      var glassGroup = _create3DGlassware(config.cristal, glassMat);
      glassGroup.position.set(0.12, 0, -0.12);
      tablewareGroup.add(glassGroup);

      group.add(tablewareGroup);
    }
  }

  function _addTablewareLine(group, offsetZ, totalWidth, numSeats, config, plateRotY) {
    if (numSeats <= 0) return;

    var baseMat = _getPlatoBaseMaterial(config.platoBase);
    var trincheMat = _getPlatoTrincheMaterial(config.platoTrinche);
    var cutleryMat = _getCutleryMaterial(config.cubiertos);
    var glassMat = _getGlasswareMaterial(config.cristal, config.copasColor);
    var napkinMat = _getNapkinMaterial(config.servilletaColor);

    var tableSurfaceY = 0.775;
    var step = totalWidth / numSeats;

    for (var i = 0; i < numSeats; i++) {
      var cx = -totalWidth/2 + step * (i + 0.5);

      var tablewareGroup = new THREE.Group();
      tablewareGroup.position.set(cx, tableSurfaceY, offsetZ);
      tablewareGroup.rotation.y = plateRotY;

      var currentY = 0.003;
      if (config.platoBase && config.platoBase !== 'ninguno') {
        var baseGeom = new THREE.CylinderGeometry(0.14, 0.14, 0.006, 16);
        var baseMesh = new THREE.Mesh(baseGeom, baseMat);
        baseMesh.position.y = currentY;
        baseMesh.castShadow = true;
        tablewareGroup.add(baseMesh);
        currentY += 0.006;
      }

      if (config.platoTrinche && config.platoTrinche !== 'ninguno') {
        var trincheGeom = (config.platoTrinche === 'cuadrado_blanco')
          ? new THREE.BoxGeometry(0.2, 0.006, 0.2)
          : new THREE.CylinderGeometry(0.1, 0.1, 0.006, 16);
        var trincheMesh = new THREE.Mesh(trincheGeom, trincheMat);
        trincheMesh.position.y = currentY;
        trincheMesh.castShadow = true;
        tablewareGroup.add(trincheMesh);
        currentY += 0.006;
      }

      if (config.servilletaColor) {
        var napkinGeom;
        var napkinMesh;
        var ny = currentY;
        if (config.servilletaDoblez === 'loto') {
          napkinGeom = new THREE.ConeGeometry(0.04, 0.06, 6);
          napkinMesh = new THREE.Mesh(napkinGeom, napkinMat);
          napkinMesh.position.y = ny + 0.03;
        } else if (config.servilletaDoblez === 'abanico') {
          napkinGeom = new THREE.BoxGeometry(0.08, 0.06, 0.015);
          napkinMesh = new THREE.Mesh(napkinGeom, napkinMat);
          napkinMesh.position.y = ny + 0.03;
        } else if (config.servilletaDoblez === 'piramide') {
          napkinGeom = new THREE.ConeGeometry(0.04, 0.06, 4);
          napkinMesh = new THREE.Mesh(napkinGeom, napkinMat);
          napkinMesh.position.y = ny + 0.03;
        } else if (config.servilletaDoblez === 'capullo') {
          napkinGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8);
          napkinMesh = new THREE.Mesh(napkinGeom, napkinMat);
          napkinMesh.position.y = ny + 0.025;
        } else {
          napkinGeom = new THREE.BoxGeometry(0.07, 0.004, 0.07);
          napkinMesh = new THREE.Mesh(napkinGeom, napkinMat);
          napkinMesh.position.y = ny + 0.002;
        }
        napkinMesh.castShadow = true;
        tablewareGroup.add(napkinMesh);
      }

      var forkGeom = new THREE.BoxGeometry(0.012, 0.003, 0.14);
      var fork = new THREE.Mesh(forkGeom, cutleryMat);
      fork.position.set(-0.13, 0.0015, 0);
      fork.castShadow = true;
      tablewareGroup.add(fork);

      var knifeGeom = new THREE.BoxGeometry(0.01, 0.003, 0.14);
      var knife = new THREE.Mesh(knifeGeom, cutleryMat);
      knife.position.set(0.13, 0.0015, 0);
      knife.castShadow = true;
      tablewareGroup.add(knife);

      var glassGroup = _create3DGlassware(config.cristal, glassMat);
      glassGroup.position.set(0.12, 0, -0.12);
      tablewareGroup.add(glassGroup);

      group.add(tablewareGroup);
    }
  }

  // ─── Init Three.js ────────────────────────────────────────
  function init(containerElement, initialElements, getState) {
    _container = containerElement;
    _getState = getState;
    _currentElements = (typeof initialElements === 'function') ? initialElements() : (initialElements || []);
    
    var state = getState ? getState() : {};
    _terrain = state.terrain || { w: 50, h: 60 };

    _container.innerHTML = '';

    // 1. Scene
    _scene = new THREE.Scene();
    _scene.background = new THREE.Color(0x0a0f1d); // Midnight dark theme
    _scene.fog = new THREE.FogExp2(0x0a0f1d, 0.015);

    // 2. Camera — defensive: guarantee non-zero dimensions
    var cw = _container.clientWidth || _container.parentElement.clientWidth || window.innerWidth;
    var ch = _container.clientHeight || _container.parentElement.clientHeight || window.innerHeight;
    console.log('[Visualizer3D] Init container size:', cw, 'x', ch);
    var aspect = cw / (ch || 1);
    _camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    _camera.position.set(_terrain.w / 2, Math.max(_terrain.w, _terrain.h) * 0.75, _terrain.h * 1.1);

    // 3. Renderer
    _renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    _renderer.setSize(cw, ch);
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _renderer.shadowMap.enabled = true;
    _renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    _renderer.toneMapping = THREE.ACESFilmicToneMapping;
    _renderer.toneMappingExposure = 1.0;
    _container.appendChild(_renderer.domElement);

    // 4. Orbit Controls
    _controls = new THREE.OrbitControls(_camera, _renderer.domElement);
    _controls.enableDamping = true;
    _controls.dampingFactor = 0.05;
    _controls.screenSpacePanning = false;
    _controls.minDistance = 5;
    _controls.maxDistance = Math.max(_terrain.w, _terrain.h) * 2.5;
    _controls.maxPolarAngle = Math.PI / 2 - 0.05; // don't go below ground
    _controls.target.set(_terrain.w / 2, 0, _terrain.h / 2);
    _controls.update();

    // 5. Lighting
    _setupLighting();

    // 6. Base Ground Sized to Terrain
    _buildTerrainFloor();

    // 7. Selection Ring
    _buildSelectionRing();

    // 8. Render Elements
    syncWithData(_currentElements);

    // 9. Start Loop
    _animate();

    window.addEventListener('resize', _onResize);
    console.log('[Visualizer3D] Initialized.');
  }

  function destroy() {
    if (_animationFrameId) {
      cancelAnimationFrame(_animationFrameId);
    }
    window.removeEventListener('resize', _onResize);
    if (_renderer) {
      _renderer.dispose();
    }
    _scene = null;
    _camera = null;
    _renderer = null;
    _controls = null;
    _active3dElements = {};
    console.log('[Visualizer3D] Destroyed.');
  }

  function _onResize() {
    if (!_container || !_camera || !_renderer) return;
    var width = _container.clientWidth || _container.parentElement.clientWidth || window.innerWidth;
    var height = _container.clientHeight || _container.parentElement.clientHeight || window.innerHeight;
    if (width === 0 || height === 0) return;
    _camera.aspect = width / height;
    _camera.updateProjectionMatrix();
    _renderer.setSize(width, height);
  }

  function resetCamera() {
    if (!_camera || !_controls) return;
    var startPos = _camera.position.clone();
    var startTarget = _controls.target.clone();
    var endPos = new THREE.Vector3(_terrain.w / 2, Math.max(_terrain.w, _terrain.h) * 0.75, _terrain.h * 1.1);
    var endTarget = new THREE.Vector3(_terrain.w / 2, 0, _terrain.h / 2);
    
    var t = 0;
    function lerp() {
      t += 0.05;
      if (t <= 1) {
        _camera.position.lerpVectors(startPos, endPos, t);
        _controls.target.lerpVectors(startTarget, endTarget, t);
        _controls.update();
        requestAnimationFrame(lerp);
      } else {
        _camera.position.copy(endPos);
        _controls.target.copy(endTarget);
        _controls.update();
      }
    }
    lerp();
  }

  var _ambientLight = null;
  var _sunLight = null;
  var _partyLight1 = null;
  var _partyLight2 = null;

  // ─── Setup Lighting ───────────────────────────────────────
  function _setupLighting() {
    // Ambient fill
    _ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    _scene.add(_ambientLight);

    // Sun / directional light (golden hour glow)
    _sunLight = new THREE.DirectionalLight(0xfff4e0, 0.75);
    _sunLight.position.set(_terrain.w * 0.5, 45, -_terrain.h * 0.3);
    _sunLight.castShadow = true;
    _sunLight.shadow.mapSize.width = 2048;
    _sunLight.shadow.mapSize.height = 2048;
    _sunLight.shadow.camera.near = 0.5;
    _sunLight.shadow.camera.far = 250;
    
    var dX = _terrain.w * 0.7;
    var dZ = _terrain.h * 0.7;
    _sunLight.shadow.camera.left = -dX;
    _sunLight.shadow.camera.right = dX;
    _sunLight.shadow.camera.top = dZ;
    _sunLight.shadow.camera.bottom = -dZ;
    _sunLight.shadow.bias = -0.0005;
    _scene.add(_sunLight);

    // Evening overhead party lights (small blue and magenta accents)
    _partyLight1 = new THREE.PointLight(0x3b82f6, 0.4, 40);
    _partyLight1.position.set(_terrain.w * 0.25, 12, _terrain.h * 0.5);
    _scene.add(_partyLight1);

    _partyLight2 = new THREE.PointLight(0xec4899, 0.4, 40);
    _partyLight2.position.set(_terrain.w * 0.75, 12, _terrain.h * 0.5);
    _scene.add(_partyLight2);
  }

  function setLighting(mode) {
    if (!_ambientLight || !_sunLight || !_partyLight1 || !_partyLight2) return;
    if (mode === 'day') {
      _ambientLight.color.setHex(0xffffff);
      _ambientLight.intensity = 0.6;
      _sunLight.color.setHex(0xfff4e0);
      _sunLight.intensity = 0.75;
      _partyLight1.intensity = 0;
      _partyLight2.intensity = 0;
    } else if (mode === 'night') {
      _ambientLight.color.setHex(0x1e1e38);
      _ambientLight.intensity = 0.15;
      _sunLight.intensity = 0.05;
      _partyLight1.color.setHex(0x3b82f6); // blue
      _partyLight1.intensity = 0.8;
      _partyLight2.color.setHex(0xec4899); // magenta
      _partyLight2.intensity = 0.8;
    } else if (mode === 'gala') {
      _ambientLight.color.setHex(0xffedd5); // warm amber
      _ambientLight.intensity = 0.35;
      _sunLight.color.setHex(0xfcd34d); // warm golden
      _sunLight.intensity = 0.3;
      _partyLight1.color.setHex(0xf59e0b); // warm yellow
      _partyLight1.intensity = 0.8;
      _partyLight2.color.setHex(0xf97316); // warm orange
      _partyLight2.intensity = 0.8;
    }
  }

  // ─── Ground & Sizing ──────────────────────────────────────
  function _buildTerrainFloor() {
    if (_terrainMesh) _scene.remove(_terrainMesh);
    if (_gridHelper) _scene.remove(_gridHelper);
    if (_perimeterWalls) _scene.remove(_perimeterWalls);

    // Main terrain base
    var geom = new THREE.BoxGeometry(_terrain.w, 0.2, _terrain.h);
    var mat = new THREE.MeshStandardMaterial({
      color: COLORS.floorOutdoor,
      roughness: 0.9,
      metalness: 0.1
    });
    _terrainMesh = new THREE.Mesh(geom, mat);
    _terrainMesh.position.set(_terrain.w / 2, -0.1, _terrain.h / 2);
    _terrainMesh.receiveShadow = true;
    _scene.add(_terrainMesh);

    // Perimeter boundary walls (barda perimetral)
    _perimeterWalls = new THREE.Group();
    _perimeterWalls.name = "Perimeter Walls";
    var wallH = 3.0; // construction floor height
    var wallT = 0.25; // thickness
    var wallMat = new THREE.MeshStandardMaterial({
      color: 0xd6d3d1, // warm stone-beige
      roughness: 0.85
    });

    // North wall (Z = 0)
    var wallN = new THREE.Mesh(new THREE.BoxGeometry(_terrain.w, wallH, wallT), wallMat);
    wallN.position.set(_terrain.w / 2, wallH / 2, 0);
    wallN.castShadow = true;
    wallN.receiveShadow = true;
    _perimeterWalls.add(wallN);

    // South wall (Z = _terrain.h)
    var wallS = new THREE.Mesh(new THREE.BoxGeometry(_terrain.w, wallH, wallT), wallMat);
    wallS.position.set(_terrain.w / 2, wallH / 2, _terrain.h);
    wallS.castShadow = true;
    wallS.receiveShadow = true;
    _perimeterWalls.add(wallS);

    // West wall (X = 0)
    var wallW = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, _terrain.h), wallMat);
    wallW.position.set(0, wallH / 2, _terrain.h / 2);
    wallW.castShadow = true;
    wallW.receiveShadow = true;
    _perimeterWalls.add(wallW);

    // East wall (X = _terrain.w)
    var wallE = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, _terrain.h), wallMat);
    wallE.position.set(_terrain.w, wallH / 2, _terrain.h / 2);
    wallE.castShadow = true;
    wallE.receiveShadow = true;
    _perimeterWalls.add(wallE);

    _scene.add(_perimeterWalls);

    // Grid helper overlay
    var gridDivisions = Math.max(_terrain.w, _terrain.h);
    _gridHelper = new THREE.GridHelper(gridDivisions, gridDivisions, 0xf05a7e, 0x334155);
    _gridHelper.position.set(_terrain.w / 2, 0.01, _terrain.h / 2);
    _gridHelper.material.opacity = 0.12;
    _gridHelper.material.transparent = true;
    _scene.add(_gridHelper);
  }

  function setTerrain(w, h) {
    _terrain = { w: w, h: h };
    _buildTerrainFloor();
    if (_controls) {
      _controls.maxDistance = Math.max(w, h) * 2.5;
      _controls.target.set(w / 2, 0, h / 2);
      _controls.update();
    }
  }

  // ─── Selection Ring ───────────────────────────────────────
  function _buildSelectionRing() {
    var geom = new THREE.RingGeometry(0.7, 0.8, 32);
    geom.rotateX(-Math.PI / 2); // lay flat
    var mat = new THREE.MeshBasicMaterial({
      color: COLORS.gold,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    _selectionRing = new THREE.Mesh(geom, mat);
    _selectionRing.position.set(0, -100, 0);
    _scene.add(_selectionRing);
  }

  function selectElement(id) {
    _selectedId = id;
    _updateSelectionRing();
  }

  function _updateSelectionRing() {
    if (!_selectionRing) return;
    if (!_selectedId || !_active3dElements[_selectedId]) {
      _selectionRing.position.y = -100;
      return;
    }

    var group = _active3dElements[_selectedId];
    var elem = _currentElements.find(function (e) { return e.id === _selectedId; });
    if (!elem) return;

    _selectionRing.position.set(group.position.x, 0.05, group.position.z);
    var size = Math.max(elem.w, elem.h || elem.w) * 0.95;
    _selectionRing.scale.set(size, size, size);
  }

  // ─── Sync Data ────────────────────────────────────────────
  function syncWithData(elementsArray) {
    _currentElements = (typeof elementsArray === 'function') ? elementsArray() : (elementsArray || []);

    if (!_scene) return;

    // 1. Remove deleted
    var activeIds = _currentElements.map(function (e) { return e.id; });
    Object.keys(_active3dElements).forEach(function (id) {
      if (activeIds.indexOf(id) === -1) {
        _scene.remove(_active3dElements[id]);
        delete _active3dElements[id];
      }
    });

    // 2. Build or Update elements
    _currentElements.forEach(function (elem) {
      // Skip flow lines since they are drawing-only stubs
      if (elem.shape === 'flow') return;

      var cat = window.getCatalogEntry ? window.getCatalogEntry(elem.type) : null;
      var category = (cat && cat.category) ? cat.category : 'mobiliario';

      var group = _active3dElements[elem.id];

      // Layer visibility filter
      var layerVisible = _getLayerVisibility(category);
      if (!layerVisible) {
        if (group) {
          _scene.remove(group);
          delete _active3dElements[elem.id];
        }
        return;
      }

      var needsRebuild = false;
      var currentTechosVisible = _getLayerVisibility('techos');

      if (group) {
        // Check if properties changed
        if (group.userData.w !== elem.w ||
            group.userData.h !== elem.h ||
            group.userData.chairs !== elem.chairs ||
            group.userData.color !== elem.color ||
            group.userData.type !== elem.type ||
            group.userData.salonType !== elem.salonType ||
            group.userData.elevation !== elem.elevation ||
            group.userData.techos !== currentTechosVisible) {
          needsRebuild = true;
          _scene.remove(group);
          delete _active3dElements[elem.id];
        }
      }

      if (!group || needsRebuild) {
        group = new THREE.Group();
        group.name = elem.name || elem.type;
        group.userData = {
          id: elem.id,
          type: elem.type,
          w: elem.w,
          h: elem.h,
          chairs: elem.chairs,
          color: elem.color,
          salonType: elem.salonType,
          elevation: elem.elevation,
          techos: currentTechosVisible
        };

        _buildProceduralMesh(group, elem);
        _scene.add(group);
        _active3dElements[elem.id] = group;
      }

      // Update positions (x -> X, y -> Z)
      var elev = parseFloat(elem.elevation) || 0.0;
      group.position.set(elem.x, elev, elem.y);
      group.rotation.y = -(elem.rotation || 0) * Math.PI / 180;
    });

    _updateSelectionRing();
  }

  // ─── Animate loop ─────────────────────────────────────────
  function _animate() {
    _animationFrameId = requestAnimationFrame(_animate);

    if (_controls) _controls.update();

    if (_selectionRing && _selectedId) {
      var time = Date.now() * 0.003;
      _selectionRing.rotation.y = time * 0.35;
      var pulse = 1.0 + Math.sin(time * 2.5) * 0.03;
      _selectionRing.scale.set(
        _selectionRing.scale.x * pulse,
        _selectionRing.scale.y,
        _selectionRing.scale.z * pulse
      );
    }

    if (_renderer && _scene && _camera) {
      _renderer.render(_scene, _camera);
    }
  }

  // ─── Procedural Builders ──────────────────────────────────
  function _buildProceduralMesh(group, elem) {
    var type = elem.type;
    var cat = window.getCatalogEntry ? window.getCatalogEntry(type) : null;
    var category = (cat && cat.category) ? cat.category : 'mobiliario';

    switch (category) {
      case 'estructuras':
        _buildStructure(group, elem);
        break;
      case 'accesos':
        _buildAccess(group, elem);
        break;
      case 'mobiliario':
        _buildFurniture(group, elem);
        break;
      case 'entretenimiento':
        _buildEntertainment(group, elem);
        break;
      case 'decoracion':
        _buildDecoration(group, elem);
        break;
      case 'proveedores':
        _buildProvider(group, elem);
        break;
      default:
        _buildGenericBox(group, elem, 0x64748b, 1.0);
        break;
    }
  }

  // ─── 1. Structures ────────────────────────────────────────
  function _buildStructure(group, elem) {
    var w = elem.w;
    var h = elem.h;
    var colorNum = parseColor(elem.color);
    var showTechos = _getLayerVisibility('techos');

    if (elem.type === 'salon') {
      var salonType = elem.salonType || 'muros';

      // Floor slab
      var floor = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.04, h),
        new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.5 })
      );
      floor.position.y = 0.02;
      floor.receiveShadow = true;
      group.add(floor);

      if (salonType === 'sin_muros') {
        // --- CARPA / TENT STYLE ---
        // Metal columns
        var colGeom = new THREE.CylinderGeometry(0.08, 0.08, 4.0, 8);
        var colMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.6, roughness: 0.2 });

        // Curtains
        var curtainMat = new THREE.MeshStandardMaterial({
          color: 0xf8fafc,
          roughness: 0.9,
          transparent: true,
          opacity: 0.85
        });
        var curtainGeom = new THREE.BoxGeometry(0.35, 3.8, 0.12);

        var pillars = [];
        // Corner pillars
        pillars.push({ x: -w/2 + 0.15, z: -h/2 + 0.15 });
        pillars.push({ x: w/2 - 0.15, z: -h/2 + 0.15 });
        pillars.push({ x: -w/2 + 0.15, z: h/2 - 0.15 });
        pillars.push({ x: w/2 - 0.15, z: h/2 - 0.15 });

        // Intermediate pillars
        if (w > 8) {
          var countW = Math.floor(w / 5);
          for (var i = 1; i < countW; i++) {
            var pct = i / countW;
            var xPos = -w/2 + pct * w;
            pillars.push({ x: xPos, z: -h/2 + 0.15 });
            pillars.push({ x: xPos, z: h/2 - 0.15 });
          }
        }
        if (h > 8) {
          var countH = Math.floor(h / 5);
          for (var j = 1; j < countH; j++) {
            var pct = j / countH;
            var zPos = -h/2 + pct * h;
            pillars.push({ x: -w/2 + 0.15, z: zPos });
            pillars.push({ x: w/2 - 0.15, z: zPos });
          }
        }

        pillars.forEach(function (pos) {
          var col = new THREE.Mesh(colGeom, colMat);
          col.position.set(pos.x, 2.0, pos.z);
          col.castShadow = true;
          col.receiveShadow = true;
          group.add(col);

          var curtain = new THREE.Mesh(curtainGeom, curtainMat);
          var offX = pos.x > 0 ? -0.12 : 0.12;
          var offZ = pos.z > 0 ? -0.12 : 0.12;
          curtain.position.set(pos.x + offX, 1.9, pos.z + offZ);
          curtain.castShadow = true;
          group.add(curtain);
        });

        // Pyramidal canvas roof
        if (showTechos) {
          var peakH = 4.0 + Math.max(2.0, Math.min(w, h) * 0.2);
          var vertices = new Float32Array([
            // Front face
            0, peakH, 0,   -w/2, 4.0, h/2,   w/2, 4.0, h/2,
            // Right face
            0, peakH, 0,   w/2, 4.0, h/2,    w/2, 4.0, -h/2,
            // Back face
            0, peakH, 0,   w/2, 4.0, -h/2,   -w/2, 4.0, -h/2,
            // Left face
            0, peakH, 0,   -w/2, 4.0, -h/2,  -w/2, 4.0, h/2
          ]);
          var roofGeom = new THREE.BufferGeometry();
          roofGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
          roofGeom.computeVertexNormals();

          var roofMat = new THREE.MeshStandardMaterial({
            color: 0xf8fafc,
            roughness: 0.9,
            side: THREE.DoubleSide
          });
          var roofMesh = new THREE.Mesh(roofGeom, roofMat);
          roofMesh.castShadow = true;
          roofMesh.receiveShadow = true;
          group.add(roofMesh);
        }

      } else {
        // --- CLOSED MASONRY SALON STYLE ---
        var wallMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.85 });

        // North wall
        var wallN = new THREE.Mesh(new THREE.BoxGeometry(w, 4.0, 0.2), wallMat);
        wallN.position.set(0, 2.0, -h/2 + 0.1);
        wallN.castShadow = true;
        wallN.receiveShadow = true;
        group.add(wallN);

        // West wall
        var wallW = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.0, h), wallMat);
        wallW.position.set(-w/2 + 0.1, 2.0, 0);
        wallW.castShadow = true;
        wallW.receiveShadow = true;
        group.add(wallW);

        // East wall
        var wallE = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.0, h), wallMat);
        wallE.position.set(w/2 - 0.1, 2.0, 0);
        wallE.castShadow = true;
        wallE.receiveShadow = true;
        group.add(wallE);

        // South wall with entrance gap
        var gapW = Math.min(4.0, w * 0.35);
        var sideWallW = (w - gapW) / 2;

        var wallSLeft = new THREE.Mesh(new THREE.BoxGeometry(sideWallW, 4.0, 0.2), wallMat);
        wallSLeft.position.set(-w/2 + sideWallW/2, 2.0, h/2 - 0.1);
        wallSLeft.castShadow = true;
        wallSLeft.receiveShadow = true;
        group.add(wallSLeft);

        var wallSRight = new THREE.Mesh(new THREE.BoxGeometry(sideWallW, 4.0, 0.2), wallMat);
        wallSRight.position.set(w/2 - sideWallW/2, 2.0, h/2 - 0.1);
        wallSRight.castShadow = true;
        wallSRight.receiveShadow = true;
        group.add(wallSRight);

        // Beam above door gap
        var beam = new THREE.Mesh(new THREE.BoxGeometry(gapW, 0.8, 0.2), wallMat);
        beam.position.set(0, 3.6, h/2 - 0.1);
        beam.castShadow = true;
        beam.receiveShadow = true;
        group.add(beam);

        // Flat concrete roof slab
        if (showTechos) {
          var roof = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.2, 0.15, h + 0.2),
            new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7 })
          );
          roof.position.y = 4.075;
          roof.castShadow = true;
          group.add(roof);
        }
      }
      
    } else if (elem.type === 'garden') {
      // Grass patch
      var grass = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.02, h),
        new THREE.MeshStandardMaterial({ color: COLORS.grass, roughness: 0.9 })
      );
      grass.position.y = 0.01;
      grass.receiveShadow = true;
      group.add(grass);

      // Add a couple of trees
      var trunkGeom = new THREE.CylinderGeometry(0.1, 0.15, 2.0, 8);
      var trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
      var foliageGeom = new THREE.SphereGeometry(0.8, 8, 8);
      var foliageMat = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.8 });

      var tree1 = new THREE.Group();
      tree1.position.set(-w * 0.25, 1.0, -h * 0.2);
      var tr1 = new THREE.Mesh(trunkGeom, trunkMat);
      var fol1 = new THREE.Mesh(foliageGeom, foliageMat);
      fol1.position.y = 1.2;
      tree1.add(tr1);
      tree1.add(fol1);
      group.add(tree1);

      var tree2 = new THREE.Group();
      tree2.position.set(w * 0.25, 1.0, h * 0.2);
      var tr2 = new THREE.Mesh(trunkGeom, trunkMat);
      var fol2 = new THREE.Mesh(foliageGeom, foliageMat);
      fol2.position.y = 1.2;
      tree2.add(tr2);
      tree2.add(fol2);
      group.add(tree2);

    } else if (elem.type === 'pool') {
      // Pool basin
      var border = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.2, h),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4 })
      );
      border.position.y = 0.1;
      group.add(border);

      // Water surface
      var water = new THREE.Mesh(
        new THREE.BoxGeometry(w - 0.4, 0.02, h - 0.4),
        new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: 0.1, metalness: 0.8 })
      );
      water.position.y = 0.18;
      group.add(water);

    } else if (elem.type === 'fountain') {
      // Fountain base ring
      var basin = new THREE.Mesh(
        new THREE.CylinderGeometry(w/2, w/2, 0.4, 16),
        new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.7 })
      );
      basin.position.y = 0.2;
      basin.castShadow = true;
      group.add(basin);

      // Water plane
      var fWater = new THREE.Mesh(
        new THREE.CylinderGeometry(w/2 - 0.1, w/2 - 0.1, 0.02, 16),
        new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: 0.1, metalness: 0.6 })
      );
      fWater.position.y = 0.36;
      group.add(fWater);

      // Foutain central column
      var col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.2, 1.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x78716c })
      );
      col.position.y = 0.8;
      col.castShadow = true;
      group.add(col);

    } else if (elem.type === 'chapel') {
      // Chapel floor
      var cFloor = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.04, h),
        new THREE.MeshStandardMaterial({ color: 0xe7e5e4, roughness: 0.8 })
      );
      cFloor.position.y = 0.02;
      group.add(cFloor);

      // Altar table
      var altar = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.9, 0.8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
      );
      altar.position.set(0, 0.47, -h/2 + 1.2);
      altar.castShadow = true;
      group.add(altar);

      // Wooden cross on wall/altar
      var crossH = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.08), new THREE.MeshStandardMaterial({ color: 0x451a03 }));
      crossH.position.set(0, 1.6, -h/2 + 0.1);
      group.add(crossH);

      var crossV = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.08), new THREE.MeshStandardMaterial({ color: 0x451a03 }));
      crossV.position.set(0, 1.5, -h/2 + 0.1);
      group.add(crossV);

    } else if (elem.type === 'kitchen' || elem.type === 'bar_area') {
      // Counter top block
      var base = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.9, h),
        new THREE.MeshStandardMaterial({ color: colorNum, roughness: 0.6 })
      );
      base.position.y = 0.45;
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);

      // Top surface
      var top = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.05, 0.06, h + 0.05),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })
      );
      top.position.y = 0.93;
      group.add(top);

    } else if (elem.type === 'terrain') {
      // Base Terrain element placed in the scene (flat 0.005m slab)
      var terrainMesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.005, h),
        new THREE.MeshStandardMaterial({ color: colorNum, roughness: 0.9 })
      );
      terrainMesh.position.y = 0.0025;
      terrainMesh.receiveShadow = true;
      group.add(terrainMesh);

    } else if (elem.type === 'stage') {
      // Stage platform elevated 40cm
      var stagePlatform = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.4, h),
        new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.8 })
      );
      stagePlatform.position.y = 0.2;
      stagePlatform.castShadow = true;
      stagePlatform.receiveShadow = true;
      group.add(stagePlatform);

      // Truss structure at the back of the stage
      var trussMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.2 });
      var trussRadius = 0.05;
      
      // Left vertical truss pillar
      var trussL = new THREE.Mesh(
        new THREE.CylinderGeometry(trussRadius, trussRadius, 3.0, 8),
        trussMat
      );
      trussL.position.set(-w / 2 + 0.15, 1.9, -h / 2 + 0.15);
      trussL.castShadow = true;
      group.add(trussL);

      // Right vertical truss pillar
      var trussR = new THREE.Mesh(
        new THREE.CylinderGeometry(trussRadius, trussRadius, 3.0, 8),
        trussMat
      );
      trussR.position.set(w / 2 - 0.15, 1.9, -h / 2 + 0.15);
      trussR.castShadow = true;
      group.add(trussR);

      // Horizontal cross truss beam
      var trussBeam = new THREE.Mesh(
        new THREE.CylinderGeometry(trussRadius, trussRadius, w - 0.3, 8),
        trussMat
      );
      trussBeam.rotation.z = Math.PI / 2;
      trussBeam.position.set(0, 3.4, -h / 2 + 0.15);
      trussBeam.castShadow = true;
      group.add(trussBeam);

    } else if (elem.type === 'kids_area') {
      // Colourful foam rubber play mat floor
      var playMat = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.02, h),
        new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.9 })
      );
      playMat.position.y = 0.01;
      playMat.receiveShadow = true;
      group.add(playMat);

      // Simple colourful toy blocks scattered
      var blockMat1 = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.8 }); // blue
      var blockMat2 = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.8 }); // yellow
      
      var block1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), blockMat1);
      block1.position.set(-w * 0.2, 0.31, -h * 0.1);
      block1.castShadow = true;
      group.add(block1);

      var block2 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.8, 12), blockMat2);
      block2.position.set(w * 0.2, 0.41, h * 0.15);
      block2.castShadow = true;
      group.add(block2);

    } else if (elem.type === 'lobby_reception') {
      // Lobby ground floor
      var lobbyFloor = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.02, h),
        new THREE.MeshStandardMaterial({ color: 0xe4e4e7, roughness: 0.5 })
      );
      lobbyFloor.position.y = 0.01;
      lobbyFloor.receiveShadow = true;
      group.add(lobbyFloor);

      // Reception counter desk in the middle
      var deskMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.6 });
      var desk = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.5, 1.0, 0.6),
        deskMat
      );
      desk.position.set(0, 0.51, -h * 0.1);
      desk.castShadow = true;
      group.add(desk);

      // Glass divider panel on desk
      var glassMat = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.5, roughness: 0.1 });
      var divider = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.5 - 0.1, 0.4, 0.02),
        glassMat
      );
      divider.position.set(0, 1.21, -h * 0.1);
      group.add(divider);

    } else if (elem.type === 'parking') {
      // Asphalt floor
      var asphalt = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.02, h),
        new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.9 })
      );
      asphalt.position.y = 0.01;
      asphalt.receiveShadow = true;
      group.add(asphalt);

      // White parking lines
      var whiteLineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
      var numSpaces = Math.max(2, Math.floor(w / 2.5));
      var spaceW = w / numSpaces;
      for (var pi = 1; pi < numSpaces; pi++) {
        var px = -w / 2 + pi * spaceW;
        var pLine = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.002, h * 0.8),
          whiteLineMat
        );
        pLine.position.set(px, 0.021, 0);
        group.add(pLine);
      }

    } else if (elem.type === 'terrace') {
      // Wooden deck floor
      var deck = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.04, h),
        new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.7 })
      );
      deck.position.y = 0.02;
      deck.receiveShadow = true;
      group.add(deck);

      // Perimeter wooden railing (simple bars)
      var railMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
      // Back railing
      var railB = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, 0.06), railMat);
      railB.position.set(0, 0.49, -h/2 + 0.03);
      railB.castShadow = true;
      group.add(railB);

      // Left railing
      var railL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, h), railMat);
      railL.position.set(-w/2 + 0.03, 0.49, 0);
      railL.castShadow = true;
      group.add(railL);

      // Right railing
      var railR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, h), railMat);
      railR.position.set(w/2 - 0.03, 0.49, 0);
      railR.castShadow = true;
      group.add(railR);

    } else if (elem.type === 'waterfall') {
      // Stone back wall
      var stoneWallMat = new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.9 });
      var backWall = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, 0.3),
        stoneWallMat
      );
      backWall.position.set(0, h/2, -0.15);
      backWall.castShadow = true;
      group.add(backWall);

      // Blue translucent water flow sheet in front of the wall
      var waterMat = new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        roughness: 0.1,
        metalness: 0.8,
        transparent: true,
        opacity: 0.7
      });
      var waterSheet = new THREE.Mesh(
        new THREE.BoxGeometry(w - 0.1, h, 0.05),
        waterMat
      );
      waterSheet.position.set(0, h/2, 0.035);
      group.add(waterSheet);

      // Splash bottom basin
      var basin = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.2, 0.6),
        stoneWallMat
      );
      basin.position.set(0, 0.1, 0.2);
      basin.castShadow = true;
      group.add(basin);

      var basinWater = new THREE.Mesh(
        new THREE.BoxGeometry(w - 0.1, 0.05, 0.5),
        waterMat
      );
      basinWater.position.set(0, 0.175, 0.2);
      group.add(basinWater);

    } else {
      _buildGenericBox(group, elem, colorNum, 1.2);
    }
  }

  // ─── 2. Accesses ──────────────────────────────────────────
  function _buildAccess(group, elem) {
    var w = elem.w;
    var h = elem.h;
    var colorNum = parseColor(elem.color);
    var showTechos = _getLayerVisibility('techos');

    if (elem.type.indexOf('door') === 0) {
      // Simple gate pillars
      var pilGeom = new THREE.BoxGeometry(0.4, 2.2, 0.4);
      var pilMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
      
      var pilL = new THREE.Mesh(pilGeom, pilMat);
      pilL.position.set(-w/2, 1.1, 0);
      pilL.castShadow = true;
      group.add(pilL);

      var pilR = new THREE.Mesh(pilGeom, pilMat);
      pilR.position.set(w/2, 1.1, 0);
      pilR.castShadow = true;
      group.add(pilR);

      // Translucent gate door
      var gateMat = new THREE.MeshStandardMaterial({
        color: colorNum,
        transparent: true,
        opacity: 0.4,
        roughness: 0.2
      });
      var gate = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 1.8, 0.06), gateMat);
      gate.position.set(0, 0.9, 0);
      group.add(gate);

    } else if (elem.type === 'bathroom') {
      // Restroom building block
      var bldg = new THREE.Mesh(
        new THREE.BoxGeometry(w, 2.5, h),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 })
      );
      bldg.position.y = 1.25;
      bldg.castShadow = true;
      bldg.receiveShadow = true;
      group.add(bldg);

      // Roof slab
      if (showTechos) {
        var roof = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.2, 0.15, h + 0.2),
          new THREE.MeshStandardMaterial({ color: 0x1e293b })
        );
        roof.position.y = 2.55;
        group.add(roof);
      }

    } else if (elem.type === 'ramp') {
      // Sloped Plane
      var rampMesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.05, h),
        new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 })
      );
      rampMesh.rotation.x = -Math.PI / 18; // sloped
      rampMesh.position.y = 0.1;
      rampMesh.receiveShadow = true;
      group.add(rampMesh);

    } else if (elem.type === 'stairs') {
      // 3 steps
      var stepMat = new THREE.MeshStandardMaterial({ color: 0x475569 });
      for (var s = 0; s < 3; s++) {
        var sw = w;
        var sh = 0.15;
        var sd = h * (1 - s * 0.3);
        
        var step = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), stepMat);
        step.position.set(0, sh/2 + s * sh, -s * (h*0.15));
        step.castShadow = true;
        step.receiveShadow = true;
        group.add(step);
      }

    } else if (elem.type === 'street') {
      // Street asphalt
      var street = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.02, h),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 })
      );
      street.position.y = 0.01;
      street.receiveShadow = true;
      group.add(street);

      // Yellow lines
      var yellowLine = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.03, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xeab308 })
      );
      yellowLine.position.set(0, 0.021, 0);
      group.add(yellowLine);

    } else if (elem.type === 'gate_large') {
      // Large vehicle gate with pillars and horizontal bars
      var gatePillarMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.7 });
      var gatePillarGeom = new THREE.BoxGeometry(0.5, 2.5, 0.5);

      var gatePilL = new THREE.Mesh(gatePillarGeom, gatePillarMat);
      gatePilL.position.set(-w / 2 + 0.25, 1.25, 0);
      gatePilL.castShadow = true;
      group.add(gatePilL);

      var gatePilR = new THREE.Mesh(gatePillarGeom, gatePillarMat);
      gatePilR.position.set(w / 2 - 0.25, 1.25, 0);
      gatePilR.castShadow = true;
      group.add(gatePilR);

      // Horizontal bars
      var gateBarMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.7 });
      var gateSpan = w - 0.5;
      for (var gb = 0; gb < 5; gb++) {
        var gateBar = new THREE.Mesh(
          new THREE.BoxGeometry(gateSpan, 0.06, 0.06),
          gateBarMat
        );
        gateBar.position.set(0, 0.3 + gb * 0.5, 0);
        gateBar.castShadow = true;
        group.add(gateBar);
      }

      // Ground rail strip
      var gateRail = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.03, 0.15),
        new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6, metalness: 0.5 })
      );
      gateRail.position.set(0, 0.015, 0);
      gateRail.receiveShadow = true;
      group.add(gateRail);

    } else {
      _buildGenericBox(group, elem, colorNum, 0.8);
    }
  }

  // ─── 3. Furniture ─────────────────────────────────────────
  function _buildFurniture(group, elem) {
    var w = elem.w;
    var h = elem.h;
    var colorNum = parseColor(elem.color);
    var isCircle = elem.shape === 'circle';
    var numChairs = elem.chairs || 0;

    // A) Table top (rendered with tablecloth or custom natural material)
    var tableTop;
    var clothMat;
    var legMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.7, roughness: 0.3 });
    
    var isSinMantel = elem.mesaConfig && elem.mesaConfig.mantelColor === 'sin_mantel';
    if (isSinMantel) {
      if (elem.type.indexOf('campirana') > -1 || elem.type.indexOf('rectangular') > -1) {
        // Wood texture/color (rough wooden board)
        clothMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7, metalness: 0.05 });
        // Wood legs instead of metal legs for campirana/rustic table
        legMat = new THREE.MeshStandardMaterial({ color: 0x5c2c06, roughness: 0.8 });
      } else if (elem.type.indexOf('marble') > -1) {
        // Marble white/gray
        clothMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.15, metalness: 0.05 });
      } else {
        // Fallback to table natural color (plastic/fiberglass)
        clothMat = new THREE.MeshStandardMaterial({ color: colorNum, roughness: 0.5 });
      }
    } else {
      var mantelHex = (elem.mesaConfig && elem.mesaConfig.mantelColor)
        ? getHexColor(elem.mesaConfig.mantelColor, colorNum)
        : colorNum;
      clothMat = new THREE.MeshStandardMaterial({ color: mantelHex, roughness: 0.4 });
    }

    if (isCircle) {
      tableTop = new THREE.Mesh(new THREE.CylinderGeometry(w/2, w/2, 0.05, 24), clothMat);
      tableTop.position.y = 0.75;
      tableTop.castShadow = true;
      group.add(tableTop);

      // Central leg column
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.72, 8), legMat);
      leg.position.y = 0.36;
      leg.castShadow = true;
      group.add(leg);

      // Table runner (Camino de mesa)
      if (elem.mesaConfig && elem.mesaConfig.caminoColor && elem.mesaConfig.caminoColor !== 'ninguno') {
        var runnerMat = new THREE.MeshStandardMaterial({
          color: getHexColor(elem.mesaConfig.caminoColor, 0xc9a96e),
          roughness: 0.5
        });
        var runner = new THREE.Mesh(new THREE.BoxGeometry(w, 0.002, 0.4), runnerMat);
        runner.position.y = 0.776;
        group.add(runner);
      }

      // Tableware
      if (elem.mesaConfig) {
        _addTablewareRadial(group, w/2, numChairs, elem.mesaConfig);
      }

      // Radial chairs
      _addChairsRadial(group, w/2 + 0.18, numChairs, 0.75);

    } else if (elem.shape === 'square' || elem.shape === 'rect') {
      tableTop = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, h), clothMat);
      tableTop.position.y = 0.75;
      tableTop.castShadow = true;
      group.add(tableTop);

      // 4 legs at corners
      var legGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.72, 8);
      var offsets = [
        { x: -w/2 + 0.1, z: -h/2 + 0.1 },
        { x: w/2 - 0.1, z: -h/2 + 0.1 },
        { x: -w/2 + 0.1, z: h/2 - 0.1 },
        { x: w/2 - 0.1, z: h/2 - 0.1 }
      ];
      offsets.forEach(function (off) {
        var tLeg = new THREE.Mesh(legGeom, legMat);
        tLeg.position.set(off.x, 0.36, off.z);
        tLeg.castShadow = true;
        group.add(tLeg);
      });

      // Table runner (Camino de mesa)
      if (elem.mesaConfig && elem.mesaConfig.caminoColor && elem.mesaConfig.caminoColor !== 'ninguno') {
        var runnerMat = new THREE.MeshStandardMaterial({
          color: getHexColor(elem.mesaConfig.caminoColor, 0xc9a96e),
          roughness: 0.5
        });
        var runner = new THREE.Mesh(new THREE.BoxGeometry(w, 0.002, 0.4), runnerMat);
        runner.position.y = 0.776;
        group.add(runner);
      }

      // Sweetheart or honor table special chairs & tableware
      if (elem.type === 'table_honor_bride' || elem.type === 'table_honor_xv') {
        _addChairsLine(group, -h/2 - 0.18, w, numChairs, 0.75, 0); // facing North
        if (elem.mesaConfig) {
          _addTablewareLine(group, -h/2 + 0.12, w, numChairs, elem.mesaConfig, 0);
        }
      } else {
        // Standard rectangular table chairs & tableware on long edges
        var chairsPerSide = Math.floor(numChairs / 2);
        if (chairsPerSide > 0) {
          _addChairsLine(group, -h/2 - 0.18, w, chairsPerSide, 0.75, 0); // Side 1
          _addChairsLine(group, h/2 + 0.18, w, chairsPerSide, 0.75, Math.PI); // Side 2
          if (elem.mesaConfig) {
            _addTablewareLine(group, -h/2 + 0.12, w, chairsPerSide, elem.mesaConfig, 0);
            _addTablewareLine(group, h/2 - 0.12, w, chairsPerSide, elem.mesaConfig, Math.PI);
          }
        }
      }

    } else if (elem.type === 'table_imperial') {
      // Long rectangular table
      tableTop = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, h), clothMat);
      tableTop.position.y = 0.75;
      tableTop.castShadow = true;
      group.add(tableTop);

      // Support legs (every 2.4 meters)
      var numLegPairs = Math.max(2, Math.ceil(w / 2.4));
      var legG = new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8);
      for (var li = 0; li < numLegPairs; li++) {
        var lx = -w/2 + (w / (numLegPairs - 1)) * li;
        var legL = new THREE.Mesh(legG, legMat);
        legL.position.set(lx, 0.36, -h/2 + 0.1);
        group.add(legL);

        var legR = new THREE.Mesh(legG, legMat);
        legR.position.set(lx, 0.36, h/2 - 0.1);
        group.add(legR);
      }

      // Table runner (Camino de mesa)
      if (elem.mesaConfig && elem.mesaConfig.caminoColor && elem.mesaConfig.caminoColor !== 'ninguno') {
        var runnerMat = new THREE.MeshStandardMaterial({
          color: getHexColor(elem.mesaConfig.caminoColor, 0xc9a96e),
          roughness: 0.5
        });
        var runner = new THREE.Mesh(new THREE.BoxGeometry(w, 0.002, 0.4), runnerMat);
        runner.position.y = 0.776;
        group.add(runner);
      }

      // Chairs and tableware on both long edges
      var sideChairs = Math.floor(numChairs / 2);
      _addChairsLine(group, -h/2 - 0.18, w, sideChairs, 0.75, 0); // Top side
      _addChairsLine(group, h/2 + 0.18, w, sideChairs, 0.75, Math.PI); // Bottom side
      if (elem.mesaConfig) {
        _addTablewareLine(group, -h/2 + 0.12, w, sideChairs, elem.mesaConfig, 0);
        _addTablewareLine(group, h/2 - 0.12, w, sideChairs, elem.mesaConfig, Math.PI);
      }

    } else if (elem.type === 'table_umbrella') {
      // Table
      tableTop = new THREE.Mesh(new THREE.CylinderGeometry(w/2, w/2, 0.05, 16), clothMat);
      tableTop.position.y = 0.75;
      group.add(tableTop);

      // Umbrella pole
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.6, 8), legMat);
      pole.position.y = 1.3;
      group.add(pole);

      // Table runner (Camino de mesa)
      if (elem.mesaConfig && elem.mesaConfig.caminoColor && elem.mesaConfig.caminoColor !== 'ninguno') {
        var runnerMat = new THREE.MeshStandardMaterial({
          color: getHexColor(elem.mesaConfig.caminoColor, 0xc9a96e),
          roughness: 0.5
        });
        var runner = new THREE.Mesh(new THREE.BoxGeometry(w, 0.002, 0.4), runnerMat);
        runner.position.y = 0.776;
        group.add(runner);
      }

      // Tableware
      if (elem.mesaConfig) {
        _addTablewareRadial(group, w/2, numChairs, elem.mesaConfig);
      }

      // Umbrella cone canvas
      var canvasMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 });
      var canvas = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.4, 0.6, 12, 1, true), canvasMat);
      canvas.position.y = 2.3;
      canvas.castShadow = true;
      group.add(canvas);

      // Radial chairs
      _addChairsRadial(group, w/2 + 0.18, numChairs, 0.75);

    } else if (elem.type === 'lounge_set') {
      // Lounge sofa sets (U-shaped arrangement around table)
      var sofaColor = parseColor(elem.color);
      var sofaMat = new THREE.MeshStandardMaterial({ color: sofaColor, roughness: 0.7 });

      // Left sofa
      var sofaL = _buildSofa(w * 0.25, 0.85, h - 0.6, sofaMat);
      sofaL.position.set(-w/2 + w*0.15, 0.35, 0);
      sofaL.rotation.y = Math.PI / 2;
      group.add(sofaL);

      // Right sofa
      var sofaR = _buildSofa(w * 0.25, 0.85, h - 0.6, sofaMat);
      sofaR.position.set(w/2 - w*0.15, 0.35, 0);
      sofaR.rotation.y = -Math.PI / 2;
      group.add(sofaR);

      // Center coffee table
      var coffeeTable = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.4, 0.4, h * 0.4),
        new THREE.MeshStandardMaterial({ color: COLORS.woodDark, roughness: 0.5 })
      );
      coffeeTable.position.set(0, 0.2, 0);
      coffeeTable.castShadow = true;
      group.add(coffeeTable);

    } else if (elem.type === 'table_periquera') {
      // High bar table with cylindrical pedestal
      var perMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.8, roughness: 0.2 });

      // Circular foot base
      var perBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.04, 16), perMat);
      perBase.position.y = 0.02;
      perBase.castShadow = true;
      perBase.receiveShadow = true;
      group.add(perBase);

      // Thin cylindrical pedestal
      var perPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.06, 8), perMat);
      perPedestal.position.y = 0.57;
      perPedestal.castShadow = true;
      group.add(perPedestal);

      // Small round top
      var perTopMat = new THREE.MeshStandardMaterial({ color: colorNum, roughness: 0.4 });
      var perTop = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.04, 24), perTopMat);
      perTop.position.y = 1.12;
      perTop.castShadow = true;
      group.add(perTop);

    } else if (elem.type === 'table_buffet') {
      // Buffet table with chafing dishes
      var bufTableMat = new THREE.MeshStandardMaterial({ color: colorNum, roughness: 0.4 });
      var bufLegMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.7, roughness: 0.3 });

      // Table top
      var bufTop = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, h), bufTableMat);
      bufTop.position.y = 0.8;
      bufTop.castShadow = true;
      bufTop.receiveShadow = true;
      group.add(bufTop);

      // 4 legs at corners
      var bufLegGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.77, 8);
      var bufOffsets = [
        { x: -w / 2 + 0.1, z: -h / 2 + 0.1 },
        { x: w / 2 - 0.1, z: -h / 2 + 0.1 },
        { x: -w / 2 + 0.1, z: h / 2 - 0.1 },
        { x: w / 2 - 0.1, z: h / 2 - 0.1 }
      ];
      bufOffsets.forEach(function(off) {
        var bLeg = new THREE.Mesh(bufLegGeom, bufLegMat);
        bLeg.position.set(off.x, 0.385, off.z);
        bLeg.castShadow = true;
        group.add(bLeg);
      });

      // 3 chafing dishes on top (stainless steel)
      var chaferMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.85, roughness: 0.15 });
      var chaferSpacing = w / 4;
      for (var ci = -1; ci <= 1; ci++) {
        // Tray base
        var chaferBase = new THREE.Mesh(new THREE.BoxGeometry(w * 0.22, 0.04, h * 0.5), chaferMat);
        chaferBase.position.set(ci * chaferSpacing, 0.845, 0);
        chaferBase.castShadow = true;
        group.add(chaferBase);

        // Lid (half cylinder approximation using a flattened box with rounded top)
        var chaferLid = new THREE.Mesh(new THREE.BoxGeometry(w * 0.20, 0.08, h * 0.45), chaferMat);
        chaferLid.position.set(ci * chaferSpacing, 0.905, 0);
        chaferLid.castShadow = true;
        group.add(chaferLid);

        // Handle knob on lid
        var knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), chaferMat);
        knob.position.set(ci * chaferSpacing, 0.955, 0);
        knob.castShadow = true;
        group.add(knob);
      }

    } else if (elem.type === 'table_cake') {
      // Cake table with 3-tier wedding cake
      var cakeTableMat = new THREE.MeshStandardMaterial({ color: colorNum, roughness: 0.4 });
      var cakeLegMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.7, roughness: 0.3 });

      // Table top
      var cakeTop = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, h), cakeTableMat);
      cakeTop.position.y = 0.75;
      cakeTop.castShadow = true;
      cakeTop.receiveShadow = true;
      group.add(cakeTop);

      // 4 legs
      var cakeLegGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.72, 8);
      var cakeLegOffs = [
        { x: -w / 2 + 0.1, z: -h / 2 + 0.1 },
        { x: w / 2 - 0.1, z: -h / 2 + 0.1 },
        { x: -w / 2 + 0.1, z: h / 2 - 0.1 },
        { x: w / 2 - 0.1, z: h / 2 - 0.1 }
      ];
      cakeLegOffs.forEach(function(off) {
        var ckLeg = new THREE.Mesh(cakeLegGeom, cakeLegMat);
        ckLeg.position.set(off.x, 0.36, off.z);
        ckLeg.castShadow = true;
        group.add(ckLeg);
      });

      // 3-tier wedding cake
      var cakeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
      var cakeGold = new THREE.MeshStandardMaterial({ color: COLORS.gold, metalness: 0.6, roughness: 0.3 });

      // Bottom tier
      var tier1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 24), cakeWhite);
      tier1.position.set(0, 0.845, 0);
      tier1.castShadow = true;
      group.add(tier1);
      // Gold band
      var band1 = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.015, 24), cakeGold);
      band1.position.set(0, 0.78, 0);
      group.add(band1);

      // Middle tier
      var tier2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 24), cakeWhite);
      tier2.position.set(0, 0.975, 0);
      tier2.castShadow = true;
      group.add(tier2);
      // Gold band
      var band2 = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.015, 24), cakeGold);
      band2.position.set(0, 0.92, 0);
      group.add(band2);

      // Top tier
      var tier3 = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.10, 24), cakeWhite);
      tier3.position.set(0, 1.085, 0);
      tier3.castShadow = true;
      group.add(tier3);
      // Gold band
      var band3 = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.015, 24), cakeGold);
      band3.position.set(0, 1.04, 0);
      group.add(band3);

      // Topper sphere
      var topper = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), cakeGold);
      topper.position.set(0, 1.165, 0);
      topper.castShadow = true;
      group.add(topper);

    } else if (elem.type === 'table_gifts') {
      // Gift table with gift boxes
      var giftTableMat = new THREE.MeshStandardMaterial({ color: colorNum, roughness: 0.4 });
      var giftLegMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.7, roughness: 0.3 });

      // Table top
      var giftTop = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, h), giftTableMat);
      giftTop.position.y = 0.75;
      giftTop.castShadow = true;
      giftTop.receiveShadow = true;
      group.add(giftTop);

      // 4 legs
      var giftLegGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.72, 8);
      var giftLegOffs = [
        { x: -w / 2 + 0.1, z: -h / 2 + 0.1 },
        { x: w / 2 - 0.1, z: -h / 2 + 0.1 },
        { x: -w / 2 + 0.1, z: h / 2 - 0.1 },
        { x: w / 2 - 0.1, z: h / 2 - 0.1 }
      ];
      giftLegOffs.forEach(function(off) {
        var gLeg = new THREE.Mesh(giftLegGeom, giftLegMat);
        gLeg.position.set(off.x, 0.36, off.z);
        gLeg.castShadow = true;
        group.add(gLeg);
      });

      // Gift boxes with different sizes and colors
      var giftColors = [
        { color: COLORS.gold, w: 0.18, h: 0.16, d: 0.18, x: -0.25, z: -0.08 },
        { color: COLORS.pink, w: 0.14, h: 0.12, d: 0.14, x: 0.10, z: 0.10 },
        { color: 0x7c3aed, w: 0.16, h: 0.20, d: 0.16, x: 0.30, z: -0.05 },
        { color: COLORS.gold, w: 0.12, h: 0.10, d: 0.12, x: -0.05, z: 0.12 }
      ];
      giftColors.forEach(function(g) {
        var gMat = new THREE.MeshStandardMaterial({ color: g.color, roughness: 0.4 });
        var gBox = new THREE.Mesh(new THREE.BoxGeometry(g.w, g.h, g.d), gMat);
        gBox.position.set(g.x, 0.775 + g.h / 2, g.z);
        gBox.castShadow = true;
        group.add(gBox);

        // Ribbon on top
        var ribbonMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
        var ribbon = new THREE.Mesh(new THREE.BoxGeometry(g.w + 0.01, 0.015, 0.025), ribbonMat);
        ribbon.position.set(g.x, 0.775 + g.h + 0.007, g.z);
        group.add(ribbon);
      });

    } else if (elem.type === 'table_candy') {
      // Candy bar table with glass jars
      var candyTableMat = new THREE.MeshStandardMaterial({ color: colorNum, roughness: 0.4 });
      var candyLegMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.7, roughness: 0.3 });

      // Table top
      var candyTop = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, h), candyTableMat);
      candyTop.position.y = 0.75;
      candyTop.castShadow = true;
      candyTop.receiveShadow = true;
      group.add(candyTop);

      // 4 legs
      var candyLegGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.72, 8);
      var candyLegOffs = [
        { x: -w / 2 + 0.1, z: -h / 2 + 0.1 },
        { x: w / 2 - 0.1, z: -h / 2 + 0.1 },
        { x: -w / 2 + 0.1, z: h / 2 - 0.1 },
        { x: w / 2 - 0.1, z: h / 2 - 0.1 }
      ];
      candyLegOffs.forEach(function(off) {
        var cLeg = new THREE.Mesh(candyLegGeom, candyLegMat);
        cLeg.position.set(off.x, 0.36, off.z);
        cLeg.castShadow = true;
        group.add(cLeg);
      });

      // Glass jars (transparent look)
      var glassMat = new THREE.MeshStandardMaterial({
        color: 0xe0f2fe,
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.45
      });
      var jarPositions = [
        { x: -0.30, z: 0, r: 0.07, jarH: 0.20 },
        { x: -0.05, z: 0.05, r: 0.08, jarH: 0.24 },
        { x: 0.20, z: -0.03, r: 0.06, jarH: 0.18 },
        { x: 0.40, z: 0.04, r: 0.07, jarH: 0.22 }
      ];
      jarPositions.forEach(function(jp) {
        // Jar body (open cylinder)
        var jar = new THREE.Mesh(
          new THREE.CylinderGeometry(jp.r, jp.r, jp.jarH, 16, 1, true),
          glassMat
        );
        jar.position.set(jp.x, 0.775 + jp.jarH / 2, jp.z);
        jar.castShadow = true;
        group.add(jar);

        // Jar bottom disc
        var jarBottom = new THREE.Mesh(
          new THREE.CylinderGeometry(jp.r, jp.r, 0.005, 16),
          glassMat
        );
        jarBottom.position.set(jp.x, 0.7775, jp.z);
        group.add(jarBottom);

        // Candy fill inside (opaque colored cylinder)
        var candyFillMat = new THREE.MeshStandardMaterial({
          color: [0xf472b6, 0x60a5fa, 0xfbbf24, 0xa78bfa][Math.floor(Math.random() * 4)],
          roughness: 0.6
        });
        var fill = new THREE.Mesh(
          new THREE.CylinderGeometry(jp.r - 0.01, jp.r - 0.01, jp.jarH * 0.6, 16),
          candyFillMat
        );
        fill.position.set(jp.x, 0.775 + jp.jarH * 0.3, jp.z);
        group.add(fill);
      });

    } else if (elem.type === 'table_kids') {
      // Kids table — small, low, colorful
      var kidsTopMat = new THREE.MeshStandardMaterial({ color: colorNum, roughness: 0.4 });
      var kidsLegMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.7, roughness: 0.3 });

      // Short table top at 0.55m
      var kidsTop = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, h), kidsTopMat);
      kidsTop.position.y = 0.55;
      kidsTop.castShadow = true;
      kidsTop.receiveShadow = true;
      group.add(kidsTop);

      // 4 short legs
      var kidsLegGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.53, 8);
      var kidsLegOffs = [
        { x: -w / 2 + 0.08, z: -h / 2 + 0.08 },
        { x: w / 2 - 0.08, z: -h / 2 + 0.08 },
        { x: -w / 2 + 0.08, z: h / 2 - 0.08 },
        { x: w / 2 - 0.08, z: h / 2 - 0.08 }
      ];
      kidsLegOffs.forEach(function(off) {
        var kLeg = new THREE.Mesh(kidsLegGeom, kidsLegMat);
        kLeg.position.set(off.x, 0.265, off.z);
        kLeg.castShadow = true;
        group.add(kLeg);
      });

    } else if (elem.type === 'table_honor_king') {
      // Two ornate imperial thrones side by side (no table)
      var throneMat = new THREE.MeshStandardMaterial({ color: COLORS.gold, metalness: 0.6, roughness: 0.3 });
      var throneVelvet = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.8 });

      for (var ti = -1; ti <= 1; ti += 2) {
        var throneX = ti * 0.4;

        // Seat
        var tSeat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.50), throneVelvet);
        tSeat.position.set(throneX, 0.42, 0);
        tSeat.castShadow = true;
        group.add(tSeat);

        // Seat base / frame
        var tBase = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.39, 0.55), throneMat);
        tBase.position.set(throneX, 0.195, 0);
        tBase.castShadow = true;
        group.add(tBase);

        // High backrest
        var tBack = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.95, 0.06), throneMat);
        tBack.position.set(throneX, 0.925, 0.25);
        tBack.castShadow = true;
        group.add(tBack);

        // Backrest velvet padding
        var tBackPad = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.85, 0.03), throneVelvet);
        tBackPad.position.set(throneX, 0.895, 0.22);
        group.add(tBackPad);

        // Backrest crown / arch top
        var tCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 16, 1, false, 0, Math.PI), throneMat);
        tCrown.rotation.z = Math.PI / 2;
        tCrown.rotation.y = Math.PI / 2;
        tCrown.position.set(throneX, 1.40, 0.25);
        tCrown.castShadow = true;
        group.add(tCrown);

        // Left armrest
        var tArmL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.45), throneMat);
        tArmL.position.set(throneX - 0.28, 0.575, 0.02);
        tArmL.castShadow = true;
        group.add(tArmL);

        // Right armrest
        var tArmR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.45), throneMat);
        tArmR.position.set(throneX + 0.28, 0.575, 0.02);
        tArmR.castShadow = true;
        group.add(tArmR);

        // Armrest top pads
        var armTopGeom = new THREE.BoxGeometry(0.08, 0.04, 0.48);
        var tArmTopL = new THREE.Mesh(armTopGeom, throneMat);
        tArmTopL.position.set(throneX - 0.28, 0.70, 0.02);
        group.add(tArmTopL);
        var tArmTopR = new THREE.Mesh(armTopGeom, throneMat);
        tArmTopR.position.set(throneX + 0.28, 0.70, 0.02);
        group.add(tArmTopR);
      }

    } else if (elem.type === 'table_shots') {
      // Shots cart with wheels, handle, and bottles
      var cartMat = new THREE.MeshStandardMaterial({ color: colorNum, roughness: 0.4 });
      var cartMetalMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.8, roughness: 0.2 });

      // Cart surface
      var cartTop = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, h), cartMat);
      cartTop.position.y = 0.90;
      cartTop.castShadow = true;
      cartTop.receiveShadow = true;
      group.add(cartTop);

      // Lower shelf
      var cartShelf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.03, h - 0.06), cartMat);
      cartShelf.position.y = 0.45;
      cartShelf.castShadow = true;
      group.add(cartShelf);

      // 4 legs connecting shelves
      var cartLegGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.86, 8);
      var cartLegOffs = [
        { x: -w / 2 + 0.06, z: -h / 2 + 0.06 },
        { x: w / 2 - 0.06, z: -h / 2 + 0.06 },
        { x: -w / 2 + 0.06, z: h / 2 - 0.06 },
        { x: w / 2 - 0.06, z: h / 2 - 0.06 }
      ];
      cartLegOffs.forEach(function(off) {
        var crtLeg = new THREE.Mesh(cartLegGeom, cartMetalMat);
        crtLeg.position.set(off.x, 0.47, off.z);
        crtLeg.castShadow = true;
        group.add(crtLeg);
      });

      // 4 small wheels at corners
      var wheelGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12);
      cartLegOffs.forEach(function(off) {
        var wheel = new THREE.Mesh(wheelGeom, cartMetalMat);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(off.x, 0.04, off.z);
        wheel.castShadow = true;
        group.add(wheel);
      });

      // Handle bar on one end (along -z side)
      var handleBar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, w - 0.10, 8), cartMetalMat);
      handleBar.rotation.z = Math.PI / 2;
      handleBar.position.set(0, 1.10, -h / 2 + 0.04);
      handleBar.castShadow = true;
      group.add(handleBar);

      // Handle uprights
      var handleUpGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.20, 8);
      var hUpL = new THREE.Mesh(handleUpGeom, cartMetalMat);
      hUpL.position.set(-w / 2 + 0.10, 1.0, -h / 2 + 0.04);
      group.add(hUpL);
      var hUpR = new THREE.Mesh(handleUpGeom, cartMetalMat);
      hUpR.position.set(w / 2 - 0.10, 1.0, -h / 2 + 0.04);
      group.add(hUpR);

      // Small bottles on top (row of thin cylinders)
      var bottleMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.3, metalness: 0.2 });
      var numBottles = Math.max(3, Math.floor(w / 0.08));
      var bottleSpacing = (w - 0.16) / (numBottles - 1);
      for (var bi = 0; bi < numBottles; bi++) {
        var bx = -w / 2 + 0.08 + bi * bottleSpacing;
        var bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.14, 8), bottleMat);
        bottle.position.set(bx, 0.99, 0);
        bottle.castShadow = true;
        group.add(bottle);

        // Bottle cap
        var capMat = new THREE.MeshStandardMaterial({ color: COLORS.metal, metalness: 0.8, roughness: 0.2 });
        var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.02, 8), capMat);
        cap.position.set(bx, 1.07, 0);
        group.add(cap);
      }

    } else {
      _buildGenericBox(group, elem, colorNum, 0.85);
    }
  }

  // Sofa building utility
  function _buildSofa(sw, sh, sd, mat) {
    var g = new THREE.Group();
    // Seat base
    var seat = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.3, sd), mat);
    seat.position.y = 0.15;
    seat.castShadow = true;
    g.add(seat);

    // Backrest
    var back = new THREE.Mesh(new THREE.BoxGeometry(0.12, sh, sd), mat);
    back.position.set(-sw/2 + 0.06, sh/2, 0);
    back.castShadow = true;
    g.add(back);

    return g;
  }

  // ─── 4. Entertainment ─────────────────────────────────────
  function _buildEntertainment(group, elem) {
    var w = elem.w;
    var h = elem.h;
    var colorNum = parseColor(elem.color);

    if (elem.type.indexOf('dancefloor') === 0) {
      // Dancefloor deck
      var deck = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.08, h),
        new THREE.MeshStandardMaterial({ color: colorNum, roughness: 0.2, metalness: 0.2 })
      );
      deck.position.y = 0.04;
      deck.receiveShadow = true;
      group.add(deck);

      // Gold bevel border
      var border = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.08, 0.09, h + 0.08),
        new THREE.MeshStandardMaterial({ color: COLORS.gold, metalness: 0.8 })
      );
      border.position.y = 0.045;
      group.add(border);

      // Pixel grids
      if (elem.type === 'dancefloor_pixel') {
        var gridHelper = new THREE.GridHelper(w, Math.floor(w), 0xec4899, 0x8b5cf6);
        gridHelper.position.set(0, 0.085, 0);
        group.add(gridHelper);
      }

    } else if (elem.type === 'dj_booth') {
      // DJ table / facade
      var facade = new THREE.Mesh(
        new THREE.BoxGeometry(w, 1.0, h),
        new THREE.MeshStandardMaterial({ color: colorNum, roughness: 0.5 })
      );
      facade.position.y = 0.5;
      facade.castShadow = true;
      group.add(facade);

      // DJ controllers
      var mixer = new THREE.Mesh(new THREE.BoxGeometry(w*0.5, 0.05, h*0.6), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
      mixer.position.set(0, 1.025, 0);
      group.add(mixer);

      // DJ laptop
      var laptop = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0xd1d5db }));
      laptop.position.set(w * 0.25, 1.15, 0);
      laptop.rotation.x = -Math.PI / 6;
      group.add(laptop);

    } else if (elem.type === 'giant_letters') {
      // Lit Giant Letters "XV" / "LOVE"
      var lMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
      
      // Let's create block shape letters procedural placeholder (4 boxes representing blocks)
      var numChars = 4;
      var charW = w / numChars;
      for (var c = 0; c < numChars; c++) {
        var charBox = new THREE.Mesh(new THREE.BoxGeometry(charW * 0.7, 1.5, 0.2), lMat);
        charBox.position.set(-w/2 + charW * (c + 0.5), 0.75, 0);
        charBox.castShadow = true;
        group.add(charBox);

        // Lit bulb pointlight on each letter
        var light = new THREE.PointLight(0xffedd5, 0.3, 3);
        light.position.set(-w/2 + charW * (c + 0.5), 1.0, 0.2);
        group.add(light);
      }

    } else if (elem.type === 'sparklers') {
      // Sparkler column (chispero)
      var sparklerBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.12, 0.3, 8),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 })
      );
      sparklerBase.position.y = 0.15;
      sparklerBase.castShadow = true;
      group.add(sparklerBase);

      // Glowing spark visual (orange cylinder)
      var sparkMat = new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.7 });
      var sparks = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.2, 2.0, 8, 1, true), sparkMat);
      sparks.position.y = 1.15;
      group.add(sparks);

    } else if (elem.type === 'limo') {
      // Long Limo body
      var limoMat = new THREE.MeshStandardMaterial({ color: colorNum, roughness: 0.2, metalness: 0.8 });
      
      // Chassis
      var carBody = new THREE.Mesh(new THREE.BoxGeometry(w, 0.8, h), limoMat);
      carBody.position.y = 0.5;
      carBody.castShadow = true;
      group.add(carBody);

      // Cabin top
      var cab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.5, h * 0.9), limoMat);
      cab.position.set(w * 0.05, 1.15, 0);
      cab.castShadow = true;
      group.add(cab);

      // Cylinder wheels
      var wheelG = new THREE.CylinderGeometry(0.25, 0.25, 0.15, 12);
      wheelG.rotateX(Math.PI / 2); // align wheel axial
      var wheelMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.9 });

      var wheelOffsets = [
        { x: -w/2 + 0.6, z: -h/2 }, { x: -w/2 + 0.6, z: h/2 },
        { x: w/2 - 0.6, z: -h/2 }, { x: w/2 - 0.6, z: h/2 },
        { x: 0, z: -h/2 }, { x: 0, z: h/2 }
      ];
      wheelOffsets.forEach(function (off) {
        var wh = new THREE.Mesh(wheelG, wheelMat);
        wh.position.set(off.x, 0.25, off.z);
        wh.castShadow = true;
        group.add(wh);
      });

    } else if (elem.type === 'photobooth_360') {
      // 360 photo platform
      var pb360Disc = new THREE.Mesh(
        new THREE.CylinderGeometry(w / 2, w / 2, 0.08, 24),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 })
      );
      pb360Disc.position.y = 0.04;
      pb360Disc.receiveShadow = true;
      group.add(pb360Disc);

      // Central vertical pole
      var pb360Pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 2.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.2, metalness: 0.8 })
      );
      pb360Pole.position.y = 1.33;
      pb360Pole.castShadow = true;
      group.add(pb360Pole);

      // Camera arm (horizontal bar)
      var pb360Arm = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.05, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.2, metalness: 0.8 })
      );
      pb360Arm.position.set(0.6, 2.55, 0);
      pb360Arm.castShadow = true;
      group.add(pb360Arm);

      // Camera box at end of arm
      var pb360Cam = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.1, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.5 })
      );
      pb360Cam.position.set(1.2, 2.52, 0);
      pb360Cam.castShadow = true;
      group.add(pb360Cam);

    } else if (elem.type === 'photobooth_mirror') {
      // Selfie mirror – black border frame
      var mirrorFrame = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.8, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.5 })
      );
      mirrorFrame.position.y = 0.9;
      mirrorFrame.castShadow = true;
      group.add(mirrorFrame);

      // Reflective white front surface
      var mirrorFace = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 1.6, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.05, metalness: 0.9 })
      );
      mirrorFace.position.set(0, 0.9, 0.06);
      group.add(mirrorFace);

    } else if (elem.type === 'photobooth_inflatable') {
      // Inflatable booth – box structure
      var infColor = colorNum || 0x8b5cf6;
      var infMat = new THREE.MeshStandardMaterial({ color: infColor, roughness: 0.7 });

      var infBody = new THREE.Mesh(
        new THREE.BoxGeometry(w, 2.2, h),
        infMat
      );
      infBody.position.y = 1.1;
      infBody.castShadow = true;
      group.add(infBody);

      // Rounded top half-sphere
      var infTop = new THREE.Mesh(
        new THREE.SphereGeometry(Math.min(w, h) / 2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        infMat
      );
      infTop.position.y = 2.2;
      infTop.castShadow = true;
      group.add(infTop);

    } else if (elem.type === 'heart_illuminated') {
      // LED heart – two lobes + cone pointing down
      var heartMat = new THREE.MeshStandardMaterial({
        color: 0xff0000, roughness: 0.4,
        emissive: 0xff0000, emissiveIntensity: 0.5
      });

      var heartLobeL = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 12, 12),
        heartMat
      );
      heartLobeL.position.set(-0.22, 1.3, 0);
      heartLobeL.castShadow = true;
      group.add(heartLobeL);

      var heartLobeR = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 12, 12),
        heartMat
      );
      heartLobeR.position.set(0.22, 1.3, 0);
      heartLobeR.castShadow = true;
      group.add(heartLobeR);

      var heartCone = new THREE.Mesh(
        new THREE.ConeGeometry(0.42, 0.8, 12),
        heartMat
      );
      heartCone.position.set(0, 0.7, 0);
      heartCone.rotation.z = Math.PI; // point down
      heartCone.castShadow = true;
      group.add(heartCone);

      // Red point light inside
      var heartLight = new THREE.PointLight(0xff0000, 0.6, 4);
      heartLight.position.set(0, 1.0, 0);
      group.add(heartLight);

    } else if (elem.type === 'red_carpet') {
      // Flat red carpet
      var carpet = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.02, h),
        new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.8 })
      );
      carpet.position.y = 0.01;
      carpet.receiveShadow = true;
      group.add(carpet);

      // Gold border strips on long edges
      var carpetBorderMat = new THREE.MeshStandardMaterial({ color: COLORS.gold, metalness: 0.7 });
      var carpetBorderL = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.025, h),
        carpetBorderMat
      );
      carpetBorderL.position.set(-w / 2, 0.012, 0);
      group.add(carpetBorderL);

      var carpetBorderR = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.025, h),
        carpetBorderMat
      );
      carpetBorderR.position.set(w / 2, 0.012, 0);
      group.add(carpetBorderR);

    } else if (elem.type === 'robot_led') {
      // LED robot – cylindrical body
      var robotMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.1, metalness: 0.9 });

      var robotBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 1.5, 12),
        robotMat
      );
      robotBody.position.y = 0.75;
      robotBody.castShadow = true;
      group.add(robotBody);

      // Sphere head
      var robotHead = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 12),
        robotMat
      );
      robotHead.position.y = 1.68;
      robotHead.castShadow = true;
      group.add(robotHead);

      // Small colored point light inside
      var robotLight = new THREE.PointLight(0x00ffff, 0.5, 3);
      robotLight.position.set(0, 1.0, 0);
      group.add(robotLight);

    } else if (elem.type === 'projector_screen') {
      // Thin white rectangular screen panel
      var screenPanel = new THREE.Mesh(
        new THREE.BoxGeometry(w, 2.0, 0.04),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })
      );
      screenPanel.position.y = 1.2;
      screenPanel.castShadow = true;
      group.add(screenPanel);

      // Black border frame around screen
      var screenBorderMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.7 });
      // Top border
      var scrBorderTop = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.06, 0.06), screenBorderMat);
      scrBorderTop.position.set(0, 2.23, 0);
      group.add(scrBorderTop);
      // Bottom border
      var scrBorderBot = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.06, 0.06), screenBorderMat);
      scrBorderBot.position.set(0, 0.17, 0);
      group.add(scrBorderBot);
      // Left border
      var scrBorderL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.12, 0.06), screenBorderMat);
      scrBorderL.position.set(-w / 2 - 0.01, 1.2, 0);
      group.add(scrBorderL);
      // Right border
      var scrBorderR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.12, 0.06), screenBorderMat);
      scrBorderR.position.set(w / 2 + 0.01, 1.2, 0);
      group.add(scrBorderR);

      // Two tripod legs angled behind
      var tripodMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 });
      var tripodLegGeom = new THREE.CylinderGeometry(0.025, 0.025, 2.0, 6);

      var tripodL = new THREE.Mesh(tripodLegGeom, tripodMat);
      tripodL.position.set(-w / 3, 0.9, -0.4);
      tripodL.rotation.x = 0.2;
      tripodL.castShadow = true;
      group.add(tripodL);

      var tripodR = new THREE.Mesh(tripodLegGeom, tripodMat);
      tripodR.position.set(w / 3, 0.9, -0.4);
      tripodR.rotation.x = 0.2;
      tripodR.castShadow = true;
      group.add(tripodR);

    } else if (elem.type === 'photo_firma') {
      // Easel with photo – two angled legs
      var easelMat = new THREE.MeshStandardMaterial({ color: COLORS.woodDark || 0x78350f, roughness: 0.8 });
      var easelLegGeom = new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6);

      var easelLegL = new THREE.Mesh(easelLegGeom, easelMat);
      easelLegL.position.set(-0.25, 0.8, 0.1);
      easelLegL.rotation.z = 0.12;
      easelLegL.castShadow = true;
      group.add(easelLegL);

      var easelLegR = new THREE.Mesh(easelLegGeom, easelMat);
      easelLegR.position.set(0.25, 0.8, 0.1);
      easelLegR.rotation.z = -0.12;
      easelLegR.castShadow = true;
      group.add(easelLegR);

      // Rear support leg
      var easelBack = new THREE.Mesh(easelLegGeom, easelMat);
      easelBack.position.set(0, 0.7, -0.25);
      easelBack.rotation.x = -0.3;
      easelBack.castShadow = true;
      group.add(easelBack);

      // Canvas / photo panel
      var canvasPanel = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 1.0, 0.03),
        new THREE.MeshStandardMaterial({ color: colorNum || 0xf8fafc, roughness: 0.4 })
      );
      canvasPanel.position.set(0, 1.1, 0.08);
      canvasPanel.castShadow = true;
      group.add(canvasPanel);

    } else if (elem.type === 'showmen_inflatables') {
      // Inflatable showman – tall tapered body
      var showmanColor = colorNum || 0xf97316;
      var showmanMat = new THREE.MeshStandardMaterial({ color: showmanColor, roughness: 0.7 });

      var showmanBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.45, 2.5, 12),
        showmanMat
      );
      showmanBody.position.y = 1.25;
      showmanBody.castShadow = true;
      group.add(showmanBody);

      // Sphere head
      var showmanHead = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 12, 12),
        showmanMat
      );
      showmanHead.position.y = 2.75;
      showmanHead.castShadow = true;
      group.add(showmanHead);

      // Waving arm
      var showmanArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6),
        showmanMat
      );
      showmanArm.position.set(0.4, 2.3, 0);
      showmanArm.rotation.z = -Math.PI / 4;
      showmanArm.castShadow = true;
      group.add(showmanArm);

    } else {
      _buildGenericBox(group, elem, colorNum, 0.8);
    }
  }

  // ─── 5. Decoration ────────────────────────────────────────
  function _buildDecoration(group, elem) {
    var w = elem.w;
    var h = elem.h;
    var colorNum = parseColor(elem.color);

    if (elem.type.indexOf('centerpiece') === 0) {
      // Vase cylinder
      var vase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8),
        new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.1, transparent: true, opacity: 0.6 })
      );
      vase.position.y = 0.95; // sits on table
      group.add(vase);

      // Flowers sphere
      var flowers = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 8, 8),
        new THREE.MeshStandardMaterial({ color: colorNum, roughness: 0.9 })
      );
      flowers.position.set(0, 1.2, 0);
      group.add(flowers);

    } else if (elem.type.indexOf('arch') > -1) {
      // Flower arch archway
      var archMat = new THREE.MeshStandardMaterial({ color: colorNum, roughness: 0.8 });
      var archWidth = w;
      var archHeight = h;
      
      // Procedural frame (arch composed of pillars and a top box)
      var colL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, archHeight, 8), archMat);
      colL.position.set(-archWidth/2, archHeight/2, 0);
      colL.castShadow = true;
      group.add(colL);

      var colR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, archHeight, 8), archMat);
      colR.position.set(archWidth/2, archHeight/2, 0);
      colR.castShadow = true;
      group.add(colR);

      var topBar = new THREE.Mesh(new THREE.BoxGeometry(archWidth + 0.24, 0.24, 0.24), archMat);
      topBar.position.set(0, archHeight, 0);
      topBar.castShadow = true;
      group.add(topBar);

    } else if (elem.type === 'shrub') {
      // Green decorative foliage sphere
      var shrubMesh = new THREE.Mesh(
        new THREE.SphereGeometry(w/2, 12, 12),
        new THREE.MeshStandardMaterial({ color: COLORS.grass, roughness: 0.95 })
      );
      shrubMesh.position.y = w/2;
      shrubMesh.castShadow = true;
      group.add(shrubMesh);

    } else if (elem.type === 'tree_decor') {
      // Procedural decorative tree
      var trunkH = h * 0.6;
      var trunkR = w * 0.08;
      var trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(trunkR * 0.8, trunkR, trunkH, 8),
        new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 })
      );
      trunk.position.y = trunkH / 2;
      trunk.castShadow = true;
      group.add(trunk);

      var folR = w * 0.45;
      var foliage = new THREE.Mesh(
        new THREE.SphereGeometry(folR, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.8 })
      );
      foliage.position.y = trunkH + folR * 0.7;
      foliage.castShadow = true;
      group.add(foliage);

    } else if (elem.type === 'backdrop') {
      // Photo backdrop – tall vertical panel
      var bdColor = colorNum || 0xd1d5db;
      var bdPanel = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, 0.05),
        new THREE.MeshStandardMaterial({ color: bdColor, roughness: 0.6 })
      );
      bdPanel.position.y = h / 2;
      bdPanel.castShadow = true;
      group.add(bdPanel);

      // Two support legs angled behind
      var bdLegMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 });
      var bdLegGeom = new THREE.CylinderGeometry(0.03, 0.03, h * 0.9, 6);

      var bdLegL = new THREE.Mesh(bdLegGeom, bdLegMat);
      bdLegL.position.set(-w / 3, h * 0.4, -0.35);
      bdLegL.rotation.x = -0.25;
      bdLegL.castShadow = true;
      group.add(bdLegL);

      var bdLegR = new THREE.Mesh(bdLegGeom, bdLegMat);
      bdLegR.position.set(w / 3, h * 0.4, -0.35);
      bdLegR.rotation.x = -0.25;
      bdLegR.castShadow = true;
      group.add(bdLegR);

    } else {
      _buildGenericBox(group, elem, colorNum, 1.5);
    }
  }

  // ─── 6. Providers ─────────────────────────────────────────
  function _buildProvider(group, elem) {
    var w = elem.w;
    var h = elem.h;
    var colorNum = parseColor(elem.color);

    if (elem.type === 'vendor_paletas') {
      // Paletas La Princesa pushcart
      var cartMat = new THREE.MeshStandardMaterial({ color: 0xfbcfe8, roughness: 0.5 }); // pink
      var cartBody = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, h), cartMat);
      cartBody.position.y = 0.5;
      cartBody.castShadow = true;
      group.add(cartBody);

      // Cart handle
      var handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, h + 0.2), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
      handle.position.set(-w/2 - 0.04, 0.7, 0);
      group.add(handle);

      // Cart wheels
      var whG = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12);
      whG.rotateX(Math.PI / 2);
      var whMat = new THREE.MeshStandardMaterial({ color: 0x1f2937 });
      
      var whL = new THREE.Mesh(whG, whMat);
      whL.position.set(w * 0.2, 0.2, -h/2);
      group.add(whL);

      var whR = new THREE.Mesh(whG, whMat);
      whR.position.set(w * 0.2, 0.2, h/2);
      group.add(whR);

      // Sign post with mini umbrella
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0xd1d5db }));
      pole.position.set(0, 1.4, 0);
      group.add(pole);

      var canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.8, 0.3, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      canopy.position.y = 2.0;
      canopy.castShadow = true;
      group.add(canopy);

    } else if (elem.type === 'vendor_taquiza') {
      // Food stall stand
      var stallBase = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.9, h),
        new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 })
      );
      stallBase.position.y = 0.45;
      stallBase.castShadow = true;
      group.add(stallBase);

      // Metal pans on top
      var panG = new THREE.BoxGeometry(w * 0.25, 0.08, h * 0.5);
      var panMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.2 });
      
      for (var pIdx = 0; pIdx < 3; pIdx++) {
        var pan = new THREE.Mesh(panG, panMat);
        pan.position.set(-w * 0.3 + w * 0.3 * pIdx, 0.94, 0);
        group.add(pan);
      }

    } else if (elem.type === 'vendor_mariachi') {
      // Mariachi space – semi-circular arrangement of standing figures
      var mariFigMat = new THREE.MeshStandardMaterial({ color: 0xc9a96e, roughness: 0.6 });
      var mariCount = 5;
      for (var mi = 0; mi < mariCount; mi++) {
        var mariAngle = Math.PI * (mi / (mariCount - 1)) - Math.PI / 2;
        var mariRadius = w / 3;
        var mariX = Math.cos(mariAngle) * mariRadius;
        var mariZ = Math.sin(mariAngle) * mariRadius;

        // Body cylinder
        var mariBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.1, 1.6, 8),
          mariFigMat
        );
        mariBody.position.set(mariX, 0.8, mariZ);
        mariBody.castShadow = true;
        group.add(mariBody);

        // Head sphere
        var mariHead = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 8, 8),
          mariFigMat
        );
        mariHead.position.set(mariX, 1.75, mariZ);
        mariHead.castShadow = true;
        group.add(mariHead);
      }

    } else if (elem.type === 'vendor_banda') {
      // Live band – raised platform
      var bandaPlatform = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.15, h),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
      );
      bandaPlatform.position.y = 0.075;
      bandaPlatform.receiveShadow = true;
      group.add(bandaPlatform);

      // Standing figures
      var bandaFigMat = new THREE.MeshStandardMaterial({ color: 0xc9a96e, roughness: 0.6 });
      var bandaPositions = [
        { x: -w * 0.3, z: 0 }, { x: -w * 0.1, z: 0 },
        { x: w * 0.1, z: 0 }, { x: w * 0.3, z: -h * 0.15 }
      ];
      for (var bi = 0; bi < bandaPositions.length; bi++) {
        var bBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.1, 1.6, 8),
          bandaFigMat
        );
        bBody.position.set(bandaPositions[bi].x, 0.95, bandaPositions[bi].z);
        bBody.castShadow = true;
        group.add(bBody);

        var bHead = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 8, 8),
          bandaFigMat
        );
        bHead.position.set(bandaPositions[bi].x, 1.9, bandaPositions[bi].z);
        bHead.castShadow = true;
        group.add(bHead);
      }

      // Drum set on the right side
      var drumMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.4 });
      var drumBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 0.5, 12),
        drumMat
      );
      drumBase.position.set(w * 0.35, 0.4, h * 0.2);
      drumBase.castShadow = true;
      group.add(drumBase);

      var drumSmall = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.3, 10),
        drumMat
      );
      drumSmall.position.set(w * 0.4, 0.65, h * 0.3);
      drumSmall.castShadow = true;
      group.add(drumSmall);

      // Speaker boxes on edges
      var speakerMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.8 });
      var speakerL = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.5, 0.35),
        speakerMat
      );
      speakerL.position.set(-w / 2 + 0.25, 0.4, -h / 2 + 0.2);
      speakerL.castShadow = true;
      group.add(speakerL);

      var speakerR = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.5, 0.35),
        speakerMat
      );
      speakerR.position.set(w / 2 - 0.25, 0.4, -h / 2 + 0.2);
      speakerR.castShadow = true;
      group.add(speakerR);

    } else if (elem.type === 'vendor_saxo') {
      // Saxophonist – single standing figure
      var saxoFigMat = new THREE.MeshStandardMaterial({ color: 0xc9a96e, roughness: 0.6 });

      var saxoBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 1.6, 8),
        saxoFigMat
      );
      saxoBody.position.y = 0.8;
      saxoBody.castShadow = true;
      group.add(saxoBody);

      var saxoHead = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 8, 8),
        saxoFigMat
      );
      saxoHead.position.y = 1.75;
      saxoHead.castShadow = true;
      group.add(saxoHead);

      // Spotlight above
      var saxoLight = new THREE.PointLight(0xffedd5, 0.6, 4);
      saxoLight.position.set(0, 2.5, 0);
      group.add(saxoLight);

    } else if (elem.type === 'vendor_generic') {
      // Generic vendor booth / stall
      // Back wall panel
      var vendorWallMat = new THREE.MeshStandardMaterial({ color: colorNum || 0x475569, roughness: 0.7 });
      var vendorWall = new THREE.Mesh(
        new THREE.BoxGeometry(w, 2.0, 0.08),
        vendorWallMat
      );
      vendorWall.position.set(0, 1.0, -h / 2 + 0.04);
      vendorWall.castShadow = true;
      group.add(vendorWall);

      // Counter at 0.9m height
      var vendorCounter = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.08, h),
        new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 })
      );
      vendorCounter.position.set(0, 0.9, 0);
      vendorCounter.castShadow = true;
      vendorCounter.receiveShadow = true;
      group.add(vendorCounter);

      // Counter front panel
      var vendorFront = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.9, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 })
      );
      vendorFront.position.set(0, 0.45, h / 2 - 0.025);
      vendorFront.castShadow = true;
      group.add(vendorFront);

      // Small canopy / awning on top
      var vendorCanopy = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.2, 0.05, h + 0.3),
        new THREE.MeshStandardMaterial({ color: colorNum || 0x475569, roughness: 0.5 })
      );
      vendorCanopy.position.set(0, 2.1, 0.1);
      vendorCanopy.castShadow = true;
      group.add(vendorCanopy);

    } else {
      _buildGenericBox(group, elem, colorNum, 1.0);
    }
  }

  // ─── Utility Builders ─────────────────────────────────────
  function _buildGenericBox(group, elem, color, heightVal) {
    var w = elem.w;
    var h = elem.h || w;
    var shape = elem.shape || 'rect';

    var geom;
    if (shape === 'circle') {
      geom = new THREE.CylinderGeometry(w/2, w/2, heightVal, 16);
    } else {
      geom = new THREE.BoxGeometry(w, heightVal, h);
    }

    var mat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.7,
      metalness: 0.1
    });

    var mesh = new THREE.Mesh(geom, mat);
    mesh.position.y = heightVal / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Add chairs radially around a central point
  function _addChairsRadial(group, radius, numChairs, tableHeight) {
    if (numChairs <= 0) return;

    var seatGeom = new THREE.BoxGeometry(0.36, 0.08, 0.36);
    var seatMat = new THREE.MeshStandardMaterial({ color: COLORS.chairSeat, roughness: 0.6 });
    
    var backGeom = new THREE.BoxGeometry(0.36, 0.42, 0.06);
    var legGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8);
    var woodMat = new THREE.MeshStandardMaterial({ color: COLORS.chairWood, roughness: 0.8 });

    var chairHeight = 0.42; // seat height

    for (var i = 0; i < numChairs; i++) {
      var angle = (i * 2 * Math.PI) / numChairs;
      
      var cg = new THREE.Group();
      
      // Radial position offset
      cg.position.set(
        Math.sin(angle) * radius,
        0,
        Math.cos(angle) * radius
      );

      // Rotate chair to face table center
      cg.rotation.y = angle + Math.PI;

      // Seat cushion
      var seat = new THREE.Mesh(seatGeom, seatMat);
      seat.position.y = chairHeight;
      seat.castShadow = true;
      cg.add(seat);

      // Backrest
      var back = new THREE.Mesh(backGeom, woodMat);
      back.position.set(0, chairHeight + 0.21, 0.15);
      back.castShadow = true;
      cg.add(back);

      // 4 legs
      var legOffs = [
        { x: -0.15, z: -0.15 }, { x: 0.15, z: -0.15 },
        { x: -0.15, z: 0.15 }, { x: 0.15, z: 0.15 }
      ];
      legOffs.forEach(function (off) {
        var leg = new THREE.Mesh(legGeom, woodMat);
        leg.position.set(off.x, 0.2, off.z);
        leg.castShadow = true;
        cg.add(leg);
      });

      group.add(cg);
    }
  }

  // Add chairs along a straight line (axial)
  function _addChairsLine(group, offsetZ, totalWidth, numChairs, tableHeight, chairRotY) {
    if (numChairs <= 0) return;

    var seatGeom = new THREE.BoxGeometry(0.36, 0.08, 0.36);
    var seatMat = new THREE.MeshStandardMaterial({ color: COLORS.chairSeat });
    var backGeom = new THREE.BoxGeometry(0.36, 0.42, 0.06);
    var legGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8);
    var woodMat = new THREE.MeshStandardMaterial({ color: COLORS.chairWood });

    var chairHeight = 0.42;

    var step = totalWidth / (numChairs);
    for (var i = 0; i < numChairs; i++) {
      var cx = -totalWidth/2 + step * (i + 0.5);

      var cg = new THREE.Group();
      cg.position.set(cx, 0, offsetZ);
      cg.rotation.y = chairRotY;

      // Cushion
      var seat = new THREE.Mesh(seatGeom, seatMat);
      seat.position.y = chairHeight;
      seat.castShadow = true;
      cg.add(seat);

      // Backrest
      var back = new THREE.Mesh(backGeom, woodMat);
      back.position.set(0, chairHeight + 0.21, 0.15);
      back.castShadow = true;
      cg.add(back);

      // Legs
      var legOffs = [
        { x: -0.15, z: -0.15 }, { x: 0.15, z: -0.15 },
        { x: -0.15, z: 0.15 }, { x: 0.15, z: 0.15 }
      ];
      legOffs.forEach(function (off) {
        var leg = new THREE.Mesh(legGeom, woodMat);
        leg.position.set(off.x, 0.2, off.z);
        leg.castShadow = true;
        cg.add(leg);
      });

      group.add(cg);
    }
  }

  function setExposure(val) {
    if (_renderer) {
      _renderer.toneMappingExposure = val;
    }
  }

  // ─── Public API ───────────────────────────────────────────
  return {
    init: init,
    syncWithData: syncWithData,
    sync: syncWithData,
    selectElement: selectElement,
    select: selectElement,
    deselect: function () { selectElement(null); },
    resetCamera: resetCamera,
    setTerrain: setTerrain,
    setLighting: setLighting,
    setExposure: setExposure,
    resize: _onResize,
    destroy: destroy
  };
})();

console.log('[visualizer3d] Visualizer3D module loaded.');
