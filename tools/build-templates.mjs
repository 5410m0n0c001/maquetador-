// tools/build-templates.mjs
// Genera templates.js (plantillas de salones) a partir de los repos originales de cada maquetador.
// Uso:  node tools/build-templates.mjs <carpeta-con-los-repos-clonados>
//   La carpeta debe contener: yolomecatl-croquis-/, centro-de-convenciones-presidente-croquis/, salon-manzanares/

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const refs = process.argv[2];
if (!refs) { console.error('Uso: node tools/build-templates.mjs <carpeta-repos>'); process.exit(1); }
const read = (p) => fs.readFileSync(path.join(refs, p), 'utf8').replace(/^﻿/, '');
const r1 = (n) => Math.round(n * 100) / 100;

// ── Catálogo del motor (para categoría, color, capa y sillas por defecto) ──
const catalogCtx = { window: {}, console };
vm.runInNewContext(fs.readFileSync('elements-db.js', 'utf8'), catalogCtx);
const getCat = catalogCtx.window.getCatalogEntry;

let _n = 0;
function makeElem(type, props) {
  const cat = getCat(type);
  if (!cat) throw new Error('Tipo no existe en el catálogo: ' + type);
  const isMesa = cat.defaultChairs > 0 || type.startsWith('table_') || type === 'lounge_set';
  const elem = {
    id: 'tpl_' + (++_n),
    type,
    category: cat.category,
    name: cat.name,
    x: 0, y: 0,
    w: cat.defaultW,
    h: cat.defaultH,
    rotation: 0,
    color: cat.color,
    chairs: cat.defaultChairs,
    editable: true,
    removable: true,
    layer: cat.layer || cat.category,
    ...props
  };
  if (isMesa) {
    elem.mesaConfig = {
      mesaNum: props.mesaNum || 0, capacidadMax: null,
      mantelColor: 'blanco', caminoColor: 'dorado', caminoAcomodo: 'diagonal',
      servilletaColorCorazon: 'dorado', servilletaColorCorbata: 'champagne', servilletaColorOtros: 'blanco',
      servilletaDoblez: ['corazon', 'corbata'], cubiertos: 'plateado', platoBase: 'ninguno',
      platoTrinche: 'redondo_blanco', cristal: 'cubero', copasColor: 'transparente',
      cristal2: 'ninguno', copasColor2: 'transparente', tipoSilla: 'tiffany', menu: '',
      arregloFloralTipo: 'bajo', arregloFloralAcomodo: 'diagonal', ensambleTipo: 'angosto', invitados: []
    };
    delete elem.mesaNum;
  }
  return elem;
}

const ALL_LAYERS = {
  estructuras: true, techos: false, accesos: true, mobiliario: true, entretenimiento: true,
  decoracion: true, proveedores: true,
  flujo_invitados: true, flujo_proveedores: true, flujo_staff: true, flujo_emergencia: true
};

