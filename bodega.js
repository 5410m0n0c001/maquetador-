// ============================================================
// bodega.js — Modo Bodega del maquetador
// Inventario, dibujo 2D y 3D de los elementos de bodega.
// Se carga después de elements-db.js. Globals, sin módulos.
// ============================================================
(function () {
  'use strict';

  var ALTURA_NIVEL = 3;    // metros entre pisos
  var GROSOR_MESA = 0.08;  // espacio que ocupa cada mesa plegada
  var COLORES_SECCION = ['#F65C7A', '#C9A96E', '#38bdf8', '#34d399', '#a78bfa', '#fb923c'];

  function item(type, name, category, icon, w, h, color, layer, alto, extra) {
    window.ELEMENTS_CATALOG.push(Object.assign({
      type: type, name: name, category: category, icon: icon,
      defaultW: w, defaultH: h, shape: 'rect', color: color,
      defaultChairs: 0, description: name, layer: layer, planoOnly: false,
      bodega: true, alto: alto
    }, extra || {}));
  }

  // ── Inventario ─────────────────────────────────────────────
  item('wh_wall', 'Muro', 'bod_estructura', 'fa-grip-lines', 6, 0.2, '#a8a29e', 'estructuras', 3, { sinEtiqueta: true });
  item('wh_column', 'Columna', 'bod_estructura', 'fa-square', 0.4, 0.4, '#78716c', 'estructuras', 3, { sinEtiqueta: true });
  item('wh_gate', 'Portón de dos puertas', 'bod_estructura', 'fa-warehouse', 4, 0.25, '#475569', 'accesos', 3);
  item('wh_door', 'Puerta de acceso', 'bod_estructura', 'fa-door-open', 1, 0.2, '#92400e', 'accesos', 2.1);
  item('wh_bathroom', 'Baño', 'bod_estructura', 'fa-restroom', 2.5, 2, '#0e7490', 'estructuras', 2.4);
  item('wh_room', 'Habitación', 'bod_estructura', 'fa-bed', 4, 4, '#6d5a8a', 'estructuras', 2.4);

  item('wh_mezzanine', 'Segundo piso interior', 'bod_niveles', 'fa-layer-group', 8, 6, '#64748b', 'estructuras', 1.1, { etiquetaArriba: true });
  item('wh_basement', 'Sótano', 'bod_niveles', 'fa-arrow-down-short-wide', 8, 6, '#57534e', 'estructuras', ALTURA_NIVEL, { etiquetaArriba: true });
  item('wh_stairs', 'Escaleras', 'bod_niveles', 'fa-stairs', 1.2, 3.6, '#94a3b8', 'estructuras', ALTURA_NIVEL);

  item('wh_shelf', 'Repisa', 'bod_almacen', 'fa-table-cells-large', 2.4, 0.6, '#3b82f6', 'mobiliario', 2.2);
  item('wh_cleaning', 'Mini bodega de limpieza', 'bod_almacen', 'fa-pump-soap', 2, 1.5, '#0d9488', 'mobiliario', 2.2);
  item('wh_chair_stack', 'Torre de sillas', 'bod_almacen', 'fa-chair', 0.5, 0.5, '#C9A96E', 'mobiliario', 1.2, { datos: { cantidad: 10 } });
  item('wh_fold_rect', 'Mesas rectangulares plegadas', 'bod_almacen', 'fa-grip-lines-vertical', 2.4, 0.8, '#b45309', 'mobiliario', 1, { datos: { cantidad: 10, plegado: 'largo', medidaL: 2.4, medidaA: 0.8 } });
  item('wh_fold_square', 'Mesas cuadradas plegadas', 'bod_almacen', 'fa-grip-lines-vertical', 1.5, 0.8, '#a16207', 'mobiliario', 1.6, { datos: { cantidad: 10, plegado: 'largo', medidaL: 1.5, medidaA: 1.5 } });
  item('wh_fold_round', 'Mesas redondas plegadas', 'bod_almacen', 'fa-grip-lines-vertical', 1.8, 0.8, '#854d0e', 'mobiliario', 1.9, { datos: { cantidad: 10, plegado: 'largo', medidaL: 1.8, medidaA: 1.8 } });

  item('wh_island', 'Isla de mesas', 'bod_trabajo', 'fa-table-cells', 4.8, 1.6, '#8b6b43', 'mobiliario', 0.8, {
    etiquetaArriba: true,
    datos: { filas: 2, mesaL: 2.4, mesaA: 0.8, secciones: [{ nombre: 'Sección A', columnas: 1 }, { nombre: 'Sección B', columnas: 1 }] }
  });
  item('wh_ironing', 'Mesa de planchado', 'bod_trabajo', 'fa-shirt', 1.4, 0.45, '#60a5fa', 'mobiliario', 0.95);
  item('wh_laundry', 'Área de lavado', 'bod_trabajo', 'fa-faucet-drip', 4, 3, '#0369a1', 'estructuras', 1, { etiquetaArriba: true });
  item('wh_washer', 'Lavadora', 'bod_trabajo', 'fa-soap', 0.7, 0.7, '#cbd5e1', 'mobiliario', 1);
  item('wh_grill', 'Parrilla de cocinar', 'bod_trabajo', 'fa-fire-burner', 1.2, 0.7, '#44403c', 'mobiliario', 1);
  item('wh_fridge', 'Refrigerador', 'bod_trabajo', 'fa-temperature-low', 0.9, 0.8, '#94a3b8', 'mobiliario', 1.8);

  item('wh_truck', 'Camioneta de redil', 'bod_vehiculos', 'fa-truck-pickup', 6, 2.2, '#2563eb', 'mobiliario', 2.4);
  item('wh_car', 'Automóvil', 'bod_vehiculos', 'fa-car', 4.5, 1.8, '#dc2626', 'mobiliario', 1.5);
  item('wh_sala', 'Sala', 'bod_descanso', 'fa-couch', 3, 2.4, '#7c5c43', 'mobiliario', 0.9);

  var CATEGORIAS = {
    bod_estructura: { label: 'Estructura', icon: 'fa-warehouse', color: '#a8a29e' },
    bod_niveles: { label: 'Niveles', icon: 'fa-layer-group', color: '#94a3b8' },
    bod_almacen: { label: 'Almacenaje', icon: 'fa-boxes-stacked', color: '#3b82f6' },
    bod_trabajo: { label: 'Trabajo y cocina', icon: 'fa-screwdriver-wrench', color: '#C9A96E' },
    bod_vehiculos: { label: 'Vehículos', icon: 'fa-truck', color: '#2563eb' },
    bod_descanso: { label: 'Descanso', icon: 'fa-couch', color: '#7c5c43' }
  };
  Object.keys(CATEGORIAS).forEach(function (k) {
    window.ELEMENT_CATEGORIES[k] = CATEGORIAS[k];
    window.CATEGORY_ICONS[k] = CATEGORIAS[k].icon;
    window.CATEGORY_LABELS[k] = CATEGORIAS[k].label;
  });

  // ── Datos de cada elemento ─────────────────────────────────
  function esPlegada(e) { return e.type.indexOf('wh_fold_') === 0; }

  function columnasIsla(e) {
    return (e.secciones || []).reduce(function (s, x) { return s + (parseInt(x.columnas, 10) || 0); }, 0) || 1;
  }

  // Mide el elemento a partir de sus datos (mesas de la isla, mesas plegadas)
  function recalcular(e) {
    if (e.type === 'wh_island') {
      e.w = Math.round(columnasIsla(e) * e.mesaL * 100) / 100;
      e.h = Math.round(e.filas * e.mesaA * 100) / 100;
    } else if (esPlegada(e)) {
      e.w = e.plegado === 'largo' ? e.medidaL : e.medidaA;
      e.h = Math.round(e.cantidad * GROSOR_MESA * 100) / 100;
    }
  }

  // Cuando se cambia el tamaño a mano, los datos siguen a la medida nueva
  function alRedimensionar(e) {
    if (e.type === 'wh_island') {
      e.mesaL = e.w / columnasIsla(e);
      e.mesaA = e.h / (e.filas || 1);
    } else if (esPlegada(e)) {
      if (e.plegado === 'largo') e.medidaL = e.w; else e.medidaA = e.w;
      e.cantidad = Math.max(1, Math.round(e.h / GROSOR_MESA));
    }
  }

  function inicializar(e, cat) {
    if (cat.datos) Object.assign(e, JSON.parse(JSON.stringify(cat.datos)));
    if (e.type === 'wh_mezzanine' && e.nivel < 1) e.nivel = 1;
    if (e.type === 'wh_basement') e.nivel = -1;
    recalcular(e);
  }

  // Altura de una mesa plegada: lo que queda hacia arriba según cómo esté parada
  function altoPlegada(e) { return e.plegado === 'largo' ? e.medidaA : e.medidaL; }

  function etiqueta3D(e, cat) {
    var sub = (Math.round(e.w * 100) / 100) + ' × ' + (Math.round(e.h * 100) / 100) + ' m';
    if (e.type === 'wh_chair_stack') sub = e.cantidad + ' sillas';
    if (esPlegada(e)) sub = e.cantidad + ' mesas · a lo ' + (e.plegado === 'largo' ? 'largo' : 'ancho');
    if (e.type === 'wh_island') sub = (e.secciones || []).map(function (s) { return s.nombre; }).join(' · ');
    return {
      title: e.name || cat.name,
      subtitle: sub,
      colorHex: e.color || cat.color,
      heightOffset: (esPlegada(e) ? altoPlegada(e) : cat.alto) + 0.7
    };
  }

  // En 3D solo se rotula lo que sirve para ubicarse, o lo que ya se renombró
  function llevaEtiqueta3D(e, cat) {
    return e.name !== cat.name || /^(wh_shelf|wh_cleaning|wh_island|wh_mezzanine|wh_basement)$/.test(e.type);
  }

  // Si cambia cualquiera de estos datos, el 3D se vuelve a construir
  function clave3D(e) {
    return JSON.stringify([e.name, e.cantidad, e.plegado, e.medidaL, e.medidaA, e.filas, e.mesaL, e.mesaA, e.secciones]);
  }

  // ── Dibujo 2D ──────────────────────────────────────────────
  function dibujar2D(svgEl, g, e, o) {
    var px = o.px, py = o.py, pw = o.pw, ph = o.ph, m = o.mToPx;
    var x0 = px - pw / 2, y0 = py - ph / 2;
    var NP = { 'pointer-events': 'none' };

    function R(x, y, w, h, fill, stroke, sw, extra) {
      g.appendChild(svgEl('rect', Object.assign({ x: x, y: y, width: w, height: h, fill: fill || 'none', stroke: stroke || 'none', 'stroke-width': sw || 1 }, NP, extra || {})));
    }
    function L(x1, y1, x2, y2, stroke, sw, dash) {
      var a = { x1: x1, y1: y1, x2: x2, y2: y2, stroke: stroke || 'rgba(255,255,255,0.45)', 'stroke-width': sw || 1 };
      if (dash) a['stroke-dasharray'] = dash;
      g.appendChild(svgEl('line', Object.assign(a, NP)));
    }
    function C(cx, cy, r, fill, stroke, sw) {
      g.appendChild(svgEl('circle', Object.assign({ cx: cx, cy: cy, r: r, fill: fill || 'none', stroke: stroke || 'none', 'stroke-width': sw || 1 }, NP)));
    }
    function P(d, stroke, sw, dash) {
      var a = { d: d, fill: 'none', stroke: stroke || 'rgba(255,255,255,0.6)', 'stroke-width': sw || 1 };
      if (dash) a['stroke-dasharray'] = dash;
      g.appendChild(svgEl('path', Object.assign(a, NP)));
    }

    // Base: es la pieza que recibe los clics
    var abierto = /^(wh_mezzanine|wh_basement|wh_laundry)$/.test(e.type);
    g.appendChild(svgEl('rect', {
      x: x0, y: y0, width: pw, height: ph,
      fill: o.color,
      'fill-opacity': abierto ? 0.28 : 0.9,
      stroke: o.selected ? '#F65C7A' : o.light,
      'stroke-width': o.selected ? 2 : 1,
      rx: e.type === 'wh_car' ? Math.min(pw, ph) * 0.25 : 0
    }));

    var i, n, paso;
    switch (e.type) {
      case 'wh_column':
        L(x0, y0, x0 + pw, y0 + ph); L(x0 + pw, y0, x0, y0 + ph);
        break;
      case 'wh_gate':
        L(px, y0, px, y0 + ph, '#fff', 1.5);
        P('M ' + x0 + ' ' + y0 + ' A ' + pw / 2 + ' ' + pw / 2 + ' 0 0 1 ' + px + ' ' + (y0 - pw / 2), null, 1, '4 3');
        P('M ' + (x0 + pw) + ' ' + y0 + ' A ' + pw / 2 + ' ' + pw / 2 + ' 0 0 0 ' + px + ' ' + (y0 - pw / 2), null, 1, '4 3');
        break;
      case 'wh_door':
        P('M ' + x0 + ' ' + y0 + ' L ' + x0 + ' ' + (y0 - pw) + ' A ' + pw + ' ' + pw + ' 0 0 1 ' + (x0 + pw) + ' ' + y0, null, 1, '4 3');
        break;
      case 'wh_bathroom':
        R(x0, y0, pw, ph, null, 'rgba(255,255,255,0.75)', 2.5);
        C(x0 + pw * 0.25, y0 + ph * 0.3, Math.min(pw, ph) * 0.12, '#fff');
        R(x0 + pw * 0.6, y0 + ph * 0.15, pw * 0.28, ph * 0.22, '#e2e8f0');
        break;
      case 'wh_room':
        R(x0, y0, pw, ph, null, 'rgba(255,255,255,0.75)', 2.5);
        R(x0 + pw * 0.1, y0 + ph * 0.1, pw * 0.45, ph * 0.5, 'rgba(255,255,255,0.25)', 'rgba(255,255,255,0.5)');
        R(x0 + pw * 0.14, y0 + ph * 0.13, pw * 0.37, ph * 0.1, 'rgba(255,255,255,0.45)');
        break;
      case 'wh_mezzanine':
        R(x0, y0, pw, ph, null, '#e2e8f0', 2, { 'stroke-dasharray': '10 5' });
        [[x0, y0], [x0 + pw, y0], [x0, y0 + ph], [x0 + pw, y0 + ph]].forEach(function (c) { R(c[0] - 4, c[1] - 4, 8, 8, '#e2e8f0'); });
        break;
      case 'wh_basement':
        R(x0, y0, pw, ph, null, '#d6d3d1', 3);
        L(x0, y0, x0 + pw, y0 + ph, 'rgba(255,255,255,0.18)'); L(x0 + pw, y0, x0, y0 + ph, 'rgba(255,255,255,0.18)');
        break;
      case 'wh_stairs':
        n = Math.max(3, Math.round(e.h / 0.3));
        paso = ph / n;
        for (i = 1; i < n; i++) L(x0, y0 + paso * i, x0 + pw, y0 + paso * i, 'rgba(255,255,255,0.6)');
        P('M ' + px + ' ' + (y0 + ph - paso / 2) + ' L ' + px + ' ' + (y0 + paso) + ' M ' + (px - pw * 0.2) + ' ' + (y0 + paso * 2) + ' L ' + px + ' ' + (y0 + paso) + ' L ' + (px + pw * 0.2) + ' ' + (y0 + paso * 2), '#fff', 1.5);
        break;
      case 'wh_shelf':
        n = Math.max(1, Math.round(e.w / 0.8));
        paso = pw / n;
        for (i = 1; i < n; i++) L(x0 + paso * i, y0, x0 + paso * i, y0 + ph, 'rgba(255,255,255,0.6)');
        L(x0, py, x0 + pw, py, 'rgba(255,255,255,0.3)');
        break;
      case 'wh_cleaning':
        R(x0, y0, pw, ph, null, 'rgba(255,255,255,0.75)', 2.5);
        R(x0, y0, pw, ph * 0.28, 'rgba(255,255,255,0.22)');
        ['#7dd3fc', '#fde047', '#f9a8d4'].forEach(function (c, k) { C(x0 + pw * (0.22 + k * 0.28), y0 + ph * 0.14, Math.min(pw, ph) * 0.07, c); });
        L(x0 + pw * 0.35, y0 + ph, x0 + pw * 0.65, y0 + ph, '#0f172a', 3);
        break;
      case 'wh_chair_stack':
        for (i = 3; i > 0; i--) R(px - pw * i / 8, py - ph * i / 8, pw * i / 4, ph * i / 4, null, 'rgba(255,255,255,0.6)');
        break;
      case 'wh_island':
        var col = 0, cols = columnasIsla(e), anchoCol = pw / cols, filas = e.filas || 1;
        (e.secciones || []).forEach(function (s, k) {
          var c = parseInt(s.columnas, 10) || 0;
          if (!c) return;
          var sx = x0 + col * anchoCol, sw = c * anchoCol;
          R(sx, y0, sw, ph, COLORES_SECCION[k % COLORES_SECCION.length], null, 1, { 'fill-opacity': 0.55 });
          for (var f = 1; f < c; f++) L(sx + f * anchoCol, y0, sx + f * anchoCol, y0 + ph, 'rgba(255,255,255,0.35)');
          if (k) L(sx, y0 - 3, sx, y0 + ph + 3, '#fff', 2.5);
          var t = svgEl('text', Object.assign({
            'class': 'elem-label', x: sx + sw / 2, y: py, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
            fill: '#fff', 'font-size': o.font * 0.85, 'font-family': 'sans-serif', 'font-weight': '600',
            'paint-order': 'stroke', stroke: 'rgba(0,0,0,0.7)', 'stroke-width': 2
          }, NP));
          t.textContent = s.nombre;
          g.appendChild(t);
          col += c;
        });
        for (i = 1; i < filas; i++) L(x0, y0 + ph * i / filas, x0 + pw, y0 + ph * i / filas, 'rgba(255,255,255,0.35)');
        break;
      case 'wh_ironing':
        P('M ' + (x0 + pw) + ' ' + py + ' Q ' + (x0 + pw * 0.8) + ' ' + y0 + ' ' + (x0 + pw * 0.55) + ' ' + y0 + ' M ' + (x0 + pw) + ' ' + py + ' Q ' + (x0 + pw * 0.8) + ' ' + (y0 + ph) + ' ' + (x0 + pw * 0.55) + ' ' + (y0 + ph), '#fff', 1.5);
        break;
      case 'wh_laundry':
        for (i = 1; i <= 3; i++) {
          var wy = y0 + ph * i / 4;
          P('M ' + x0 + ' ' + wy + ' q ' + pw / 8 + ' ' + (-m(0.2)) + ' ' + pw / 4 + ' 0 t ' + pw / 4 + ' 0 t ' + pw / 4 + ' 0 t ' + pw / 4 + ' 0', 'rgba(125,211,252,0.5)');
        }
        break;
      case 'wh_washer':
        C(px, py, Math.min(pw, ph) * 0.33, '#475569', '#1e293b', 2);
        break;
      case 'wh_grill':
        n = Math.max(3, Math.round(e.w / 0.15));
        for (i = 1; i < n; i++) L(x0 + pw * i / n, y0 + 2, x0 + pw * i / n, y0 + ph - 2, '#f97316');
        break;
      case 'wh_fridge':
        L(x0, py, x0 + pw, py, '#1e293b', 1.5);
        L(x0 + pw * 0.85, y0 + ph * 0.15, x0 + pw * 0.85, y0 + ph * 0.4, '#1e293b', 2);
        break;
      case 'wh_truck':
        R(x0 + pw * 0.72, y0 + 1, pw * 0.28 - 1, ph - 2, 'rgba(255,255,255,0.25)', 'rgba(255,255,255,0.6)');
        R(x0 + pw * 0.86, y0 + ph * 0.1, pw * 0.1, ph * 0.8, '#bae6fd');
        n = 6;
        for (i = 1; i < n; i++) L(x0 + pw * 0.7 * i / n, y0, x0 + pw * 0.7 * i / n, y0 + ph, 'rgba(255,255,255,0.5)');
        break;
      case 'wh_car':
        R(x0 + pw * 0.22, y0 + ph * 0.12, pw * 0.55, ph * 0.76, 'rgba(0,0,0,0.25)');
        R(x0 + pw * 0.62, y0 + ph * 0.16, pw * 0.13, ph * 0.68, '#bae6fd');
        R(x0 + pw * 0.24, y0 + ph * 0.18, pw * 0.08, ph * 0.64, '#bae6fd');
        break;
      case 'wh_sala':
        R(x0, y0, pw, ph * 0.3, 'rgba(255,255,255,0.28)');
        R(x0, y0, pw * 0.26, ph * 0.75, 'rgba(255,255,255,0.28)');
        R(x0 + pw * 0.45, y0 + ph * 0.5, pw * 0.35, ph * 0.3, 'rgba(0,0,0,0.3)', 'rgba(255,255,255,0.5)');
        break;
      default:
        if (esPlegada(e)) {
          n = Math.min(e.cantidad || 1, 40);
          for (i = 1; i < n; i++) L(x0, y0 + ph * i / n, x0 + pw, y0 + ph * i / n, 'rgba(255,255,255,0.65)');
        }
    }
  }

  // ── Dibujo 3D ──────────────────────────────────────────────
  function construir3D(group, e) {
    var T = window.THREE;
    var w = e.w, d = e.h;
    var cat = window.getCatalogEntry(e.type);
    var color = e.color || cat.color;

    function box(bw, bh, bd, x, y, z, c, opts) {
      opts = opts || {};
      var mat = new T.MeshStandardMaterial({ color: c === undefined ? color : c, roughness: opts.rough === undefined ? 0.7 : opts.rough, metalness: opts.metal || 0, transparent: !!opts.opacity, opacity: opts.opacity || 1 });
      var mesh = new T.Mesh(new T.BoxGeometry(bw, bh, bd), mat);
      mesh.position.set(x, y + bh / 2, z);
      mesh.castShadow = !opts.opacity;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    }
    function rueda(x, z, r, grosor) {
      var mesh = new T.Mesh(new T.CylinderGeometry(r, r, grosor, 16), new T.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }));
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, r, z);
      mesh.castShadow = true;
      group.add(mesh);
    }
    function cuarto(alto, c, puertaAncho) {
      var t = 0.1, pa = puertaAncho || 0.9;
      box(w, 0.04, d, 0, 0, 0, 0x57534e);
      box(w, alto, t, 0, 0, -d / 2 + t / 2, c);
      box(t, alto, d, -w / 2 + t / 2, 0, 0, c);
      box(t, alto, d, w / 2 - t / 2, 0, 0, c);
      var lado = (w - pa) / 2;
      box(lado, alto, t, -w / 2 + lado / 2, 0, d / 2 - t / 2, c);
      box(lado, alto, t, w / 2 - lado / 2, 0, d / 2 - t / 2, c);
    }

    var i, n;
    switch (e.type) {
      case 'wh_wall':
      case 'wh_column':
        box(w, cat.alto, d, 0, 0, 0);
        break;
      case 'wh_gate':
        box(w / 2 - 0.03, cat.alto, 0.08, -w / 4, 0, 0, color, { metal: 0.5, rough: 0.4 });
        box(w / 2 - 0.03, cat.alto, 0.08, w / 4, 0, 0, color, { metal: 0.5, rough: 0.4 });
        box(0.08, cat.alto + 0.1, d, -w / 2, 0, 0, 0x1e293b);
        box(0.08, cat.alto + 0.1, d, w / 2, 0, 0, 0x1e293b);
        box(w + 0.08, 0.1, d, 0, cat.alto, 0, 0x1e293b);
        break;
      case 'wh_door':
        box(w - 0.1, 2.05, 0.05, 0, 0, 0);
        box(0.05, 2.1, d, -w / 2, 0, 0, 0x292524);
        box(0.05, 2.1, d, w / 2, 0, 0, 0x292524);
        box(w, 0.05, d, 0, 2.08, 0, 0x292524);
        break;
      case 'wh_bathroom':
        cuarto(cat.alto, color, 0.8);
        box(0.4, 0.45, 0.55, -w * 0.25, 0, -d * 0.2, 0xffffff);
        box(0.55, 0.85, 0.45, w * 0.25, 0, -d / 2 + 0.33, 0xe2e8f0);
        break;
      case 'wh_room':
        cuarto(cat.alto, color, 1);
        box(Math.min(1.5, w * 0.5), 0.5, Math.min(2, d * 0.55), -w * 0.2, 0, -d * 0.18, 0xe2e8f0);
        break;
      case 'wh_mezzanine':
        var altura = (e.nivel || 1) * ALTURA_NIVEL + (parseFloat(e.elevation) || 0);
        box(w, 0.2, d, 0, -0.2, 0, color);
        var postesX = Math.max(2, Math.ceil(w / 4) + 1), postesZ = Math.max(2, Math.ceil(d / 4) + 1);
        for (i = 0; i < postesX; i++) {
          for (n = 0; n < postesZ; n++) {
            if (i && i < postesX - 1 && n && n < postesZ - 1) continue;
            box(0.18, altura - 0.2, 0.18, -w / 2 + 0.1 + (w - 0.2) * i / (postesX - 1), -altura, -d / 2 + 0.1 + (d - 0.2) * n / (postesZ - 1), 0x334155, { metal: 0.4 });
          }
        }
        // Barandal: deja libre el frente para la escalera
        box(w, 0.05, 0.05, 0, 1, -d / 2, 0xe2e8f0, { metal: 0.5 });
        box(0.05, 0.05, d, -w / 2, 1, 0, 0xe2e8f0, { metal: 0.5 });
        box(0.05, 0.05, d, w / 2, 1, 0, 0xe2e8f0, { metal: 0.5 });
        break;
      case 'wh_basement':
        box(w, 0.1, d, 0, 0, 0, 0x44403c);
        box(w, ALTURA_NIVEL, 0.15, 0, 0, -d / 2, color);
        box(w, ALTURA_NIVEL, 0.15, 0, 0, d / 2, color);
        box(0.15, ALTURA_NIVEL, d, -w / 2, 0, 0, color);
        box(0.15, ALTURA_NIVEL, d, w / 2, 0, 0, color);
        break;
      case 'wh_stairs':
        n = Math.max(6, Math.round(ALTURA_NIVEL / 0.18));
        for (i = 0; i < n; i++) {
          box(w, 0.05, d / n + 0.02, 0, (i + 1) * ALTURA_NIVEL / n - 0.05, d / 2 - (i + 0.5) * d / n, color, { metal: 0.3 });
          box(w, ALTURA_NIVEL / n, 0.03, 0, i * ALTURA_NIVEL / n, d / 2 - i * d / n, 0x475569);
        }
        break;
      case 'wh_shelf':
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
          box(0.05, cat.alto, 0.05, s[0] * (w / 2 - 0.03), 0, s[1] * (d / 2 - 0.03), 0x1e293b, { metal: 0.6, rough: 0.4 });
        });
        for (i = 0; i < 4; i++) {
          box(w, 0.04, d, 0, 0.15 + i * 0.65, 0, color, { metal: 0.3 });
          box(w * 0.2, 0.3, d * 0.7, -w * 0.28, 0.19 + i * 0.65, 0, 0xc4a57b);
          if (i % 2 === 0) box(w * 0.25, 0.26, d * 0.7, w * 0.22, 0.19 + i * 0.65, 0, 0xa98b64);
        }
        break;
      case 'wh_cleaning':
        cuarto(cat.alto, color, Math.min(0.9, w * 0.5));
        box(w * 0.85, 0.04, 0.35, 0, 1.3, -d / 2 + 0.28, 0xe2e8f0);
        box(w * 0.85, 0.04, 0.35, 0, 0.7, -d / 2 + 0.28, 0xe2e8f0);
        [0x7dd3fc, 0xfde047, 0xf9a8d4, 0x86efac].forEach(function (c, k) {
          var botella = new T.Mesh(new T.CylinderGeometry(0.06, 0.07, 0.28, 10), new T.MeshStandardMaterial({ color: c }));
          botella.position.set(-w * 0.3 + k * w * 0.2, 1.48, -d / 2 + 0.28);
          group.add(botella);
          var galon = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.3, 10), new T.MeshStandardMaterial({ color: c }));
          galon.position.set(w * 0.3 - k * w * 0.2, 0.89, -d / 2 + 0.28);
          group.add(galon);
        });
        var cubeta = new T.Mesh(new T.CylinderGeometry(0.16, 0.12, 0.28, 12), new T.MeshStandardMaterial({ color: 0x2563eb }));
        cubeta.position.set(w * 0.28, 0.18, d * 0.15);
        group.add(cubeta);
        break;
      case 'wh_chair_stack':
        n = Math.max(1, e.cantidad || 1);
        for (i = 0; i < n; i++) box(w * 0.9, 0.04, d * 0.9, 0, 0.42 + i * 0.07, 0, color, { metal: 0.3 });
        box(0.04, 0.42, 0.04, -w * 0.4, 0, -d * 0.4, 0x292524);
        box(0.04, 0.42, 0.04, w * 0.4, 0, -d * 0.4, 0x292524);
        box(0.04, 0.42, 0.04, -w * 0.4, 0, d * 0.4, 0x292524);
        box(0.04, 0.42, 0.04, w * 0.4, 0, d * 0.4, 0x292524);
        box(w * 0.9, 0.45 + n * 0.07, 0.04, 0, 0.42, -d * 0.43, color, { metal: 0.3 });
        break;
      case 'wh_island':
        var filas = e.filas || 1, cols = columnasIsla(e), ml = w / cols, ma = d / filas, col = 0;
        (e.secciones || []).forEach(function (s, k) {
          var c = parseInt(s.columnas, 10) || 0;
          var tono = new T.Color(COLORES_SECCION[k % COLORES_SECCION.length]);
          for (var cx = 0; cx < c; cx++) {
            for (var fx = 0; fx < filas; fx++) {
              var mx = -w / 2 + (col + cx + 0.5) * ml, mz = -d / 2 + (fx + 0.5) * ma;
              box(ml - 0.03, 0.04, ma - 0.03, mx, 0.74, mz, tono.getHex());
              [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
                box(0.04, 0.74, 0.04, mx + p[0] * (ml / 2 - 0.08), 0, mz + p[1] * (ma / 2 - 0.08), 0x292524);
              });
            }
          }
          if (c) group.add(_rotuloPlano(T, s.nombre, -w / 2 + (col + c / 2) * ml, 0.79, 0, c * ml * 0.9, d * 0.6));
          col += c;
        });
        break;
      case 'wh_ironing':
        box(w, 0.04, d, 0, 0.88, 0, color);
        box(0.04, 0.88, d * 0.7, -w * 0.25, 0, 0, 0x64748b, { metal: 0.6 });
        box(0.04, 0.88, d * 0.7, w * 0.25, 0, 0, 0x64748b, { metal: 0.6 });
        break;
      case 'wh_laundry':
        box(w, 0.02, d, 0, 0, 0, color, { opacity: 0.5 });
        box(Math.min(1.2, w * 0.4), 0.9, 0.6, -w * 0.25, 0, -d / 2 + 0.3, 0xcbd5e1, { metal: 0.3 });
        box(Math.min(1, w * 0.3), 0.04, 0.45, -w * 0.25, 0.9, -d / 2 + 0.3, 0x38bdf8);
        break;
      case 'wh_washer':
        box(w, 0.95, d, 0, 0, 0, 0xf1f5f9);
        var ojo = new T.Mesh(new T.CylinderGeometry(w * 0.3, w * 0.3, 0.03, 20), new T.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.2 }));
        ojo.rotation.x = Math.PI / 2;
        ojo.position.set(0, 0.5, d / 2 + 0.01);
        group.add(ojo);
        break;
      case 'wh_grill':
        box(w, 0.75, d, 0, 0, 0, 0x44403c, { metal: 0.6, rough: 0.4 });
        n = Math.max(3, Math.round(w / 0.1));
        for (i = 0; i < n; i++) box(0.015, 0.02, d * 0.9, -w / 2 + (i + 0.5) * w / n, 0.75, 0, 0x111111, { metal: 0.8 });
        box(w, 0.25, 0.04, 0, 0.75, -d / 2, 0x292524);
        break;
      case 'wh_fridge':
        box(w, 1.2, d, 0, 0, 0, 0xcbd5e1, { metal: 0.6, rough: 0.3 });
        box(w, 0.58, d, 0, 1.22, 0, 0xcbd5e1, { metal: 0.6, rough: 0.3 });
        box(0.03, 0.5, 0.03, w * 0.38, 0.6, d / 2 + 0.02, 0x334155);
        box(0.03, 0.3, 0.03, w * 0.38, 1.3, d / 2 + 0.02, 0x334155);
        break;
      case 'wh_truck':
        // Frente hacia +X. Caja de redil con estacas
        box(w, 0.25, d * 0.92, 0, 0.55, 0, 0x1e293b);
        box(w * 0.26, 1.15, d * 0.9, w * 0.36, 0.8, 0, color, { metal: 0.3, rough: 0.4 });
        box(0.03, 0.5, d * 0.78, w / 2 - 0.02, 1.35, 0, 0xbae6fd, { rough: 0.1 });
        box(w * 0.7, 0.05, d * 0.92, -w * 0.14, 0.8, 0, 0x78350f);
        n = 8;
        for (i = 0; i <= n; i++) {
          var ex = -w / 2 + 0.05 + (w * 0.68) * i / n;
          box(0.06, 1.3, 0.06, ex, 0.85, -d * 0.45, 0x92400e);
          box(0.06, 1.3, 0.06, ex, 0.85, d * 0.45, 0x92400e);
        }
        [1.1, 1.55, 2.0].forEach(function (y) {
          box(w * 0.7, 0.07, 0.03, -w * 0.14, y, -d * 0.45, 0xa16207);
          box(w * 0.7, 0.07, 0.03, -w * 0.14, y, d * 0.45, 0xa16207);
        });
        [[-w * 0.3, -1], [-w * 0.3, 1], [w * 0.33, -1], [w * 0.33, 1]].forEach(function (p) { rueda(p[0], p[1] * (d * 0.46), 0.42, 0.25); });
        break;
      case 'wh_car':
        box(w, 0.5, d * 0.95, 0, 0.3, 0, color, { metal: 0.5, rough: 0.3 });
        box(w * 0.5, 0.5, d * 0.82, -w * 0.05, 0.8, 0, 0xbae6fd, { metal: 0.3, rough: 0.1 });
        box(w * 0.5, 0.05, d * 0.82, -w * 0.05, 1.3, 0, color, { metal: 0.5, rough: 0.3 });
        [[-w * 0.3, -1], [-w * 0.3, 1], [w * 0.3, -1], [w * 0.3, 1]].forEach(function (p) { rueda(p[0], p[1] * (d * 0.46), 0.32, 0.22); });
        break;
      case 'wh_sala':
        box(w, 0.42, d * 0.3, 0, 0, -d * 0.35, color);
        box(w, 0.4, d * 0.1, 0, 0.42, -d * 0.45, color);
        box(w * 0.26, 0.42, d * 0.45, -w * 0.37, 0, d * 0.02, color);
        box(w * 0.3, 0.38, d * 0.25, w * 0.15, 0, d * 0.2, 0x292524);
        break;
      default:
        if (esPlegada(e)) {
          var alto = altoPlegada(e), redonda = e.type === 'wh_fold_round';
          n = Math.max(1, e.cantidad || 1);
          for (i = 0; i < n; i++) {
            var z = -d / 2 + (i + 0.5) * d / n, tabla;
            if (redonda) {
              tabla = new T.Mesh(new T.CylinderGeometry(alto / 2, alto / 2, 0.04, 28), new T.MeshStandardMaterial({ color: color, roughness: 0.7 }));
              tabla.rotation.x = Math.PI / 2 - 0.08;
              tabla.position.set(0, alto / 2, z);
            } else {
              tabla = new T.Mesh(new T.BoxGeometry(w, alto, 0.04), new T.MeshStandardMaterial({ color: color, roughness: 0.7 }));
              tabla.rotation.x = -0.08;
              tabla.position.set(0, alto / 2, z);
            }
            tabla.castShadow = true;
            group.add(tabla);
          }
        } else {
          box(w, cat.alto || 1, d, 0, 0, 0);
        }
    }
  }

  // Nombre de sección impreso sobre las mesas de la isla
  function _rotuloPlano(T, texto, x, y, z, ancho, largo) {
    var canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    var c = canvas.getContext('2d');
    c.font = 'bold 54px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 8;
    c.strokeStyle = 'rgba(0,0,0,0.75)';
    c.fillStyle = '#fff';
    c.strokeText(texto, 256, 64, 490);
    c.fillText(texto, 256, 64, 490);
    var malla = new T.Mesh(
      new T.PlaneGeometry(ancho, Math.min(largo, ancho / 4)),
      new T.MeshBasicMaterial({ map: new T.CanvasTexture(canvas), transparent: true, depthWrite: false })
    );
    malla.rotation.x = -Math.PI / 2;
    malla.position.set(x, y, z);
    return malla;
  }

  window.BODEGA = {
    ALTURA_NIVEL: ALTURA_NIVEL,
    NIVELES: [{ id: 1, label: '2º piso' }, { id: 0, label: 'Planta baja' }, { id: -1, label: 'Sótano' }],
    CATEGORIAS: Object.keys(CATEGORIAS),
    TERRENO: { w: 30, h: 20 },
    esPlegada: esPlegada,
    columnasIsla: columnasIsla,
    recalcular: recalcular,
    alRedimensionar: alRedimensionar,
    inicializar: inicializar,
    etiqueta3D: etiqueta3D,
    llevaEtiqueta3D: llevaEtiqueta3D,
    clave3D: clave3D,
    dibujar2D: dibujar2D,
    construir3D: construir3D
  };
})();
