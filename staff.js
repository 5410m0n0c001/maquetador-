// ============================================================
// staff.js — Staff del evento
// Quién va (coordinador, capitanes, meseros, barra…), su teléfono,
// qué mesas del croquis atiende cada quien y qué radio lleva.
// Se guarda en el evento: data.staff = [{ nombre, rol, telefono, mesas: [n], radio }]
// ============================================================
(function () {
  'use strict';

  var ROLES = ['Coordinador', 'Capitán', 'Mesero', 'Barra', 'Lavado de loza', 'Servicios generales', 'Cocina', 'Chofer', 'Bodega', 'Otro'];
  // Qué hace cada perfil (se muestra al elegirlo)
  var AYUDA_ROL = {
    'Barra': 'Personal de barra: prepara y sirve bebidas.',
    'Lavado de loza': 'Lava durante el evento la loza que sale sucia y la entrega limpia para el regreso a bodega.',
    'Servicios generales': 'Baños, barrer y limpieza durante el evento.'
  };
  var PLURAL = { 'Coordinador': 'Coordinadores', 'Capitán': 'Capitanes', 'Mesero': 'Meseros', 'Chofer': 'Choferes', 'Otro': 'Otros' };
  var _modal = null;

  function PE() { return window.PEGEventos; }
  function evento() { return PE() && PE().getEvent ? PE().getEvent() : null; }
  function esPlanner() { return !!(PE() && PE().isPlanner && PE().isPlanner()); }
  function toast(m, t) { if (window.App && window.App.showToast) window.App.showToast(m, t); }
  function guardar() { if (PE() && PE().scheduleSave) PE().scheduleSave(); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function staff() {
    var ev = evento();
    if (!ev) return [];
    if (!Array.isArray(ev.data.staff)) ev.data.staff = [];
    return ev.data.staff;
  }

  // Mesas numeradas del croquis
  function mesasDelPlano() {
    var layout = window.App && window.App.getLayout ? window.App.getLayout() : { elements: [] };
    var nums = (layout.elements || []).map(function (e) { return e.mesaConfig && parseInt(e.mesaConfig.mesaNum, 10); })
      .filter(function (n) { return n > 0; });
    return nums.filter(function (n, i) { return nums.indexOf(n) === i; }).sort(function (a, b) { return a - b; });
  }

  // [1,2,3,5] → "1–3, 5"
  function rangos(nums) {
    var s = (nums || []).slice().sort(function (a, b) { return a - b; }), out = [], i = 0;
    while (i < s.length) {
      var j = i;
      while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
      out.push(j > i ? s[i] + '–' + s[j] : String(s[i]));
      i = j + 1;
    }
    return out.join(', ');
  }

  function porRol(lista) {
    return lista.slice().sort(function (a, b) { return ROLES.indexOf(a.rol) - ROLES.indexOf(b.rol); });
  }

  function resumen(lista) {
    var cuenta = {};
    lista.forEach(function (p) { cuenta[p.rol || 'Otro'] = (cuenta[p.rol || 'Otro'] || 0) + 1; });
    return ROLES.filter(function (r) { return cuenta[r]; }).map(function (r) {
      return cuenta[r] + ' ' + (cuenta[r] > 1 && PLURAL[r] ? PLURAL[r] : r);
    }).join(' · ');
  }

  // ── Ventana ────────────────────────────────────────────────
  function abrir() {
    if (!evento()) { toast('Abre un evento primero.', 'warning'); return; }
    if (!_modal) {
      _modal = document.createElement('div');
      _modal.className = 'venue-picker-overlay staff-overlay';
      _modal.addEventListener('click', function (e) { if (e.target === _modal) cerrar(); });
    }
    document.body.appendChild(_modal);
    pintar();
  }
  function cerrar() { if (_modal) _modal.remove(); }

  function pintar() {
    if (!_modal || !_modal.isConnected) return;
    var lista = staff(), editar = esPlanner(), mesas = mesasDelPlano();
    var asignadas = {};
    lista.forEach(function (p) { (p.mesas || []).forEach(function (n) { asignadas[n] = true; }); });
    var libres = mesas.filter(function (n) { return !asignadas[n]; });
    var sinCoord = lista.length && !lista.some(function (p) { return p.rol === 'Coordinador' || p.rol === 'Capitán'; });

    var filas = lista.map(function (p, i) {
      if (!editar) {
        return '<tr><td><b>' + esc(p.rol) + '</b></td><td>' + esc(p.nombre) + '</td><td>' + (p.telefono ? '<a href="tel:' + esc(p.telefono) + '">' + esc(p.telefono) + '</a>' : '') + '</td>' +
          '<td>' + esc(rangos(p.mesas)) + '</td><td>' + esc(p.radio) + '</td></tr>';
      }
      return '<div class="staff-persona" data-i="' + i + '">' +
        '<div class="staff-datos">' +
          '<select class="form-input" data-k="rol" title="' + esc(AYUDA_ROL[p.rol] || '') + '">' + ROLES.concat(ROLES.indexOf(p.rol) < 0 && p.rol ? [p.rol] : []).map(function (r) { return '<option' + (p.rol === r ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select>' +
          '<input class="form-input" data-k="nombre" placeholder="Nombre" value="' + esc(p.nombre) + '">' +
          '<input class="form-input" data-k="telefono" type="tel" placeholder="Teléfono" value="' + esc(p.telefono) + '">' +
          '<input class="form-input" data-k="radio" placeholder="Radio (núm.)" value="' + esc(p.radio) + '">' +
          '<button type="button" class="btn-icon-sm staff-quitar" title="Quitar"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        (AYUDA_ROL[p.rol] ? '<div class="staff-ayuda">' + esc(AYUDA_ROL[p.rol]) + '</div>' : '') +
        (mesas.length && (p.rol === 'Mesero' || p.rol === 'Capitán' || (p.mesas || []).length) ? '<div class="staff-mesas"><span>Mesas:</span>' + mesas.map(function (n) {
          var mia = (p.mesas || []).indexOf(n) > -1;
          var otro = !mia && asignadas[n];
          return '<button type="button" class="staff-mesa' + (mia ? ' mia' : '') + (otro ? ' otra' : '') + '" data-n="' + n + '" title="' + (otro ? 'Ya la tiene otra persona' : 'Mesa ' + n) + '">' + n + '</button>';
        }).join('') + '</div>' : '') +
      '</div>';
    }).join('');

    _modal.innerHTML = '<div class="venue-picker staff-modal">' +
      '<div class="venue-picker-head"><h2>Staff del evento · ' + esc(evento().nombre) + '</h2>' +
        '<button class="venue-picker-close" title="Cerrar"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<p class="vale-sub">' + (lista.length ? lista.length + ' personas · ' + resumen(lista) : 'Todavía no hay staff registrado.') + '</p>' +
      (sinCoord ? '<p class="minuto-aviso"><i class="fa-solid fa-triangle-exclamation"></i> No hay coordinador ni capitán asignado.</p>' : '') +
      (lista.length && libres.length ? '<p class="minuto-aviso"><i class="fa-solid fa-triangle-exclamation"></i> Mesas sin mesero: ' + esc(rangos(libres)) + '</p>' : '') +
      (!mesas.length ? '<p class="vale-sub">El croquis no tiene mesas numeradas: cuando las tenga, aquí podrás asignarlas.</p>' : '') +
      '<div class="vale-acciones">' +
        (editar ? '<button type="button" class="event-btn" id="staff-agregar"><i class="fa-solid fa-user-plus"></i> Agregar persona</button>' : '') +
        '<button type="button" class="event-btn active" id="staff-imprimir"><i class="fa-solid fa-print"></i> Imprimir hoja de staff</button>' +
      '</div>' +
      (editar ? '<div class="staff-lista">' + filas + '</div>'
        : (lista.length ? '<div class="vale-lista"><table><thead><tr><th>Rol</th><th>Nombre</th><th>Teléfono</th><th>Mesas</th><th>Radio</th></tr></thead><tbody>' + porRol(lista).map(function (p) {
            return '<tr><td><b>' + esc(p.rol) + '</b></td><td>' + esc(p.nombre) + '</td><td>' + esc(p.telefono) + '</td><td>' + esc(rangos(p.mesas)) + '</td><td>' + esc(p.radio) + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '')) +
      '</div>';

    _modal.querySelector('.venue-picker-close').onclick = cerrar;
    _modal.querySelector('#staff-imprimir').onclick = imprimir;
    if (!editar) return;
    _modal.querySelector('#staff-agregar').onclick = function () {
      lista.push({ rol: 'Mesero', nombre: '', telefono: '', mesas: [], radio: '' });
      guardar();
      pintar();
      var ult = _modal.querySelectorAll('.staff-persona [data-k="nombre"]');
      if (ult.length) ult[ult.length - 1].focus();
    };
    Array.prototype.forEach.call(_modal.querySelectorAll('.staff-persona'), function (fila) {
      var p = lista[parseInt(fila.getAttribute('data-i'), 10)];
      Array.prototype.forEach.call(fila.querySelectorAll('[data-k]'), function (el) {
        el.onchange = function () { p[el.getAttribute('data-k')] = el.value; guardar(); if (el.getAttribute('data-k') === 'rol') pintar(); };
      });
      fila.querySelector('.staff-quitar').onclick = function () {
        if (p.nombre && !confirm('¿Quitar a ' + p.nombre + '?')) return;
        lista.splice(lista.indexOf(p), 1);
        guardar();
        pintar();
      };
      Array.prototype.forEach.call(fila.querySelectorAll('.staff-mesa'), function (b) {
        b.onclick = function () {
          var n = parseInt(b.getAttribute('data-n'), 10);
          p.mesas = p.mesas || [];
          var k = p.mesas.indexOf(n);
          if (k > -1) p.mesas.splice(k, 1);
          else {
            // Una mesa la atiende una sola persona: se le quita a quien la tenía
            lista.forEach(function (o) { if (o !== p && o.mesas) o.mesas = o.mesas.filter(function (x) { return x !== n; }); });
            p.mesas.push(n);
          }
          guardar();
          pintar();
        };
      });
    });
  }

  // ── Hoja de staff impresa ──────────────────────────────────
  function imprimir() {
    var ev = evento(), lista = porRol(staff());
    if (!lista.length) { toast('Todavía no hay staff registrado.', 'warning'); return; }
    var w = window.open('', '_blank');
    if (!w) { toast('El navegador bloqueó la ventana emergente. Permite las ventanas emergentes en este sitio.', 'error'); return; }
    var b = ev.data.brief || {};
    var fecha = b.fecha_evento ? new Date(b.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
    var logo = new URL('assets/logo-primavera.png', location.href).href;
    var libres = (function () {
      var asig = {};
      lista.forEach(function (p) { (p.mesas || []).forEach(function (n) { asig[n] = true; }); });
      return mesasDelPlano().filter(function (n) { return !asig[n]; });
    })();
    var html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Staff · ' + esc(ev.nombre) + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">' +
      '<style>:root{--pink:#F65C7A;--gold:#C9A96E;--ink:#1F1F1F;--gray:#6D6D6D;--line:#E2D9D0}' +
      '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      'html,body{background:#fff}body{font-family:Poppins,sans-serif;color:var(--ink);font-size:10.5px;margin:18px auto;max-width:800px;padding:0 14px}' +
      'h1{font-family:"Playfair Display",serif;margin:0;font-size:17px}' +
      '.toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;color:var(--gray)}.toolbar button{background:var(--pink);color:#fff;border:0;border-radius:6px;padding:8px 14px;cursor:pointer}' +
      '.head{display:flex;align-items:center;gap:12px;padding-bottom:8px;border-bottom:2px solid var(--gold)}.head img{width:44px;height:44px;border-radius:50%;object-fit:cover}' +
      '.marca{font-family:"Playfair Display",serif;font-size:15px;color:var(--pink)}.sub{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}' +
      '.titulo{margin-left:auto;text-align:right}.titulo div{color:var(--gray)}' +
      '.datos{display:grid;grid-template-columns:2fr 1.5fr 1fr;gap:4px 14px;margin:10px 0}.datos div{border-bottom:1px solid var(--line);padding:3px 0}.datos b{font-size:7.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);display:block}' +
      'table{width:100%;border-collapse:collapse}th{background:var(--ink);color:#fff;font-weight:500;padding:5px 6px;text-align:left;font-size:9.5px}td{border-bottom:1px solid var(--line);padding:6px;vertical-align:top}tr{break-inside:avoid}' +
      'td.caja{border-left:1px solid var(--line);width:80px}.aviso{color:var(--pink);margin-top:8px}' +
      '.footer{margin-top:12px;padding-top:6px;border-top:1px solid var(--gold);font-size:8px;color:var(--gray);text-align:center}' +
      '@media print{.toolbar{display:none}body{margin:0;max-width:none}@page{size:letter;margin:1.2cm}}</style></head><body>' +
      '<div class="toolbar"><span>Vista previa · Hoja de staff</span><button onclick="window.print()">Imprimir / Guardar PDF</button></div>' +
      '<header class="head"><img src="' + esc(logo) + '" alt="Primavera Events Group"><div><div class="marca">Primavera Events Group®</div><div class="sub">Staff del evento</div></div>' +
        '<div class="titulo"><h1>Hoja de staff</h1><div>' + esc(resumen(lista)) + '</div></div></header>' +
      '<section class="datos"><div><b>Evento</b>' + esc(ev.nombre) + '</div><div><b>Fecha</b>' + esc(fecha) + '</div><div><b>Personas</b>' + esc(b.invitados || '') + '</div></section>' +
      '<table><thead><tr><th>Rol</th><th>Nombre</th><th>Teléfono</th><th>Mesas</th><th>Radio</th><th>Llegada (hora)</th><th>Firma</th></tr></thead><tbody>' +
      lista.map(function (p) {
        return '<tr><td><b>' + esc(p.rol) + '</b></td><td>' + esc(p.nombre) + '</td><td>' + esc(p.telefono) + '</td><td>' + esc(rangos(p.mesas)) + '</td><td>' + esc(p.radio) + '</td><td class="caja"></td><td class="caja"></td></tr>';
      }).join('') + '</tbody></table>' +
      (libres.length ? '<p class="aviso">Mesas sin mesero asignado: ' + esc(rangos(libres)) + '</p>' : '') +
      '<footer class="footer">Primavera Events Group® · Documento de control interno</footer></body></html>';
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // Sección para la ficha técnica del coordinador
  function filasFicha() {
    var lista = porRol(staff());
    return lista.map(function (p) {
      return '<tr><td><strong>' + esc(p.rol) + '</strong></td><td>' + esc(p.nombre) + '</td><td>' + esc(p.telefono) + '</td><td>' + esc(rangos(p.mesas)) + '</td><td>' + esc(p.radio) + '</td></tr>';
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('btn-staff');
    if (btn) btn.onclick = abrir;
  });

  window.PEGStaff = { abrir: abrir, imprimir: imprimir, filasFicha: filasFicha, resumen: function () { return resumen(staff()); } };
})();