// ══════════════════════════════════════════════════════════
// YOLOMECATL  (SVG a escala: 10 unidades = 1 metro)
// ══════════════════════════════════════════════════════════
function buildYolomecatl() {
  const html = read('yolomecatl-croquis-/index.html');
  const appJs = read('yolomecatl-croquis-/app.js');
  const U = (v) => r1(v / 10);
  // rect SVG (x,y,w,h en unidades) → centro en metros
  const rect = (x, y, w, h) => ({ x: U(x + w / 2), y: U(y + h / 2), w: U(w), h: U(h) });

  // Datos de las versiones A / B (mesas, pista, flujos)
  const lpSrc = appJs.slice(appJs.indexOf('const layoutPositions'), appJs.indexOf('// Initialize Table Data'));
  const ctx = {};
  vm.runInNewContext(lpSrc.replace('const layoutPositions', 'this.layoutPositions'), ctx);
  const LP = ctx.layoutPositions;

  // ── Fondo: capas fijas del croquis original (jardín, estacionamiento, cocina, lobby, baños, muros, escenario)
  let bg = html.slice(html.indexOf('<g id="g-garden">'), html.indexOf('<!-- LOGISTICS & CIRCULATION LAYER'));
  bg = removeGroup(bg, 'dancefloor-group');   // la pista es un elemento editable
  bg = removeGroup(bg, 'dj2-group');          // el 2º DJ (versión B) es un elemento editable
  let defs = html.slice(html.indexOf('<defs>'), html.indexOf('</defs>') + 7);

  // Paleta Gala PEG (tonos cálidos en vez del azul marino original del croquis)
  const vars = {
    '--svg-bg': '#221f20', '--svg-wall-stroke': '#a08a62', '--svg-grass': '#1a2a1d', '--svg-water': '#1b3a4b',
    '--svg-pista': '#2a1b12', '--svg-lobby': '#2b2627', '--svg-kitchen': '#272223', '--svg-bathroom': '#252021',
    '--svg-parking': '#1c1a1b', '--svg-text': '#F8F6F4', '--text-muted': '#C9A96E', '--accent': '#F65C7A',
    '--bg-primary': '#1F1F1F'
  };
  const css = `
    .yb-zone-grass{fill:var(--svg-grass)} .yb-zone-water{fill:var(--svg-water)}
    .yb-zone-pista{fill:var(--svg-pista);stroke:var(--svg-wall-stroke);stroke-width:2.5}
    .yb-zone-lobby{fill:var(--svg-lobby)} .yb-zone-kitchen{fill:var(--svg-kitchen)}
    .yb-zone-bathroom{fill:var(--svg-bathroom)} .yb-zone-parking{fill:var(--svg-parking)}
    .yb-svg-door-swing{fill:none;stroke:var(--svg-wall-stroke);stroke-width:1.2;stroke-dasharray:4,4}
    .yb-svg-stair-step,.yb-stage-stairs{fill:none;stroke:var(--svg-wall-stroke);stroke-width:1}
    .yb-svg-shrub{fill:#14532d;stroke:#166534;stroke-width:1}
    .yb-svg-chair{fill:#071b2d;stroke:rgba(240,90,126,0.5)}
    .yb-svg-label{fill:var(--svg-text);font-family:sans-serif;font-size:13px;font-weight:600;letter-spacing:0.05em}
    .yb-svg-label-sub{fill:var(--text-muted);font-family:sans-serif;font-size:9px;font-weight:500}`;

  let svg = `<style>${css}</style>${defs}${bg}`;
  // Prefijar clases e ids para no chocar con los estilos del maquetador
  svg = svg.replace(/class="([^"]+)"/g, (m, c) => 'class="' + c.split(/\s+/).map((k) => 'yb-' + k).join(' ') + '"');
  svg = svg.replace(/id="([^"]+)"/g, 'id="yb-$1"').replace(/url\(#([^)]+)\)/g, 'url(#yb-$1)');
  for (const [k, v] of Object.entries(vars)) svg = svg.split(`var(${k})`).join(v);
  svg = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').replace(/> </g, '><').trim();
  if (/var\(--/.test(svg)) throw new Error('Quedaron variables CSS sin resolver en el fondo de Yolomecatl');

  // ── Estructuras fijas (para la vista 3D; en 2D las dibuja el fondo)
  const fixed = (type, name, r) => makeElem(type, { name, ...r, editable: false, removable: false, bg2d: true });
  const structures = () => [
    fixed('salon', 'Salón de Eventos', rect(270, 80, 480, 620)),
    fixed('stage', 'Escenario DJ (+0.60 m)', rect(385, 80, 200, 60)),
    fixed('kitchen', 'Cocina & Bar', rect(770, 20, 210, 230)),
    fixed('bathroom', 'Servicios Sanitarios', rect(410, 20, 200, 60)),
    fixed('lobby_reception', 'Recepción Principal', rect(270, 700, 480, 55)),
    fixed('parking', 'Estacionamiento', rect(770, 270, 210, 670)),
    fixed('garden', 'Jardín', rect(20, 20, 230, 920)),
    fixed('pool', 'Alberca (Jardín 2)', rect(390, 805, 250, 110)),
    fixed('chapel', 'Capilla', rect(40, 800, 170, 120)),
    fixed('waterfall', 'Cascada de Agua', rect(25, 195, 30, 250))
  ];

  // ── Flujos: cada subtrazo "M ... L ..." se vuelve una polilínea en metros
  const flowDefs = [
    ['guest', 'flujo_invitados', '#3b82f6'],
    ['service', 'flujo_proveedores', '#22c55e'],
    ['emergency', 'flujo_emergencia', '#ef4444']
  ];
  // Soporta M, L y C (las curvas C se muestrean en 8 tramos)
  function pathToFlows(d, layer, color) {
    if (/[^MLC0-9.,\s-]/.test(d)) throw new Error('Trazo de flujo con comandos no soportados: ' + d);
    return d.trim().split(/(?=M)/).map((sub) => {
      const tokens = sub.match(/[MLC]|-?[\d.]+/g);
      const points = [];
      let cmd = null;
      for (let i = 0; i < tokens.length;) {
        if (/[MLC]/.test(tokens[i])) { cmd = tokens[i++]; continue; }
        if (cmd === 'C') {
          const [x1, y1, x2, y2, x3, y3] = tokens.slice(i, i + 6).map(Number);
          const [x0, y0] = points[points.length - 1].map((v) => v * 10);
          for (let s = 1; s <= 8; s++) {
            const t = s / 8, k = 1 - t;
            points.push([
              U(k * k * k * x0 + 3 * k * k * t * x1 + 3 * k * t * t * x2 + t * t * t * x3),
              U(k * k * k * y0 + 3 * k * k * t * y1 + 3 * k * t * t * y2 + t * t * t * y3)
            ]);
          }
          i += 6;
        } else {
          points.push([U(+tokens[i]), U(+tokens[i + 1])]);
          i += 2;
        }
      }
      return { id: 'flow_' + (++_n), layer, color, points };
    }).filter((f) => f.points.length > 1);
  }

  function version(key) {
    const L = LP[key];
    const elements = structures();
    L.activeTables.forEach((num) => {
      const t = L.tables[num];
      if (num === 22) {
        // Mesa imperial vertical de 50 sillas (lado izquierdo)
        elements.push(makeElem('table_imperial', {
          name: 'Mesa Imperial 22', mesaNum: 22, x: U(t.cx), y: U(t.cy), w: 12, h: 0.8, rotation: 90, chairs: 50
        }));
      } else {
        elements.push(makeElem('table_square', { name: 'Mesa ' + num, mesaNum: num, x: U(t.cx), y: U(t.cy) }));
      }
    });
    const df = L.dancefloor;
    elements.push(makeElem('dancefloor', { name: 'Zona de Baile', ...rect(df.x, df.y, df.width, df.height) }));
    if (key === 'B') {
      elements.push(makeElem('dj_booth', { name: 'Segundo DJ', ...rect(730, 380, 20, 80) }));
    }
    const flows = flowDefs.flatMap(([k, layer, color]) => pathToFlows(L.paths[k], layer, color));
    return { terrain: { w: 100, h: 98 }, elements, flows, layers: { ...ALL_LAYERS } };
  }

  return { bgSvg: svg, A: version('A'), B: version('B') };
}

