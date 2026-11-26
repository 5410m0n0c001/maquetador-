// ============================================================
// app.js — Universal Venue Floor Plan Builder
// Primavera Events Group
// Standalone, no ES modules. Loads after: elements-db.js, editor2d.js, visualizer3d.js
// ============================================================

(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════
  // GLOBAL STATE
  // ══════════════════════════════════════════════════════════
  window.AppState = {
    elements: [],
    flows: [],          // polilíneas de circulación: { id, layer, color, points: [[x,y], ...] } en metros
    venueId: null,      // id de la plantilla de salón de origen (templates.js)
    mode: 'evento',     // 'evento' o 'bodega'
    vistas: [],         // zonas para encuadrar: [{ nombre, x, y, w, h }] (p. ej. Salón, Cóctel, Áreas verdes)
    vistaActiva: null,
    nivel: 0,           // piso activo en modo bodega: -1 sótano, 0 planta baja, 1 segundo piso
    terrain: { w: 50, h: 60 },
    selectedId: null,
    activeView: '3d',
    useGrid: true,
    history: [],
    historyIndex: -1,
    pendingType: null,
    layers: {
      estructuras:      true,
      techos:           false,
      accesos:          true,
      mobiliario:       true,
      entretenimiento:  true,
      decoracion:       true,
      proveedores:      true,
      flujo_invitados:  true,
      flujo_proveedores: true,
      flujo_staff:      true,
      flujo_emergencia: true
    }
  };

  var LS_KEY = 'primavera_universal_planner';
  var _idCounter = 1;
  var _tableCounter = 0;
  
  var _supabase = null;
  var SB_URL_KEY = 'primavera_supabase_url';
  var SB_ANON_KEY = 'primavera_supabase_key';

  // ══════════════════════════════════════════════════════════
  // UTILITY
  // ══════════════════════════════════════════════════════════
  function uid() {
    return 'el_' + Date.now() + '_' + (_idCounter++);
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  function $$(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }

  // ══════════════════════════════════════════════════════════
  // TOAST NOTIFICATIONS
  // ══════════════════════════════════════════════════════════
  function showToast(message, type) {
    type = type || 'info';
    var colors = {
      info:    '#C9A96E',
      success: '#7fbf9a',
      warning: '#e0b866',
      error:   '#d94f6f'
    };
    var icons = {
      info:    'ℹ',
      success: '✓',
      warning: '⚠',
      error:   '✕'
    };

    var container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = [
        'position:fixed',
        'bottom:24px',
        'right:24px',
        'z-index:99999',
        'display:flex',
        'flex-direction:column',
        'gap:8px',
        'pointer-events:none'
      ].join(';');
      document.body.appendChild(container);
    }

    var toast = document.createElement('div');
    toast.style.cssText = [
      'background:rgba(31,31,31,0.92)',
      'backdrop-filter:blur(12px)',
      'border:1px solid rgba(201,169,110,0.3)',
      'border-left:3px solid ' + colors[type],
      'color:#F8F6F4',
      'padding:10px 16px',
      'border-radius:12px',
      'font-size:14px',
      'font-family:var(--font-body)',
      'box-shadow:0 10px 30px rgba(0,0,0,0.45)',
      'display:flex',
      'align-items:center',
      'gap:8px',
      'pointer-events:auto',
      'animation:toastIn 0.25s ease',
      'max-width:320px'
    ].join(';');
    toast.innerHTML = '<span style="font-size:16px;color:' + colors[type] + '">' + (icons[type] || '•') + '</span>' +
                      '<span>' + message + '</span>';

    container.appendChild(toast);

    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 350);
    }, 3000);
  }

  // Inject toast animation
  (function () {
    var style = document.createElement('style');
    style.textContent = '@keyframes toastIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }';
    document.head.appendChild(style);
  })();

  // ══════════════════════════════════════════════════════════
  // HISTORY (UNDO/REDO)
  // ══════════════════════════════════════════════════════════
  function saveHistory() {
    var s = AppState;
    // Truncate forward history
    s.history = s.history.slice(0, s.historyIndex + 1);
    s.history.push(deepClone(s.elements));
    if (s.history.length > 60) s.history.shift();
    s.historyIndex = s.history.length - 1;
  }

  function undo() {
    var s = AppState;
    if (s.historyIndex <= 0) {
      showToast('No hay más acciones para deshacer.', 'warning');
      return;
    }
    s.historyIndex--;
    s.elements = deepClone(s.history[s.historyIndex]);
    s.selectedId = null;
    _refresh();
    updateCounters();
    showToast('Deshecho', 'info');
  }

  function redo() {
    var s = AppState;
    if (s.historyIndex >= s.history.length - 1) {
      showToast('No hay más acciones para rehacer.', 'warning');
      return;
    }
    s.historyIndex++;
    s.elements = deepClone(s.history[s.historyIndex]);
    s.selectedId = null;
    _refresh();
    updateCounters();
    showToast('Rehecho', 'info');
  }

  // ══════════════════════════════════════════════════════════
  // ELEMENT CRUD
  // ══════════════════════════════════════════════════════════
  function addElement(type, x, y) {
    var cat = window.getCatalogEntry ? window.getCatalogEntry(type) : null;
    if (!cat) {
      showToast('Elemento desconocido: ' + type, 'error');
      return null;
    }

    // Imperial table: prompt for tablones
    if (type === 'table_imperial') {
      _promptImperial(x, y);
      return null;
    }

    var isMesa = cat.defaultChairs > 0 || type.startsWith('table_') || type === 'lounge_set';
    // Periqueras y salas lounge no llevan número de mesa
    var numerada = isMesa && type !== 'table_periquera' && type !== 'table_periquera_umbrella' && type !== 'lounge_set';
    if (numerada) {
      _tableCounter++;
    }
    var elem = {
      id: uid(),
      type: type,
      category: cat.category,
      name: cat.name,
      x: x,
      y: y,
      w: cat.defaultW,
      h: cat.defaultH,
      rotation: 0,
      color: cat.color,
      chairs: cat.defaultChairs,
      editable: true,
      removable: true,
      layer: cat.layer || cat.category,
      mesaConfig: {
        mesaNum: numerada ? _tableCounter : 0,
        capacidadMax: null,
        mantelColor: (type.indexOf('campirana') > -1 || type.indexOf('marble') > -1) ? 'sin_mantel' : 'blanco',
        caminoColor: 'dorado',
        caminoAcomodo: 'diagonal',
        servilletaColorCorazon: 'dorado',
        servilletaColorCorbata: 'champagne',
        servilletaColorOtros: 'blanco',
        servilletaDoblez: ['corazon', 'corbata'],
        cubiertos: 'plateado',
        platoBase: 'ninguno',
        platoTrinche: 'redondo_blanco',
        cristal: 'cubero',
        copasColor: 'transparente',
        cristal2: 'ninguno',
        copasColor2: 'transparente',
        tipoSilla: 'tiffany',
        menu: '',
        arregloFloralTipo: 'bajo',
        arregloFloralAcomodo: 'diagonal',
        ensambleTipo: 'angosto'
      }
    };

    if (cat.bodega) {
      delete elem.mesaConfig;
      elem.nivel = AppState.nivel || 0;
      window.BODEGA.inicializar(elem, cat);
    }

    saveHistory();
    AppState.elements.push(elem);
    // El segundo piso y el sótano tienen su propio nivel: se abre ese nivel para seguir trabajando
    if (cat.bodega && elem.nivel !== AppState.nivel) _setNivel(elem.nivel);
    _refresh();
    updateCounters();
    selectElement(elem.id);
    showToast(cat.name + ' agregado.', 'success');
    return elem;
  }

  function _promptImperial(x, y) {
    var modal = document.createElement('div');
    modal.style.cssText = [
      'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.7)',
      'z-index:50000', 'display:flex', 'align-items:center', 'justify-content:center'
    ].join(';');

    var box = document.createElement('div');
    box.style.cssText = [
      'background:#1F1F1F', 'border:1px solid rgba(201,169,110,0.35)', 'border-radius:16px',
      'padding:28px 32px', 'min-width:300px', 'font-family:sans-serif', 'color:#e2e8f0'
    ].join(';');

    box.innerHTML = [
      '<h3 style="margin:0 0 16px;color:#c9a96e;font-size:18px">Mesa Imperial</h3>',
      '<p style="margin:0 0 14px;font-size:14px;color:#94a3b8">¿Cuántos tablones? <br><small>(mínimo 2 — cada tablón = 2.4m, 10 personas)</small></p>',
      '<input id="imperial-tablones" type="number" min="2" max="20" value="3" style="width:100%;padding:8px 12px;background:#141314;border:1px solid rgba(201,169,110,0.3);border-radius:6px;color:#fff;font-size:16px;box-sizing:border-box;">',
      '<div style="display:flex;gap:10px;margin-top:18px;justify-content:flex-end">',
      '<button id="imperial-cancel" style="padding:8px 18px;background:#374151;color:#e2e8f0;border:none;border-radius:6px;cursor:pointer;font-size:14px">Cancelar</button>',
      '<button id="imperial-ok" style="padding:8px 18px;background:#c9a96e;color:#1F1F1F;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:700">Agregar</button>',
      '</div>'
    ].join('');

    modal.appendChild(box);
    document.body.appendChild(modal);

    var inp = box.querySelector('#imperial-tablones');
    inp.focus();
    inp.select();

    box.querySelector('#imperial-cancel').onclick = function () { modal.remove(); };
    box.querySelector('#imperial-ok').onclick = function () {
      var n = Math.max(2, parseInt(inp.value, 10) || 3);
      modal.remove();
      _createImperial(n, x, y);
    };
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') box.querySelector('#imperial-ok').click();
      if (e.key === 'Escape') box.querySelector('#imperial-cancel').click();
    });
  }

  function _createImperial(tablones, x, y) {
    var cat = window.getCatalogEntry('table_imperial');
    _tableCounter++;
    var elem = {
      id: uid(),
      type: 'table_imperial',
      category: 'mobiliario',
      name: 'Mesa Imperial',
      x: x,
      y: y,
      w: tablones * 2.4,
      h: 0.8,
      rotation: 0,
      color: cat ? cat.color : '#5c3d2e',
      chairs: tablones * 10,
      tablones: tablones,
      editable: true,
      removable: true,
      layer: 'mobiliario',
      mesaConfig: {
        mantelColor: 'blanco',
        caminoColor: 'dorado',
        caminoAcomodo: 'diagonal',
        servilletaColorCorazon: 'dorado',
        servilletaColorCorbata: 'champagne',
        servilletaColorOtros: 'blanco',
        servilletaDoblez: ['corazon', 'corbata'],
        cubiertos: 'plateado',
        platoBase: 'ninguno',
        platoTrinche: 'redondo_blanco',
        cristal: 'cubero',
        copasColor: 'transparente',
        tipoSilla: 'tiffany',
        menu: '',
        mesaNum: _tableCounter,
        capacidadMax: null,
        arregloFloralTipo: 'bajo',
        arregloFloralAcomodo: 'diagonal',
        ensambleTipo: 'angosto'
      }
    };
    saveHistory();
    AppState.elements.push(elem);
    _refresh();
    updateCounters();
    selectElement(elem.id);
    showToast('Mesa Imperial (' + tablones + ' tablones) agregada.', 'success');
  }

  function removeElement(id) {
    var idx = AppState.elements.findIndex(function (e) { return e.id === id; });
    if (idx === -1) return;
    saveHistory();
    AppState.elements.splice(idx, 1);
    if (AppState.selectedId === id) {
      AppState.selectedId = null;
      deselectAll();
    }
    _refresh();
    updateCounters();
    showToast('Elemento eliminado.', 'warning');
  }

  function updateElement(id, changes) {
    var elem = AppState.elements.find(function (e) { return e.id === id; });
    if (!elem) return;
    Object.assign(elem, changes);
    if (window.BODEGA && elem.nivel !== undefined && (changes.w !== undefined || changes.h !== undefined)) {
      window.BODEGA.alRedimensionar(elem);
    }
    _refresh();
    updateCounters();
  }

  // ══════════════════════════════════════════════════════════
  // MODO BODEGA
  // ══════════════════════════════════════════════════════════
  function _setNivel(nivel) {
    AppState.nivel = nivel;
    Array.prototype.forEach.call(document.querySelectorAll('#nivel-selector button'), function (b) {
      b.classList.toggle('active', parseInt(b.getAttribute('data-nivel'), 10) === nivel);
    });
    var sel = AppState.elements.find(function (e) { return e.id === AppState.selectedId; });
    if (sel && (sel.nivel || 0) !== nivel) deselectAll();
    if (window.Editor2D) window.Editor2D.update(AppState.elements);
  }

  // ── Vistas del plano: botones para encuadrar una zona (Salón, Cóctel, Áreas verdes) ──
  function _enfocarVista(nombre) {
    var v = (AppState.vistas || []).find(function (x) { return x.nombre === nombre; });
    AppState.vistaActiva = v ? v.nombre : null;
    if (v) {
      if (AppState.activeView === '2d' && window.Editor2D && window.Editor2D.enfocar) window.Editor2D.enfocar(v.x, v.y, v.w, v.h);
      if (AppState.activeView !== '2d' && window.Visualizer3D && window.Visualizer3D.enfocar) window.Visualizer3D.enfocar(v.x, v.y, v.w, v.h);
    } else {
      if (window.Editor2D) window.Editor2D.resetZoom();
      if (window.Visualizer3D) window.Visualizer3D.resetCamera();
    }
    Array.prototype.forEach.call(document.querySelectorAll('#vista-selector button'), function (b) {
      b.classList.toggle('active', (b.getAttribute('data-vista') || null) === AppState.vistaActiva);
    });
  }

  function _pintarVistas() {
    var cont = document.getElementById('vista-selector');
    if (!cont) return;
    var vistas = AppState.vistas || [];
    cont.classList.toggle('hidden', !vistas.length || AppState.mode === 'bodega');
    cont.innerHTML = vistas.length ? '<button type="button" class="active"><i class="fa-solid fa-expand"></i> Todo</button>' +
      vistas.map(function (v) { return '<button type="button" data-vista="' + v.nombre.replace(/"/g, '&quot;') + '">' + v.nombre + '</button>'; }).join('') : '';
    Array.prototype.forEach.call(cont.querySelectorAll('button'), function (b) {
      b.onclick = function () { _enfocarVista(b.getAttribute('data-vista')); };
    });
  }

  function _aplicarModo() {
    var bodega = AppState.mode === 'bodega';
    document.body.classList.toggle('modo-bodega', bodega);
    var selector = document.getElementById('nivel-selector');
    if (selector) selector.classList.toggle('hidden', !bodega);
    _pintarVistas();
    _setNivel(AppState.nivel || 0);
    _buildToolbox();
  }

  function _pintarInspectorBodega(elem) {
    var panel = document.getElementById('inspector-bodega');
    if (!panel) return;
    var cat = window.getCatalogEntry ? window.getCatalogEntry(elem.type) : null;
    var esBodega = !!(cat && cat.bodega);
    panel.classList.toggle('hidden', !esBodega);
    var lblNombre = document.querySelector('label[for="inspector-name"]');
    if (lblNombre) lblNombre.innerHTML = '<i class="fa-solid fa-tag"></i> ' + (esBodega ? 'Nombre / Etiqueta' : 'Nombre');
    var sillas = document.getElementById('inspector-chairs');
    if (sillas) sillas.closest('.form-group').style.display = esBodega ? 'none' : '';
    if (!esBodega) return;

    function esc(v) {
      return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    }
    var html = '<div class="form-group"><label class="form-label"><i class="fa-solid fa-layer-group"></i> Piso</label>' +
      '<select id="bod-nivel" class="form-input">' + window.BODEGA.NIVELES.map(function (n) {
        return '<option value="' + n.id + '"' + ((elem.nivel || 0) === n.id ? ' selected' : '') + '>' + n.label + '</option>';
      }).join('') + '</select></div>';

    if (window.BODEGA.esPlegada(elem)) {
      if (elem.type !== 'wh_fold_round') {
        html += '<div class="form-group"><label class="form-label"><i class="fa-solid fa-arrows-up-down"></i> Cómo van paradas</label>' +
          '<select id="bod-plegado" class="form-input">' +
          '<option value="largo"' + (elem.plegado === 'largo' ? ' selected' : '') + '>A lo largo</option>' +
          '<option value="ancho"' + (elem.plegado === 'ancho' ? ' selected' : '') + '>A lo ancho</option></select></div>';
      }
      html += '<div class="form-group"><label class="form-label"><i class="fa-solid fa-hashtag"></i> Mesas recargadas juntas</label>' +
        '<input id="bod-cantidad" type="number" min="1" max="100" class="form-input" value="' + elem.cantidad + '"></div>';
    }
    if (elem.type === 'wh_chair_stack') {
      html += '<div class="form-group"><label class="form-label"><i class="fa-solid fa-hashtag"></i> Sillas en la torre</label>' +
        '<input id="bod-cantidad" type="number" min="1" max="40" class="form-input" value="' + elem.cantidad + '"></div>';
    }
    if (elem.type === 'wh_island') {
      html += '<div class="form-group"><label class="form-label"><i class="fa-solid fa-table-cells"></i> Filas de mesas</label>' +
        '<input id="bod-filas" type="number" min="1" max="20" class="form-input" value="' + elem.filas + '"></div>' +
        '<div class="form-group"><label class="form-label"><i class="fa-solid fa-object-ungroup"></i> Secciones de la isla</label>';
      elem.secciones.forEach(function (s, i) {
        html += '<div class="bod-seccion" data-i="' + i + '">' +
          '<input class="form-input bod-sec-nombre" value="' + esc(s.nombre) + '" placeholder="Nombre de la sección">' +
          '<input class="form-input bod-sec-col" type="number" min="1" max="30" value="' + s.columnas + '" title="Mesas a lo largo">' +
          '<button type="button" class="btn-icon-sm bod-sec-quitar" title="Quitar sección"' + (elem.secciones.length < 2 ? ' disabled' : '') + '><i class="fa-solid fa-xmark"></i></button>' +
          '</div>';
      });
      html += '<p class="bod-ayuda">El número es cuántas mesas lleva cada sección a lo largo.</p>' +
        '<button type="button" id="bod-sec-agregar" class="btn-icon-sm"><i class="fa-solid fa-plus"></i> Agregar sección</button></div>';
    }
    panel.innerHTML = html;

    function aplicar() {
      window.BODEGA.recalcular(elem);
      updateInspectorField('inspector-w', parseFloat(elem.w).toFixed(2));
      updateInspectorField('inspector-h', parseFloat(elem.h).toFixed(2));
      _refresh();
    }
    function enlazar(id, fn) {
      var el = panel.querySelector(id);
      if (el) el.addEventListener('change', function () { saveHistory(); fn(el); aplicar(); });
    }
    enlazar('#bod-nivel', function (el) {
      elem.nivel = parseInt(el.value, 10);
      _setNivel(elem.nivel);
    });
    enlazar('#bod-plegado', function (el) { elem.plegado = el.value; });
    enlazar('#bod-cantidad', function (el) { elem.cantidad = Math.max(1, parseInt(el.value, 10) || 1); });
    enlazar('#bod-filas', function (el) { elem.filas = Math.max(1, parseInt(el.value, 10) || 1); });
    Array.prototype.forEach.call(panel.querySelectorAll('.bod-seccion'), function (fila) {
      var s = elem.secciones[parseInt(fila.getAttribute('data-i'), 10)];
      fila.querySelector('.bod-sec-nombre').addEventListener('change', function (e) {
        saveHistory(); s.nombre = e.target.value; aplicar();
      });
      fila.querySelector('.bod-sec-col').addEventListener('change', function (e) {
        saveHistory(); s.columnas = Math.max(1, parseInt(e.target.value, 10) || 1); aplicar();
      });
      fila.querySelector('.bod-sec-quitar').addEventListener('click', function () {
        saveHistory();
        elem.secciones.splice(elem.secciones.indexOf(s), 1);
        aplicar();
        _pintarInspectorBodega(elem);
      });
    });
    var agregar = panel.querySelector('#bod-sec-agregar');
    if (agregar) agregar.addEventListener('click', function () {
      saveHistory();
      elem.secciones.push({ nombre: 'Sección ' + String.fromCharCode(65 + elem.secciones.length % 26), columnas: 1 });
      aplicar();
      _pintarInspectorBodega(elem);
    });
  }

  function selectElement(id) {
    AppState.selectedId = id;
    var elem = AppState.elements.find(function (e) { return e.id === id; });

    if (window.Editor2D) window.Editor2D.select(id);
    if (window.Visualizer3D) window.Visualizer3D.select(id);

    if (elem) {
      _populateInspector(elem);
    }
    _updateInspectorVisibility(!!elem);
  }

  function deselectAll() {
    AppState.selectedId = null;
    if (window.Editor2D) window.Editor2D.deselect();
    if (window.Visualizer3D) window.Visualizer3D.deselect();
    _updateInspectorVisibility(false);
  }

  function duplicateElement(id) {
    var src = AppState.elements.find(function (e) { return e.id === id; });
    if (!src) return;
    saveHistory();
    var copy = deepClone(src);
    copy.id = uid();
    copy.x = Math.min(src.x + 1.5, AppState.terrain.w - src.w / 2);
    copy.y = Math.min(src.y + 1.5, AppState.terrain.h - src.h / 2);
    // Solo lleva número la copia de una mesa numerada (periqueras, salas lounge y mesas de regalos no)
    if (copy.mesaConfig && src.mesaConfig && src.mesaConfig.mesaNum > 0) {
      _tableCounter++;
      copy.mesaConfig.mesaNum = _tableCounter;
    } else if (copy.mesaConfig) {
      copy.mesaConfig.mesaNum = 0;
    }
    AppState.elements.push(copy);
    _refresh();
    updateCounters();
    selectElement(copy.id);
    showToast('Elemento duplicado.', 'success');
  }

  function rotateElement(id, deg) {
    var elem = AppState.elements.find(function (e) { return e.id === id; });
    if (!elem) return;
    saveHistory();
    elem.rotation = ((elem.rotation || 0) + (deg || 45)) % 360;
    _refresh();
    updateInspectorField('inp-rotation', elem.rotation);
  }

  // ══════════════════════════════════════════════════════════
  // REFRESH — update both 2D and 3D views
  // ══════════════════════════════════════════════════════════
  function _refresh() {
    if (window.Editor2D) window.Editor2D.update(AppState.elements);
    if (window.Visualizer3D) window.Visualizer3D.sync(AppState.elements);
    if (AppState.selectedId) window.Editor2D && window.Editor2D.select(AppState.selectedId);
  }

  // ══════════════════════════════════════════════════════════
  // COUNTERS
  // ══════════════════════════════════════════════════════════
  function updateCounters() {
    var totalGuests = 0;
    var totalCapacity = 0;
    var tableCounts = {};

    AppState.elements.forEach(function (elem) {
      var t = elem.type;
      
      var isTable = t.startsWith('table_') || t === 'lounge_set';
      var isDecorativeTable = ['table_cake', 'table_gifts', 'table_candy', 'table_shots', 'table_buffet'].indexOf(t) !== -1;
      
      if (isTable && !isDecorativeTable) {
        if (elem.chairs) totalCapacity += elem.chairs;
        if (elem.mesaConfig && elem.mesaConfig.invitados) {
          elem.mesaConfig.invitados.forEach(function (g) {
            totalGuests += (g.pases || 0);
          });
        }
      } else if (elem.chairs && t !== 'terrain' && t !== 'salon') {
        totalCapacity += elem.chairs;
        if (elem.mesaConfig && elem.mesaConfig.invitados) {
          elem.mesaConfig.invitados.forEach(function (g) {
            totalGuests += (g.pases || 0);
          });
        }
      }
      
      tableCounts[t] = (tableCounts[t] || 0) + 1;
    });

    var guestEl = document.getElementById('counter-guests');
    if (guestEl) {
      guestEl.textContent = totalGuests + ' / ' + totalCapacity;
    }

    var tableEl = document.getElementById('counter-tables');
    if (tableEl) {
      var tableTotal = 0;
      var excludedTables = ['table_cake', 'table_gifts', 'table_candy', 'table_shots', 'table_buffet'];
      Object.keys(tableCounts).forEach(function (k) {
        if ((k.startsWith('table_') || k === 'lounge_set') && excludedTables.indexOf(k) === -1) {
          tableTotal += tableCounts[k];
        }
      });
      tableEl.textContent = tableTotal;
    }

    var imperialEl = document.getElementById('counter-imperial');
    if (imperialEl) {
      imperialEl.textContent = tableCounts['table_imperial'] || 0;
    }
  }

  // ══════════════════════════════════════════════════════════
  // INSPECTOR
  // ══════════════════════════════════════════════════════════
  function renderGuestListEditor(elem) {
    var guestsListEl = document.getElementById('mesa-invitados-list');
    if (!guestsListEl) return;
    
    var maxCapacity = (elem.mesaConfig && elem.mesaConfig.capacidadMax) ? elem.mesaConfig.capacidadMax : (elem.type === 'table_imperial' ? ((elem.tablones || 4) * 10) : 10);
    var invitados = elem.mesaConfig.invitados || [];
    
    var html = '';
    html += '<div style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">';
    if (invitados.length === 0) {
      html += '  <span style="color:var(--text-muted); font-size:12px;">No hay invitados asignados a esta mesa.</span>';
    } else {
      invitados.forEach(function (guest, idx) {
        html += '  <div class="guest-edit-row" data-index="' + idx + '" style="display:flex; align-items:center; gap:6px;">';
        html += '    <input type="text" class="guest-name-input form-input" value="' + guest.nombre + '" style="flex:1; padding:4px 8px; font-size:12px; background:rgba(10,9,10,0.55); border:1px solid rgba(201,169,110,0.16); color:var(--text-primary); border-radius:4px;" placeholder="Nombre" />';
        html += '    <input type="number" class="guest-passes-input form-input" min="1" max="' + maxCapacity + '" value="' + guest.pases + '" style="width:50px; padding:4px; font-size:12px; background:rgba(10,9,10,0.55); border:1px solid rgba(201,169,110,0.16); color:var(--text-primary); border-radius:4px; text-align:center;" />';
        html += '    <button class="guest-delete-btn" style="padding:4px 8px; background:rgba(217,79,111,0.15); border:1px solid rgba(217,79,111,0.35); color:#d94f6f; border-radius:4px; cursor:pointer;" title="Eliminar"><i class="fa-solid fa-trash"></i></button>';
        html += '  </div>';
      });
    }
    html += '</div>';
    html += '<button id="btn-add-guest" style="width:100%; padding:6px; background:rgba(244,63,94,0.1); color:#f43f5e; border:1px dashed #f43f5e; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px;">';
    html += '  <i class="fa-solid fa-plus"></i> Agregar Invitado';
    html += '</button>';
    
    guestsListEl.innerHTML = html;
    
    var rows = guestsListEl.querySelectorAll('.guest-edit-row');
    rows.forEach(function (row) {
      var idx = parseInt(row.dataset.index, 10);
      var nameInp = row.querySelector('.guest-name-input');
      var passesInp = row.querySelector('.guest-passes-input');
      var delBtn = row.querySelector('.guest-delete-btn');
      
      nameInp.oninput = function () {
        invitados[idx].nombre = nameInp.value;
      };
      
      nameInp.onchange = function () {
        saveHistory();
      };
      
      passesInp.onchange = function () {
        var v = parseInt(passesInp.value, 10);
        if (isNaN(v) || v < 1) v = 1;
        
        var otherSum = 0;
        invitados.forEach(function (g, gIdx) {
          if (gIdx !== idx) otherSum += g.pases;
        });
        
        if (otherSum + v > maxCapacity) {
          showToast('¡Capacidad excedida! El límite de la mesa es de ' + maxCapacity + ' personas.', 'warning');
          v = maxCapacity - otherSum;
          if (v < 1) v = 1;
          passesInp.value = v;
        }
        
        saveHistory();
        invitados[idx].pases = v;
        elem.chairs = invitados.reduce(function (sum, g) { return sum + g.pases; }, 0);
        updateCounters();
        _refresh();
      };
      
      delBtn.onclick = function () {
        saveHistory();
        invitados.splice(idx, 1);
        elem.chairs = invitados.reduce(function (sum, g) { return sum + g.pases; }, 0);
        updateCounters();
        _refresh();
        renderGuestListEditor(elem);
      };
    });
    
    var addBtn = guestsListEl.querySelector('#btn-add-guest');
    if (addBtn) {
      addBtn.onclick = function () {
        var currentSum = invitados.reduce(function (sum, g) { return sum + g.pases; }, 0);
        if (currentSum >= maxCapacity) {
          showToast('¡Mesa llena! No se pueden agregar más invitados a esta mesa.', 'warning');
          return;
        }
        
        saveHistory();
        invitados.push({ nombre: 'Nuevo Invitado', pases: 1 });
        elem.chairs = invitados.reduce(function (sum, g) { return sum + g.pases; }, 0);
        updateCounters();
        _refresh();
        renderGuestListEditor(elem);
      };
    }
  }

  function renderNapkinSlots(elem) {
    var container = document.getElementById('mesa-servilletas-config-container');
    if (!container) return;
    
    if (!elem || !elem.mesaConfig) {
      container.innerHTML = '';
      return;
    }
    
    var cfg = elem.mesaConfig;
    
    var activeFolds = [];
    if (Array.isArray(cfg.servilletaDoblez)) {
      activeFolds = cfg.servilletaDoblez;
    } else if (typeof cfg.servilletaDoblez === 'string' && cfg.servilletaDoblez) {
      activeFolds = [cfg.servilletaDoblez];
    }
    
    var slots = [
      { type: activeFolds[0] || 'ninguno', color: '' },
      { type: activeFolds[1] || 'ninguno', color: '' },
      { type: activeFolds[2] || 'ninguno', color: '' }
    ];
    
    slots.forEach(function (slot) {
      if (slot.type !== 'ninguno') {
        var foldKey = 'servilletaColor_' + slot.type;
        var defaultColor = 'blanco';
        if (slot.type === 'corazon') defaultColor = cfg.servilletaColorCorazon || 'dorado';
        else if (slot.type === 'corbata') defaultColor = cfg.servilletaColorCorbata || 'champagne';
        else if (slot.type === 'default') defaultColor = cfg.servilletaColorOtros || 'blanco';
        
        slot.color = cfg[foldKey] || defaultColor;
      } else {
        slot.color = 'blanco';
      }
    });
    
    var foldOptions = [
      { value: 'ninguno', label: 'Ninguno' },
      { value: 'corazon', label: 'Corazón' },
      { value: 'corbata', label: 'Corbata' },
      { value: 'loto', label: 'Loto' },
      { value: 'vela', label: 'Vela' },
      { value: 'abanico', label: 'Abanico' },
      { value: 'piramide', label: 'Pirámide' },
      { value: 'cartera', label: 'Cartera' },
      { value: 'conito', label: 'Conito' }
    ];
    
    var colorOptions = [
      { value: 'blanco', label: 'Blanco' },
      { value: 'dorado', label: 'Dorado' },
      { value: 'champagne', label: 'Champagne' },
      { value: 'negro', label: 'Negro' },
      { value: 'caqui', label: 'Caqui' },
      { value: 'azul_marino', label: 'Azul Marino' },
      { value: 'arena', label: 'Arena' },
      { value: 'chocolate', label: 'Chocolate' },
      { value: 'palo_de_rosa', label: 'Palo de Rosa' },
      { value: 'rojo', label: 'Rojo' },
      { value: 'verde_olivo', label: 'Verde Olivo' },
      { value: 'azul_rey', label: 'Azul Rey' },
      { value: 'rosa_mexicano', label: 'Rosa Mexicano' },
      { value: 'azul_cielo', label: 'Azul Cielo' },
      { value: 'plata', label: 'Plata' },
      { value: 'azul_plumbago', label: 'Azul Plumbago (corrugada)' }
    ];
    
    var html = '';
    slots.forEach(function (slot, idx) {
      var slotNum = idx + 1;
      html += '<div style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 10px; border: 1px solid rgba(201,169,110,0.16); margin-bottom: 10px;">';
      html += '  <div style="font-size: 11px; font-weight: bold; color: var(--gold); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">';
      html += '    <i class="fa-solid fa-cookie"></i> Doblez de Servilleta ' + slotNum;
      html += '  </div>';
      
      html += '  <div class="form-group" style="margin-bottom: 6px;">';
      html += '    <label class="form-label" style="font-size:11px; color:var(--text-secondary); margin-bottom:2px;">Tipo de Doblez</label>';
      html += '    <select class="form-input napkin-slot-type" data-slot="' + idx + '" style="font-size:12px; padding:6px 10px; background:rgba(10,9,10,0.55); border:1px solid rgba(201,169,110,0.16); color:var(--text-primary); border-radius:4px; width:100%; box-sizing:border-box;">';
      foldOptions.forEach(function (opt) {
        var selected = opt.value === slot.type ? ' selected' : '';
        html += '      <option value="' + opt.value + '"' + selected + '>' + opt.label + '</option>';
      });
      html += '    </select>';
      html += '  </div>';
      
      var colorHiddenStyle = slot.type === 'ninguno' ? ' style="margin-bottom: 0; display:none;"' : ' style="margin-bottom: 0;"';
      html += '  <div class="form-group napkin-slot-color-wrapper" data-slot="' + idx + '"' + colorHiddenStyle + '>';
      html += '    <label class="form-label" style="font-size:11px; color:var(--text-secondary); margin-bottom:2px;">Color de Servilleta</label>';
      html += '    <select class="form-input napkin-slot-color" data-slot="' + idx + '" style="font-size:12px; padding:6px 10px; background:rgba(10,9,10,0.55); border:1px solid rgba(201,169,110,0.16); color:var(--text-primary); border-radius:4px; width:100%; box-sizing:border-box;">';
      colorOptions.forEach(function (opt) {
        var selected = opt.value === slot.color ? ' selected' : '';
        html += '      <option value="' + opt.value + '"' + selected + '>' + opt.label + '</option>';
      });
      html += '    </select>';
      html += '  </div>';
      
      html += '</div>';
    });
    
    container.innerHTML = html;
    
    container.querySelectorAll('.napkin-slot-type').forEach(function (select) {
      select.onchange = function () {
        saveHistory();
        var sIdx = parseInt(select.getAttribute('data-slot'), 10);
        var selectedType = select.value;
        
        var wrapper = container.querySelector('.napkin-slot-color-wrapper[data-slot="' + sIdx + '"]');
        if (wrapper) {
          if (selectedType === 'ninguno') {
            wrapper.style.display = 'none';
          } else {
            wrapper.style.display = '';
          }
        }
        
        _saveSlotsToConfig();
      };
    });
    
    container.querySelectorAll('.napkin-slot-color').forEach(function (select) {
      select.onchange = function () {
        saveHistory();
        _saveSlotsToConfig();
      };
    });
    
    function _saveSlotsToConfig() {
      var newFolds = [];
      for (var i = 0; i < 3; i++) {
        var typeSel = container.querySelector('.napkin-slot-type[data-slot="' + i + '"]');
        var colorSel = container.querySelector('.napkin-slot-color[data-slot="' + i + '"]');
        if (typeSel && typeSel.value !== 'ninguno') {
          var t = typeSel.value;
          var c = colorSel ? colorSel.value : 'blanco';
          newFolds.push(t);
          
          var foldKey = 'servilletaColor_' + t;
          cfg[foldKey] = c;
          
          if (t === 'corazon') cfg.servilletaColorCorazon = c;
          else if (t === 'corbata') cfg.servilletaColorCorbata = c;
          else if (t === 'default') cfg.servilletaColorOtros = c;
        }
      }
      cfg.servilletaDoblez = newFolds;
      _refresh();
    }
  }

  function _populateInspector(elem) {
    _pintarInspectorBodega(elem);
    function setVal(id, v) {
      var el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = (v !== undefined && v !== null) ? v : '';
    }

    setVal('inspector-name', elem.name);
    setVal('inspector-x', parseFloat(elem.x).toFixed(2));
    setVal('inspector-y', parseFloat(elem.y).toFixed(2));
    setVal('inspector-w', parseFloat(elem.w).toFixed(2));
    setVal('inspector-h', parseFloat(elem.h).toFixed(2));
    setVal('inspector-rotation', elem.rotation || 0);
    setVal('inspector-color', elem.color || '#888888');
    setVal('inspector-elevation', elem.elevation || 0);
    
    var disp = document.getElementById('color-hex-display');
    if (disp) disp.textContent = (elem.color || '#888888').toUpperCase();

    setVal('inspector-chairs', elem.chairs || 0);
    setVal('inspector-elevation', elem.elevation || 0.0);

    var chairsInp = document.getElementById('inspector-chairs');
    if (chairsInp) {
      var isTable = elem.type.startsWith('table_') || elem.type === 'lounge_set';
      if (isTable && elem.type !== 'table_imperial') {
        var maxCap = (elem.mesaConfig && elem.mesaConfig.capacidadMax) ? elem.mesaConfig.capacidadMax : 10;
        chairsInp.setAttribute('max', maxCap.toString());
      } else {
        chairsInp.removeAttribute('max');
      }
    }

    // Salon specific settings
    var salonSettings = document.getElementById('inspector-salon-settings');
    if (salonSettings) {
      if (elem.type === 'salon') {
        salonSettings.classList.remove('hidden');
        setVal('inspector-salon-type', elem.salonType || 'muros');
      } else {
        salonSettings.classList.add('hidden');
      }
    }

    // Imperial tablones row (hidden unless imperial table)
    var tablonRow = document.getElementById('mesa-tablones-row');
    var ensambleRow = document.getElementById('mesa-ensamble-row');
    if (elem.type === 'table_imperial') {
      if (tablonRow) {
        tablonRow.classList.remove('hidden');
        setVal('mesa-num-tablones', elem.tablones || 3);
      }
      if (ensambleRow) {
        ensambleRow.classList.remove('hidden');
        setVal('mesa-ensamble-tipo', (elem.mesaConfig && elem.mesaConfig.ensambleTipo) || 'angosto');
      }
    } else {
      if (tablonRow) tablonRow.classList.add('hidden');
      if (ensambleRow) ensambleRow.classList.add('hidden');
    }

    // Mesa config
    var hasMesa = !!(elem.mesaConfig);
    var tabMesaBtn = document.getElementById('tab-mesa');
    if (tabMesaBtn) {
      tabMesaBtn.style.display = hasMesa ? '' : 'none';
      if (hasMesa) {
        tabMesaBtn.click();
      } else if (tabMesaBtn.classList.contains('active')) {
        var tabPropsBtn = document.getElementById('tab-settings');
        if (tabPropsBtn) tabPropsBtn.click();
      }
    }

    if (hasMesa && elem.mesaConfig) {
      setVal('mesa-numero', elem.mesaConfig.mesaNum || 0);
      
      var mantelSelect = document.getElementById('mesa-mantel-color');
      if (mantelSelect) {
        var val = elem.mesaConfig.mantelColor || 'blanco';
        var toRemove = [];
        for (var i = 0; i < mantelSelect.options.length; i++) {
          var opt = mantelSelect.options[i];
          if (opt.value.startsWith('#') || opt.text.indexOf('Personalizado') === 0) {
            toRemove.push(opt);
          }
        }
        toRemove.forEach(function (opt) { opt.remove(); });

        var optionExists = Array.from(mantelSelect.options).some(function (opt) { return opt.value === val; });
        if (!optionExists && val.startsWith('#')) {
          var opt = document.createElement('option');
          opt.value = val;
          opt.textContent = 'Personalizado (' + val + ')';
          mantelSelect.add(opt);
        }
        mantelSelect.value = val;
      }
      setVal('mesa-capacidad-max', elem.mesaConfig.capacidadMax || '');
      setVal('mesa-camino-color', elem.mesaConfig.caminoColor || 'ninguno');
      setVal('mesa-camino-acomodo', elem.mesaConfig.caminoAcomodo || 'centro');
      renderNapkinSlots(elem);
      setVal('mesa-cubiertos', elem.mesaConfig.cubiertos || 'plateado');
      setVal('mesa-plato-base', elem.mesaConfig.platoBase || 'ninguno');
      setVal('mesa-plato-trinche', elem.mesaConfig.platoTrinche || 'redondo_blanco');
      setVal('mesa-cristal', elem.mesaConfig.cristal || 'standard');
      setVal('mesa-copas-color', elem.mesaConfig.copasColor || 'transparente');
      setVal('mesa-cristal2', elem.mesaConfig.cristal2 || 'ninguno');
      setVal('mesa-copas-color2', elem.mesaConfig.copasColor2 || 'transparente');
      setVal('mesa-silla-tipo', elem.mesaConfig.tipoSilla || 'tiffany');
      setVal('mesa-silla-funda', elem.mesaConfig.sillaFunda || 'ninguna');
      setVal('mesa-menu', elem.mesaConfig.menu || '');
      setVal('mesa-floral-tipo', elem.mesaConfig.arregloFloralTipo || 'ninguno');
      setVal('mesa-floral-acomodo', elem.mesaConfig.arregloFloralAcomodo || 'ninguno');

      if (!elem.mesaConfig.invitados) elem.mesaConfig.invitados = [];
      renderGuestListEditor(elem);
    }

    // Type badge
    var typeBadge = document.getElementById('inspector-type');
    if (typeBadge) {
      var cat = window.getCatalogEntry ? window.getCatalogEntry(elem.type) : null;
      typeBadge.textContent = (cat ? cat.name : elem.type) + (elem.type === 'table_imperial' ? ' (' + (elem.tablones || 3) + ' tablones)' : '');
    }
  }

  function _updateInspectorVisibility(hasElem) {
    var panel = document.getElementById('inspector-empty');
    var content = document.getElementById('inspector-panel');
    if (panel) panel.style.display = hasElem ? 'none' : '';
    if (content) content.style.display = hasElem ? '' : 'none';

    // Mobile slide-in
    var sidebarRight = document.getElementById('sidebar-right');
    if (sidebarRight && window.innerWidth < 768) {
      if (hasElem) sidebarRight.classList.add('open');
      else sidebarRight.classList.remove('open');
    }
  }

  function updateInspectorField(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!value;
    else el.value = value;
  }

  function _wireInspector() {
    function onInpChange(id, fn) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () {
        var sid = AppState.selectedId;
        if (!sid) return;
        fn(sid, el);
      });
      el.addEventListener('change', function () {
        var sid = AppState.selectedId;
        if (!sid) return;
        fn(sid, el);
      });
    }

    onInpChange('inspector-name', function (id, el) {
      updateElement(id, { name: el.value });
      showToast('Nombre actualizado.', 'info');
    });

    onInpChange('inspector-x', function (id, el) {
      var v = parseFloat(el.value);
      if (!isNaN(v)) updateElement(id, { x: v });
    });
    onInpChange('inspector-y', function (id, el) {
      var v = parseFloat(el.value);
      if (!isNaN(v)) updateElement(id, { y: v });
    });
    onInpChange('inspector-w', function (id, el) {
      var v = parseFloat(el.value);
      if (!isNaN(v) && v > 0) {
        saveHistory();
        updateElement(id, { w: v });
      }
    });
    onInpChange('inspector-h', function (id, el) {
      var v = parseFloat(el.value);
      if (!isNaN(v) && v > 0) { saveHistory(); updateElement(id, { h: v }); }
    });
    onInpChange('inspector-rotation', function (id, el) {
      var v = parseFloat(el.value);
      if (!isNaN(v)) updateElement(id, { rotation: v });
    });
    onInpChange('inspector-color', function (id, el) {
      var elem = AppState.elements.find(function (e) { return e.id === id; });
      var updates = { color: el.value };
      if (elem && elem.mesaConfig) {
        elem.mesaConfig.mantelColor = el.value;
        var selectEl = document.getElementById('mesa-mantel-color');
        if (selectEl) {
          var optionExists = Array.from(selectEl.options).some(function (opt) { return opt.value === el.value; });
          if (!optionExists) {
            var opt = document.createElement('option');
            opt.value = el.value;
            opt.textContent = 'Personalizado (' + el.value + ')';
            selectEl.add(opt);
          }
          selectEl.value = el.value;
        }
      }
      updateElement(id, updates);
      var disp = document.getElementById('color-hex-display');
      if (disp) disp.textContent = el.value.toUpperCase();
    });
    onInpChange('inspector-chairs', function (id, el) {
      var v = parseInt(el.value, 10);
      if (!isNaN(v) && v >= 0) {
        var elem = AppState.elements.find(function (e) { return e.id === id; });
        if (elem) {
          var isTable = elem.type.startsWith('table_') || elem.type === 'lounge_set';
          var maxChairs = (elem.type === 'table_marble_square') ? 12 : 10;
          if (isTable && elem.type !== 'table_imperial' && v > maxChairs) {
            v = maxChairs;
            el.value = maxChairs;
          }
          saveHistory();
          updateElement(id, { chairs: v });
          updateCounters();
        }
      }
    });
    onInpChange('inspector-elevation', function (id, el) {
      var v = parseFloat(el.value);
      if (!isNaN(v)) {
        saveHistory();
        updateElement(id, { elevation: v });
      }
    });
    onInpChange('inspector-salon-type', function (id, el) {
      saveHistory();
      updateElement(id, { salonType: el.value });
    });

    // Imperial tablones
    onInpChange('mesa-num-tablones', function (id, el) {
      var n = Math.max(2, parseInt(el.value, 10) || 3);
      saveHistory();
      updateElement(id, { tablones: n, w: n * 2.4, chairs: n * 10 });
      updateInspectorField('inspector-w', (n * 2.4).toFixed(2));
      updateInspectorField('inspector-chairs', n * 10);
      updateCounters();
    });

    // Mesa config
    function mesaInp(id, field) {
      onInpChange(id, function (eid, el) {
        var elem = AppState.elements.find(function (e) { return e.id === eid; });
        if (!elem || !elem.mesaConfig) return;
        var val = el.type === 'checkbox' ? el.checked : el.value;
        elem.mesaConfig[field] = val;
        
        if (field === 'ensambleTipo') {
          if (val === 'angosto') {
            elem.h = 1.6;
            updateInspectorField('inspector-h', 1.6);
          } else if (val === 'ancho') {
            elem.w = 2.4;
            elem.h = (elem.tablones || 4) * 0.8;
            updateInspectorField('inspector-w', 2.4);
            updateInspectorField('inspector-h', elem.h);
          }
        }
        
        if (field === 'mantelColor') {
          var colorMap = {
            blanco: '#ffffff',
            marfil: '#fffff0',
            negro: '#18181b',
            caqui: '#c3b091',
            azul_marino: '#0f172a',
            arena: '#e5e5e5',
            chocolate: '#3b2314',
            dorado: '#d4af37',
            palo_de_rosa: '#d39e9e',
            rojo: '#ef4444',
            verde: '#10b981',
            amarillo: '#f59e0b'
          };
          if (val === 'sin_mantel') {
            var cat = window.getCatalogEntry ? window.getCatalogEntry(elem.type) : null;
            elem.color = (cat && cat.color) ? cat.color : '#888888';
          } else if (colorMap[val]) {
            elem.color = colorMap[val];
          } else if (val.startsWith('#')) {
            elem.color = val;
          }
          var colorPicker = document.getElementById('inspector-color');
          if (colorPicker) colorPicker.value = elem.color;
          var disp = document.getElementById('color-hex-display');
          if (disp) disp.textContent = elem.color.toUpperCase();
        }
        
        _refresh();
      });
    }
    onInpChange('mesa-capacidad-max', function (id, el) {
      var elem = AppState.elements.find(function (e) { return e.id === id; });
      if (!elem || !elem.mesaConfig) return;
      saveHistory();
      var v = parseInt(el.value, 10);
      if (isNaN(v) || v < 1) {
        elem.mesaConfig.capacidadMax = null;
      } else {
        elem.mesaConfig.capacidadMax = v;
        if (elem.chairs > v) {
          showToast('La cantidad de sillas se ajustó al nuevo límite de capacidad.', 'warning');
          elem.chairs = v;
          updateInspectorField('inspector-chairs', v);
        }
      }
      updateCounters();
      _refresh();
      renderGuestListEditor(elem);
    });



    mesaInp('mesa-numero', 'mesaNum');
    mesaInp('mesa-mantel-color', 'mantelColor');
    mesaInp('mesa-camino-color', 'caminoColor');
    mesaInp('mesa-camino-acomodo', 'caminoAcomodo');
    mesaInp('mesa-cubiertos', 'cubiertos');
    mesaInp('mesa-plato-base', 'platoBase');
    mesaInp('mesa-plato-trinche', 'platoTrinche');
    mesaInp('mesa-cristal', 'cristal');
    mesaInp('mesa-copas-color', 'copasColor');
    mesaInp('mesa-cristal2', 'cristal2');
    mesaInp('mesa-copas-color2', 'copasColor2');
    mesaInp('mesa-silla-tipo', 'tipoSilla');
    mesaInp('mesa-silla-funda', 'sillaFunda');
    mesaInp('mesa-menu', 'menu');
    mesaInp('mesa-floral-tipo', 'arregloFloralTipo');
    mesaInp('mesa-floral-acomodo', 'arregloFloralAcomodo');
    mesaInp('mesa-ensamble-tipo', 'ensambleTipo');

    // Action buttons
    var btnRotate = document.getElementById('btn-rotate-90');
    if (btnRotate) btnRotate.onclick = function () {
      if (AppState.selectedId) rotateElement(AppState.selectedId, 90);
    };

    var btnDuplicate = document.getElementById('btn-duplicate-element');
    if (btnDuplicate) btnDuplicate.onclick = function () {
      if (AppState.selectedId) duplicateElement(AppState.selectedId);
    };

    var btnDelete = document.getElementById('btn-delete-element');
    if (btnDelete) btnDelete.onclick = function () {
      if (AppState.selectedId) {
        if (confirm('¿Eliminar este elemento?')) removeElement(AppState.selectedId);
      }
    };
  }

  // ══════════════════════════════════════════════════════════
  // TOOLBOX
  // ══════════════════════════════════════════════════════════
  function _buildToolbox() {
    var container = document.getElementById('toolbox-list');
    if (!container) return;
    container.innerHTML = '';

    var enBodega = AppState.mode === 'bodega';
    var cats = enBodega ? window.BODEGA.CATEGORIAS : ['estructuras', 'accesos', 'mobiliario', 'entretenimiento', 'decoracion', 'proveedores'];

    cats.forEach(function (cat) {
      var catMeta = window.ELEMENT_CATEGORIES[cat] || { label: cat, icon: 'fa-cube', color: '#888' };
      var items = window.ELEMENTS_CATALOG.filter(function (e) { return e.category === cat; });

      var section = document.createElement('div');
      section.className = 'toolbox-section';
      section.dataset.category = cat;

      var header = document.createElement('div');
      header.className = 'toolbox-cat-header';
      header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;user-select:none;background:rgba(255,255,255,0.04);border-radius:6px;margin-bottom:4px;';
      header.innerHTML = '<i class="fas ' + catMeta.icon + '" style="color:' + catMeta.color + ';width:16px;text-align:center"></i>' +
                         '<span style="font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em">' + catMeta.label + '</span>' +
                         '<span class="cat-badge" style="margin-left:auto;font-size:10px;background:#334155;color:#94a3b8;border-radius:999px;padding:1px 6px">' + items.length + '</span>' +
                         '<i class="fas fa-chevron-down cat-chevron" style="font-size:10px;color:#64748b;margin-left:4px;transition:transform 0.2s"></i>';

      var grid = document.createElement('div');
      grid.className = 'toolbox-grid';
      grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:2px 0 8px;';

      items.forEach(function (item) {
        var card = document.createElement('div');
        card.className = 'toolbox-card';
        card.dataset.type = item.type;
        card.style.cssText = [
          'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
          'gap:4px', 'padding:10px 6px', 'background:rgba(255,255,255,0.025)', 'border:1px solid rgba(201,169,110,0.16)',
          'border-radius:8px', 'cursor:pointer', 'transition:all 0.15s', 'text-align:center',
          'user-select:none'
        ].join(';');

        card.innerHTML = '<i class="fas ' + item.icon + '" style="font-size:18px;color:' + item.color + '"></i>' +
                         '<span style="font-size:10px;color:#cbd5e1;line-height:1.3;max-width:72px">' + item.name + '</span>';

        card.addEventListener('mouseenter', function () {
          card.style.background = '#2d3f54';
          card.style.borderColor = item.color;
          card.style.transform = 'scale(1.03)';
        });
        card.addEventListener('mouseleave', function () {
          card.style.background = AppState.pendingType === item.type ? 'rgba(246,92,122,0.16)' : 'rgba(255,255,255,0.025)';
          card.style.borderColor = AppState.pendingType === item.type ? item.color : '#334155';
          card.style.transform = '';
        });
        card.addEventListener('click', function () {
          _setPendingType(item.type, item.color, card);
        });

        grid.appendChild(card);
      });

      // Collapse toggle
      var collapsed = false;
      header.addEventListener('click', function () {
        collapsed = !collapsed;
        grid.style.display = collapsed ? 'none' : 'grid';
        var chev = header.querySelector('.cat-chevron');
        if (chev) chev.style.transform = collapsed ? 'rotate(-90deg)' : '';
      });

      section.appendChild(header);
      section.appendChild(grid);
      container.appendChild(section);
    });
  }

  var _lastPendingCard = null;
  var _lastPendingColor = null;

  function _setPendingType(type, color, card) {
    // Switch to 2D view for editing/placing
    if (window.App_setView) {
      window.App_setView('2d');
    }

    var banner = document.getElementById('placement-banner');
    var bannerTxt = document.getElementById('placement-banner-text');

    // Deselect previous card
    if (_lastPendingCard) {
      _lastPendingCard.style.background = 'rgba(255,255,255,0.025)';
      _lastPendingCard.style.borderColor = '#334155';
      _lastPendingCard.style.outline = '';
    }

    if (AppState.pendingType === type || !type) {
      // Toggle off / cancel placement
      AppState.pendingType = null;
      _lastPendingCard = null;
      _updateCanvasCursor(false);
      if (banner) banner.classList.add('hidden');
      if (type) showToast('Colocación cancelada.', 'info');
      return;
    }

    AppState.pendingType = type;
    _lastPendingCard = card;
    _lastPendingColor = color;

    if (card) {
      card.style.background = 'rgba(246,92,122,0.16)';
      card.style.borderColor = color || '#c9a96e';
      card.style.outline = '2px solid ' + (color || '#c9a96e');
    }
    _updateCanvasCursor(true);

    var cat = window.getCatalogEntry ? window.getCatalogEntry(type) : null;
    var name = cat ? cat.name : type;
    
    // Update and show placement banner
    if (banner && bannerTxt) {
      bannerTxt.textContent = 'Modo Colocación: Haz clic en el terreno para colocar "' + name + '".';
      banner.classList.remove('hidden');
    }
    showToast('Haz clic en el plano para colocar: ' + name, 'info');
  }

  function _updateCanvasCursor(crosshair) {
    var svgEl = document.getElementById('svg-canvas');
    if (svgEl) svgEl.style.cursor = crosshair ? 'crosshair' : '';
    var c3d = document.getElementById('canvas-3d');
    if (c3d) c3d.style.cursor = crosshair ? 'crosshair' : '';
  }

  // ══════════════════════════════════════════════════════════
  // SEARCH / FILTER TOOLBOX
  // ══════════════════════════════════════════════════════════
  function _wireSearch() {
    var inp = document.getElementById('search-elements');
    if (!inp) return;
    inp.addEventListener('input', function () {
      var q = inp.value.toLowerCase().trim();
      var cards = $$('.toolbox-card');
      cards.forEach(function (c) {
        var name = (c.querySelector('span') || {}).textContent || '';
        var type = c.dataset.type || '';
        var match = !q || name.toLowerCase().includes(q) || type.toLowerCase().includes(q);
        c.style.display = match ? '' : 'none';
      });
      // Show/hide sections based on visible cards
      $$('.toolbox-section').forEach(function (sec) {
        var visible = sec.querySelectorAll('.toolbox-card:not([style*="display: none"])').length > 0;
        sec.style.display = visible ? '' : 'none';
      });
    });
  }

  // ══════════════════════════════════════════════════════════
  // VIEW SWITCHER (2D ↔ 3D)
  // ══════════════════════════════════════════════════════════
  function _wireViewSwitcher() {
    var btn2d = document.getElementById('btn-view-2d');
    var btn3d = document.getElementById('btn-view-3d');
    var container2d = document.getElementById('container-2d');
    var container3d = document.getElementById('container-3d');
    var _3dInitialized = false;

    function _lazyInit3D() {
      if (_3dInitialized) return;
      var canvas3d = document.getElementById('canvas-3d');
      if (canvas3d && window.Visualizer3D && typeof THREE !== 'undefined') {
        window.Visualizer3D.init(
          canvas3d,
          function () { return AppState.elements; },
          function () { return AppState; }
        );
        _3dInitialized = true;
      } else if (!window.Visualizer3D) {
        console.warn('[App] Visualizer3D not loaded.');
      } else if (typeof THREE === 'undefined') {
        console.warn('[App] THREE.js not loaded — 3D view unavailable.');
      }
    }

    function setView(view) {
      AppState.activeView = view;
      var brightnessGroup = document.getElementById('topbar-brightness-group');
      if (view === '2d') {
        if (container2d) container2d.style.display = 'block';
        if (container3d) container3d.style.display = 'none';
        // Ajustar el encuadre si el terreno cambió mientras el 2D estaba oculto
        if (_fit2dOnShow && window.Editor2D) {
          _fit2dOnShow = false;
          window.Editor2D.resetZoom();
        }
        if (AppState.vistaActiva && window.Editor2D) setTimeout(function () { _enfocarVista(AppState.vistaActiva); }, 30);
        if (btn2d) { btn2d.classList.add('active'); }
        if (btn3d) { btn3d.classList.remove('active'); }
        if (brightnessGroup) brightnessGroup.style.display = 'none';
      } else {
        if (container2d) container2d.style.display = 'none';
        if (container3d) container3d.style.display = 'block';
        if (AppState.vistaActiva) setTimeout(function () { _enfocarVista(AppState.vistaActiva); }, 60);
        if (btn3d) { btn3d.classList.add('active'); }
        if (btn2d) { btn2d.classList.remove('active'); }
        if (brightnessGroup) brightnessGroup.style.display = 'flex';
        // Esperar un frame para que el browser calcule el layout
        // y el canvas tenga dimensiones reales antes de inicializar Three.js
        requestAnimationFrame(function () {
          _lazyInit3D();
          if (window.Visualizer3D && _3dInitialized) {
            window.Visualizer3D.sync(AppState.elements);
            window.Visualizer3D.resize();
            // Segundo resize por si hay layout tardío
            setTimeout(function () {
              if (window.Visualizer3D) window.Visualizer3D.resize();
              // Recién cargado un plano/evento: encuadrar la cámara ya con el tamaño final del lienzo
              if (_fit3dOnShow && window.Visualizer3D) {
                _fit3dOnShow = false;
                window.Visualizer3D.resetCamera();
              }
            }, 100);
          }
        });
      }
    }

    // Expose internally for auto-switching
    window.App_setView = setView;

    if (btn2d) btn2d.onclick = function () { setView('2d'); };
    if (btn3d) btn3d.onclick = function () { setView('3d'); };

    // Initialize to default view
    setView(AppState.activeView);
  }

  // ══════════════════════════════════════════════════════════
  // LAYOUT SWITCHER
  // ══════════════════════════════════════════════════════════
  var _currentLayoutMode = 'vertical';

  function setLayoutMode(mode) {
    _currentLayoutMode = mode;

    var btnVer = document.getElementById('btn-layout-ver');
    var btnHor = document.getElementById('btn-layout-hor');
    if (btnVer && btnHor) {
      if (mode === 'vertical') {
        btnVer.classList.add('active');
        btnHor.classList.remove('active');
      } else {
        btnHor.classList.add('active');
        btnVer.classList.remove('active');
      }
    }

    saveHistory();

    AppState.elements.forEach(function (elem) {
      if (elem.type === 'table_imperial' && elem.mesaConfig) {
        var num = parseInt(elem.mesaConfig.mesaNum, 10);
        if (mode === 'vertical') {
          elem.rotation = 90;
          elem.w = 15.0;
          elem.h = 1.6;
          if (num === 2) { elem.x = 19.3; elem.y = 28.0; }
          else if (num === 3) { elem.x = 28.3; elem.y = 28.1; }
          else if (num === 4) { elem.x = 36.9; elem.y = 28.1; }
          else if (num === 5) { elem.x = 45.4; elem.y = 28.2; }
        } else {
          elem.rotation = 0;
          elem.w = 15.0;
          elem.h = 1.6;
          if (num === 2) { elem.x = 23.8; elem.y = 23.8; }
          else if (num === 3) { elem.x = 40.9; elem.y = 23.7; }
          else if (num === 4) { elem.x = 24.0; elem.y = 33.2; }
          else if (num === 5) { elem.x = 40.9; elem.y = 33.0; }
        }
      }
    });

    _refresh();
    updateCounters();

    if (AppState.selectedId) {
      var elem = AppState.elements.find(function (e) { return e.id === AppState.selectedId; });
      if (elem) _populateInspector(elem);
    }

    showToast('Acomodo cambiado a ' + (mode === 'vertical' ? 'Vertical (Original)' : 'Horizontal (Alternativo)') + '.', 'success');
  }

  function _wireLayoutSwitcher() {
    var btnVer = document.getElementById('btn-layout-ver');
    var btnHor = document.getElementById('btn-layout-hor');
    if (btnVer) {
      btnVer.onclick = function () {
        setLayoutMode('vertical');
      };
    }
    if (btnHor) {
      btnHor.onclick = function () {
        setLayoutMode('horizontal');
      };
    }
  }

  // ══════════════════════════════════════════════════════════
  // LIGHTING
  // ══════════════════════════════════════════════════════════
  function _wireLighting() {
    var modes = ['day', 'night', 'gala', 'claro'];
    var nombres = { day: 'Día', night: 'Noche', gala: 'Gala', claro: 'Claro (para imprimir)' };
    modes.forEach(function (mode) {
      var btn = document.getElementById('btn-light-' + mode);
      if (!btn) return;
      btn.onclick = function () {
        if (window.Visualizer3D) window.Visualizer3D.setLighting(mode);
        // En 2D el ambiente se aplica con una clase (colores del lienzo en styles.css)
        modes.forEach(function (m) { document.body.classList.remove('plan-' + m); });
        document.body.classList.add('plan-' + mode);
        $$('.lighting-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        showToast('Ambiente: ' + nombres[mode], 'info');
      };
    });
  }

  function _wireBrightnessSlider() {
    var slider = document.getElementById('light-intensity-slider');
    var valDisp = document.getElementById('light-intensity-val');
    if (!slider) return;
    slider.addEventListener('input', function () {
      var v = parseFloat(slider.value);
      if (valDisp) valDisp.textContent = v.toFixed(2);
      if (window.Visualizer3D) {
        window.Visualizer3D.setExposure(v);
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  // LAYER TOGGLES
  // ══════════════════════════════════════════════════════════
  function _wireLayerToggles() {
    var cats = [
      'estructuras', 'techos', 'accesos', 'mobiliario', 'entretenimiento', 'decoracion', 'proveedores',
      'flujo_invitados', 'flujo_proveedores', 'flujo_staff', 'flujo_emergencia'
    ];
    cats.forEach(function (cat) {
      var cb = document.getElementById('layer-toggle-' + cat);
      if (!cb) return;
      cb.addEventListener('change', function () {
        AppState.layers[cat] = cb.checked;
        if (window.Editor2D) window.Editor2D.setLayerVisibility(cat, cb.checked);
        _refresh();
      });
      cb.checked = AppState.layers[cat] !== false;
    });
  }

  // ══════════════════════════════════════════════════════════
  // ZOOM BUTTONS
  // ══════════════════════════════════════════════════════════
  function _wireZoomButtons() {
    var btnIn = document.getElementById('zoom-in');
    var btnOut = document.getElementById('zoom-out');
    var btnReset = document.getElementById('zoom-reset');

    if (btnIn) btnIn.onclick = function () { if (window.Editor2D) window.Editor2D.zoomIn(); };
    // Tamaño de las etiquetas del plano (se guarda con el plano y lo usa la ficha PDF)
    var cambiaEtiquetas = function (factor) {
      var v = Math.round(Math.min(2.5, Math.max(0.6, (AppState.labelScale || 1) * factor)) * 100) / 100;
      AppState.labelScale = v;
      _refresh();
      showToast('Etiquetas al ' + Math.round(v * 100) + '%', 'info');
    };
    var bBig = document.getElementById('label-bigger'), bSmall = document.getElementById('label-smaller');
    if (bBig) bBig.onclick = function () { cambiaEtiquetas(1.2); };
    if (bSmall) bSmall.onclick = function () { cambiaEtiquetas(1 / 1.2); };
    if (btnOut) btnOut.onclick = function () { if (window.Editor2D) window.Editor2D.zoomOut(); };
    if (btnReset) btnReset.onclick = function () {
      if (window.Editor2D) window.Editor2D.resetZoom();
      if (window.Visualizer3D) window.Visualizer3D.resetCamera();
    };
  }

  // ══════════════════════════════════════════════════════════
  // GRID SNAP TOGGLE
  // ══════════════════════════════════════════════════════════
  function _wireGridToggle() {
    var cb = document.getElementById('grid-toggle');
    if (!cb) return;
    cb.addEventListener('change', function () {
      AppState.useGrid = cb.checked;
      if (window.Editor2D) window.Editor2D.setGridSnap(AppState.useGrid);
      showToast('Cuadrícula ' + (AppState.useGrid ? 'activada' : 'desactivada') + '.', 'info');
    });
    cb.checked = !!AppState.useGrid;
  }

  // ══════════════════════════════════════════════════════════
  // TERRAIN WIZARD / SETTINGS
  // ══════════════════════════════════════════════════════════
  function _wireTerrainSettings() {
    var btnApply = document.getElementById('btn-apply-terrain');
    if (!btnApply) return;

    btnApply.onclick = function () {
      var wEl = document.getElementById('terrain-width');
      var hEl = document.getElementById('terrain-height');
      if (!wEl || !hEl) return;
      var w = parseFloat(wEl.value);
      var h = parseFloat(hEl.value);
      if (isNaN(w) || isNaN(h) || w < 5 || h < 5) {
        showToast('Dimensiones inválidas (mínimo 5×5 m).', 'error');
        return;
      }
      AppState.terrain = { w: w, h: h };
      if (window.Editor2D) window.Editor2D.setTerrain(w, h);
      showToast('Terreno actualizado: ' + w + 'm × ' + h + 'm.', 'success');
    };

    // Populate current values
    var wEl = document.getElementById('terrain-width');
    var hEl = document.getElementById('terrain-height');
    if (wEl) wEl.value = AppState.terrain.w;
    if (hEl) hEl.value = AppState.terrain.h;
  }

  // ══════════════════════════════════════════════════════════
  // SUPABASE INTEGRATION
  // ══════════════════════════════════════════════════════════
  function _initSupabase() {
    var statusLbl = document.getElementById('db-status-lbl');
    var layoutsGroup = document.getElementById('supabase-layouts-group');
    var urlInp = document.getElementById('db-url');
    var keyInp = document.getElementById('db-key');

    // First try fetching config.json
    fetch('config.json')
      .then(function (res) { return res.json(); })
      .then(function (cfg) {
        if (cfg.supabaseUrl && cfg.supabaseKey) {
          localStorage.setItem(SB_URL_KEY, cfg.supabaseUrl);
          localStorage.setItem(SB_ANON_KEY, cfg.supabaseKey);
          console.log('[Supabase] Configured automatically from config.json');
        }
        _connectSupabase();
      })
      .catch(function () {
        // Fallback to localStorage if config.json fails or isn't present
        _connectSupabase();
      });

    function _connectSupabase() {
      var url = localStorage.getItem(SB_URL_KEY);
      var key = localStorage.getItem(SB_ANON_KEY);

      if (urlInp && url) urlInp.value = url;
      if (keyInp && key) keyInp.value = key;

      if (url && key && typeof supabase !== 'undefined') {
        try {
          _supabase = supabase.createClient(url, key);
          if (statusLbl) {
            statusLbl.textContent = 'Conectado';
            statusLbl.style.color = 'var(--success)';
          }
          if (layoutsGroup) layoutsGroup.style.display = 'block';
          _fetchSupabaseLayouts();
        } catch (e) {
          console.error('[Supabase] Init error:', e);
          _supabase = null;
          if (statusLbl) {
            statusLbl.textContent = 'Error';
            statusLbl.style.color = 'var(--danger)';
          }
        }
      } else {
        _supabase = null;
        if (statusLbl) {
          statusLbl.textContent = 'Desconectado';
          statusLbl.style.color = 'var(--danger)';
        }
        if (layoutsGroup) layoutsGroup.style.display = 'none';
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // LOCAL SERVER FILE API (layouts/ folder)
  // ══════════════════════════════════════════════════════════
  function _fetchLocalLayouts() {
    var select = document.getElementById('local-layouts-select');
    if (!select) return;
    
    // Only fetch if running on localhost or 127.0.0.1
    if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      select.innerHTML = '<option value="">Solo disponible localmente (localhost)</option>';
      return;
    }
    
    fetch('/api/list')
      .then(function (res) { return res.json(); })
      .then(function (files) {
        select.innerHTML = '<option value="">Selecciona un plano local...</option>';
        if (files && files.length > 0) {
          files.forEach(function (file) {
            var opt = document.createElement('option');
            opt.value = file;
            opt.textContent = file + '.json';
            select.appendChild(opt);
          });
        } else {
          select.innerHTML = '<option value="">No hay planos guardados en /layouts</option>';
        }
      })
      .catch(function (err) {
        console.warn('[LocalServer] Error listing layouts:', err);
        select.innerHTML = '<option value="">Error al conectar con servidor local</option>';
      });
  }

  function _saveLayoutToLocalServer(name, payload) {
    if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      return;
    }
    
    fetch('/api/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json(); })
      .then(function (res) {
        if (res.status === 'success') {
          showToast(res.message, 'success');
          _fetchLocalLayouts();
        } else {
          showToast('Error de servidor: ' + res.message, 'error');
        }
      })
      .catch(function (err) {
        console.warn('[LocalServer] Error saving layout:', err);
        showToast('Error al conectar con el servidor para guardar.', 'error');
      });
  }

  function _loadLayoutFromLocalServer(name) {
    showToast('Cargando plano local...', 'info');
    fetch('/layouts/' + name + '.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        saveHistory();
        if (data.elements) AppState.elements = data.elements;
        if (data.terrain) AppState.terrain = data.terrain;
        if (data.layers) Object.assign(AppState.layers, data.layers);
        AppState.flows = data.flows || [];
        AppState.venueId = data.venueId || null;

        var wEl = document.getElementById('terrain-width');
        var hEl = document.getElementById('terrain-height');
        if (wEl) wEl.value = AppState.terrain.w;
        if (hEl) hEl.value = AppState.terrain.h;
        
        if (window.Editor2D) {
          window.Editor2D.setTerrain(AppState.terrain.w, AppState.terrain.h);
        }
        _refresh();
        updateCounters();
        
        var cats = ['estructuras', 'accesos', 'mobiliario', 'entretenimiento', 'decoracion', 'proveedores'];
        cats.forEach(function (cat) {
          var cb = document.getElementById('layer-toggle-' + cat);
          if (cb) cb.checked = !!AppState.layers[cat];
        });
        
        showToast('Plano local "' + name + '" cargado exitosamente.', 'success');
      })
      .catch(function (err) {
        showToast('Error al cargar plano local: ' + err.message, 'error');
      });
  }

  function _wireLocalServerUI() {
    var btnLoad = document.getElementById('btn-local-load');
    if (btnLoad) {
      btnLoad.onclick = function () {
        var select = document.getElementById('local-layouts-select');
        if (!select || !select.value) {
          showToast('Selecciona un plano local para cargar.', 'warning');
          return;
        }
        _loadLayoutFromLocalServer(select.value);
      };
    }
  }

  function _wireSupabaseUI() {
    var btnSave = document.getElementById('btn-db-save');
    var btnTest = document.getElementById('btn-db-test');
    var btnClear = document.getElementById('btn-db-clear');
    var btnLoad = document.getElementById('btn-db-load');

    if (btnSave) {
      btnSave.onclick = function () {
        var urlInp = document.getElementById('db-url');
        var keyInp = document.getElementById('db-key');
        var url = (urlInp ? urlInp.value : '').trim();
        var key = (keyInp ? keyInp.value : '').trim();
        if (!url || !key) {
          showToast('Por favor ingresa la URL y la clave anon.', 'error');
          return;
        }
        
        showToast('Validando conexión...', 'info');
        _testSupabaseConnection(url, key, function (ok, errMsg) {
          if (ok) {
            localStorage.setItem(SB_URL_KEY, url);
            localStorage.setItem(SB_ANON_KEY, key);
            _initSupabase();
            showToast('Conexión exitosa y configurada.', 'success');
          } else {
            showToast('Error de conexión: ' + errMsg, 'error');
          }
        });
      };
    }

    if (btnTest) {
      btnTest.onclick = function () {
        var urlInp = document.getElementById('db-url');
        var keyInp = document.getElementById('db-key');
        var url = (urlInp ? urlInp.value : '').trim();
        var key = (keyInp ? keyInp.value : '').trim();
        if (!url || !key) {
          showToast('Ingresa credenciales para probar.', 'warning');
          return;
        }
        showToast('Probando conexión...', 'info');
        _testSupabaseConnection(url, key, function (ok, errMsg) {
          if (ok) {
            showToast('Conexión exitosa.', 'success');
          } else {
            showToast('Fallo: ' + errMsg, 'error');
          }
        });
      };
    }

    if (btnClear) {
      btnClear.onclick = function () {
        localStorage.removeItem(SB_URL_KEY);
        localStorage.removeItem(SB_ANON_KEY);
        var urlInp = document.getElementById('db-url');
        var keyInp = document.getElementById('db-key');
        if (urlInp) urlInp.value = '';
        if (keyInp) keyInp.value = '';
        _initSupabase();
        showToast('Desconectado de Supabase.', 'warning');
      };
    }

    if (btnLoad) {
      btnLoad.onclick = function () {
        var select = document.getElementById('supabase-layouts-select');
        if (!select || !select.value) {
          showToast('Selecciona un plano para cargar.', 'warning');
          return;
        }
        _loadLayoutFromSupabase(select.value);
      };
    }
  }

  function _testSupabaseConnection(url, key, callback) {
    if (typeof supabase === 'undefined') {
      callback(false, 'SDK de Supabase no cargado');
      return;
    }
    try {
      var client = supabase.createClient(url, key);
      client.from('venue_layouts').select('name').limit(1).then(function (res) {
        if (res.error) {
          if (res.error.code === '42P01') {
            callback(true, 'successful but table venue_layouts missing');
          } else {
            callback(false, res.error.message);
          }
        } else {
          callback(true);
        }
      }).catch(function (err) {
        callback(false, err.message || err);
      });
    } catch (e) {
      callback(false, e.message || e);
    }
  }

  function _fetchSupabaseLayouts() {
    if (!_supabase) return;
    _supabase.from('venue_layouts').select('name').order('name').then(function (res) {
      var select = document.getElementById('supabase-layouts-select');
      if (!select) return;
      
      select.innerHTML = '<option value="">Selecciona un plano...</option>';
      
      if (res.error) {
        console.warn('[Supabase] Error listing layouts:', res.error);
        if (res.error.code === '42P01') {
          showToast('Aviso: la tabla venue_layouts no existe en tu proyecto.', 'warning');
        }
        return;
      }
      
      if (res.data) {
        res.data.forEach(function (row) {
          var opt = document.createElement('option');
          opt.value = row.name;
          opt.textContent = row.name;
          select.appendChild(opt);
        });
      }
    }).catch(function (err) {
      console.warn('[Supabase] Catch listing layouts:', err);
    });
  }

  function _saveLayoutToSupabase(name) {
    if (!_supabase) return;
    var payload = {
      name: name,
      terrain: AppState.terrain,
      elements: AppState.elements,
      layers: AppState.layers,
      updated_at: new Date().toISOString()
    };
    showToast('Guardando en Supabase...', 'info');
    _supabase.from('venue_layouts').upsert(payload, { onConflict: 'name' }).then(function (res) {
      if (res.error) {
        showToast('Error al guardar en Supabase: ' + res.error.message, 'error');
      } else {
        showToast('Plano "' + name + '" guardado en Supabase.', 'success');
        _fetchSupabaseLayouts();
      }
    }).catch(function (err) {
      showToast('Error al guardar: ' + (err.message || err), 'error');
    });
  }

  function _loadLayoutFromSupabase(name) {
    if (!_supabase) return;
    showToast('Cargando desde Supabase...', 'info');
    _supabase.from('venue_layouts').select('*').eq('name', name).maybeSingle().then(function (res) {
      if (res.error) {
        showToast('Error al cargar: ' + res.error.message, 'error');
        return;
      }
      if (!res.data) {
        showToast('No se encontró el plano.', 'error');
        return;
      }
      var data = res.data;
      saveHistory();
      if (data.elements) AppState.elements = data.elements;
      if (data.terrain) AppState.terrain = data.terrain;
      if (data.layers) Object.assign(AppState.layers, data.layers);
      AppState.flows = data.flows || [];
      AppState.venueId = data.venueId || null;

      var wEl = document.getElementById('terrain-width');
      var hEl = document.getElementById('terrain-height');
      if (wEl) wEl.value = AppState.terrain.w;
      if (hEl) hEl.value = AppState.terrain.h;
      
      if (window.Editor2D) {
        window.Editor2D.setTerrain(AppState.terrain.w, AppState.terrain.h);
      }
      _refresh();
      updateCounters();
      
      var cats = ['estructuras', 'accesos', 'mobiliario', 'entretenimiento', 'decoracion', 'proveedores'];
      cats.forEach(function (cat) {
        var cb = document.getElementById('layer-toggle-' + cat);
        if (cb) cb.checked = !!AppState.layers[cat];
      });
      
      showToast('Plano "' + name + '" cargado exitosamente.', 'success');
    }).catch(function (err) {
      showToast('Error de carga: ' + (err.message || err), 'error');
    });
  }

  // ══════════════════════════════════════════════════════════
  // SAVE / LOAD / EXPORT
  // ══════════════════════════════════════════════════════════
  function saveToLocalStorage() {
    var defaultName = localStorage.getItem(LS_KEY + '_name') || 'Mi Plano';
    var name = prompt('Nombre del plano:', defaultName);
    if (name === null) return;
    name = name.trim();
    if (!name) {
      showToast('Nombre inválido.', 'error');
      return;
    }

    var payload = {
      name: name,
      elements: AppState.elements,
      terrain: AppState.terrain,
      layers: AppState.layers,
      flows: AppState.flows,
      venueId: AppState.venueId,
      savedAt: new Date().toISOString()
    };

    // 1. Save in local browser storage
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
      localStorage.setItem(LS_KEY + '_name', name);
      localStorage.setItem(LS_KEY + '_version', CURRENT_LAYOUT_VERSION);
    } catch (e) {
      console.warn('[app] LocalStorage save error:', e);
    }

    // 2. Save on local Python server if running on localhost
    var isLocalhost = (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
    if (isLocalhost) {
      _saveLayoutToLocalServer(name, payload);
    }

    // 3. Save in Supabase cloud if connected
    if (_supabase) {
      _saveLayoutToSupabase(name);
    } else if (!isLocalhost) {
      // If not running locally and not connected to Supabase, just say saved in browser
        showToast('Guardado en la memoria de este navegador.', 'success');
    }
  }

  function updateLayoutModeFromElements() {
    var mesa2 = AppState.elements.find(function (e) {
      return e.type === 'table_imperial' && e.mesaConfig && e.mesaConfig.mesaNum === 2;
    });
    if (mesa2) {
      var mode = (mesa2.rotation === 0) ? 'horizontal' : 'vertical';
      _currentLayoutMode = mode;
      var btnVer = document.getElementById('btn-layout-ver');
      var btnHor = document.getElementById('btn-layout-hor');
      if (btnVer && btnHor) {
        if (mode === 'vertical') {
          btnVer.classList.add('active');
          btnHor.classList.remove('active');
        } else {
          btnHor.classList.add('active');
          btnVer.classList.remove('active');
        }
      }
    }
  }

  function _loadLayoutData(data) {
    if (!data) return;
    if (data.elements) AppState.elements = data.elements;
    if (data.terrain) AppState.terrain = data.terrain;
    if (data.layers) Object.assign(AppState.layers, data.layers);
    AppState.mode = data.mode || (AppState.elements.some(function (e) { return e.type.indexOf('wh_') === 0; }) ? 'bodega' : 'evento');
    AppState.nivel = 0;
    AppState.vistas = Array.isArray(data.vistas) ? data.vistas : [];
    AppState.vistaActiva = null;
    AppState.flows = data.flows || [];
    AppState.venueId = data.venueId || null;
    AppState.labelScale = data.labelScale || 1;
    AppState.elements.forEach(function (e) {
      // Clean up corrupted characters caused by broken UTF-8 encoding
      // Solo se reparan nombres con acentos dañados por codificación (Ã… o �); los demás se respetan
      if (typeof e.name === 'string' && /[Ã�]/.test(e.name)) {
        var nClean = e.name.trim();
        
        // 1. Árbol Decorativo (\u00C1rbol)
        if (nClean.indexOf('rbol') > -1) {
          e.name = '\u00C1rbol Decorativo';
        }
        // 2. Área de Barra / Área de Cocina (\u00C1rea)
        else if (nClean.indexOf('rea') > -1) {
          if (nClean.indexOf('Barra') > -1) {
            e.name = '\u00C1rea de Barra';
          } else if (nClean.indexOf('Cocina') > -1) {
            e.name = '\u00C1rea de Cocina';
          } else {
            e.name = '\u00C1rea';
          }
        }
        // 3. Salón / Arco Estructural (Sal\u00F3n)
        else if (nClean.indexOf('Sal') > -1 && (nClean.indexOf('o') > -1 || nClean.indexOf('Ã') > -1 || nClean.indexOf('í') > -1)) {
          if (nClean.indexOf('Arco') > -1) {
            e.name = 'Arco Estructural/Sal\u00F3n';
          } else {
            e.name = 'Sal\u00F3n Techado';
          }
        }
        // 4. Mesa Mármol Rectangular (M\u00E1rmol)
        else if (nClean.indexOf('rmol') > -1) {
          e.name = 'Mesa M\u00E1rmol Rectangular';
        }
      }

        // Auto-update old marble table names from square to rectangular
        if (e.type === 'table_marble_square' && e.name.indexOf('Cuadrada') > -1) {
          e.name = e.name.replace('Cuadrada', 'Rectangular');
        }

      var n = parseInt((e.id || '').replace('el_', ''), 10);
      if (!isNaN(n) && n >= _idCounter) _idCounter = n + 1;
      if (e.mesaConfig && e.mesaConfig.mesaNum > _tableCounter) _tableCounter = e.mesaConfig.mesaNum;
    });
    updateLayoutModeFromElements();
  }

  var CURRENT_LAYOUT_VERSION = '2026-07-12-v35';

  function loadFromLocalStorage() {
    try {
      var savedVersion = localStorage.getItem(LS_KEY + '_version');
      if (savedVersion !== CURRENT_LAYOUT_VERSION) {
        console.log('[App] Discarding outdated local storage cache.');
        localStorage.removeItem(LS_KEY);
        localStorage.removeItem(LS_KEY + '_name');
        localStorage.removeItem(LS_KEY + '_auto');
        localStorage.removeItem(LS_KEY + '_version');
        return false;
      }
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      _loadLayoutData(data);
      return true;
    } catch (e) {
      console.warn('[app] Failed to load from localStorage:', e);
      return false;
    }
  }

  function exportJSON() {
    var payload = {
      version: '1.0',
      appName: 'Primavera Universal Planner',
      exportedAt: new Date().toISOString(),
      terrain: AppState.terrain,
      elements: AppState.elements,
      layers: AppState.layers,
      flows: AppState.flows,
      venueId: AppState.venueId
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'plano_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Plano exportado como JSON.', 'success');
  }

  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (data.elements) {
          saveHistory();
          AppState.elements = data.elements;
          if (data.terrain) AppState.terrain = data.terrain;
          if (data.layers) Object.assign(AppState.layers, data.layers);
          AppState.flows = data.flows || [];
          AppState.venueId = data.venueId || null;
          if (window.Editor2D) window.Editor2D.setTerrain(AppState.terrain.w, AppState.terrain.h);
          _refresh();
          updateCounters();
          showToast('Plano importado: ' + data.elements.length + ' elementos.', 'success');
        }
      } catch (err) {
        showToast('Error al importar: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  function exportPNG() {
    var svgEl = document.getElementById('svg-canvas');
    if (!svgEl) { showToast('Canvas SVG no encontrado.', 'error'); return; }

    var svgData = new XMLSerializer().serializeToString(svgEl);
    var svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(svgBlob);
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width = svgEl.clientWidth || 1200;
      canvas.height = svgEl.clientHeight || 800;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#171516';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      var a = document.createElement('a');
      a.download = 'plano_' + new Date().toISOString().slice(0, 10) + '.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
      showToast('PNG exportado.', 'success');
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      showToast('Error al exportar PNG. Intenta desde vista 2D.', 'warning');
    };
    img.src = url;
  }

  // ══════════════════════════════════════════════════════════
  // FICHA TÉCNICA (PDF) — membretada PEG, con QR al evento
  // Usa los datos del evento abierto (brief.js) y el plano actual.
  // ══════════════════════════════════════════════════════════
  // Plano de la bodega: una vista por piso e inventario, con membrete
  function _exportPDFBodega(svgEl, printWindow) {
    function esc(v) {
      return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    var PE = window.PEGEventos;
    var ev = PE && PE.getEvent ? PE.getEvent() : null;
    var nombre = ev ? ev.nombre : 'Bodega';
    var logoUrl = new URL('assets/logo-primavera.png', location.href).href;
    var nivelActual = AppState.nivel, seleccion = AppState.selectedId;
    if (window.Editor2D) window.Editor2D.deselect();

    var secciones = window.BODEGA.NIVELES.slice().reverse().map(function (n) {
      var piezas = AppState.elements.filter(function (e) { return (e.nivel || 0) === n.id; });
      if (!piezas.length) return '';
      AppState.nivel = n.id;
      window.Editor2D.update(AppState.elements);
      var copia = svgEl.cloneNode(true);
      ['.active-selection', '#svg-ruler-h', '#svg-ruler-v', '#svg-terrain-border'].forEach(function (sel) {
        var nodo = copia.querySelector(sel);
        if (nodo) nodo.remove();
      });
      Array.prototype.forEach.call(copia.querySelectorAll('.resize-handle, .ghost-nivel'), function (h) { h.remove(); });
      var tw = AppState.terrain.w * 15, th = AppState.terrain.h * 15;
      var fondo = copia.querySelector('#svg-background');
      if (fondo) { fondo.setAttribute('width', tw); fondo.setAttribute('height', th); }
      var zoom = copia.querySelector('#svg-zoom-group');
      if (zoom) zoom.removeAttribute('transform');
      copia.setAttribute('viewBox', '0 0 ' + tw + ' ' + th);
      var escala = Math.min(725 / tw, 460 / th);
      Array.prototype.forEach.call(copia.querySelectorAll('.elem-label'), function (l) {
        l.setAttribute('font-size', 9 * (AppState.labelScale || 1) / escala);
      });
      copia.setAttribute('width', '100%');
      copia.setAttribute('height', '100%');
      copia.setAttribute('preserveAspectRatio', 'xMidYMid meet');

      var conteo = {};
      piezas.forEach(function (e) {
        var cat = window.getCatalogEntry(e.type);
        var tipo = cat ? cat.name : e.type;
        conteo[tipo] = (conteo[tipo] || 0) + 1;
      });
      var filas = Object.keys(conteo).sort().map(function (t) { return '<tr><td>' + esc(t) + '</td><td>' + conteo[t] + '</td></tr>'; }).join('');
      var detalles = piezas.filter(function (e) {
        var cat = window.getCatalogEntry(e.type);
        return e.type === 'wh_shelf' || e.type === 'wh_island' || e.cantidad || (cat && e.name !== cat.name);
      }).map(function (e) {
        var txt = '';
        if (e.type === 'wh_island') txt = e.secciones.map(function (s) { return s.nombre + ' (' + s.columnas + ' × ' + e.filas + ' mesas)'; }).join(', ');
        else if (e.type === 'wh_chair_stack') txt = e.cantidad + ' sillas';
        else if (window.BODEGA.esPlegada(e)) txt = e.cantidad + ' mesas, a lo ' + e.plegado;
        return '<li><b>' + esc(e.name) + '</b>' + (txt ? ': ' + esc(txt) : '') + '</li>';
      }).join('');
      return '<section class="piso"><h2>' + esc(n.label) + '</h2><div class="plan">' + new XMLSerializer().serializeToString(copia) + '</div>' +
        '<div class="cols"><table><tr><th>Elemento</th><th>Cantidad</th></tr>' + filas + '</table>' +
        (detalles ? '<div><h3>Etiquetas y secciones</h3><ul>' + detalles + '</ul></div>' : '') + '</div></section>';
    }).join('');

    AppState.nivel = nivelActual;
    if (seleccion && window.Editor2D) window.Editor2D.select(seleccion); else if (window.Editor2D) window.Editor2D.update(AppState.elements);

    var html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>' + esc(nombre) + ' · Plano de bodega</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">' +
      '<style>:root{--pink:#F65C7A;--gold:#C9A96E;--ink:#1F1F1F;--gray:#6D6D6D;--line:#EFE7E1}' +
      '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      'html,body{background:#fff}body{font-family:Poppins,sans-serif;color:var(--ink);font-size:11px;margin:24px auto;max-width:800px;padding:0 16px}' +
      'h1,h2,h3{font-family:"Playfair Display",serif;margin:0}' +
      '.toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;color:var(--gray)}.toolbar button{background:var(--pink);color:#fff;border:0;border-radius:6px;padding:8px 14px;cursor:pointer}' +
      '.head{display:flex;align-items:center;gap:12px;padding-bottom:10px;border-bottom:2px solid var(--gold)}.head img{width:52px;height:52px;border-radius:50%;object-fit:cover}' +
      '.marca{font-family:"Playfair Display",serif;font-size:16px;color:var(--pink)}.sub{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}' +
      'h1{font-size:24px;margin:14px 0 2px}.piso{margin-top:18px;break-inside:avoid}.piso h2{font-size:15px;padding-left:10px;border-left:3px solid var(--pink);margin-bottom:8px}' +
      '.plan{height:460px;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff}.plan svg{display:block}.plan #svg-background{fill:#fff}.plan #terrain-fill{fill:#f8f6f4}' +
      '.plan .elem-label{fill:#1F1F1F;stroke:rgba(255,255,255,.9);stroke-width:3px;paint-order:stroke;font-weight:700}' +
      '.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:10px}table{width:100%;border-collapse:collapse}th{background:var(--ink);color:#fff;text-align:left;padding:5px 8px;font-weight:500}td{padding:5px 8px;border-bottom:1px solid var(--line)}' +
      'h3{font-size:12px;margin-bottom:4px}ul{margin:0;padding-left:16px}li{margin-bottom:2px}' +
      '.footer{margin-top:18px;padding-top:8px;border-top:1px solid var(--gold);font-size:9px;color:var(--gray);text-align:center}' +
      '@media print{.toolbar{display:none}body{margin:0;max-width:none}@page{size:letter;margin:1.2cm}}</style></head><body>' +
      '<div class="toolbar"><span>Vista previa · Plano de bodega</span><button onclick="window.print()">Imprimir / Guardar PDF</button></div>' +
      '<header class="head"><img src="' + esc(logoUrl) + '" alt="Primavera Events Group"><div><div class="marca">Primavera Events Group®</div><div class="sub">Plano de bodega</div></div></header>' +
      '<h1>' + esc(nombre) + '</h1><p>' + AppState.terrain.w + ' × ' + AppState.terrain.h + ' m</p>' +
      (secciones || '<p>El plano todavía no tiene elementos.</p>') +
      '<footer class="footer">Primavera Events Group® · primaveraeventsgroup.com</footer></body></html>';
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }

  function exportPDF() {
    var svgEl = document.getElementById('svg-canvas');
    if (!svgEl) {
      showToast('Error: No se encontró el lienzo 2D.', 'error');
      return;
    }

    var printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('El navegador bloqueó la ventana emergente. Permite las ventanas emergentes en este sitio.', 'error');
      return;
    }

    if (AppState.mode === 'bodega') {
      _exportPDFBodega(svgEl, printWindow);
      return;
    }
    // La requisición de la ficha usa el inventario de bodega: si aún no se carga, se espera
    var V = window.PEGVale;
    if (V && V.inventarioListo && !V.inventarioListo()) {
      printWindow.document.write('<p style="font-family:sans-serif;padding:24px">Preparando la ficha técnica…</p>');
      V.cargarInventario().then(function () { _fichaTecnica(svgEl, printWindow); }, function () { _fichaTecnica(svgEl, printWindow); });
      return;
    }
    _fichaTecnica(svgEl, printWindow);
  }

  function _fichaTecnica(svgEl, printWindow) {
    function esc(v) {
      return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' '); }
    function fmtDate(iso) {
      if (!iso) return '';
      var d = new Date(iso + 'T12:00:00');
      return isNaN(d) ? iso : cap(d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    }

    // ── Datos del evento (brief.js) ──
    var PE = window.PEGEventos;
    var ev = PE && PE.getEvent ? PE.getEvent() : null;
    var isPlanner = PE && PE.verSensible ? PE.verSensible() : (PE && PE.isPlanner ? PE.isPlanner() : true);
    var schema = PE && PE.getSchema ? PE.getSchema() : { sections: [], montajeFields: [] };
    if (ev && PE.syncMinuto) PE.syncMinuto();
    var data = ev ? ev.data : { brief: {}, minuto: [], montaje: { fotos: [] } };
    var b = data.brief || {};
    var eventName = ev ? ev.nombre : (localStorage.getItem(LS_KEY + '_name') || 'Plano de evento');
    var eventUrl = ev && PE.publicEventUrl ? PE.publicEventUrl(ev.id) : '';

    // ── Plano: copia limpia del lienzo 2D, encuadrada al terreno ──
    if (window.Editor2D) window.Editor2D.update(AppState.elements);
    var clonedSvg = svgEl.cloneNode(true);
    ['.active-selection', '#svg-ruler-h', '#svg-ruler-v', '#svg-terrain-border'].forEach(function (sel) {
      var n = clonedSvg.querySelector(sel);
      if (n) n.remove();
    });
    Array.prototype.forEach.call(clonedSvg.querySelectorAll('.resize-handle'), function (h) { h.remove(); });
    var tw = AppState.terrain.w * 15;
    var th = AppState.terrain.h * 15;
    var svgBg = clonedSvg.querySelector('#svg-background');
    if (svgBg) { svgBg.setAttribute('width', tw); svgBg.setAttribute('height', th); }
    var zoomGroup = clonedSvg.querySelector('#svg-zoom-group');
    if (zoomGroup) zoomGroup.removeAttribute('transform');
    // Encuadre: la zona donde están las mesas y elementos (con margen), no todo el terreno
    var vb = [0, 0, tw, th];
    // Todo lo que está en el plano del evento (mesas, jardines, área de niños, barras…) + el salón completo
    // aunque sea parte del croquis, para no cortar nada
    var piezas = AppState.elements.filter(function (e) {
      return !e.bg2d || /^(salon|salon_carpa|stage|bathroom|lobby_reception|kitchen)$/.test(e.type);
    });
    if (piezas.length) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      piezas.forEach(function (e) {
        // Medidas reales; si está girado ~90° se intercambian ancho y largo
        var rot = Math.abs(((e.rotation || 0) % 180 + 180) % 180);
        var girado = rot > 45 && rot < 135;
        var hw = ((girado ? e.h : e.w) || 1) / 2, hh = ((girado ? e.w : e.h) || 1) / 2;
        x0 = Math.min(x0, e.x - hw); x1 = Math.max(x1, e.x + hw);
        y0 = Math.min(y0, e.y - hh); y1 = Math.max(y1, e.y + hh);
      });
      var m = 5;
      x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
      x1 = Math.min(AppState.terrain.w, x1 + m); y1 = Math.min(AppState.terrain.h, y1 + m);
      if (x1 - x0 < 20) { var cxm = (x0 + x1) / 2; x0 = Math.max(0, cxm - 10); x1 = x0 + 20; }
      if (y1 - y0 < 15) { var cym = (y0 + y1) / 2; y0 = Math.max(0, cym - 7.5); y1 = y0 + 15; }
      vb = [x0 * 15, y0 * 15, (x1 - x0) * 15, (y1 - y0) * 15];
    }
    clonedSvg.setAttribute('viewBox', vb.join(' '));
    // El croquis ocupa una hoja carta completa: si el plano es más ancho que alto se imprime girado
    // (la hoja se lee en horizontal); si no, derecho. Etiquetas a ~9 px en la hoja sin importar el zoom.
    var horizontal = vb[2] >= vb[3];
    var escala = Math.min((horizontal ? 877 : 695) / vb[2], (horizontal ? 688 : 877) / vb[3]);
    Array.prototype.forEach.call(clonedSvg.querySelectorAll('.elem-label'), function (l) {
      var fs = 9 * (AppState.labelScale || 1) / escala;
      l.setAttribute('font-size', fs);
      l.setAttribute('font-weight', '700');
      var badge = l.nextElementSibling;
      if (badge && badge.classList.contains('elem-badge')) {
        badge.setAttribute('font-size', 7 * (AppState.labelScale || 1) / escala);
        badge.setAttribute('y', parseFloat(l.getAttribute('y')) + fs * 1.1);
      }
    });
    clonedSvg.setAttribute('width', '100%');
    clonedSvg.setAttribute('height', '100%');
    clonedSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    var planSvg = new XMLSerializer().serializeToString(clonedSvg);
    if (AppState.selectedId && window.Editor2D) window.Editor2D.select(AppState.selectedId);

    // ── Mesas y elementos del plano ──
    var tablesList = AppState.elements.filter(function (elem) {
      return !elem.bg2d && (elem.type.indexOf('table_') === 0 || elem.type === 'lounge_set');
    });
    // Lugares del banquete (mesas + mesa principal) contra invitados; el cóctel no cuenta
    var invitadosN = parseInt(b.invitados, 10) || 0;
    var L = window.PEGCalculo.lugares(AppState.elements, invitadosN);
    tablesList.sort(function (a, c) {
      var na = (a.mesaConfig && parseInt(a.mesaConfig.mesaNum, 10)) || 999;
      var nc = (c.mesaConfig && parseInt(c.mesaConfig.mesaNum, 10)) || 999;
      return na - nc;
    });

    var venueTpl = (window.VENUE_TEMPLATES || []).find(function (t) { return t.id === AppState.venueId; });
    var venueName = b.venue_red || b.venue_externo || (venueTpl ? venueTpl.name : '');
    var tipo = b.tipo_evento === 'Otro' ? (b.tipo_evento_otro || 'Otro') : b.tipo_evento;
    var h12 = window.PEGEventos && window.PEGEventos.hora12 ? window.PEGEventos.hora12 : function (h) { return h; };
    var horario = [b.hora_inicio, b.hora_cierre].filter(Boolean).map(h12).join(' – ');

    // ── QR al evento ──
    var qrSvg = '';
    if (eventUrl && window.qrcode) {
      var qr = window.qrcode(0, 'M');
      qr.addData(eventUrl);
      qr.make();
      qrSvg = qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
    }
    var logoUrl = new URL('assets/logo-primavera.png', location.href).href;

    var typeLabels = {
      table_round: 'Mesa Redonda', table_square: 'Mesa Cuadrada', table_rectangular: 'Mesa Rectangular',
      table_imperial: 'Mesa Imperial', table_honor_bride: 'Mesa de Honor Novios', table_honor_xv: 'Mesa de Honor XV Años',
      table_honor_king: 'Mesa de Honor Imperial', table_periquera: 'Periquera Alta', table_periquera_umbrella: 'Periquera con Sombrilla', table_kids: 'Mesa Infantil',
      table_campirana: 'Mesa Campirana', table_marble_round: 'Mesa Mármol Redonda', table_marble_square: 'Mesa Mármol Rectangular',
      table_umbrella: 'Mesa con Sombrilla', table_cake: 'Mesa de Pastel', table_gifts: 'Mesa de Regalos',
      table_candy: 'Mesa de Dulces', table_shots: 'Carrito de Shots', table_buffet: 'Mesa de Buffet', lounge_set: 'Sala Lounge'
    };
    var glassLabels = {
      standard: 'Estándar', flauta: 'Copa Flauta', vino: 'Copa Vino', romana: 'Copa Romana', martinera: 'Copa Martinera',
      cubero: 'Vaso Cubero', old_fashion: 'Vaso Old Fashion', tequilero: 'Copa Tequilera'
    };
    var plateBaseLabels = {
      gold_ring: 'Plato Base Oro', silver_ring: 'Plato Base Plata', glass_gold: 'Plato Base Vidrio Oro', wood: 'Plato Base Madera'
    };
    var foldLabels = { corazon: 'Corazón', corbata: 'Corbata', loto: 'Loto', vela: 'Vela', abanico: 'Abanico', piramide: 'Pirámide', cartera: 'Cartera', conito: 'Conito' };
    var sillaLabels = { princesa: 'Sillón de Princesa' };

    // ── HTML ──
    var html = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">';
    html += '<title>Ficha Técnica · ' + esc(eventName) + '</title>';
    html += '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">';
    html += '<style>' +
      '@page { size: letter; margin: 16mm 16mm 18mm; }' +
      ':root { --pink:#F65C7A; --gold:#C9A96E; --ink:#1F1F1F; --gray:#6D6D6D; --line:#EFE7E1; --soft:#F8F6F4; }' +
      '* { box-sizing: border-box; }' +
      'html { background: #E9E4DF; }' +
      'body { font-family: Poppins, sans-serif; color: var(--ink); background: #fff; margin: 0 auto 30px; padding: 0 16mm 16mm; max-width: 216mm; box-shadow: 0 6px 30px rgba(0,0,0,.18); font-size: 11px; line-height: 1.5; }' +
      'h1, h2, h3 { font-family: "Playfair Display", Georgia, serif; font-weight: 600; margin: 0; }' +
      '.toolbar { position: sticky; top: 0; z-index: 9; display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 0 -16mm 16mm; padding: 12px 16mm; background: var(--ink); color: #fff; }' +
      '.toolbar button { font-family: Poppins, sans-serif; border: none; border-radius: 999px; padding: 9px 18px; font-weight: 600; cursor: pointer; color: #fff; background: linear-gradient(135deg, #F65C7A, #FF8FA3); }' +
      '.letterhead { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding-bottom: 14px; border-bottom: 2px solid var(--gold); }' +
      '.brand { display: flex; align-items: center; gap: 14px; }' +
      '.brand img { width: 62px; height: 62px; object-fit: cover; border-radius: 10px; border: 1px solid var(--gold); }' +
      '.brand-name { font-family: "Playfair Display", serif; font-size: 20px; font-weight: 600; }' +
      '.brand-sub { font-size: 9px; letter-spacing: .22em; text-transform: uppercase; color: var(--gold); }' +
      '.doc-kind { font-size: 9px; letter-spacing: .22em; text-transform: uppercase; color: var(--pink); margin-top: 2px; }' +
      '.qr { text-align: center; font-size: 8px; color: var(--gray); }' +
      '.qr svg { width: 92px; height: 92px; display: block; margin: 0 auto 4px; }' +
      '.hero { margin: 18px 0 14px; }' +
      '.hero h1 { font-size: 26px; }' +
      '.hero p { margin: 2px 0 0; color: var(--gray); }' +
      '.cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 18px; }' +
      '.card { background: var(--soft); border: 1px solid var(--line); border-top: 3px solid var(--pink); border-radius: 8px; padding: 8px 10px; }' +
      '.card .v { font-weight: 600; font-size: 12px; }' +
      '.card .l { font-size: 8.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--gray); }' +
      '.section { margin-top: 18px; }' +
      '.section h2 { font-size: 15px; padding-left: 10px; border-left: 3px solid var(--pink); margin-bottom: 10px; }' +
      '.plan { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }' +
      '.plano-h .plan { aspect-ratio: 232 / 182; } .plano-v .plan { aspect-ratio: 192 / 232; }' +
      '.equipo { color: var(--ink) !important; } .equipo b { color: var(--gold); font-weight: 600; }' +
      // Tablas con celdas y colores de la marca (minuto a minuto, proveedores, requisición)
      'table.grid { border: 1px solid #E8D9C4; }' +
      'table.grid th { background: var(--ink); color: #fff; border-bottom: 2px solid var(--gold); border-right: 1px solid #3a3a3a; }' +
      'table.grid td { border: 1px solid #EADFD3; }' +
      'table.grid tbody tr:nth-child(even) td { background: #FDF3F5; }' +
      'table.grid td.hora { color: var(--pink); font-weight: 600; white-space: nowrap; }' +
      'table.grid td.hora.deducido { color: #B9A99A; font-weight: 400; font-style: italic; }' +
      'table.grid tr.vacia td { height: 24px; background: #fff !important; }' +
      '.renglon { border-bottom: 1px solid #D9CFC5; min-height: 17px; font-size: 8.5px; color: var(--gray); margin-top: 2px; }' +
      '.pendientes { border: 1px solid var(--gold); background: #FBF7F0; border-radius: 8px; padding: 6px 10px; margin: 6px 0 8px; }' +
      '.pendientes b { color: var(--gold); text-transform: uppercase; letter-spacing: .1em; font-size: 9px; }' +
      '.pendientes ul { margin: 3px 0 0 16px; padding: 0; }' +
      '.lugares-resumen { margin: 8px 0 4px; } .lugares-resumen b { color: var(--pink); }' +
      '.nota-chica { font-size: 9px; margin: 4px 0 0; }' +
      '.plan svg { width: 100%; height: 100%; display: block; }' +
      '.flow-path { fill: none; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 9 9; opacity: .85; }' +
      // Plano en versión clara para imprimir
      '.plan { background: #fff; } .plan #svg-background { fill: #fff; } .plan #terrain-fill { fill: #f8f6f4; }' +
      '.plan #layer-bg > g { filter: invert(1) hue-rotate(180deg); }' +
      '.plan .elem-label, .plan .elem-badge { fill: #1F1F1F; stroke: rgba(255,255,255,0.9); stroke-width: 3px; paint-order: stroke; }' +
      'table { width: 100%; border-collapse: collapse; font-size: 10.5px; }' +
      'th { text-align: left; background: var(--ink); color: #fff; font-weight: 500; padding: 6px 8px; }' +
      'td { padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }' +
      'tr { page-break-inside: avoid; break-inside: avoid; }' +
      '.kv { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 18px; }' +
      '.kv div { padding: 5px 0; border-bottom: 1px solid var(--line); break-inside: avoid; white-space: pre-line; }' +
      '.kv .wide { grid-column: 1 / -1; }' +
      '.kv b { display: block; font-size: 8.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--gold); font-weight: 600; }' +
      '.block { break-inside: avoid; page-break-inside: avoid; margin-bottom: 12px; }' +
      '.block h3 { font-size: 12.5px; margin-bottom: 4px; }' +
      '.photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 10px; }' +
      '.photos figure { margin: 0; break-inside: avoid; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: #fff; }' +
      '.photos img { width: 100%; height: 170px; object-fit: cover; display: block; border-bottom: 3px solid var(--gold); }' +
      '.photos figcaption { padding: 5px 8px 7px; }' +
      '.photos figcaption b { display: block; font-size: 9px; letter-spacing: .12em; text-transform: uppercase; color: var(--pink); }' +
      '.photos .desc { font-size: 9.5px; color: var(--ink); line-height: 1.35; margin-top: 2px; }' +
      '.montajes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 8px; }' +
      '.mcard { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; background: #fff; }' +
      '.mcard img { width: 100%; height: 210px; object-fit: cover; display: block; border-bottom: 3px solid var(--gold); }' +
      '.mcard .cuerpo { padding: 8px 10px 10px; }' +
      '.mcard h3 { font-size: 13px; color: var(--pink); }' +
      '.mcard .sub { font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: var(--gray); margin: 1px 0 4px; }' +
      '.mcard .desc { margin: 0 0 6px; }' +
      '.mcard .lleva div { display: grid; grid-template-columns: 30% 1fr; border-top: 1px solid var(--line); padding: 2px 0; }' +
      '.mcard .lleva b { font-size: 8px; letter-spacing: .08em; text-transform: uppercase; color: #A88A55; font-weight: 600; padding-top: 1px; }' +
      '.notas-fin { margin-top: 10px; } .notas-fin .mod .fila { grid-template-columns: 26% 1fr; }' +
      // Información del evento por módulos
      '.mods { column-count: 2; column-gap: 12px; }' +
      '.mod { break-inside: avoid; page-break-inside: avoid; display: block; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; margin: 0 0 10px; background: #fff; }' +
      '.mod h3 { font-size: 12px; margin: 0; padding: 5px 10px; background: var(--soft); border-left: 4px solid var(--pink); border-bottom: 1px solid var(--line); }' +
      '.mod:nth-child(even) h3 { border-left-color: var(--gold); }' +
      '.mod.largo { break-inside: auto; page-break-inside: auto; } .mod .fila { break-inside: avoid; display: grid; grid-template-columns: 36% 1fr; border-bottom: 1px solid var(--line); }' +
      '.mod .fila:last-child { border-bottom: 0; }' +
      '.mod .k { padding: 4px 8px; background: #FBF8F5; border-right: 1px solid var(--line); font-size: 8px; letter-spacing: .08em; text-transform: uppercase; color: #A88A55; font-weight: 600; }' +
      '.mod .v { padding: 4px 8px; white-space: pre-line; }' +
      '.guests { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }' +
      '.guest-card { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; break-inside: avoid; }' +
      '.guest-card h3 { font-size: 12px; display: flex; justify-content: space-between; border-bottom: 1px solid var(--pink); padding-bottom: 4px; margin-bottom: 4px; }' +
      '.muted { color: var(--gray); }' +
      '.signs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 46px; text-align: center; font-size: 10px; color: var(--gray); }' +
      '.signs div { border-top: 1px solid var(--ink); padding-top: 6px; }' +
      '.footer { margin-top: 26px; padding-top: 8px; border-top: 1px solid var(--gold); text-align: center; font-size: 8.5px; color: var(--gray); }' +
      '.page-break { break-before: page; page-break-before: always; }' +
      // Impresión compacta: que la ficha quepa en ~3 hojas carta
      '@media print { html { background: #fff; } body { padding: 0; margin: 0; max-width: none; box-shadow: none; font-size: 9.5px; line-height: 1.35; } .toolbar { display: none; }' +
        ' .letterhead { padding-bottom: 8px; } .brand img { width: 46px; height: 46px; } .qr svg { width: 72px; height: 72px; }' +
        ' .hero { margin: 8px 0 8px; } .hero h1 { font-size: 20px; } .cards { gap: 6px; margin-bottom: 10px; } .card { padding: 5px 8px; }' +
        ' .section { margin-top: 10px; } .section h2 { font-size: 13px; margin-bottom: 6px; }' +
        ' .plano-pagina { break-before: page; break-after: page; margin: 0; }' +
        ' .plano-h .plan-giro { height: 232mm; } .plano-h .plan { width: 232mm; height: 182mm; aspect-ratio: auto; transform-origin: 0 0; transform: translate(182mm, 0) rotate(90deg); }' +
        ' .plano-v .plan { height: 232mm; aspect-ratio: auto; }' +
        ' table.grid tr.vacia td { height: 20px; }' +
        ' th, td { padding: 3px 6px; } table { font-size: 9px; } .kv { grid-template-columns: repeat(3, 1fr); gap: 0 14px; } .kv div { padding: 3px 0; }' +
        ' .block { margin-bottom: 6px; } .block h3 { font-size: 11px; margin-bottom: 2px; }' +
        ' .mods { column-gap: 8px; } .mod { margin-bottom: 7px; } .mod h3 { font-size: 10.5px; padding: 3px 8px; } .mod .k, .mod .v { padding: 2px 6px; } .mod .k { font-size: 7.5px; }' +
        ' .photos { grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 6px; } .photos img { height: 120px; } .photos .desc { font-size: 8.5px; }' +
        ' .montajes { gap: 8px; } .mcard img { height: 150px; } .mcard h3 { font-size: 11px; }' +
        ' .signs { margin-top: 26px; } .footer { margin-top: 12px; } }' +
      '</style></head><body>';

    html += '<div class="toolbar"><span>Vista previa · Ficha técnica</span><button onclick="window.print()">Imprimir / Guardar PDF</button></div>';

    // Membrete
    html += '<header class="letterhead"><div class="brand"><img src="' + esc(logoUrl) + '" alt="Primavera Events Group">' +
      '<div><div class="brand-name">Primavera Events Group<sup>®</sup></div>' +
      '<div class="brand-sub">primaveraeventsgroup.com</div>' +
      '<div class="doc-kind">Ficha técnica del evento' + (isPlanner ? '' : ' · versión para personal') + '</div></div></div>' +
      (qrSvg ? '<div class="qr">' + qrSvg + 'Escanea para ver el evento</div>' : '') +
      '</header>';

    // Encabezado del evento, con su coordinador y capitán
    var staffLista = data.staff || [];
    var deStaff = function (rol) {
      return staffLista.filter(function (p) { return p.rol === rol && p.nombre; }).map(function (p) { return p.nombre + (p.telefono ? ' · ' + p.telefono : ''); }).join(', ');
    };
    var coordinador = deStaff('Coordinador'), capitan = deStaff('Capitán');
    html += '<section class="hero"><h1>' + esc(eventName) + '</h1>' +
      (b.fecha_evento ? '<p>' + esc(fmtDate(b.fecha_evento)) + (horario ? ' · ' + esc(horario) : '') + '</p>' : '') +
      (coordinador || capitan ? '<p class="equipo">' + [coordinador && '<b>Coordinador:</b> ' + esc(coordinador), capitan && '<b>Capitán:</b> ' + esc(capitan)].filter(Boolean).join(' &nbsp;·&nbsp; ') + '</p>' : '') +
      '</section>';

    var cards = [
      ['Tipo de evento', tipo],
      ['Invitados', b.invitados ? b.invitados + (b.adultos || b.ninos ? ' (' + (b.adultos || 0) + ' adultos · ' + (b.ninos || 0) + ' niños)' : '') : ''],
      ['Venue', venueName],
      // Los lugares deben ser exactamente los invitados: si el plano no cuadra se avisa, no se presenta como correcto
      ['Mesas · lugares del banquete', L.banquete.length || L.principal.length ? L.banquete.length + ' mesas' + (L.principal.length ? ' + principal' : '') + ' · ' + L.total + ' lugares' +
        (invitadosN && L.total !== invitadosN ? ' ⚠ no cuadra con ' + invitadosN + ' invitados (' + (L.total > invitadosN ? 'sobran ' + (L.total - invitadosN) : 'faltan ' + (invitadosN - L.total)) + ')' : '') : ''],
      ['Formalidad', b.formalidad],
      ['Temática', b.tematica],
      ['Paleta de colores', [].concat(b.paletas || [], b.paleta ? [b.paleta] : []).join(' · ')],
      ['Planner', b.planner]
    ].filter(function (c) { return c[1]; });
    html += '<div class="cards">' + cards.map(function (c) {
      return '<div class="card"><div class="v">' + esc(c[1]) + '</div><div class="l">' + esc(c[0]) + '</div></div>';
    }).join('') + '</div>';

    // Información del evento (al principio y sin repetir lo de arriba)
    var EN_TARJETAS = ['tipo_evento', 'tipo_evento_otro', 'fecha_evento', 'hora_inicio', 'hora_cierre', 'invitados', 'adultos', 'ninos',
      'venue_red', 'venue_externo', 'formalidad', 'tematica', 'paletas', 'paleta', 'planner'];
    // Brief: solo campos con respuesta; en la versión para personal sin lo interno
    var briefHtml = '';
    var FOTOS_MENU = ['1er tiempo', '2do tiempo', 'Plato fuerte', 'Postre', 'Plato'];
    var todasFotos = (data.montaje && data.montaje.fotos) || [];
    var fotosMenu = todasFotos.filter(function (f) { return FOTOS_MENU.indexOf(f.etiqueta) > -1; });
    var fotosMontaje = todasFotos.filter(function (f) { return FOTOS_MENU.indexOf(f.etiqueta) < 0; });
    // Banquete / Menú y Montaje y Mobiliario acompañan a sus fotos (si hay), en vez de ir en la información general
    var modJuntoAFotos = {};
    (schema.sections || []).forEach(function (s) {
      if (!isPlanner && s.internal) return;
      var fmt = function (f) {
        var v = b[f.k];
        if (f.k === 'tipo_evento' && v === 'Otro' && b.tipo_evento_otro) return b.tipo_evento_otro;
        if (f.k === 'tipo_evento_otro') return ''; // ya se muestra como tipo de evento
        if (f.type === 'date') return fmtDate(v);
        return PE && PE.formatValue ? PE.formatValue(f, v) : (Array.isArray(v) ? v.join(' · ') : (v || ''));
      };
      var rows = s.fields.filter(function (f) {
        if (!f.k || (!isPlanner && f.internal)) return false;
        if (f.timed) return false; // lo que tiene hora ya sale en el minuto a minuto
        if (EN_TARJETAS.indexOf(f.k) > -1) return false; // ya está en el encabezado o en las tarjetas
        return fmt(f) !== '';
      });
      if (!rows.length) return;
      var modulo = function (titulo, filas) {
        return '<div class="mod' + (filas.length > 7 ? ' largo' : '') + '"><h3>' + esc(titulo) + '</h3>' + filas.map(function (f) {
          return '<div class="fila"><div class="k">' + esc(f.label) + '</div><div class="v">' + esc(fmt(f)) + '</div></div>';
        }).join('') + '</div>';
      };
      // Lo que ya dicen las mesas del plano o las fotos con su descripción no se repite en las notas
      var fotosConDesc = function (re) { var l = todasFotos.filter(function (f) { return re.test(f.etiqueta || ''); }); return l.length && l.every(function (f) { return f.descripcion; }); };
      if (s.id === 'mobiliario' && (tablesList.length || fotosMontaje.length)) {
        var yaEnMesas = ['sillas', 'mesas'].concat(fotosConDesc(/^Montaje/) ? ['manteleria', 'vajilla_color'] : []);
        var notasM = rows.filter(function (f) { return yaEnMesas.indexOf(f.k) < 0; });
        if (notasM.length) modJuntoAFotos.mobiliario = modulo('Notas del montaje', notasM);
      } else if (s.id === 'menu' && fotosMenu.length) {
        var yaEnFotos = fotosConDesc(/^Plato fuerte$/) ? ['proteina', 'guarniciones'] : [];
        var notasMenu = rows.filter(function (f) { return yaEnFotos.indexOf(f.k) < 0; });
        if (notasMenu.length) modJuntoAFotos.menu = modulo('Notas del menú', notasMenu);
      } else briefHtml += modulo(s.title, rows);
    });
    if (briefHtml) html += '<section class="section"><h2>Información del evento</h2><div class="mods">' + briefHtml + '</div></section>';


    // Mesas y lugares: desglose por tipo y cuadre contra los invitados
    if (L.banquete.length || L.principal.length || L.coctel.length) {
      var grupos = [];
      var agrupa = function (lista, uso) {
        lista.forEach(function (e) {
          var nombre = typeLabels[e.type] || e.name || e.type;
          var g = grupos.find(function (x) { return x.nombre === nombre && x.uso === uso; });
          if (!g) grupos.push(g = { nombre: nombre, uso: uso, n: 0, lugares: 0 });
          g.n++;
          g.lugares += parseInt(e.chairs, 10) || 0;
        });
      };
      agrupa(L.principal, 'Mesa principal');
      agrupa(L.banquete, 'Banquete');
      agrupa(L.coctel, 'Cóctel (no cuenta para el banquete)');
      html += '<section class="section block"><h2>Mesas y lugares</h2><table class="grid"><thead><tr><th>Tipo</th><th style="width:12%">Cantidad</th><th style="width:14%">Lugares</th><th style="width:34%">Uso</th></tr></thead><tbody>' +
        grupos.map(function (g) { return '<tr><td><strong>' + esc(g.nombre) + '</strong></td><td>' + g.n + '</td><td>' + (g.lugares || '-') + '</td><td>' + esc(g.uso) + '</td></tr>'; }).join('') +
        '</tbody></table>';
      var dif = L.total - invitadosN;
      html += '<p class="lugares-resumen">Lugares del banquete (mesas + mesa principal): <b>' + L.total + '</b>' +
        (invitadosN ? ' · Invitados: <b>' + invitadosN + '</b> · ' + (dif === 0 ? 'cuadra exacto' : dif > 0 ? 'sobran <b>' + dif + '</b> lugares' : 'faltan <b>' + (-dif) + '</b> lugares') : '') + '</p>';
      if (L.sugerido && dif !== 0) {
        var sg = L.sugerido;
        html += '<p>' + (sg.valido
          ? 'Para que cuadre: ' + (L.principal.length ? 'mesa principal con ' + L.lugaresPrincipal + ' y ' : '') + sg.porRepartir + ' invitados en ' + sg.mesas + ' mesas → ' +
            (sg.extra ? (sg.mesas - sg.extra) + ' mesas de ' + sg.base + ' y ' + sg.extra + ' mesas de ' + (sg.base + 1) : sg.mesas + ' mesas de ' + sg.base) + ' (las mesas son de 8 a 12).'
          : 'Con ' + sg.mesas + ' mesas quedarían ' + sg.base + (sg.extra ? ' a ' + (sg.base + 1) : '') + ' personas por mesa, fuera del rango de 8 a 12: se necesitan entre ' +
            Math.ceil(sg.porRepartir / 12) + ' y ' + Math.floor(sg.porRepartir / 8) + ' mesas.') + '</p>';
      }
      var conLista = tablesList.some(function (t) { return t.mesaConfig && t.mesaConfig.invitados && t.mesaConfig.invitados.length; });
      if (!conLista) html += '<div class="pendientes"><b>Falta definir</b><ul><li>Cuántas personas se sientan en cada mesa: se necesita la lista de invitados.</li></ul></div>';
      html += '</section>';
    }


    // Minuto a minuto: inicia, termina, actividad y responsable, con renglones para apuntes
    var minDelEvento = function (h) {
      if (!h) return 9999;
      var p = h.split(':'), mm = parseInt(p[0], 10) * 60 + (parseInt(p[1], 10) || 0);
      return mm < 360 ? mm + 1440 : mm;
    };
    var minuto = (data.minuto || []).filter(function (r) { return r.hora || r.actividad; });
    var hayDeducidas = false;
    html += '<section class="section"><h2>Minuto a minuto</h2><table class="grid minuto"><thead><tr><th style="width:10%">Inicia</th><th style="width:10%">Termina</th><th>Actividad</th><th style="width:27%">Responsable</th></tr></thead><tbody>';
    minuto.forEach(function (r, i) {
      var termina = r.fin || '', deducida = false;
      if (!termina && r.hora) {
        var sig = minuto.slice(i + 1).find(function (x) { return x.hora && minDelEvento(x.hora) > minDelEvento(r.hora); });
        if (sig) { termina = sig.hora; deducida = hayDeducidas = true; }
      }
      html += '<tr><td class="hora">' + esc(h12(r.hora)) + '</td><td class="hora' + (deducida ? ' deducido' : '') + '">' + esc(h12(termina)) + '</td><td>' + esc(r.actividad) + '</td><td>' + esc(r.responsable) + '</td></tr>';
    });
    for (var vm = 0; vm < (minuto.length ? 4 : 10); vm++) html += '<tr class="vacia"><td></td><td></td><td></td><td></td></tr>';
    html += '</tbody></table>' + (hayDeducidas ? '<p class="muted nota-chica">Las horas de término en gris se tomaron del inicio de la actividad siguiente: confírmalas.</p>' : '') + '</section>';

    // Staff y fuerza de trabajo del capitán: sus meseros (con sus mesas) y quién está en barra.
    // Si aún no están asignados, quedan renglones para escribir los nombres.
    var staffFilas = window.PEGStaff ? window.PEGStaff.filasFicha() : '';
    var tieneRol = function (rol) { return staffLista.some(function (p) { return p.rol === rol && p.nombre; }); };
    var vaciaStaff = function (rol) { return '<tr class="vacia"><td><strong>' + esc(rol) + '</strong></td><td></td><td></td><td></td><td></td></tr>'; };
    var staffVacias = '';
    if (!tieneRol('Mesero')) for (var vs = 0; vs < 6; vs++) staffVacias += vaciaStaff('Mesero');
    if (!tieneRol('Barra')) staffVacias += vaciaStaff('Barra') + vaciaStaff('Barra');
    staffVacias += vaciaStaff('') + vaciaStaff('');
    html += '<section class="section"><h2>Staff y fuerza de trabajo del capitán</h2>' +
      '<p class="muted">' + (staffFilas ? esc(window.PEGStaff.resumen()) + ' · ' : '') + 'Meseros con las mesas que atiende cada uno y quién va en la posición de barra.' +
      (!tieneRol('Mesero') || !tieneRol('Barra') ? ' <b>Falta asignar ' + [!tieneRol('Mesero') && 'meseros', !tieneRol('Barra') && 'barra'].filter(Boolean).join(' y ') + ':</b> escribe los nombres en los renglones.' : '') + '</p>' +
      '<table class="grid"><thead><tr><th style="width:16%">Rol</th><th>Nombre</th><th style="width:16%">Teléfono</th><th style="width:16%">Mesas</th><th style="width:10%">Radio</th></tr></thead><tbody>' + staffFilas + staffVacias + '</tbody></table></section>';

    // Proveedores externos: lo que falta queda en renglones para anotarlo a mano
    var provs = (data.proveedores || []).filter(function (p) { return p.servicio || p.nombre; });
    var renglon = function (t) { return '<div class="renglon">' + esc(t || '') + '</div>'; };
    html += '<section class="section"><h2>Servicios y proveedores externos</h2><table class="grid"><thead><tr><th style="width:18%">Servicio</th><th style="width:24%">Proveedor / contacto</th><th style="width:18%">Horario</th><th>Condiciones y requerimientos</th></tr></thead><tbody>';
    provs.forEach(function (p) {
      var horas = [['llegada', 'Llega'], ['inicio', 'Inicia'], ['fin', 'Termina']].map(function (x) {
        return p[x[0]] ? '<div>' + x[1] + ' ' + esc(h12(p[x[0]])) + '</div>' : renglon(x[1] + ':');
      }).join('');
      var notas = (isPlanner ? (p.condiciones ? '<div><b>Condiciones:</b> ' + esc(p.condiciones) + '</div>' : renglon('Condiciones:')) : '') +
        (p.requerimientos ? '<div><b>Requerimientos:</b> ' + esc(p.requerimientos) + '</div>' : renglon('Requerimientos:')) + renglon('');
      html += '<tr><td><strong>' + esc(p.servicio || '-') + '</strong>' + (p.red ? '<br><span class="muted">Red Primavera</span>' : '') + (p.contrata ? '<br><span class="muted">Contrata: ' + esc(p.contrata) + '</span>' : '') + '</td>' +
        '<td>' + esc(p.nombre || '') + (p.nombre ? '' : renglon('Nombre:')) + (p.telefono ? '<br>' + esc(p.telefono) : renglon('Tel.:')) + (p.recibe ? '<br><span class="muted">Recibe: ' + esc(p.recibe) + '</span>' : renglon('Recibe:')) + '</td>' +
        '<td>' + horas + '</td><td>' + notas + '</td></tr>';
    });
    // Servicios del evento que surte PEG (DJ, pista, cabinas, robot LED, chisperos…) u otros sin proveedor registrado
    var servsPEG = window.PEGVale && window.PEGVale.serviciosFicha ? window.PEGVale.serviciosFicha() : [];
    servsPEG.forEach(function (s) {
      var pv = s.prov;
      var horas = [['llega', 'Llega'], ['inicia', 'Inicia'], ['termina', 'Termina']].map(function (x) {
        return pv[x[0]] ? '<div>' + x[1] + ' ' + esc(h12(pv[x[0]])) + '</div>' : renglon(x[1] + ':');
      }).join('');
      html += '<tr><td><strong>' + esc(s.nombre) + '</strong><br><span class="muted">Lo surte: ' + esc(s.surte) + '</span></td>' +
        '<td>' + (pv.nombre ? esc(pv.nombre) : renglon('Nombre:')) + (pv.telefono ? '<br>' + esc(pv.telefono) : renglon('Tel.:')) + (pv.recibe ? '<br><span class="muted">Recibe: ' + esc(pv.recibe) + '</span>' : renglon('Recibe:')) + '</td>' +
        '<td>' + horas + '</td><td>' + (s.nota ? '<div>' + esc(s.nota) + '</div>' : '') + renglon('Requerimientos:') + renglon('') + '</td></tr>';
    });
    for (var vp = 0; vp < (provs.length ? 2 : 4); vp++) {
      html += '<tr class="vacia"><td>' + renglon('') + '</td><td>' + renglon('Nombre:') + renglon('Tel.:') + '</td><td>' + renglon('Llega:') + renglon('Inicia:') + renglon('Termina:') + '</td><td>' + renglon('') + renglon('') + '</td></tr>';
    }
    html += '</tbody></table></section>';

    // Montaje: una sola sección. Cada montaje (mesas iguales) con su foto grande y debajo lo que lleva;
    // después las demás fotos, el cóctel y las notas que no están en ninguna foto
    var m = data.montaje || {};
    var montajeRows = (schema.montajeFields || []).filter(function (f) { return m[f.k]; });
    // Números consecutivos como rango: 1, 2, 3, 5 → 1–3, 5
    function rangos(lista) {
      var n = lista.map(Number).sort(function (x, y) { return x - y; }), out = [];
      for (var i = 0; i < n.length; i++) {
        var ini = n[i];
        while (i + 1 < n.length && n[i + 1] === n[i] + 1) i++;
        out.push(n[i] - ini >= 2 ? ini + '–' + n[i] : (n[i] === ini ? String(ini) : ini + ', ' + n[i]));
      }
      return out.join(', ');
    }
    var fotosHtml = function (lista) {
      return '<div class="photos">' + lista.map(function (f, i) {
        return '<figure><img src="' + esc(f.url) + '" alt="' + esc(f.etiqueta || 'Foto ' + (i + 1)) + '">' +
          (f.etiqueta || f.descripcion ? '<figcaption>' + (f.etiqueta ? '<b>' + esc(f.etiqueta) + '</b>' : '') + (f.descripcion ? '<div class="desc">' + esc(f.descripcion) + '</div>' : '') + '</figcaption>' : '') + '</figure>';
      }).join('') + '</div>';
    };
    var lleva = function (c) {
      var items = [];
      if (c.mantelColor) items.push(['Mantel', c.mantelColor === 'sin_mantel' ? 'Sin mantel' : cap(c.mantelColor)]);
      if (c.caminoColor && c.caminoColor !== 'ninguno') items.push(['Camino', cap(c.caminoColor) + (c.caminoAcomodo ? ' (' + c.caminoAcomodo + ')' : '')]);
      var folds = Array.isArray(c.servilletaDoblez) ? c.servilletaDoblez : (c.servilletaDoblez ? [c.servilletaDoblez] : []);
      if (folds.length) items.push(['Servilleta', folds.map(function (f) {
        var color = c['servilletaColor_' + f] || (f === 'corazon' ? c.servilletaColorCorazon : f === 'corbata' ? c.servilletaColorCorbata : c.servilletaColorOtros) || 'blanco';
        return (foldLabels[f] || cap(f)) + ' (' + cap(color) + ')';
      }).join(', ')]);
      if (c.platoBase && c.platoBase !== 'ninguno') items.push(['Plato base', plateBaseLabels[c.platoBase] || cap(c.platoBase)]);
      if (c.platoTrinche && c.platoTrinche !== 'ninguno') items.push(['Plato trinche', cap(c.platoTrinche)]);
      if (c.cubiertos) items.push(['Cubiertos', cap(c.cubiertos)]);
      if (c.tipoSilla) items.push(['Silla', (sillaLabels[c.tipoSilla] || cap(c.tipoSilla)) + (c.sillaFunda && c.sillaFunda !== 'ninguna' ? ' con funda completa ' + c.sillaFunda : '')]);
      var glass = [];
      if (c.cristal && c.cristal !== 'ninguno') glass.push((glassLabels[c.cristal] || cap(c.cristal)) + ' (' + (c.copasColor || 'transparente') + ')');
      if (c.cristal2 && c.cristal2 !== 'ninguno') glass.push((glassLabels[c.cristal2] || cap(c.cristal2)) + ' (' + (c.copasColor2 || 'transparente') + ')');
      if (glass.length) items.push(['Cristalería', glass.join(', ')]);
      if (c.arregloFloralTipo && c.arregloFloralTipo !== 'ninguno') items.push(['Centro / floral', cap(c.arregloFloralTipo) + (c.arregloFloralAcomodo ? ' (' + c.arregloFloralAcomodo + ')' : '')]);
      return items;
    };
    // Mesas con el mismo montaje (sin importar cuántas sillas tengan) forman un grupo
    var gruposMesa = [], coctelYApoyo = [];
    tablesList.forEach(function (t) {
      var c = t.mesaConfig || {};
      if (/^(table_periquera|lounge_set)/.test(t.type) || /^(table_gifts|table_candy|table_cake|table_shots|table_buffet)$/.test(t.type)) {
        // Cóctel y mesas de apoyo: solo cuántas piezas y lugares (su montaje de mesa no aplica)
        var nombre = /^(table_gifts|table_candy|table_cake|table_shots|table_buffet)$/.test(t.type) && t.name ? t.name : (typeLabels[t.type] || t.name || t.type);
        var a = coctelYApoyo.find(function (x) { return x.nombre === nombre; });
        if (!a) coctelYApoyo.push(a = { nombre: nombre, n: 0, lugares: 0, coctel: /^(table_periquera|lounge_set)/.test(t.type) });
        a.n++; a.lugares += parseInt(t.chairs, 10) || 0;
        return;
      }
      var items = lleva(c);
      var firma = t.type + '|' + JSON.stringify(items) + '|' + (c.menu || '');
      var g = gruposMesa.find(function (x) { return x.firma === firma; });
      if (!g) gruposMesa.push(g = { firma: firma, t: t, items: items, menu: c.menu || '', nums: [], sillas: [], principal: t.type.indexOf('table_honor') === 0 });
      g.nums.push(c.mesaNum || '');
      g.sillas.push(parseInt(t.chairs, 10) || 0);
    });
    // El menú por mesa solo se muestra si no es igual en todas
    var menusDistintos = gruposMesa.filter(function (g) { return !g.principal; }).map(function (g) { return g.menu; }).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).length > 1;
    // Foto "Montaje 1", "Montaje 2"… para el 1er, 2do… grupo de mesas del banquete
    var fotosLibres = fotosMontaje.slice();
    var nMontaje = 0;
    gruposMesa.forEach(function (g) {
      if (g.principal) return;
      nMontaje++;
      var foto = fotosLibres.find(function (f) { return f.etiqueta === 'Montaje ' + nMontaje; }) ||
        (gruposMesa.filter(function (x) { return !x.principal; }).length === 1 ? fotosLibres.find(function (f) { return f.etiqueta === 'Montaje'; }) : null);
      if (foto) { g.foto = foto; fotosLibres.splice(fotosLibres.indexOf(foto), 1); }
      g.titulo = 'Montaje ' + nMontaje;
    });
    var sillasTexto = function (lista) {
      var cuenta = {};
      lista.forEach(function (n) { cuenta[n] = (cuenta[n] || 0) + 1; });
      var claves = Object.keys(cuenta);
      return claves.length === 1 ? claves[0] + ' sillas por mesa' : claves.sort(function (a, b) { return b - a; }).map(function (k) { return cuenta[k] + ' mesas de ' + k; }).join(' y ') + ' sillas';
    };
    if (gruposMesa.length || fotosMontaje.length || montajeRows.length) {
      html += '<section class="section"><h2>Montaje</h2>' + (montajeRows.length ? '<div class="kv">' + montajeRows.map(function (f) {
        return '<div' + (f.type === 'textarea' ? ' class="wide"' : '') + '><b>' + esc(f.label) + '</b>' + esc(m[f.k]) + '</div>';
      }).join('') + '</div>' : '');
      html += '<div class="montajes">' + gruposMesa.map(function (g) {
        var nums = g.nums.filter(Boolean);
        var mesas = g.principal ? 'Mesa principal' : (nums.length ? (nums.length === 1 ? 'Mesa ' : 'Mesas ') + rangos(nums) : '');
        return '<article class="mcard">' + (g.foto ? '<img src="' + esc(g.foto.url) + '" alt="' + esc(g.titulo || 'Mesa principal') + '">' : '') +
          '<div class="cuerpo"><h3>' + esc(g.principal ? 'Mesa principal' : g.titulo + ' · ' + mesas) + '</h3>' +
          '<div class="sub">' + esc((g.principal ? '' : g.nums.length + ' mesas · ') + (typeLabels[g.t.type] || g.t.name || g.t.type) + ' · ' + sillasTexto(g.sillas)) + '</div>' +
          (g.foto && g.foto.descripcion ? '<p class="desc">' + esc(g.foto.descripcion) + '</p>' : '') +
          '<div class="lleva">' + g.items.map(function (it) { return '<div><b>' + esc(it[0]) + '</b>' + esc(it[1]) + '</div>'; }).join('') +
            (menusDistintos && g.menu ? '<div><b>Menú</b>' + esc(g.menu) + '</div>' : '') + '</div>' +
          '</div></article>';
      }).join('') +
        // Las demás fotos del montaje (centro de mesa, loza…) como tarjeta junto a la mesa principal
        fotosLibres.map(function (f) {
          return '<article class="mcard"><img src="' + esc(f.url) + '" alt="' + esc(f.etiqueta || 'Foto') + '"><div class="cuerpo"><h3>' + esc(f.etiqueta || 'Montaje') + '</h3>' +
            (f.descripcion ? '<p class="desc">' + esc(f.descripcion) + '</p>' : '') + '</div></article>';
        }).join('') + '</div>';
      if (coctelYApoyo.length) {
        html += '<table class="grid" style="margin-top:10px"><thead><tr><th>Cóctel y mesas de apoyo</th><th style="width:14%">Piezas</th><th style="width:14%">Lugares</th></tr></thead><tbody>' +
          coctelYApoyo.map(function (a) { return '<tr><td><strong>' + esc(a.nombre) + '</strong></td><td>' + a.n + '</td><td>' + (a.lugares || '-') + '</td></tr>'; }).join('') + '</tbody></table>';
      }
      if (modJuntoAFotos.mobiliario) html += '<div class="notas-fin">' + modJuntoAFotos.mobiliario + '</div>';
      html += '</section>';
    }
    // Menú: fotos grandes con su descripción y al final las notas del menú
    if (fotosMenu.length) {
      html += '<section class="section"><h2>Menú</h2>' + fotosHtml(fotosMenu).replace('<div class="photos">', '<div class="photos" style="grid-template-columns: repeat(' + Math.min(fotosMenu.length, 4) + ', 1fr)">') + (modJuntoAFotos.menu ? '<div class="notas-fin">' + modJuntoAFotos.menu + '</div>' : '') + '</section>';
    }

    // Croquis en hoja completa (antes de la requisición: así los saltos de hoja no dejan huecos)
    html += '<section class="section plano-pagina ' + (horizontal ? 'plano-h' : 'plano-v') + '"><h2>Plano y distribución</h2><div class="plan-giro"><div class="plan">' + planSvg + '</div></div></section>';

    // Requisición de material: la plantilla de bodega, prellenada con lo sugerido (o con lo que ya llenaron).
    // La revisan y completan planner, capitán y coordinador.
    var req = window.PEGVale && window.PEGVale.datosFicha ? window.PEGVale.datosFicha() : { items: [], pendientes: [], calculada: true };
    var reqDoc = window.PEGVale ? window.PEGVale.imprimirInventario(true) : '';
    if (reqDoc) {
      // Sus estilos se limitan a la sección (.reqp) para no chocar con los de la ficha
      var reqCss = (reqDoc.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1].replace(/@media print\{[\s\S]*$/, '')
        .replace(/(^|\})([^{}@]+)\{/g, function (m0, a, sel) {
          return a + sel.split(',').map(function (x) {
            x = x.trim();
            return x === ':root' || x === 'html' || x === 'body' ? '.reqp' : x === '*' ? '.reqp *' : '.reqp ' + x;
          }).join(',') + '{';
        });
      var reqBody = reqDoc.split('<body>')[1].split('</body>')[0].replace(/<div class="toolbar">[\s\S]*?<\/div>/, '');
      html += '<style>' + reqCss + '.reqp{margin:0;max-width:none;padding:0}@media print{.reqp thead{display:table-header-group}}</style>' +
        '<section class="reqp page-break">' +
        '<p class="muted" style="margin:0 0 6px">' + (req.calculada ? '<b>Sugerido</b> calculado desde el plano, el menú y las amenidades. ' : '') +
        'Planner, capitán y coordinador revisan las cantidades, eligen modelo y color donde se indica y completan lo que falte.</p>' +
        (req.pendientes.length ? '<div class="pendientes"><b>Falta definir</b><ul>' + req.pendientes.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></div>' : '') +
        reqBody + '</section>';
    }

    // Invitados por mesa
    var withGuests = tablesList.filter(function (t) { return t.mesaConfig && t.mesaConfig.invitados && t.mesaConfig.invitados.length; });
    if (withGuests.length) {
      html += '<section class="section page-break"><h2>Invitados por mesa</h2><div class="guests">';
      withGuests.forEach(function (t) {
        var inv = t.mesaConfig.invitados;
        var total = inv.reduce(function (s, g) { return s + (parseInt(g.pases, 10) || 0); }, 0);
        html += '<div class="guest-card"><h3><span>Mesa ' + esc(t.mesaConfig.mesaNum || '') + '</span><span class="muted">' + total + ' pases</span></h3>' +
          inv.map(function (g) { return '<div>' + esc(g.nombre) + ' <span class="muted">· ' + esc(g.pases) + '</span></div>'; }).join('') + '</div>';
      });
      html += '</div></section>';
    }

    if (isPlanner) {
      html += '<div class="signs"><div>Firma del cliente</div><div>Firma del planner</div><div>Fecha</div></div>';
    }

    html += '<footer class="footer">Primavera Events Group® · Marca registrada · Todos los derechos reservados · primaveraeventsgroup.com' +
      (eventUrl ? '<br>Evento en línea: ' + esc(eventUrl) : '') + '</footer>';
    html += '</body></html>';

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }

  // ── Pantalla completa del plano ──
  // Usa la pantalla completa del navegador; donde no existe (iPhone) el plano se extiende sobre toda la página.
  function _wirePantallaCompleta() {
    var area = document.querySelector('.canvas-area');
    var btn = document.getElementById('btn-pantalla-completa');
    if (!area || !btn) return;
    function activa() {
      return document.fullscreenElement === area || document.webkitFullscreenElement === area || area.classList.contains('pantalla-completa');
    }
    function alCambiar() {
      var on = activa();
      document.body.classList.toggle('plano-completo', on);
      btn.innerHTML = '<i class="fa-solid ' + (on ? 'fa-compress' : 'fa-expand') + '"></i>';
      btn.title = on ? 'Salir de pantalla completa' : 'Ver el plano en pantalla completa';
      Array.prototype.forEach.call(document.querySelectorAll('.pc-vista'), function (b) {
        b.classList.toggle('active', b.getAttribute('data-vista') === AppState.activeView);
      });
      // El lienzo cambió de tamaño: reacomodar el 3D y el 2D (respetando la vista elegida)
      setTimeout(function () {
        if (window.Visualizer3D && window.Visualizer3D.resize) window.Visualizer3D.resize();
        if (AppState.vistaActiva) _enfocarVista(AppState.vistaActiva);
        else if (AppState.activeView === '2d' && window.Editor2D) window.Editor2D.resetZoom();
      }, 150);
    }
    btn.onclick = function () {
      if (activa()) {
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
        area.classList.remove('pantalla-completa');
        alCambiar();
        return;
      }
      var pedir = area.requestFullscreen || area.webkitRequestFullscreen;
      var falla = function () { area.classList.add('pantalla-completa'); alCambiar(); };
      if (!pedir) { falla(); return; }
      try {
        var p = pedir.call(area);
        if (p && p.catch) p.catch(falla);
      } catch (e) { falla(); }
    };
    document.addEventListener('fullscreenchange', alCambiar);
    document.addEventListener('webkitfullscreenchange', alCambiar);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && area.classList.contains('pantalla-completa')) { area.classList.remove('pantalla-completa'); alCambiar(); }
    });
    // Dentro de pantalla completa la barra de arriba no se ve: estos botones cambian entre 3D y 2D
    Array.prototype.forEach.call(document.querySelectorAll('.pc-vista'), function (b) {
      b.onclick = function () {
        var real = document.getElementById(b.getAttribute('data-vista') === '3d' ? 'btn-view-3d' : 'btn-view-2d');
        if (real) real.click();
        alCambiar();
      };
    });
  }

  function _wireExportButtons() {
    var btnSave = document.getElementById('btn-save');
    // Con un evento abierto, Guardar actualiza ese evento (no pide nombre ni crea otro plano)
    if (btnSave) btnSave.onclick = function () {
      var PE = window.PEGEventos;
      if (PE && PE.getEvent && PE.getEvent()) { PE.guardarAhora(); return; }
      saveToLocalStorage();
    };

    var btnExportJSON = document.getElementById('btn-export-json');
    if (btnExportJSON) btnExportJSON.onclick = exportJSON;

    var btnExportPNG = document.getElementById('btn-export-png');
    if (btnExportPNG) btnExportPNG.onclick = exportPNG;

    var btnExportPDF = document.getElementById('btn-export-pdf');
    if (btnExportPDF) btnExportPDF.onclick = exportPDF;

    var btnImport = document.getElementById('btn-import-json');
    var fileInput = document.getElementById('import-file-input');
    if (btnImport && fileInput) {
      btnImport.onclick = function () { fileInput.click(); };
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) {
          importJSON(fileInput.files[0]);
          fileInput.value = '';
        }
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  // CLEAR
  // ══════════════════════════════════════════════════════════
  function _wireClear() {
    var btn = document.getElementById('btn-clear');
    var btnFab = document.getElementById('btn-clear-fab');
    
    // Categorías que forman el plano del salón y se conservan en el reinicio parcial
    var VENUE_CATEGORIES = ['estructuras', 'accesos'];

    var applyReset = function (total) {
      saveHistory();
      if (total) {
        AppState.elements = [];
        AppState.flows = [];
        AppState.venueId = null;
      } else {
        AppState.elements = AppState.elements.filter(function (e) {
          return e.bg2d || VENUE_CATEGORIES.indexOf(e.category) > -1;
        });
      }
      _tableCounter = 0;
      deselectAll();
      _refresh();
      updateCounters();

      if (_currentViewMode === '3d' && window.Visualizer3D) {
        window.Visualizer3D.syncWithData(AppState.elements);
      }

      showToast(total
        ? 'Reinicio total: lienzo 100% vacío.'
        : 'Reinicio parcial: se conservó el plano del salón; se quitaron mesas, amenidades y decoración.', 'success');
    };

    var onClearClick = function () {
      var modal = document.createElement('div');
      modal.className = 'venue-picker-overlay';
      modal.innerHTML =
        '<div class="venue-picker">' +
          '<div class="venue-picker-head"><h2>Reiniciar el plano</h2>' +
          '<button class="venue-picker-close" title="Cerrar"><i class="fa-solid fa-xmark"></i></button></div>' +
          '<p>Puedes deshacer con Ctrl+Z.</p>' +
          '<div class="venue-grid">' +
            '<button class="venue-card" data-reset="parcial"><i class="fa-solid fa-broom"></i>' +
              '<strong>Reinicio parcial</strong>' +
              '<span>Conserva el plano del salón (estructuras, accesos, croquis y flujos) y quita mesas, amenidades, entretenimiento, decoración y proveedores.</span></button>' +
            '<button class="venue-card venue-card-empty" data-reset="total"><i class="fa-solid fa-trash-can"></i>' +
              '<strong>Reinicio total</strong>' +
              '<span>Deja el lienzo 100% vacío: sin terreno, construcción, mesas ni flujos.</span></button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
      var close = function () { modal.remove(); };
      modal.querySelector('.venue-picker-close').onclick = close;
      modal.onclick = function (e) { if (e.target === modal) close(); };
      Array.prototype.forEach.call(modal.querySelectorAll('[data-reset]'), function (b) {
        b.onclick = function () {
          close();
          applyReset(b.getAttribute('data-reset') === 'total');
        };
      });
    };

    if (btn) btn.onclick = onClearClick;
    if (btnFab) btnFab.onclick = onClearClick;
  }

  // ══════════════════════════════════════════════════════════
  // VENUE PICKER (plantillas de salones / desde cero)
  // ══════════════════════════════════════════════════════════
  var _fit2dOnShow = false;
  var _fit3dOnShow = true;

  function _venueOptions() {
    var opts = [];
    if (window.DEFAULT_LAYOUT) {
      opts.push({
        id: 'jardin', name: 'Jardín con alberca',
        description: 'Plano base actual del maquetador universal', layout: window.DEFAULT_LAYOUT
      });
    }
    (window.VENUE_TEMPLATES || []).forEach(function (t) { opts.push(t); });
    opts.push({
      id: 'cero', name: 'Empezar desde cero',
      description: 'Terreno vacío de 50 × 60 m para maquetar un salón nuevo',
      layout: { terrain: { w: 50, h: 60 }, elements: [], flows: [] }
    });
    return opts;
  }

  function _loadVenueTemplate(opt) {
    _applyLayout(opt.layout);
    showToast('Plantilla cargada: ' + opt.name, 'success');
  }

  // Plano actual (lo que se guarda dentro de un evento)
  function _currentLayout() {
    return {
      terrain: AppState.terrain,
      elements: AppState.elements,
      flows: AppState.flows,
      layers: AppState.layers,
      venueId: AppState.venueId,
      labelScale: AppState.labelScale || 1,
      mode: AppState.mode,
      vistas: AppState.vistas || []
    };
  }

  function _applyLayout(layout) {
    var data = JSON.parse(JSON.stringify(layout));
    saveHistory();
    _tableCounter = 0;
    _loadLayoutData(data);
    deselectAll();

    var wEl = document.getElementById('terrain-width');
    var hEl = document.getElementById('terrain-height');
    if (wEl) wEl.value = AppState.terrain.w;
    if (hEl) hEl.value = AppState.terrain.h;
    Object.keys(AppState.layers).forEach(function (cat) {
      var cb = document.getElementById('layer-toggle-' + cat);
      if (cb) cb.checked = AppState.layers[cat] !== false;
    });

    if (window.Editor2D) window.Editor2D.setTerrain(AppState.terrain.w, AppState.terrain.h);
    _fit2dOnShow = AppState.activeView !== '2d';
    _fit3dOnShow = true;
    _aplicarModo();
    _refresh();
    updateCounters();
    // Si el 3D ya está a la vista, encuadrarlo de una vez sobre el plano nuevo
    if (AppState.activeView === '3d' && window.App_setView) window.App_setView('3d');
  }

  function _openVenuePicker(isStart) {
    var modal = document.createElement('div');
    modal.className = 'venue-picker-overlay';
    var cards = _venueOptions().map(function (opt, i) {
      var count = (opt.layout.elements || []).filter(function (e) { return !e.bg2d; }).length;
      var meta = opt.id === 'cero' ? 'Lienzo vacío' :
        opt.layout.terrain.w + ' × ' + opt.layout.terrain.h + ' m · ' + count + ' elementos' +
        ((opt.layout.flows || []).length ? ' · flujos de circulación' : '');
      return '<button class="venue-card' + (opt.id === 'cero' ? ' venue-card-empty' : '') + '" data-idx="' + i + '">' +
        '<i class="fa-solid ' + (opt.id === 'cero' ? 'fa-plus' : 'fa-building-columns') + '"></i>' +
        '<strong>' + opt.name + '</strong>' +
        '<span>' + opt.description + '</span>' +
        '<small>' + meta + '</small>' +
        '</button>';
    }).join('');
    modal.innerHTML =
      '<div class="venue-picker">' +
        '<div class="venue-picker-head">' +
          '<h2>¿Con qué salón quieres empezar?</h2>' +
          '<button class="venue-picker-close" title="Cerrar"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<p>Elige un salón ya maquetado y ajústalo a tu evento, o empieza un plano nuevo.</p>' +
        '<div class="venue-grid">' + cards + '</div>' +
      '</div>';
    document.body.appendChild(modal);

    var opts = _venueOptions();
    var close = function () { modal.remove(); };
    modal.querySelector('.venue-picker-close').onclick = close;
    modal.onclick = function (e) { if (e.target === modal) close(); };
    Array.prototype.forEach.call(modal.querySelectorAll('.venue-card'), function (btn) {
      btn.onclick = function () {
        var hasWork = AppState.elements.some(function (e) { return !e.bg2d; });
        if (!isStart && hasWork && !confirm('Se reemplazará el plano actual. Puedes deshacer con Ctrl+Z. ¿Continuar?')) return;
        _loadVenueTemplate(opts[parseInt(btn.getAttribute('data-idx'), 10)]);
        close();
      };
    });
  }

  function _wireVenuePicker(showOnStart) {
    var btn = document.getElementById('btn-open-venues');
    if (btn) btn.onclick = function () { _openVenuePicker(false); };
    if (showOnStart) _openVenuePicker(true);
  }

  // ══════════════════════════════════════════════════════════
  // ALIGN & IMPORT SIDEBAR
  // ══════════════════════════════════════════════════════════
  function _wireAlign() {
    var btn = document.getElementById('btn-align');
    var btnFab = document.getElementById('btn-align-fab');

    var onAlignClick = function () {
      saveHistory();

      var elements = AppState.elements;
      var tables = elements.filter(function (e) {
        return !e.bg2d && (e.type.indexOf('table') === 0 || e.type === 'lounge_set');
      });

      function median(arr) {
        var s = arr.slice().sort(function (a, b) { return a - b; });
        var m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
      }

      var moved = {};
      // Agrupa valores ordenados: un salto mayor a la tolerancia inicia otro grupo
      function groupsFor(sorted, axis, tol) {
        var groups = [];
        sorted.forEach(function (e) {
          var g = groups[groups.length - 1];
          if (g && e[axis] - g[g.length - 1][axis] <= tol) g.push(e); else groups.push([e]);
        });
        return groups;
      }
      // Tolerancia por eje: 40% de la separación típica entre filas (o columnas) del plano
      function axisTol(sorted, axis) {
        var lines = groupsFor(sorted, axis, 0.8).map(function (g) { return median(g.map(function (e) { return e[axis]; })); });
        var gaps = [];
        for (var i = 1; i < lines.length; i++) gaps.push(lines[i] - lines[i - 1]);
        return gaps.length ? Math.max(0.8, median(gaps) * 0.4) : 0.8;
      }

      // Agrupa por eje (columnas en X, filas en Y) y lleva cada grupo a su mediana:
      // así la mesa desalineada regresa a la línea de las demás sin moverlas a ellas.
      function alignAxis(axis) {
        var sorted = tables.slice().sort(function (a, b) { return a[axis] - b[axis]; });
        var tol = axisTol(sorted, axis);
        var group = [];
        var flush = function () {
          if (group.length > 1) {
            var target = Math.round(median(group.map(function (e) { return e[axis]; })) * 10) / 10;
            group.forEach(function (e) {
              if (Math.abs(e[axis] - target) > 0.05) moved[e.id] = true;
              e[axis] = target;
            });
          }
          group = [];
        };
        sorted.forEach(function (e) {
          if (group.length && e[axis] - group[group.length - 1][axis] > tol) flush();
          group.push(e);
        });
        flush();
      }
      alignAxis('x');
      alignAxis('y');

      // Espaciado parejo dentro de cada columna (y fila) de 3+ mesas, salvo que haya
      // un hueco claramente intencional (pasillo, pista): separación > 1.6× la menor.
      function distribute(lineAxis, alongAxis) {
        var byLine = {};
        tables.forEach(function (e) { (byLine[e[lineAxis]] = byLine[e[lineAxis]] || []).push(e); });
        Object.keys(byLine).forEach(function (k) {
          var g = byLine[k].sort(function (a, b) { return a[alongAxis] - b[alongAxis]; });
          if (g.length < 3) return;
          var gaps = [];
          for (var i = 1; i < g.length; i++) gaps.push(g[i][alongAxis] - g[i - 1][alongAxis]);
          var mn = Math.min.apply(null, gaps), mx = Math.max.apply(null, gaps);
          if (mn <= 0.3 || mx / mn > 1.6) return;
          var first = g[0][alongAxis];
          var step = (g[g.length - 1][alongAxis] - first) / (g.length - 1);
          g.forEach(function (e, idx) {
            var target = Math.round((first + idx * step) * 10) / 10;
            if (Math.abs(e[alongAxis] - target) > 0.05) moved[e.id] = true;
            e[alongAxis] = target;
          });
        });
      }
      distribute('x', 'y');
      distribute('y', 'x');

      // 3. Redondear coordenadas X, Y, W, H y rotaciones
      elements.forEach(function (elem) {
        elem.x = Math.round(elem.x * 10) / 10;
        elem.y = Math.round(elem.y * 10) / 10;
        elem.w = Math.round(elem.w * 10) / 10;
        elem.h = Math.round(elem.h * 10) / 10;
        
        if (elem.rotation !== undefined) {
          var r = elem.rotation % 360;
          if (r < 0) r += 360;
          
          var angles = [0, 90, 180, 270, 360];
          for (var a = 0; a < angles.length; a++) {
            if (Math.abs(r - angles[a]) < 10) {
              elem.rotation = angles[a] % 360;
              break;
            }
          }
        }
      });

      deselectAll();
      _refresh();
      updateCounters();
      
      if (_currentViewMode === '3d' && window.Visualizer3D) {
        window.Visualizer3D.syncWithData(AppState.elements);
      }
      
      var n = Object.keys(moved).length;
      showToast(n ? 'Plano alineado: ' + n + ' mesa(s) acomodada(s) en su fila y columna.' : 'Las mesas ya estaban alineadas.', 'success');
    };

    if (btn) btn.onclick = onAlignClick;
    if (btnFab) btnFab.onclick = onAlignClick;
  }

  function _wireImportSidebar() {
    var btn = document.getElementById('btn-import-json-sidebar');
    var fileInput = document.getElementById('import-file-input');
    if (btn && fileInput) {
      btn.onclick = function () {
        fileInput.click();
      };
    }
  }

  // ══════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS (global)
  // ══════════════════════════════════════════════════════════
  function _wireKeyboard() {
    document.addEventListener('keydown', function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
      } else if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveToLocalStorage();
      } else if (e.key === 'Escape') {
        _setPendingType(null);
        deselectAll();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (AppState.selectedId) {
          removeElement(AppState.selectedId);
        }
      } else if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey) {
        if (AppState.selectedId) rotateElement(AppState.selectedId, 45);
      } else if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        if (AppState.selectedId) duplicateElement(AppState.selectedId);
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  // EDITOR2D CALLBACKS
  // ══════════════════════════════════════════════════════════
  function _buildEditor2DCallbacks() {
    return {
      onSelect: function (elem) {
        AppState.selectedId = elem.id;
        if (window.Visualizer3D) window.Visualizer3D.select(elem.id);
        _populateInspector(elem);
        _updateInspectorVisibility(true);
      },
      onDeselect: function () {
        deselectAll();
      },
      onMove: function (id, x, y) {
        var elem = AppState.elements.find(function (e) { return e.id === id; });
        if (!elem) return;
        // Allow street/avenida to be placed outside terrain (up to 20m margin)
        var outsideAllowed = (elem.type === 'street');
        var margin = 20;
        if (outsideAllowed) {
          elem.x = Math.max(-margin, Math.min(x, AppState.terrain.w + margin));
          elem.y = Math.max(-margin, Math.min(y, AppState.terrain.h + margin));
        } else {
          elem.x = Math.max(0, Math.min(x, AppState.terrain.w));
          elem.y = Math.max(0, Math.min(y, AppState.terrain.h));
        }
        if (window.Editor2D) window.Editor2D.update(AppState.elements);
        if (window.Visualizer3D) window.Visualizer3D.sync(AppState.elements);
        // Live-update inspector position fields
        updateInspectorField('inp-x', parseFloat(elem.x).toFixed(2));
        updateInspectorField('inp-y', parseFloat(elem.y).toFixed(2));
      },
      onPlaceElement: function (type, x, y) {
        AppState.pendingType = null;
        if (_lastPendingCard) {
          _lastPendingCard.style.background = 'rgba(255,255,255,0.025)';
          _lastPendingCard.style.borderColor = '#334155';
          _lastPendingCard.style.outline = '';
          _lastPendingCard = null;
        }
        _updateCanvasCursor(false);
        var banner = document.getElementById('placement-banner');
        if (banner) banner.classList.add('hidden');
        addElement(type, x, y);
      },
      onRename: function (id, name) {
        updateElement(id, { name: name });
        updateInspectorField('inspector-name', name);
      },
      onResizeStart: function () {
        saveHistory();
      },
      onResize: function (id, medidas) {
        updateElement(id, medidas);
        updateInspectorField('inspector-x', parseFloat(medidas.x).toFixed(2));
        updateInspectorField('inspector-y', parseFloat(medidas.y).toFixed(2));
        updateInspectorField('inspector-w', medidas.w.toFixed(2));
        updateInspectorField('inspector-h', medidas.h.toFixed(2));
      },
      onContext_rotate: function (id) {
        rotateElement(id, 45);
      },
      onContext_duplicate: function (id) {
        duplicateElement(id);
      },
      onContext_delete: function (id) {
        removeElement(id);
      },
      onUndo: undo,
      onRedo: redo
    };
  }

  // ══════════════════════════════════════════════════════════
  // NAVIGATION & QUICK-ADD
  // ══════════════════════════════════════════════════════════
  var QUICK_ADD_TYPE_MAP = {
    'salon': 'salon',
    'jardin': 'garden',
    'cocina': 'kitchen',
    'barra': 'bar_area',
    'terraza': 'terrace',
    'estacionamiento': 'parking',
    'capilla': 'chapel',
    'alberca': 'pool',
    'entrada': 'door_main',
    'salida': 'door_exit',
    'banos': 'bathroom',
    'rampa': 'ramp',
    'escaleras': 'stairs'
  };

  function _wireWizardSteps() {
    var btns = $$('.wizard-step-btn');
    btns.forEach(function (btn) {
      btn.onclick = function () {
        var step = btn.dataset.step;
        btns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        $$('.wizard-panel').forEach(function (p) { p.classList.remove('active'); });
        var activePanel = document.getElementById('wizard-content-' + step);
        if (activePanel) activePanel.classList.add('active');
      };
    });
  }

  function _wireInspectorTabs() {
    var tabs = $$('.inspector-tab');
    tabs.forEach(function (tab) {
      tab.onclick = function () {
        var tabId = tab.dataset.tab;
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        $$('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
        var activePanel = $('[data-panel="' + tabId + '"]');
        if (activePanel) activePanel.classList.add('active');
      };
    });
  }

  function _wireQuickAdd() {
    var btns = $$('.quick-add-btn');
    btns.forEach(function (btn) {
      btn.onclick = function () {
        var key = btn.dataset.type;
        var type = QUICK_ADD_TYPE_MAP[key] || key;
        var cat = window.getCatalogEntry(type);
        var color = cat ? cat.color : '#c9a96e';
        _setPendingType(type, color, btn);
      };
    });
  }

  // ══════════════════════════════════════════════════════════
  // AUTO-SAVE TIMER
  // ══════════════════════════════════════════════════════════
  function _startAutoSave() {
    setInterval(function () {
      if (AppState.elements.length > 0) {
        var payload = {
          elements: AppState.elements,
          terrain: AppState.terrain,
          layers: AppState.layers,
          flows: AppState.flows,
          venueId: AppState.venueId,
          savedAt: new Date().toISOString()
        };
        try {
          localStorage.setItem(LS_KEY + '_auto', JSON.stringify(payload));
        } catch (e) { /* quota exceeded silently */ }
      }
    }, 60000); // every 60s
  }

  // ══════════════════════════════════════════════════════════
  // INITIALIZE
  // ══════════════════════════════════════════════════════════
  // ── Lista de invitados al tocar una mesa (2D en solo lectura y 3D) ──
  function _escHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Mesa bajo un punto en metros (con margen para las sillas); si hay varias, la más cercana
  function _mesaEnPunto(x, y) {
    var mejor = null, mejorD = Infinity;
    AppState.elements.forEach(function (el) {
      if (!el.mesaConfig) return;
      var rad = -(el.rotation || 0) * Math.PI / 180;
      var dx = x - el.x, dy = y - el.y;
      var lx = dx * Math.cos(rad) - dy * Math.sin(rad), ly = dx * Math.sin(rad) + dy * Math.cos(rad);
      var mx = (el.w || 1) / 2 + 0.6, my = (el.h || el.w || 1) / 2 + 0.8;
      if (Math.abs(lx) <= mx && Math.abs(ly) <= my) {
        var d = dx * dx + dy * dy;
        if (d < mejorD) { mejorD = d; mejor = el; }
      }
    });
    return mejor;
  }
  function _cerrarInvitadosMesa() {
    var v = document.getElementById('mesa-invitados-pop');
    if (v) v.remove();
  }
  function _mostrarInvitadosMesa(el) {
    _cerrarInvitadosMesa();
    var mc = el.mesaConfig || {};
    var inv = Array.isArray(mc.invitados) ? mc.invitados : [];
    var total = inv.reduce(function (s, g) { return s + (g.pases || 0); }, 0);
    var titulo = mc.mesaNum ? 'Mesa ' + mc.mesaNum : (el.name || 'Mesa');
    var pop = document.createElement('div');
    pop.id = 'mesa-invitados-pop';
    pop.className = 'mesa-pop';
    pop.innerHTML =
      '<div class="mesa-pop-card" role="dialog" aria-label="Invitados de ' + _escHtml(titulo) + '">' +
      '  <div class="mesa-pop-head"><span class="mesa-pop-title">' + _escHtml(titulo) + '</span>' +
      '    <span class="mesa-pop-total">' + total + ' persona' + (total === 1 ? '' : 's') + '</span>' +
      '    <button type="button" class="mesa-pop-close" aria-label="Cerrar">✕</button></div>' +
      (inv.length
        ? '<ul class="mesa-pop-list">' + inv.map(function (g) {
            return '<li><span>' + _escHtml(g.nombre) + '</span><b>' + (g.pases || 1) + '</b></li>';
          }).join('') + '</ul>'
        : '<p class="mesa-pop-vacia">Sin invitados asignados.</p>') +
      '  <div class="mesa-pop-pie">Número = lugares (invitado + acompañantes)</div>' +
      '</div>';
    pop.addEventListener('click', function (e) {
      if (e.target === pop || e.target.closest('.mesa-pop-close')) _cerrarInvitadosMesa();
    });
    document.body.appendChild(pop);
  }
  window.addEventListener('plano:tocar', function (ev) {
    var d = ev.detail || {};
    var el = d.id ? AppState.elements.find(function (x) { return x.id === d.id; }) : _mesaEnPunto(d.x, d.y);
    if (el && el.mesaConfig) _mostrarInvitadosMesa(el);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') _cerrarInvitadosMesa(); });

  function init() {
    console.log('[App] Initializing Universal Venue Planner...');

    // If on mobile, default view is 3D
    if (window.innerWidth < 768) {
      AppState.activeView = '3d';
    }

    // Load saved state
    var hadSaved = loadFromLocalStorage();
    if (!hadSaved && window.DEFAULT_LAYOUT) {
      console.log('[App] Loading default layout...');
      _loadLayoutData(window.DEFAULT_LAYOUT);
    }

    // Build toolbox
    _buildToolbox();
    _wireSearch();
    Array.prototype.forEach.call(document.querySelectorAll('#nivel-selector button'), function (b) {
      b.onclick = function () { _setNivel(parseInt(b.getAttribute('data-nivel'), 10)); };
    });
    _aplicarModo();

    // Init 2D Editor
    var svgCanvas = document.getElementById('svg-canvas');
    if (svgCanvas && window.Editor2D) {
      window.Editor2D.init(
        svgCanvas,
        function () { return AppState.elements; },
        function () { return AppState; },
        _buildEditor2DCallbacks()
      );
      // Si se arranca en 3D, el 2D se encuadra la primera vez que se muestra
      _fit2dOnShow = AppState.activeView !== '2d';
    }

    // 3D Visualizer is initialized lazily on first view switch to avoid
    // rendering into a hidden container (clientWidth/Height = 0).
    // See _wireViewSwitcher > _lazyInit3D().

    // Wire UI Navigation & Actions
    _wireWizardSteps();
    _wireInspectorTabs();
    _wireQuickAdd();

    // Wire UI Views & Buttons
    _wireViewSwitcher();
    _wireLayoutSwitcher();
    _wireLighting();
    _wireBrightnessSlider();
    _wireLayerToggles();
    _wireZoomButtons();
    _wireGridToggle();
    _wireTerrainSettings();
    _wireInspector();
    _wireExportButtons();
    _wirePantallaCompleta();
    _wireClear();
    _wireAlign();
    _wireImportSidebar();
    // El selector inicial solo aparece si no hay plano guardado, en modo planner y sin abrir un evento compartido
    _wireVenuePicker(!hadSaved && !(window.PEGEventos && window.PEGEventos.suppressStartPicker()));
    _wireKeyboard();

    // Init Supabase Connection
    _initSupabase();
    _wireSupabaseUI();

    // Local layouts
    _fetchLocalLayouts();
    _wireLocalServerUI();

    // Cancel placement button in banner
    var btnCancel = document.getElementById('btn-cancel-placement');
    if (btnCancel) {
      btnCancel.onclick = function (e) {
        e.stopPropagation();
        _setPendingType(null);
      };
    }

    // Initial state
    saveHistory();
    _refresh();
    updateCounters();
    _updateInspectorVisibility(false);
    _startAutoSave();

    // Wire Mobile Menu & Inspector Toggles
    var btnToggleMenu = document.getElementById('btn-toggle-menu');
    var btnCloseMenu = document.getElementById('btn-close-menu');
    var btnCloseInspector = document.getElementById('btn-close-inspector');
    var sidebarLeft = document.getElementById('sidebar-left');
    var sidebarRight = document.getElementById('sidebar-right');
    
    if (btnToggleMenu && sidebarLeft) {
      btnToggleMenu.onclick = function (e) {
        e.stopPropagation();
        sidebarLeft.classList.toggle('open');
      };
    }
    
    if (btnCloseMenu && sidebarLeft) {
      btnCloseMenu.onclick = function (e) {
        e.stopPropagation();
        sidebarLeft.classList.remove('open');
      };
    }

    if (btnCloseInspector && sidebarRight) {
      btnCloseInspector.onclick = function (e) {
        e.stopPropagation();
        deselectAll();
      };
    }

    // Swipe gestures to close sidebars
    var touchstartX = 0;
    var touchendX = 0;
    if (sidebarLeft) {
      sidebarLeft.addEventListener('touchstart', function(e) {
        touchstartX = e.changedTouches[0].screenX;
      }, {passive: true});
      sidebarLeft.addEventListener('touchend', function(e) {
        touchendX = e.changedTouches[0].screenX;
        if (touchstartX - touchendX > 50) { // Swiped left
          sidebarLeft.classList.remove('open');
        }
      }, {passive: true});
    }

    var touchstartRightX = 0;
    var touchendRightX = 0;
    if (sidebarRight) {
      sidebarRight.addEventListener('touchstart', function(e) {
        touchstartRightX = e.changedTouches[0].screenX;
      }, {passive: true});
      sidebarRight.addEventListener('touchend', function(e) {
        touchendRightX = e.changedTouches[0].screenX;
        if (touchendRightX - touchstartRightX > 50) { // Swiped right
          deselectAll();
        }
      }, {passive: true});
    }

    if (hadSaved) {
      showToast('Plano restaurado desde guardado anterior.', 'success');
    } else {
      showToast('¡Bienvenido al Planeador Universal Primavera!', 'info');
    }

    console.log('[App] Ready. Elements loaded:', AppState.elements.length);

    // Eventos (brief, minuto a minuto, montaje, modo planner) — brief.js
    if (window.PEGEventos) window.PEGEventos.init();
  }

  // ─── Boot on DOMContentLoaded ────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ─── Expose public API ───────────────────────────────────
  window.App = {
    addElement: addElement,
    removeElement: removeElement,
    updateElement: updateElement,
    selectElement: selectElement,
    deselectAll: deselectAll,
    duplicateElement: duplicateElement,
    rotateElement: rotateElement,
    undo: undo,
    redo: redo,
    save: saveToLocalStorage,
    exportJSON: exportJSON,
    exportPNG: exportPNG,
    exportPDF: exportPDF,
    importJSON: importJSON,
    updateCounters: updateCounters,
    refresh: _refresh,
    showToast: showToast,
    getState: function () { return AppState; },
    getLayout: _currentLayout,
    loadLayout: _applyLayout,
    openVenuePicker: function () { _openVenuePicker(false); }
  };

})();

console.log('[app] App module loaded.');
