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
    terrain: { w: 50, h: 60 },
    selectedId: null,
    activeView: '2d',
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
      flujo_staff:      true
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
      info:    '#3b82f6',
      success: '#22c55e',
      warning: '#f59e0b',
      error:   '#ef4444'
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
      'background:' + colors[type],
      'color:#fff',
      'padding:10px 16px',
      'border-radius:8px',
      'font-size:14px',
      'font-family:sans-serif',
      'box-shadow:0 4px 16px rgba(0,0,0,0.35)',
      'display:flex',
      'align-items:center',
      'gap:8px',
      'pointer-events:auto',
      'animation:toastIn 0.25s ease',
      'max-width:320px'
    ].join(';');
    toast.innerHTML = '<span style="font-size:16px">' + (icons[type] || '•') + '</span>' +
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

    _tableCounter++;
    var isMesa = cat.defaultChairs > 0 || type.startsWith('table_') || type === 'lounge_set';
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
        mesaNum: isMesa ? _tableCounter : 0,
        mantelColor: (type.indexOf('campirana') > -1 || type.indexOf('marble') > -1) ? 'sin_mantel' : 'blanco',
        caminoColor: 'ninguno',
        servilletaColor: 'blanco',
        servilletaDoblez: 'loto',
        cubiertos: 'plateado',
        platoBase: 'ninguno',
        platoTrinche: 'redondo_blanco',
        cristal: 'standard',
        copasColor: 'transparente',
        cristal2: 'ninguno',
        copasColor2: 'transparente',
        tipoSilla: 'tiffany',
        menu: ''
      }
    };

    saveHistory();
    AppState.elements.push(elem);
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
      'background:#1e293b', 'border:1px solid #334155', 'border-radius:12px',
      'padding:28px 32px', 'min-width:300px', 'font-family:sans-serif', 'color:#e2e8f0'
    ].join(';');

    box.innerHTML = [
      '<h3 style="margin:0 0 16px;color:#c9a96e;font-size:18px">Mesa Imperial</h3>',
      '<p style="margin:0 0 14px;font-size:14px;color:#94a3b8">¿Cuántos tablones? <br><small>(mínimo 2 — cada tablón = 2.4m, 10 personas)</small></p>',
      '<input id="imperial-tablones" type="number" min="2" max="20" value="3" style="width:100%;padding:8px 12px;background:#0f172a;border:1px solid #475569;border-radius:6px;color:#fff;font-size:16px;box-sizing:border-box;">',
      '<div style="display:flex;gap:10px;margin-top:18px;justify-content:flex-end">',
      '<button id="imperial-cancel" style="padding:8px 18px;background:#374151;color:#e2e8f0;border:none;border-radius:6px;cursor:pointer;font-size:14px">Cancelar</button>',
      '<button id="imperial-ok" style="padding:8px 18px;background:#c9a96e;color:#1e293b;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:700">Agregar</button>',
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
        caminoColor: 'ninguno',
        servilletaColor: 'blanco',
        servilletaDoblez: 'loto',
        cubiertos: 'plateado',
        platoBase: 'ninguno',
        platoTrinche: 'redondo_blanco',
        cristal: 'standard',
        copasColor: 'transparente',
        tipoSilla: 'tiffany',
        menu: '',
        mesaNum: _tableCounter
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
    _refresh();
    updateCounters();
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
    if (copy.mesaConfig) {
      _tableCounter++;
      copy.mesaConfig.mesaNum = _tableCounter;
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
    var tableCounts = {};

    AppState.elements.forEach(function (elem) {
      if (elem.chairs) totalGuests += elem.chairs;
      var t = elem.type;
      tableCounts[t] = (tableCounts[t] || 0) + 1;
    });

    var guestEl = document.getElementById('counter-guests');
    if (guestEl) guestEl.textContent = totalGuests;

    var tableEl = document.getElementById('counter-tables');
    if (tableEl) {
      var tableTotal = 0;
      var excludedTables = ['table_gifts', 'table_candy', 'table_shots', 'table_buffet'];
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
  function _populateInspector(elem) {
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
    if (tablonRow) {
      if (elem.type === 'table_imperial') {
        tablonRow.classList.remove('hidden');
        setVal('mesa-num-tablones', elem.tablones || 3);
      } else {
        tablonRow.classList.add('hidden');
      }
    }

    // Mesa config
    var hasMesa = !!(elem.mesaConfig);
    var tabMesaBtn = document.getElementById('tab-mesa');
    if (tabMesaBtn) {
      tabMesaBtn.style.display = hasMesa ? '' : 'none';
      if (!hasMesa && tabMesaBtn.classList.contains('active')) {
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
      setVal('mesa-camino-color', elem.mesaConfig.caminoColor || 'ninguno');
      setVal('mesa-servilleta-color', elem.mesaConfig.servilletaColor || 'blanco');
      setVal('mesa-servilleta-doblez', elem.mesaConfig.servilletaDoblez || 'loto');
      setVal('mesa-cubiertos', elem.mesaConfig.cubiertos || 'plateado');
      setVal('mesa-plato-base', elem.mesaConfig.platoBase || 'ninguno');
      setVal('mesa-plato-trinche', elem.mesaConfig.platoTrinche || 'redondo_blanco');
      setVal('mesa-cristal', elem.mesaConfig.cristal || 'standard');
      setVal('mesa-copas-color', elem.mesaConfig.copasColor || 'transparente');
      setVal('mesa-cristal2', elem.mesaConfig.cristal2 || 'ninguno');
      setVal('mesa-copas-color2', elem.mesaConfig.copasColor2 || 'transparente');
      setVal('mesa-silla-tipo', elem.mesaConfig.tipoSilla || 'tiffany');
      setVal('mesa-menu', elem.mesaConfig.menu || '');

      var guestsListEl = document.getElementById('mesa-invitados-list');
      if (guestsListEl) {
        if (elem.mesaConfig.invitados && elem.mesaConfig.invitados.length > 0) {
          var html = '';
          elem.mesaConfig.invitados.forEach(function (guest) {
            html += '<div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 4px 0;">';
            html += '  <span>' + guest.nombre + '</span>';
            html += '  <span class="badge" style="background: rgba(244, 63, 94, 0.2); color: #f43f5e; padding: 2px 6px; border-radius: 4px; font-weight: bold;">' + guest.pases + ' pases</span>';
            html += '</div>';
          });
          guestsListEl.innerHTML = html;
        } else {
          guestsListEl.innerHTML = '<span style="color: #64748b;">No hay invitados asignados a esta mesa.</span>';
        }
      }
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
        var elem = AppState.elements.find(function (e) { return e.id === id; });
        if (elem && elem.type === 'table_imperial') {
          var n = Math.max(2, Math.round(v / 2.4));
          var chairsCount = n * 10;
          updateElement(id, { w: v, tablones: n, chairs: chairsCount });
          updateInspectorField('mesa-num-tablones', n);
          updateInspectorField('inspector-chairs', chairsCount);
          updateCounters();
        } else {
          updateElement(id, { w: v });
        }
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
      if (!isNaN(v) && v >= 0) { saveHistory(); updateElement(id, { chairs: v }); updateCounters(); }
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
    mesaInp('mesa-numero', 'mesaNum');
    mesaInp('mesa-mantel-color', 'mantelColor');
    mesaInp('mesa-camino-color', 'caminoColor');
    mesaInp('mesa-servilleta-color', 'servilletaColor');
    mesaInp('mesa-servilleta-doblez', 'servilletaDoblez');
    mesaInp('mesa-cubiertos', 'cubiertos');
    mesaInp('mesa-plato-base', 'platoBase');
    mesaInp('mesa-plato-trinche', 'platoTrinche');
    mesaInp('mesa-cristal', 'cristal');
    mesaInp('mesa-copas-color', 'copasColor');
    mesaInp('mesa-cristal2', 'cristal2');
    mesaInp('mesa-copas-color2', 'copasColor2');
    mesaInp('mesa-silla-tipo', 'tipoSilla');
    mesaInp('mesa-menu', 'menu');

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

    var cats = ['estructuras', 'accesos', 'mobiliario', 'entretenimiento', 'decoracion', 'proveedores'];

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
          'gap:4px', 'padding:10px 6px', 'background:#1e293b', 'border:1px solid #334155',
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
          card.style.background = AppState.pendingType === item.type ? '#1e3a5f' : '#1e293b';
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
      _lastPendingCard.style.background = '#1e293b';
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
      card.style.background = '#1e3a5f';
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
        if (btn2d) { btn2d.classList.add('active'); }
        if (btn3d) { btn3d.classList.remove('active'); }
        if (brightnessGroup) brightnessGroup.style.display = 'none';
      } else {
        if (container2d) container2d.style.display = 'none';
        if (container3d) container3d.style.display = 'block';
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
            }, 100);
          }
        });
      }
    }

    // Expose internally for auto-switching
    window.App_setView = setView;

    if (btn2d) btn2d.onclick = function () { setView('2d'); };
    if (btn3d) btn3d.onclick = function () { setView('3d'); };

    // Default to 2D for initial blueprinting
    setView('2d');
  }

  // ══════════════════════════════════════════════════════════
  // LIGHTING
  // ══════════════════════════════════════════════════════════
  function _wireLighting() {
    var modes = ['day', 'night', 'gala'];
    modes.forEach(function (mode) {
      var btn = document.getElementById('btn-light-' + mode);
      if (!btn) return;
      btn.onclick = function () {
        if (window.Visualizer3D) window.Visualizer3D.setLighting(mode);
        $$('.lighting-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        showToast('Iluminación: ' + mode, 'info');
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
      'flujo_invitados', 'flujo_proveedores', 'flujo_staff'
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

  function _loadLayoutData(data) {
    if (!data) return;
    if (data.elements) AppState.elements = data.elements;
    if (data.terrain) AppState.terrain = data.terrain;
    if (data.layers) Object.assign(AppState.layers, data.layers);
    AppState.elements.forEach(function (e) {
      var n = parseInt((e.id || '').replace('el_', ''), 10);
      if (!isNaN(n) && n >= _idCounter) _idCounter = n + 1;
      if (e.mesaConfig && e.mesaConfig.mesaNum > _tableCounter) _tableCounter = e.mesaConfig.mesaNum;
    });
  }

  var CURRENT_LAYOUT_VERSION = '2026-06-29-v2';

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
      layers: AppState.layers
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
      ctx.fillStyle = '#0f172a';
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

  function exportPDF() {
    var svgEl = document.getElementById('svg-canvas');
    if (!svgEl) {
      showToast('Error: No se encontró el lienzo 2D.', 'error');
      return;
    }

    // Clone the SVG so we can clean up selection borders before printing
    var clonedSvg = svgEl.cloneNode(true);
    var activeSel = clonedSvg.querySelector('.active-selection');
    if (activeSel) activeSel.remove();
    var resizeHandles = clonedSvg.querySelectorAll('.resize-handle');
    resizeHandles.forEach(function (h) { h.remove(); });

    var svgString = new XMLSerializer().serializeToString(clonedSvg);

    // Get event data
    var totalGuests = 0;
    var tableCounts = {};
    var tablesList = [];
    var otherElementsList = [];

    AppState.elements.forEach(function (elem) {
      if (elem.chairs) totalGuests += elem.chairs;
      var t = elem.type;
      tableCounts[t] = (tableCounts[t] || 0) + 1;

      var isTable = t.startsWith('table_') || t === 'lounge_set';
      if (isTable) {
        tablesList.push(elem);
      } else {
        otherElementsList.push(elem);
      }
    });

    // Sort tables by number
    tablesList.sort(function (a, b) {
      var numA = (a.mesaConfig && a.mesaConfig.mesaNum) ? parseInt(a.mesaConfig.mesaNum, 10) : 999;
      var numB = (b.mesaConfig && b.mesaConfig.mesaNum) ? parseInt(b.mesaConfig.mesaNum, 10) : 999;
      return numA - numB;
    });

    var layoutName = localStorage.getItem(LS_KEY + '_name') || 'Mi Plano';

    // Build the print HTML
    var printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Error: El navegador bloqueó la ventana emergente. Por favor permite las ventanas emergentes en este sitio.', 'error');
      return;
    }

    var typeLabels = {
      'table_round': 'Mesa Redonda',
      'table_square': 'Mesa Cuadrada',
      'table_rectangular': 'Mesa Rectangular',
      'table_imperial': 'Mesa Imperial',
      'table_honor_bride': 'Mesa de Honor Novios',
      'table_honor_xv': 'Mesa de Honor XV Años',
      'table_honor_king': 'Mesa de Honor Imperial',
      'table_periquera': 'Periquera Alta',
      'table_kids': 'Mesa Infantil',
      'table_campirana': 'Mesa Campirana',
      'table_marble_round': 'Mesa Mármol Redonda',
      'table_marble_square': 'Mesa Mármol Cuadrada',
      'table_umbrella': 'Mesa con Sombrilla',
      'table_cake': 'Mesa de Pastel',
      'table_gifts': 'Mesa de Regalos',
      'table_candy': 'Mesa de Dulces',
      'table_shots': 'Carrito de Shots',
      'table_buffet': 'Mesa de Buffet',
      'lounge_set': 'Sala Lounge'
    };

    var glassLabels = {
      'standard': 'Estándar',
      'flauta': 'Copa Flauta',
      'vino': 'Copa Vino',
      'romana': 'Copa Romana',
      'martinera': 'Copa Martinera',
      'cubero': 'Vaso Cubero',
      'old_fashion': 'Vaso Old Fashion',
      'tequilero': 'Copa Tequilera',
      'ninguno': 'Ninguno'
    };

    var plateBaseLabels = {
      'gold_ring': 'Plato Base Oro',
      'silver_ring': 'Plato Base Plata',
      'glass_gold': 'Plato Base Vidrio Oro',
      'wood': 'Plato Base Madera',
      'ninguno': 'Ninguno'
    };

    var html = '<!DOCTYPE html>\n<html>\n<head>\n';
    html += '<title>Ficha Técnica - ' + layoutName + '</title>\n';
    html += '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">\n';
    html += '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">\n';
    html += '<style>\n';
    html += '  body { font-family: "Outfit", sans-serif; color: #1e293b; background: #fff; margin: 0; padding: 40px; line-height: 1.5; }\n';
    html += '  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }\n';
    html += '  .brand-title { font-size: 24px; font-weight: 700; color: #f43f5e; display: flex; align-items: center; gap: 8px; }\n';
    html += '  .brand-sub { font-size: 14px; color: #64748b; font-weight: 400; }\n';
    html += '  .doc-title { font-size: 20px; font-weight: 600; text-align: right; color: #0f172a; }\n';
    html += '  .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }\n';
    html += '  .meta-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; text-align: center; }\n';
    html += '  .meta-val { font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 5px; }\n';
    html += '  .meta-lbl { font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600; }\n';
    html += '  .section-title { font-size: 18px; font-weight: 600; color: #0f172a; border-left: 4px solid #f43f5e; padding-left: 10px; margin: 30px 0 15px 0; }\n';
    html += '  .map-container { border: 1px solid #cbd5e1; border-radius: 12px; padding: 10px; background: #f8fafc; display: flex; justify-content: center; align-items: center; margin-bottom: 40px; page-break-inside: avoid; }\n';
    html += '  .map-container svg { width: 100%; height: auto; max-height: 480px; }\n';
    html += '  table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px; page-break-inside: auto; }\n';
    html += '  tr { page-break-inside: avoid; page-break-after: auto; }\n';
    html += '  th { background: #0f172a; color: #fff; font-weight: 600; text-align: left; padding: 10px; border: 1px solid #1e293b; }\n';
    html += '  td { padding: 10px; border: 1px solid #e2e8f0; vertical-align: top; }\n';
    html += '  tr:nth-child(even) td { background: #f8fafc; }\n';
    html += '  .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; }\n';
    html += '  .badge-primary { background: #ffe4e6; color: #f43f5e; }\n';
    html += '  .menu-text { font-style: italic; color: #475569; white-space: pre-wrap; font-size: 12px; border-left: 2px solid #cbd5e1; padding-left: 8px; margin-top: 4px; }\n';
    html += '  .footer { border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 50px; font-size: 12px; color: #64748b; text-align: center; page-break-before: auto; }\n';
    html += '  @media print {\n';
    html += '    body { padding: 20px; }\n';
    html += '    .no-print { display: none; }\n';
    html += '    .page-break { page-break-before: always; }\n';
    html += '  }\n';
    html += '</style>\n</head>\n<body>\n';

    // Toolbar inside print window to trigger print
    html += '<div class="no-print" style="background: #0f172a; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; border-radius: 8px; margin-bottom: 30px;">\n';
    html += '  <span style="color: #fff; font-size: 14px; font-weight: 600;"><i class="fa-solid fa-file-pdf" style="color: #f43f5e; margin-right: 6px;"></i> Vista Previa de Ficha Técnica</span>\n';
    html += '  <button onclick="window.print();" style="background: #f43f5e; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-print"></i> Guardar como PDF / Imprimir</button>\n';
    html += '</div>\n';

    // Document Header
    html += '<div class="header">\n';
    html += '  <div class="brand-title">\n';
    html += '    🌸 Primavera <span class="brand-sub">| Planeador de Eventos</span>\n';
    html += '  </div>\n';
    html += '  <div class="doc-title">\n';
    html += '    <div>FICHA TÉCNICA</div>\n';
    html += '    <div style="font-size: 14px; font-weight: 400; color: #64748b; margin-top: 4px;">Proyecto: ' + layoutName + '</div>\n';
    html += '  </div>\n';
    html += '</div>\n';

    // Meta Grid
    var numTablesTotal = tablesList.length;
    var formattedDate = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

    html += '<div class="meta-grid">\n';
    html += '  <div class="meta-card"><div class="meta-val">' + totalGuests + '</div><div class="meta-lbl">Invitados</div></div>\n';
    html += '  <div class="meta-card"><div class="meta-val">' + numTablesTotal + '</div><div class="meta-lbl">Total Mesas</div></div>\n';
    html += '  <div class="meta-card"><div class="meta-val">' + (AppState.terrain.w + 'x' + AppState.terrain.h + 'm') + '</div><div class="meta-lbl">Terreno</div></div>\n';
    html += '  <div class="meta-card"><div class="meta-val" style="font-size: 13px; font-weight: 600; padding: 6px 0;">' + formattedDate + '</div><div class="meta-lbl">Fecha Reporte</div></div>\n';
    html += '</div>\n';

    // Section 1: Plano Map
    html += '<div class="section-title"><i class="fa-solid fa-map" style="margin-right: 6px; color:#f43f5e;"></i> Distribución del Evento (Croquis)</div>\n';
    html += '<div class="map-container">\n' + svgString + '\n</div>\n';

    // Page break before tables list if needed
    html += '<div class="page-break"></div>\n';

    // Section 2: Tables Specifications
    html += '<div class="section-title"><i class="fa-solid fa-circle-dot" style="margin-right: 6px; color:#f43f5e;"></i> Especificaciones de Mobiliario y Montaje</div>\n';
    html += '<table>\n';
    html += '  <thead>\n';
    html += '    <tr>\n';
    html += '      <th style="width: 12%;">Mesa</th>\n';
    html += '      <th style="width: 15%;">Tipo</th>\n';
    html += '      <th style="width: 12%;">Capacidad</th>\n';
    html += '      <th style="width: 25%;">Configuración Montaje</th>\n';
    html += '      <th style="width: 18%;">Cristalería y Copas</th>\n';
    html += '      <th style="width: 18%;">Menú / Comentarios</th>\n';
    html += '    </tr>\n';
    html += '  </thead>\n';
    html += '  <tbody>\n';

    tablesList.forEach(function (t) {
      var config = t.mesaConfig || {};
      var typeName = typeLabels[t.type] || (window.getCatalogEntry ? window.getCatalogEntry(t.type).name : t.type);
      
      var mesaLabel = config.mesaNum ? 'Mesa ' + config.mesaNum : 'Sin Número';
      if (t.type === 'table_honor_xv' || t.type === 'table_honor_king' || t.type === 'table_honor_bride') {
        mesaLabel = '<strong>' + mesaLabel + ' (Honor)</strong>';
      } else if (t.type === 'table_cake') {
        mesaLabel = '<strong>Mesa de Pastel</strong>';
      }

      var capacityText = t.chairs ? t.chairs + ' Sillas' : '0 Sillas';
      if (t.type === 'table_imperial' && t.tablones) {
        capacityText += '<br><span style="font-size: 11px; color:#64748b;">(' + t.tablones + ' Tablones)</span>';
      }

      // Montage details
      var montageItems = [];
      if (config.mantelColor) {
        var mantelText = config.mantelColor === 'sin_mantel' ? 'Sin Mantel' : config.mantelColor.charAt(0).toUpperCase() + config.mantelColor.slice(1);
        montageItems.push('<strong>Mantel:</strong> ' + mantelText);
      }
      if (config.caminoColor && config.caminoColor !== 'ninguno') {
        montageItems.push('<strong>Camino:</strong> ' + config.caminoColor.charAt(0).toUpperCase() + config.caminoColor.slice(1));
      }
      if (config.servilletaColor && config.servilletaDoblez) {
        montageItems.push('<strong>Servilleta:</strong> ' + config.servilletaColor.charAt(0).toUpperCase() + config.servilletaColor.slice(1) + ' (' + config.servilletaDoblez + ')');
      }
      if (config.platoBase && config.platoBase !== 'ninguno') {
        var pbText = plateBaseLabels[config.platoBase] || config.platoBase.replace('_', ' ');
        montageItems.push('<strong>P. Base:</strong> ' + pbText);
      }
      if (config.platoTrinche && config.platoTrinche !== 'ninguno') {
        montageItems.push('<strong>P. Trinche:</strong> ' + config.platoTrinche.replace('_', ' '));
      }
      if (config.cubiertos) {
        montageItems.push('<strong>Cubiertos:</strong> ' + config.cubiertos);
      }
      var montageText = montageItems.join('<br>');

      // Glassware details
      var glassItems = [];
      if (config.cristal) {
        var c1 = glassLabels[config.cristal] || config.cristal.charAt(0).toUpperCase() + config.cristal.slice(1);
        var col1 = config.copasColor ? config.copasColor : 'transparente';
        glassItems.push('1: ' + c1 + ' (' + col1 + ')');
      }
      if (config.cristal2 && config.cristal2 !== 'ninguno') {
        var c2 = glassLabels[config.cristal2] || config.cristal2.charAt(0).toUpperCase() + config.cristal2.slice(1);
        var col2 = config.copasColor2 ? config.copasColor2 : 'transparente';
        glassItems.push('2: ' + c2 + ' (' + col2 + ')');
      }
      var glassText = glassItems.join('<br>');

      // Menu / Comments
      var menuText = config.menu ? '<div class="menu-text">' + config.menu + '</div>' : '-';

      html += '    <tr>\n';
      html += '      <td>' + mesaLabel + '</td>\n';
      html += '      <td>' + typeName + '</td>\n';
      html += '      <td>' + capacityText + '</td>\n';
      html += '      <td>' + montageText + '</td>\n';
      html += '      <td>' + glassText + '</td>\n';
      html += '      <td>' + menuText + '</td>\n';
      html += '    </tr>\n';
    });

    html += '  </tbody>\n';
    html += '</table>\n';

    // Section 3: Other Elements
    if (otherElementsList.length > 0) {
      html += '<div class="section-title"><i class="fa-solid fa-shapes" style="margin-right: 6px; color:#f43f5e;"></i> Distribución de Áreas y Equipamiento</div>\n';
      html += '<table>\n';
      html += '  <thead>\n';
      html += '    <tr>\n';
      html += '      <th style="width: 25%;">Nombre Elemento</th>\n';
      html += '      <th style="width: 25%;">Categoría</th>\n';
      html += '      <th style="width: 20%;">Dimensiones</th>\n';
      html += '      <th style="width: 30%;">Configuración / Ubicación</th>\n';
      html += '    </tr>\n';
      html += '  </thead>\n';
      html += '  <tbody>\n';

      otherElementsList.forEach(function (e) {
        var cat = window.getCatalogEntry ? window.getCatalogEntry(e.type) : null;
        var typeName = cat ? cat.name : e.type;
        var categoryName = cat ? cat.category.charAt(0).toUpperCase() + cat.category.slice(1) : '-';
        var nameLabel = e.name || typeName;
        
        var dimText = (e.w && e.h) ? e.w + ' x ' + e.h + ' m' : '-';
        var configItems = [];
        configItems.push('<strong>Posición:</strong> X: ' + parseFloat(e.x).toFixed(1) + 'm, Y: ' + parseFloat(e.y).toFixed(1) + 'm');
        if (e.elevation) configItems.push('<strong>Elevación:</strong> ' + e.elevation + ' m');
        if (e.color) configItems.push('<strong>Color:</strong> <span style="display:inline-block; width:10px; height:10px; border-radius:20%; background:' + e.color + '; border:1px solid #ccc; vertical-align:middle; margin-right:3px;"></span>' + e.color);
        if (e.salonType) configItems.push('<strong>Estilo:</strong> ' + e.salonType);
        
        html += '    <tr>\n';
        html += '      <td><strong>' + nameLabel + '</strong></td>\n';
        html += '      <td>' + categoryName + '</td>\n';
        html += '      <td>' + dimText + '</td>\n';
        html += '      <td>' + configItems.join('<br>') + '</td>\n';
        html += '    </tr>\n';
      });

      html += '  </tbody>\n';
      html += '</table>\n';
    }

    // Document Footer
    html += '<div class="footer">\n';
    html += '  Primavera Events Planner &copy; 2026. Documento generado digitalmente desde el navegador. Ficha técnica de montaje para personal de banquete y proveedores.\n';
    html += '</div>\n';

    html += '</body>\n</html>';

    printWindow.document.write(html);
    printWindow.document.close();
  }

  function _wireExportButtons() {
    var btnSave = document.getElementById('btn-save');
    if (btnSave) btnSave.onclick = saveToLocalStorage;

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
    if (!btn) return;
    btn.onclick = function () {
      if (!confirm('¿Eliminar todos los elementos? Esta acción no se puede deshacer.')) return;
      saveHistory();
      AppState.elements = [];
      _tableCounter = 0;
      deselectAll();
      _refresh();
      updateCounters();
      showToast('Plano limpiado.', 'warning');
    };
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
        elem.x = Math.max(0, Math.min(x, AppState.terrain.w));
        elem.y = Math.max(0, Math.min(y, AppState.terrain.h));
        if (window.Editor2D) window.Editor2D.update(AppState.elements);
        if (window.Visualizer3D) window.Visualizer3D.sync(AppState.elements);
        // Live-update inspector position fields
        updateInspectorField('inp-x', parseFloat(elem.x).toFixed(2));
        updateInspectorField('inp-y', parseFloat(elem.y).toFixed(2));
      },
      onPlaceElement: function (type, x, y) {
        AppState.pendingType = null;
        if (_lastPendingCard) {
          _lastPendingCard.style.background = '#1e293b';
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

    // Init 2D Editor
    var svgCanvas = document.getElementById('svg-canvas');
    if (svgCanvas && window.Editor2D) {
      window.Editor2D.init(
        svgCanvas,
        function () { return AppState.elements; },
        function () { return AppState; },
        _buildEditor2DCallbacks()
      );
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
    _wireLighting();
    _wireBrightnessSlider();
    _wireLayerToggles();
    _wireZoomButtons();
    _wireGridToggle();
    _wireTerrainSettings();
    _wireInspector();
    _wireExportButtons();
    _wireClear();
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
    importJSON: importJSON,
    updateCounters: updateCounters,
    refresh: _refresh,
    showToast: showToast,
    getState: function () { return AppState; }
  };

})();

console.log('[app] App module loaded.');