// Quita <g id="..."> ... </g> respetando grupos anidados
function removeGroup(src, id) {
  const start = src.indexOf(`<g id="${id}"`);
  if (start < 0) throw new Error('No se encontró el grupo ' + id);
  const re = /<g\b|<\/g>/g;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(src))) {
    depth += m[0] === '</g>' ? -1 : 1;
    if (depth === 0) return src.slice(0, start) + src.slice(m.index + 4);
  }
  throw new Error('Grupo sin cerrar: ' + id);
}

// ══════════════════════════════════════════════════════════
// CENTRO DE CONVENCIONES PRESIDENTE  (ya está en metros, centro del elemento)
// ══════════════════════════════════════════════════════════
function buildPresidente() {
  const src = JSON.parse(read('centro-de-convenciones-presidente-croquis/layout.json'));
  const typeFor = (e) => {
    switch (e.type) {
      case 'table': return e.shape === 'circle' ? 'table_round' : 'table_square';
      case 'dj': return 'dj_booth';
      case 'stand': return 'vendor_generic';
      case 'door': return e.w >= 4 ? 'door_double' : 'door_single';
      case 'entrance': return 'ramp';
      case 'umbrella': return 'table_umbrella';
      case 'lounge': return 'lounge_set';
      case 'bar_stool': return 'table_periquera';
      case 'photobooth':
        if (/360/.test(e.name)) return 'photobooth_360';
        if (/inflable/i.test(e.name)) return 'photobooth_inflatable';
        return 'photobooth_mirror';
      default: return e.type; // dancefloor, salon, garden, bathroom, stage, giant_letters
    }
  };
  let mesa = 0;
  const elements = src.map((e) => {
    const type = typeFor(e);
    const isTable = /^table_|lounge_set/.test(type);
    const props = { name: e.name.trim(), x: e.x, y: e.y, w: e.w, h: e.h, rotation: e.rotation || 0 };
    if (e.chairs) props.chairs = e.chairs;
    if (isTable) props.mesaNum = ++mesa;
    if (e.exhibitor) props.exhibitor = e.exhibitor;
    return makeElem(type, props);
  });
  // El salón va primero para que quede debajo de todo
  elements.sort((a, b) => (a.type === 'salon' ? -1 : 0) - (b.type === 'salon' ? -1 : 0));
  return { terrain: { w: 70, h: 90 }, elements, flows: [], layers: { ...ALL_LAYERS } };
}

