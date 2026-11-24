// ============================================================
// rancho.js — Elementos de rancho y plantilla de Rancho Los Potrillos
// Camino de terracería, picadero, caballerizas, puente ondulado,
// rotonda con estatua y árboles; y el plano base del rancho
// (medido sobre la vista satelital, ~0.3 m por pixel).
// Se carga después de elements-db.js y templates.js.
// ============================================================
(function () {
  'use strict';

  var NP = { 'pointer-events': 'none' };

  // ── Dibujos 2D ─────────────────────────────────────────────
  function base(svgEl, g, o, attrs) {
    g.appendChild(svgEl(attrs.circle ? 'circle' : 'rect', Object.assign(attrs.circle
      ? { cx: o.px, cy: o.py, r: o.pw / 2 }
      : { x: o.px - o.pw / 2, y: o.py - o.ph / 2, width: o.pw, height: o.ph, rx: attrs.rx || 0 }, {
      fill: attrs.fill || o.color, 'fill-opacity': attrs.opacity == null ? 0.9 : attrs.opacity,
      stroke: o.selected ? '#F65C7A' : (attrs.stroke || o.light), 'stroke-width': o.selected ? 2 : (attrs.sw || 1)
    })));
  }

  var D2 = {
    rancho_path: function (svgEl, g, e, o) {
      base(svgEl, g, o, { opacity: 0.85, stroke: 'rgba(0,0,0,0.25)' });
      var largo = Math.max(o.pw, o.ph), horiz = o.pw >= o.ph, n = Math.floor(largo / o.mToPx(3));
      for (var i = 1; i < n; i++) {
        var t = -largo / 2 + i * largo / n;
        g.appendChild(svgEl('circle', Object.assign({ cx: o.px + (horiz ? t : 0), cy: o.py + (horiz ? 0 : t), r: o.mToPx(0.25), fill: 'rgba(255,255,255,0.18)' }, NP)));
      }
    },
    rancho_arena: function (svgEl, g, e, o) {
      base(svgEl, g, o, { circle: true, fill: '#c2a878', opacity: 0.9, stroke: '#6b4f2a', sw: 2 });
      g.appendChild(svgEl('circle', Object.assign({ cx: o.px, cy: o.py, r: o.pw / 2 - o.mToPx(0.6), fill: 'none', stroke: '#5b3d1e', 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }, NP)));
    },
    rancho_stables: function (svgEl, g, e, o) {
      base(svgEl, g, o, {});
      var n = Math.max(2, Math.round(e.w / 3.5));
      for (var i = 1; i < n; i++) {
        var x = o.px - o.pw / 2 + i * o.pw / n;
        g.appendChild(svgEl('line', Object.assign({ x1: x, y1: o.py - o.ph / 2, x2: x, y2: o.py + o.ph / 2, stroke: 'rgba(255,255,255,0.5)', 'stroke-width': 1 }, NP)));
      }
      g.appendChild(svgEl('line', Object.assign({ x1: o.px - o.pw / 2, y1: o.py + o.ph / 2 - o.mToPx(1), x2: o.px + o.pw / 2, y2: o.py + o.ph / 2 - o.mToPx(1), stroke: '#e7d3a8', 'stroke-width': 1, 'stroke-dasharray': '4 3' }, NP)));
    },
    rancho_bridge: function (svgEl, g, e, o) {
      // Zona de clic transparente y el puente en forma de onda a lo largo
      g.appendChild(svgEl('rect', { x: o.px - o.pw / 2, y: o.py - o.ph / 2, width: o.pw, height: o.ph, fill: 'rgba(0,0,0,0.01)', stroke: o.selected ? '#F65C7A' : 'none' }));
      var pts = [], n = 24, amp = o.pw * 0.32;
      for (var i = 0; i <= n; i++) {
        var t = i / n;
        pts.push((o.px + Math.sin(t * Math.PI * 2) * amp) + ',' + (o.py - o.ph / 2 + t * o.ph));
      }
      g.appendChild(svgEl('polyline', Object.assign({ points: pts.join(' '), fill: 'none', stroke: '#8b5a2b', 'stroke-width': Math.max(3, o.pw * 0.36), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, NP)));
      g.appendChild(svgEl('polyline', Object.assign({ points: pts.join(' '), fill: 'none', stroke: '#d6b48a', 'stroke-width': 1, 'stroke-dasharray': '3 3' }, NP)));
    },
    rancho_roundabout: function (svgEl, g, e, o) {
      base(svgEl, g, o, { circle: true, fill: '#a8916b', opacity: 0.85, stroke: 'rgba(0,0,0,0.3)' });
      g.appendChild(svgEl('circle', Object.assign({ cx: o.px, cy: o.py, r: o.pw * 0.3, fill: '#2f6b35' }, NP)));
      g.appendChild(svgEl('circle', Object.assign({ cx: o.px, cy: o.py, r: o.pw * 0.1, fill: '#b08d57', stroke: '#5b3d1e' }, NP)));
    },
    rancho_cascade: function (svgEl, g, e, o) {
      base(svgEl, g, o, { fill: '#1b6fa8', opacity: 0.85, stroke: '#7dd3fc' });
      for (var i = 1; i <= 3; i++) {
        var y = o.py - o.ph / 2 + i * o.ph / 4;
        g.appendChild(svgEl('path', Object.assign({ d: 'M ' + (o.px - o.pw / 2) + ' ' + y + ' q ' + o.pw / 8 + ' -3 ' + o.pw / 4 + ' 0 t ' + o.pw / 4 + ' 0 t ' + o.pw / 4 + ' 0 t ' + o.pw / 4 + ' 0', fill: 'none', stroke: 'rgba(255,255,255,0.6)', 'stroke-width': 1 }, NP)));
      }
    },
    rancho_tree: function (svgEl, g, e, o) {
      base(svgEl, g, o, { circle: true, fill: '#1f5e2c', opacity: 0.85, stroke: '#14421f' });
      g.appendChild(svgEl('circle', Object.assign({ cx: o.px - o.pw * 0.12, cy: o.py - o.pw * 0.12, r: o.pw * 0.22, fill: 'rgba(255,255,255,0.08)' }, NP)));
    }
  };

  // ── Modelos 3D ─────────────────────────────────────────────
  function caja(T, g, w, h, d, x, y, z, color, opts) {
    opts = opts || {};
    var m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshStandardMaterial({ color: color, roughness: opts.rough == null ? 0.8 : opts.rough, metalness: opts.metal || 0 }));
    m.position.set(x, y + h / 2, z);
    m.castShadow = !opts.sinSombra;
    m.receiveShadow = true;
    if (opts.rotY) m.rotation.y = opts.rotY;
    g.add(m);
    return m;
  }
  function cilindro(T, g, r1, r2, h, x, y, z, color, seg) {
    var m = new T.Mesh(new T.CylinderGeometry(r1, r2, h, seg || 24), new T.MeshStandardMaterial({ color: color, roughness: 0.85 }));
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  }
  // Silueta sencilla de un caballo (cuerpo, cuello, cabeza y patas)
  function caballo(T, g, x, z, rotY, color, escala) {
    var c = new T.Group(), s = escala || 1;
    caja(T, c, 1.4 * s, 0.6 * s, 0.45 * s, 0, 0.9 * s, 0, color, { metal: 0.4, rough: 0.4 });
    var cuello = caja(T, c, 0.3 * s, 0.8 * s, 0.3 * s, 0.6 * s, 1.2 * s, 0, color, { metal: 0.4, rough: 0.4 });
    cuello.rotation.z = -0.5;
    caja(T, c, 0.55 * s, 0.25 * s, 0.25 * s, 0.95 * s, 1.85 * s, 0, color, { metal: 0.4, rough: 0.4 });
    [[-0.5, -0.15], [-0.5, 0.15], [0.5, -0.15], [0.5, 0.15]].forEach(function (p) {
      caja(T, c, 0.12 * s, 0.9 * s, 0.12 * s, p[0] * s, 0, p[1] * s, color, { metal: 0.4, rough: 0.4 });
    });
    c.position.set(x, 0, z);
    c.rotation.y = rotY || 0;
    g.add(c);
  }

  var D3 = {
    rancho_path: function (T, g, e) { caja(T, g, e.w, 0.05, e.h, 0, 0, 0, 0xa8916b, { sinSombra: true }); },
    rancho_arena: function (T, g, e) {
      var r = e.w / 2;
      cilindro(T, g, r, r, 0.05, 0, 0, 0, 0xc2a878, 48);
      var n = Math.max(16, Math.round(2 * Math.PI * r / 2.5));
      for (var i = 0; i < n; i++) {
        var a = i / n * Math.PI * 2;
        caja(T, g, 0.15, 1.4, 0.15, Math.cos(a) * r, 0, Math.sin(a) * r, 0x5b3d1e);
      }
      [0.6, 1.2].forEach(function (y) {
        var riel = new T.Mesh(new T.TorusGeometry(r, 0.05, 6, 64), new T.MeshStandardMaterial({ color: 0x7a5230 }));
        riel.rotation.x = Math.PI / 2;
        riel.position.y = y;
        g.add(riel);
      });
    },
    rancho_stables: function (T, g, e) {
      var w = e.w, d = e.h, n = Math.max(2, Math.round(w / 3.5));
      caja(T, g, w, 0.1, d, 0, 0, 0, 0x6b5a45, { sinSombra: true });
      caja(T, g, w, 2.6, 0.2, 0, 0, -d / 2 + 0.1, 0x8b6b4a);
      caja(T, g, w + 0.6, 0.15, d + 1, 0, 2.8, 0, 0x7c4a2a);
      for (var i = 0; i <= n; i++) caja(T, g, 0.15, 2.6, d, -w / 2 + i * w / n, 0, 0, 0x8b6b4a);
      for (var k = 0; k < n; k++) caja(T, g, w / n - 0.4, 1.2, 0.08, -w / 2 + (k + 0.5) * w / n, 0, d / 2 - 0.05, 0xc9a96e);
    },
    rancho_bridge: function (T, g, e) {
      var n = 24, amp = e.w * 0.32, largo = e.h, prev = null;
      for (var i = 0; i <= n; i++) {
        var t = i / n, p = { x: Math.sin(t * Math.PI * 2) * amp, z: -largo / 2 + t * largo, y: 0.15 + Math.sin(t * Math.PI) * 0.5 };
        if (prev) {
          var dx = p.x - prev.x, dz = p.z - prev.z, len = Math.sqrt(dx * dx + dz * dz);
          var tabla = caja(T, g, 1.8, 0.12, len + 0.05, (p.x + prev.x) / 2, (p.y + prev.y) / 2, (p.z + prev.z) / 2, 0x8b5a2b, { rotY: Math.atan2(dx, dz) });
          tabla.rotation.y = Math.atan2(dx, dz);
          if (i % 3 === 0) {
            [-0.85, 0.85].forEach(function (off) {
              var nx = Math.cos(Math.atan2(dx, dz)) * off, nz = -Math.sin(Math.atan2(dx, dz)) * off;
              caja(T, g, 0.08, 0.9, 0.08, p.x + nx, p.y, p.z + nz, 0x5b3d1e);
            });
          }
        }
        prev = p;
      }
    },
    rancho_roundabout: function (T, g, e) {
      var r = e.w / 2;
      cilindro(T, g, r, r, 0.05, 0, 0, 0, 0xa8916b, 40);
      cilindro(T, g, r * 0.6, r * 0.6, 0.25, 0, 0, 0, 0x2f6b35, 40);
      cilindro(T, g, r * 0.18, r * 0.2, 0.9, 0, 0.25, 0, 0xb8a58a, 16);
      var esc = Math.max(0.8, Math.min(1.4, r / 4));
      var est = new T.Group();
      est.position.y = 1.15;
      caballo(T, est, -0.5 * esc, -0.25 * esc, 0.3, 0x8c6a3a, esc);
      caballo(T, est, 0.5 * esc, 0.35 * esc, -0.4, 0x8c6a3a, esc * 0.85);
      g.add(est);
    },
    rancho_cascade: function (T, g, e) {
      caja(T, g, e.w, 0.3, e.h, 0, -0.3, 0, 0x1b6fa8, { sinSombra: true });
      caja(T, g, e.w * 0.9, 0.9, 0.5, 0, 0, -e.h / 2, 0x6b6257);
      var agua = caja(T, g, e.w * 0.8, 0.85, 0.08, 0, 0, -e.h / 2 + 0.3, 0x7dd3fc, { sinSombra: true });
      agua.material.transparent = true;
      agua.material.opacity = 0.75;
    },
    rancho_tree: function (T, g, e) {
      var r = e.w / 2;
      cilindro(T, g, r * 0.08, r * 0.12, r * 1.4, 0, 0, 0, 0x5b3d1e, 8);
      var copa = new T.Mesh(new T.SphereGeometry(r, 12, 10), new T.MeshStandardMaterial({ color: 0x2f6b35, roughness: 0.9 }));
      copa.position.y = r * 1.4 + r * 0.6;
      copa.scale.y = 0.8;
      copa.castShadow = true;
      g.add(copa);
    }
  };

  function tipo(type, name, icon, w, h, color, shape, extra) {
    window.ELEMENTS_CATALOG.push(Object.assign({
      type: type, name: name, category: 'estructuras', icon: icon, defaultW: w, defaultH: h,
      shape: shape || 'rect', color: color, defaultChairs: 0, description: name, layer: 'estructuras', planoOnly: false,
      dibujar2D: function (svgEl, g, e, o) { D2[type](svgEl, g, e, o); },
      construir3D: function (g, e) { D3[type](window.THREE, g, e); }
    }, extra || {}));
  }
  tipo('rancho_path', 'Camino de terracería', 'fa-road', 5, 30, '#a8916b', 'rect', { sinEtiqueta: true });
  tipo('rancho_arena', 'Picadero', 'fa-horse', 25, 25, '#c2a878', 'circle');
  tipo('rancho_stables', 'Caballerizas', 'fa-horse-head', 24, 7, '#8b6b4a');
  tipo('rancho_bridge', 'Puente ondulado', 'fa-bridge', 3, 8, '#8b5a2b');
  tipo('rancho_roundabout', 'Rotonda con estatua', 'fa-circle-dot', 8, 8, '#a8916b', 'circle');
  tipo('rancho_cascade', 'Cascada', 'fa-water', 8, 3, '#1b6fa8', 'rect', { sinEtiqueta: true });
  tipo('rancho_tree', 'Árbol', 'fa-tree', 7, 7, '#1f5e2c', 'circle', { sinEtiqueta: true });

  // ── Plantilla: Rancho Los Potrillos ────────────────────────
  // Medidas tomadas de la vista satelital: pixel → metro (x0, y0 = esquina del terreno)
  var M = 0.3, X0 = 455, Y0 = 95;
  function px(x, y) { return { x: Math.round((x - X0) * M * 10) / 10, y: Math.round((y - Y0) * M * 10) / 10 }; }
  var _n = 0;
  function el(type, name, cx, cy, w, h, extra) {
    var cat = window.getCatalogEntry(type), p = px(cx, cy);
    return Object.assign({
      id: 'potrillos_' + (++_n), type: type, category: cat.category, name: name || cat.name,
      x: p.x, y: p.y, w: w, h: h, rotation: 0, color: cat.color, chairs: 0,
      editable: true, removable: true, layer: cat.layer || cat.category
    }, extra || {});
  }

  var elementos = [
    // Áreas verdes (van primero para quedar abajo)
    el('garden', 'Césped central', 734, 297, 74, 79),
    el('garden', 'Jardín de la alberca', 527, 380, 36, 40),
    el('garden', 'Jardín de habitaciones', 560, 500, 18, 22),
    // Camino de acceso que rodea el césped
    el('rancho_path', null, 606, 312, 5, 86),
    el('rancho_path', null, 718, 167, 90, 5),
    el('rancho_path', null, 864, 312, 5, 86),
    el('rancho_path', null, 732, 455, 84, 5),
    el('rancho_path', null, 645, 512, 5, 26),
    el('rancho_roundabout', 'Rotonda de los potrillos', 600, 178, 7, 7),
    el('rancho_roundabout', 'Rotonda de caballos (entrada)', 645, 472, 9, 9),
    // Construcciones
    el('salon', 'Salón', 545, 237, 28, 34),
    el('kitchen', 'Cocina', 590, 143, 11, 10),
    el('bathroom', 'Baños', 645, 141, 15, 10),
    el('terrace', 'Apartado techado', 540, 145, 10, 8),
    el('pool', 'Alberca', 521, 344, 13, 14),
    el('terrace', 'Palapa', 568, 350, 8, 13),
    el('rancho_cascade', null, 566, 312, 8, 3),
    el('rancho_bridge', 'Puente sobre la cascada', 566, 312, 3, 9),
    el('salon', 'Habitaciones (novios / quinceañera)', 495, 480, 18, 18),
    el('parking', 'Estacionamiento', 734, 497, 40, 21),
    el('rancho_stables', 'Caballerizas', 745, 540, 36, 7),
    el('rancho_arena', 'Picadero', 900, 143, 25, 25),
    // Calle y acceso
    el('street', 'Calle Francisco I. Madero', 710, 575, 153, 9),
    el('gate_large', 'Entrada principal', 645, 556, 6, 0.4)
  ];
  // Árboles alrededor del césped y en los jardines
  [[478, 300], [472, 405], [512, 420], [490, 360], [700, 128], [760, 124], [822, 130], [668, 128],
   [885, 240], [895, 330], [884, 420], [624, 230], [628, 395], [690, 425], [800, 425], [840, 300],
   [575, 470], [590, 530], [530, 540], [950, 260], [940, 380], [930, 470]].forEach(function (t) {
    elementos.push(el('rancho_tree', 'Árbol', t[0], t[1], 7, 7));
  });

  window.VENUE_TEMPLATES = window.VENUE_TEMPLATES || [];
  window.VENUE_TEMPLATES.push({
    id: 'rancho_los_potrillos',
    name: 'Rancho Los Potrillos',
    description: 'Rancho con salón, palapa, alberca, picadero y caballerizas · Francisco I. Madero 23, Tepetzingo (medidas aproximadas de la vista satelital)',
    layout: { terrain: { w: 153, h: 147 }, elements: elementos, flows: [], layers: {}, venueId: 'rancho_los_potrillos' }
  });
})();
