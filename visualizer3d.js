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
    _currentElements = (typeof initialElements === 'function') ? initialElements() : (initialElements || []);
    
    var state = getState ? getState() : {};
    _terrain = state.terrain || { w: 50, h: 60 };

    _container.innerHTML = '';

    // 1. Scene
    _scene = new THREE.Scene();
    _scene.background = new THREE.Color(0x0a0f1d); // Midnight dark theme
    _scene.fog = new THREE.FogExp2(0x0a0f1d, 0.015);

    // 2. Camera
    var aspect = _container.clientWidth / _container.clientHeight;
    _camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    _camera.position.set(_terrain.w / 2, Math.max(_terrain.w, _terrain.h) * 0.75, _terrain.h * 1.1);

    // 3. Renderer
    _renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    _renderer.setSize(_container.clientWidth, _container.clientHeight);
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
    var width = _container.clientWidth;
    var height = _container.clientHeight;
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

      var group = _active3dElements[elem.id];
      var needsRebuild = false;

      if (group) {
        // Check if properties changed
        if (group.userData.w !== elem.w ||
            group.userData.h !== elem.h ||
            group.userData.chairs !== elem.chairs ||
            group.userData.color !== elem.color ||
            group.userData.type !== elem.type) {
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
          color: elem.color
        };

        _buildProceduralMesh(group, elem);
        _scene.add(group);
        _active3dElements[elem.id] = group;
      }

      // Update positions (x -> X, y -> Z)
      group.position.set(elem.x, 0, elem.y);
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

    if (elem.type === 'salon') {
      // Floor slab
      var floor = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.04, h),
        new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.5 })
      );
      floor.position.y = 0.02;
      floor.receiveShadow = true;
      group.add(floor);

      // Columns at 4 corners
      var colGeom = new THREE.BoxGeometry(0.3, 4.0, 0.3);
      var colMat = new THREE.MeshStandardMaterial({ color: COLORS.walls, roughness: 0.7 });
      
      var corners = [
        { x: -w/2 + 0.15, z: -h/2 + 0.15 },
        { x: w/2 - 0.15, z: -h/2 + 0.15 },
        { x: -w/2 + 0.15, z: h/2 - 0.15 },
        { x: w/2 - 0.15, z: h/2 - 0.15 }
      ];
      
      corners.forEach(function (pos) {
        var col = new THREE.Mesh(colGeom, colMat);
        col.position.set(pos.x, 2.0, pos.z);
        col.castShadow = true;
        col.receiveShadow = true;
        group.add(col);
      });
      
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
    } else {
      _buildGenericBox(group, elem, colorNum, 1.2);
    }
  }

  // ─── 2. Accesses ──────────────────────────────────────────
  function _buildAccess(group, elem) {
    var w = elem.w;
    var h = elem.h;
    var colorNum = parseColor(elem.color);

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
      var roof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.2, 0.15, h + 0.2),
        new THREE.MeshStandardMaterial({ color: 0x1e293b })
      );
      roof.position.y = 2.55;
      group.add(roof);

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

    // A) Table top (rendered with tablecloth)
    var tableTop;
    var mantelHex = (elem.mesaConfig && elem.mesaConfig.mantelColor)
      ? getHexColor(elem.mesaConfig.mantelColor, colorNum)
      : colorNum;
    var clothMat = new THREE.MeshStandardMaterial({ color: mantelHex, roughness: 0.4 });
    var legMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.7, roughness: 0.3 });

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

    } else if (elem.type.indexOf('arch') > 0) {
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
    destroy: destroy,
    resize: _onResize
  };
})();

console.log('[visualizer3d] Visualizer3D module loaded.');