// ══════════════════════════════════════════════════════════
// SALÓN MANZANARES  (mismo motor: se copia su plano tal cual)
// ══════════════════════════════════════════════════════════
function buildManzanares() {
  const ctx = { window: {} };
  vm.runInNewContext(read('salon-manzanares/default-layout.js').replace('var DEFAULT_LAYOUT', 'window.L'), ctx);
  const L = ctx.window.L;
  return { terrain: L.terrain, elements: L.elements.map(sinDatosDeCliente), flows: [], layers: { ...ALL_LAYERS, ...L.layers } };
}

// Las plantillas no deben llevar datos de un evento real (invitados, menú)
function sinDatosDeCliente(e) {
  if (!e.mesaConfig) return e;
  return { ...e, mesaConfig: { ...e.mesaConfig, invitados: [], menu: '' } };
}

// ══════════════════════════════════════════════════════════
const yolo = buildYolomecatl();
const templates = [
  {
    id: 'yolomecatl-a', name: 'Yolomecatl · Versión A',
    description: 'Pista central · 21 mesas + imperial · jardín, capilla, alberca y estacionamiento',
    bg: 'yolomecatl', layout: yolo.A
  },
  {
    id: 'yolomecatl-b', name: 'Yolomecatl · Versión B',
    description: 'Pista longitudinal · 22 mesas · segundo DJ',
    bg: 'yolomecatl', layout: yolo.B
  },
  {
    id: 'presidente', name: 'Centro de Convenciones Presidente',
    description: 'Salón techado 36 × 58 m · escenario, stands y jardín',
    layout: buildPresidente()
  },
  {
    id: 'manzanares', name: 'Salón Manzanares',
    description: 'Salón techado, terraza, alberca y área infantil',
    layout: buildManzanares()
  }
];
for (const t of templates) t.layout.venueId = t.id;

const out = `// templates.js — GENERADO por tools/build-templates.mjs (no editar a mano)
// Plantillas de salones de Primavera Events Group.
window.VENUE_BACKGROUNDS = ${JSON.stringify({ yolomecatl: { scale: 0.1, svg: yolo.bgSvg } })};
window.VENUE_TEMPLATES = ${JSON.stringify(templates, null, 1)};
`;
fs.writeFileSync('templates.js', out, 'utf8');
for (const t of templates) {
  console.log(`${t.id}: ${t.layout.elements.length} elementos, ${t.layout.flows.length} flujos, terreno ${t.layout.terrain.w}x${t.layout.terrain.h}`);
}
console.log('Fondo Yolomecatl:', yolo.bgSvg.length, 'caracteres');
