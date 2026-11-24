// ============================================================
// coordinacion.js — Hoja del coordinador
// Uniforme del día, revisión de equipo y presentación del staff,
// brief con el equipo, dinero entregado, gastos con ticket y bitácora.
// Se guarda en el evento: data.coordinacion = { uniforme, briefEquipo, fondo, gastos, bitacora }
// y la revisión de cada persona en data.staff[i].revision = { 'Destapador': true, … }
// ============================================================
(function () {
  'use strict';

  var EQUIPO = ['Destapador', 'Abrecorchos', 'Encendedor', 'Plumas', 'Pinzas para hielo', 'Guantes', 'Trapo / caballo'];
  var PRESENTACION = ['Uniforme completo', 'Sin aretes (hombres)', 'Maquillaje discreto', 'Cabello recogido', 'Uñas limpias y cortas', 'Calzado correcto', 'Sin perfume fuerte'];
  var UNIFORME = [['camisa', 'Camisa (color)'], ['corbata', 'Corbata / moño (color)'], ['mandil', 'Mandil (color)'], ['pantalon', 'Pantalón / falda'], ['calzado', 'Calzado'], ['otro', 'Otro']];
  var TIPOS = ['Nota', 'Eventualidad', 'Incidente', 'Reporte'];
  var BUCKET = 'maquetador-fotos';
  var _modal = null;

  function PE() { return window.PEGEventos; }
  function evento() { return PE() && PE().getEvent ? PE().getEvent() : null; }
  function esPlanner() { return !!(PE() && PE().isPlanner && PE().isPlanner()); }
  function toast(m, t) { if (window.App && window.App.showToast) window.App.showToast(m, t); }
  function guardar() { if (PE() && PE().scheduleSave) PE().scheduleSave(); }
  function h12(h) { return h && PE() && PE().hora12 ? PE().hora12(h) : (h || ''); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dinero(n) { return '$' + (Math.round((parseFloat(n) || 0) * 100) / 100).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function horaActual() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }

  function datos() {
    var ev = evento();
    var c = ev.data.coordinacion = ev.data.coordinacion || {};
    c.uniforme = c.uniforme || {};
    c.briefEquipo = c.briefEquipo || {};
    c.fondo = c.fondo || {};
    c.gastos = c.gastos || [];
    c.bitacora = c.bitacora || [];
    return c;
  }
  function staff() { var ev = evento(); return ev && Array.isArray(ev.data.staff) ? ev.data.staff : []; }
  function totales(c) {
    var gastado = c.gastos.reduce(function (s, g) { return s + (parseFloat(g.monto) || 0); }, 0);
    var fondo = parseFloat(c.fondo.monto) || 0;
    return { fondo: fondo, gastado: gastado, saldo: fondo - gastado };
  }

  // ── Ventana ────────────────────────────────────────────────
  function abrir() {
    if (!evento()) { toast('Abre un evento primero.', 'warning'); return; }
    if (!_modal) {
      _modal = document.createElement('div');
      _modal.className = 'venue-picker-overlay coord-overlay';
      _modal.addEventListener('click', function (e) { if (e.target === _modal) cerrar(); });
    }
    document.body.appendChild(_modal);
    pintar();
  }
  function cerrar() { if (_modal) _modal.remove(); }

  function pintar() {
    if (!_modal || !_modal.isConnected) return;
    var c = datos(), editar = esPlanner(), lista = staff(), t = totales(c);
    var dis = editar ? '' : ' disabled';
    var scroll = _modal.querySelector('.coord-modal') ? _modal.querySelector('.coord-modal').scrollTop : 0;

    var revision = lista.length ? lista.map(function (p, i) {
      var rev = p.revision || {};
      var items = EQUIPO.concat(PRESENTACION);
      var ok = items.filter(function (k) { return rev[k]; }).length;
      return '<div class="coord-persona" data-i="' + i + '"><div class="coord-persona-head"><b>' + esc(p.nombre || 'Sin nombre') + '</b> <span>' + esc(p.rol) + '</span>' +
        '<span class="coord-cuenta' + (ok === items.length ? ' completo' : '') + '">' + ok + '/' + items.length + '</span></div>' +
        '<div class="coord-chips"><small>Equipo</small>' + EQUIPO.map(function (k) { return chip(k, rev[k]); }).join('') + '</div>' +
        '<div class="coord-chips"><small>Presentación</small>' + PRESENTACION.map(function (k) { return chip(k, rev[k]); }).join('') + '</div></div>';
    }).join('') : '<p class="vale-vacio">Primero registra el staff en el botón Staff para revisar a cada persona.</p>';
    function chip(k, si) {
      return '<button type="button" class="coord-chip' + (si ? ' si' : '') + '" data-rev="' + esc(k) + '"' + dis + '><i class="fa-solid ' + (si ? 'fa-check' : 'fa-minus') + '"></i> ' + esc(k) + '</button>';
    }

    var gastos = c.gastos.map(function (g, i) {
      return '<div class="coord-gasto" data-g="' + i + '">' +
        '<input class="form-input" data-gk="concepto" placeholder="Concepto (hielo, gasolina…)" value="' + esc(g.concepto) + '"' + dis + '>' +
        '<input class="form-input" data-gk="monto" type="number" min="0" step="0.5" placeholder="$" value="' + esc(g.monto) + '"' + dis + '>' +
        (g.foto ? '<a class="coord-ticket" href="' + esc(g.foto.url) + '" target="_blank" rel="noopener"><img src="' + esc(g.foto.url) + '" alt="Ticket"></a>'
          : (editar ? '<label class="btn-icon-sm coord-foto" title="Foto del ticket"><i class="fa-solid fa-camera"></i><input type="file" accept="image/*" capture="environment" hidden></label>' : '<span class="coord-sin">Sin ticket</span>')) +
        (editar ? '<button type="button" class="btn-icon-sm coord-quitar-gasto" title="Quitar"><i class="fa-solid fa-xmark"></i></button>' : '') +
        '</div>';
    }).join('');

    var bitacora = c.bitacora.map(function (b, i) {
      return '<div class="coord-nota" data-b="' + i + '">' +
        '<input class="form-input" type="time" data-bk="hora" value="' + esc(b.hora) + '"' + dis + '>' +
        '<select class="form-input" data-bk="tipo"' + dis + '>' + TIPOS.map(function (x) { return '<option' + (b.tipo === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>' +
        '<textarea class="form-input" data-bk="texto" rows="2" placeholder="Qué pasó, a quién se avisó, cómo se resolvió"' + dis + '>' + esc(b.texto) + '</textarea>' +
        (editar ? '<button type="button" class="btn-icon-sm coord-quitar-nota" title="Quitar"><i class="fa-solid fa-xmark"></i></button>' : '') +
        '</div>';
    }).join('');

    _modal.innerHTML = '<div class="venue-picker coord-modal">' +
      '<div class="venue-picker-head"><h2>Hoja del coordinador · ' + esc(evento().nombre) + '</h2>' +
        '<button class="venue-picker-close" title="Cerrar"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<div class="vale-acciones"><button type="button" class="event-btn active" id="coord-imprimir"><i class="fa-solid fa-print"></i> Imprimir hoja del coordinador</button></div>' +

      '<section class="coord-sec"><h3><i class="fa-solid fa-shirt"></i> Uniforme del día</h3><div class="coord-grid">' +
        UNIFORME.map(function (u) {
          return '<label><span>' + u[1] + '</span><input class="form-input" data-u="' + u[0] + '" value="' + esc(c.uniforme[u[0]]) + '"' + dis + '></label>';
        }).join('') + '</div></section>' +

      '<section class="coord-sec"><h3><i class="fa-solid fa-people-group"></i> Brief con el equipo</h3>' +
        '<label class="coord-check"><input type="checkbox" id="coord-brief"' + (c.briefEquipo.hecho ? ' checked' : '') + dis + '> Se hizo el brief con el equipo antes del evento</label>' +
        '<label class="coord-hora">Hora <input class="form-input" type="time" id="coord-brief-hora" value="' + esc(c.briefEquipo.hora) + '"' + dis + '></label></section>' +

      '<section class="coord-sec"><h3><i class="fa-solid fa-clipboard-user"></i> Revisión del equipo y presentación</h3>' +
        '<p class="vale-sub">Marca lo que cada persona trae y cumple al llegar.</p>' + revision + '</section>' +

      '<section class="coord-sec"><h3><i class="fa-solid fa-wallet"></i> Dinero y gastos</h3><div class="coord-grid">' +
        '<label><span>Dinero entregado ($)</span><input class="form-input" type="number" min="0" step="0.5" data-f="monto" value="' + esc(c.fondo.monto) + '"' + dis + '></label>' +
        '<label><span>Lo entrega</span><input class="form-input" data-f="entrega" value="' + esc(c.fondo.entrega) + '"' + dis + '></label>' +
        '<label><span>Lo recibe (coordinador / capitán)</span><input class="form-input" data-f="recibe" value="' + esc(c.fondo.recibe) + '"' + dis + '></label></div>' +
        '<div class="coord-gastos">' + (gastos || '<p class="vale-vacio">Sin gastos registrados.</p>') + '</div>' +
        (editar ? '<button type="button" class="event-btn" id="coord-gasto"><i class="fa-solid fa-plus"></i> Agregar gasto</button>' : '') +
        '<div class="coord-totales"><span>Entregado <b>' + dinero(t.fondo) + '</b></span><span>Gastado <b>' + dinero(t.gastado) + '</b></span>' +
          '<span class="' + (t.saldo < 0 ? 'reponer' : '') + '">' + (t.saldo < 0 ? 'A reponer al coordinador' : 'A devolver') + ' <b>' + dinero(Math.abs(t.saldo)) + '</b></span></div></section>' +

      '<section class="coord-sec"><h3><i class="fa-solid fa-book"></i> Bitácora: notas, eventualidades e incidentes</h3>' +
        '<div class="coord-bitacora">' + (bitacora || '<p class="vale-vacio">Sin notas.</p>') + '</div>' +
        (editar ? '<button type="button" class="event-btn" id="coord-nota"><i class="fa-solid fa-plus"></i> Agregar nota</button>' : '') + '</section>' +
      '</div>';

    var m = _modal;
    m.querySelector('.coord-modal').scrollTop = scroll;
    m.querySelector('.venue-picker-close').onclick = cerrar;
    m.querySelector('#coord-imprimir').onclick = imprimir;
    if (!editar) return;

    function on(sel, fn, evt) {
      Array.prototype.forEach.call(m.querySelectorAll(sel), function (el) { el.addEventListener(evt || 'change', function () { fn(el); guardar(); }); });
    }
    on('[data-u]', function (el) { c.uniforme[el.getAttribute('data-u')] = el.value; });
    on('[data-f]', function (el) { c.fondo[el.getAttribute('data-f')] = el.value; pintar(); });
    on('#coord-brief', function (el) {
      c.briefEquipo.hecho = el.checked;
      if (el.checked && !c.briefEquipo.hora) c.briefEquipo.hora = horaActual();
      pintar();
    });
    on('#coord-brief-hora', function (el) { c.briefEquipo.hora = el.value; });
    Array.prototype.forEach.call(m.querySelectorAll('.coord-persona'), function (div) {
      var p = lista[parseInt(div.getAttribute('data-i'), 10)];
      Array.prototype.forEach.call(div.querySelectorAll('[data-rev]'), function (b) {
        b.onclick = function () {
          p.revision = p.revision || {};
          var k = b.getAttribute('data-rev');
          p.revision[k] = !p.revision[k];
          guardar();
          pintar();
        };
      });
    });
    Array.prototype.forEach.call(m.querySelectorAll('.coord-gasto'), function (div) {
      var g = c.gastos[parseInt(div.getAttribute('data-g'), 10)];
      Array.prototype.forEach.call(div.querySelectorAll('[data-gk]'), function (el) {
        el.onchange = function () { g[el.getAttribute('data-gk')] = el.value; guardar(); if (el.getAttribute('data-gk') === 'monto') pintar(); };
      });
      var archivo = div.querySelector('input[type="file"]');
      if (archivo) archivo.onchange = function () { if (archivo.files[0]) subirTicket(g, archivo.files[0]); };
      div.querySelector('.coord-quitar-gasto').onclick = function () {
        if (!confirm('¿Quitar este gasto?')) return;
        c.gastos.splice(c.gastos.indexOf(g), 1);
        guardar();
        pintar();
      };
    });
    m.querySelector('#coord-gasto').onclick = function () { c.gastos.push({ concepto: '', monto: '' }); guardar(); pintar(); };
    Array.prototype.forEach.call(m.querySelectorAll('.coord-nota'), function (div) {
      var b = c.bitacora[parseInt(div.getAttribute('data-b'), 10)];
      Array.prototype.forEach.call(div.querySelectorAll('[data-bk]'), function (el) {
        el.onchange = function () { b[el.getAttribute('data-bk')] = el.value; guardar(); };
      });
      div.querySelector('.coord-quitar-nota').onclick = function () {
        if (!confirm('¿Quitar esta nota?')) return;
        c.bitacora.splice(c.bitacora.indexOf(b), 1);
        guardar();
        pintar();
      };
    });
    m.querySelector('#coord-nota').onclick = function () { c.bitacora.push({ hora: horaActual(), tipo: 'Nota', texto: '' }); guardar(); pintar(); };
  }

  // Foto del ticket: se comprime en el teléfono y se guarda con las fotos del evento
  function subirTicket(g, file) {
    var sb = PE().client ? PE().client() : null;
    if (!sb || !PE().comprimirFoto) { toast('No hay conexión para subir la foto.', 'error'); return; }
    toast('Subiendo ticket…', 'info');
    PE().comprimirFoto(file).then(function (blob) {
      var path = evento().id + '/ticket-' + Date.now() + '.jpg';
      return sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' }).then(function (res) {
        if (res.error) throw res.error;
        g.foto = { url: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, path: path, kb: Math.round(blob.size / 1024) };
        guardar();
        pintar();
        toast('Ticket guardado.', 'success');
      });
    }).catch(function (err) { toast('No se pudo subir el ticket: ' + (err.message || err), 'error'); });
  }

  // ── Hoja impresa ───────────────────────────────────────────
  function imprimir() {
    var ev = evento(), c = datos(), lista = staff(), t = totales(c);
    var w = window.open('', '_blank');
    if (!w) { toast('El navegador bloqueó la ventana emergente. Permite las ventanas emergentes en este sitio.', 'error'); return; }
    var b = ev.data.brief || {};
    var fecha = b.fecha_evento ? new Date(b.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
    var logo = new URL('assets/logo-primavera.png', location.href).href;
    var filasStaff = lista.length ? lista : [{}, {}, {}, {}, {}, {}, {}, {}];
    function matriz(titulo, items) {
      return '<h2>' + titulo + '</h2><table class="matriz"><thead><tr><th class="izq">Nombre</th>' + items.map(function (k) { return '<th>' + esc(k) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        filasStaff.map(function (p) {
          var rev = p.revision || {};
          return '<tr><td class="izq">' + esc(p.nombre || '') + (p.rol ? ' <span class="rol">' + esc(p.rol) + '</span>' : '') + '</td>' +
            items.map(function (k) { return '<td>' + (rev[k] ? '✓' : '') + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table>';
    }
    var gastos = c.gastos.map(function (g) {
      return '<tr><td>' + esc(g.concepto) + '</td><td class="der">' + (g.monto ? dinero(g.monto) : '') + '</td><td>' + (g.foto ? 'Sí' : '') + '</td></tr>';
    }).join('');
    for (var i = c.gastos.length; i < 4; i++) gastos += '<tr><td>&nbsp;</td><td></td><td></td></tr>';
    var notas = c.bitacora.map(function (n) {
      return '<tr><td>' + esc(h12(n.hora)) + '</td><td>' + esc(n.tipo) + '</td><td>' + esc(n.texto) + '</td></tr>';
    }).join('');
    for (var j = c.bitacora.length; j < 5; j++) notas += '<tr><td>&nbsp;</td><td></td><td></td></tr>';

    var html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Hoja del coordinador · ' + esc(ev.nombre) + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">' +
      '<style>:root{--pink:#F65C7A;--gold:#C9A96E;--ink:#1F1F1F;--gray:#6D6D6D;--line:#E2D9D0}' +
      '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      'html,body{background:#fff}body{font-family:Poppins,sans-serif;color:var(--ink);font-size:10px;margin:18px auto;max-width:800px;padding:0 14px}' +
      'h1,h2{font-family:"Playfair Display",serif;margin:0}h1{font-size:17px}h2{font-size:13px;color:var(--pink);margin:10px 0 5px;border-bottom:1px solid var(--gold);padding-bottom:2px}' +
      '.toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;color:var(--gray)}.toolbar button{background:var(--pink);color:#fff;border:0;border-radius:6px;padding:8px 14px;cursor:pointer}' +
      '.head{display:flex;align-items:center;gap:12px;padding-bottom:8px;border-bottom:2px solid var(--gold)}.head img{width:44px;height:44px;border-radius:50%;object-fit:cover}' +
      '.marca{font-family:"Playfair Display",serif;font-size:15px;color:var(--pink)}.sub{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}.titulo{margin-left:auto;text-align:right}.titulo div{color:var(--gray)}' +
      '.kv{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 14px}.kv div{border-bottom:1px solid var(--line);padding:3px 0;min-height:28px}.kv b{display:block;font-size:7.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold)}' +
      'table{width:100%;border-collapse:collapse}th{background:var(--ink);color:#fff;font-weight:500;padding:4px;font-size:8.5px;text-align:center}th.izq,td.izq{text-align:left}' +
      'td{border-bottom:1px solid var(--line);padding:4px;vertical-align:top}tr{break-inside:avoid}.matriz td{text-align:center;border-left:1px solid var(--line);height:18px}.matriz td.izq{border-left:0;width:28%}.rol{color:var(--gray);font-size:8.5px}' +
      '.matriz td.izq{text-align:left}td.der{text-align:right}.tot{display:flex;gap:18px;justify-content:flex-end;margin-top:6px;font-size:11px}.tot b{color:var(--pink)}' +
      '.firma{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px;break-inside:avoid}.firma div{border-top:1px solid var(--ink);padding-top:3px;color:var(--gray)}' +
      '.footer{margin-top:12px;padding-top:6px;border-top:1px solid var(--gold);font-size:8px;color:var(--gray);text-align:center}' +
      '@media print{.toolbar{display:none}body{margin:0;max-width:none}@page{size:letter;margin:1.1cm}}</style></head><body>' +
      '<div class="toolbar"><span>Vista previa · Hoja del coordinador</span><button onclick="window.print()">Imprimir / Guardar PDF</button></div>' +
      '<header class="head"><img src="' + esc(logo) + '" alt="Primavera Events Group"><div><div class="marca">Primavera Events Group®</div><div class="sub">Coordinación del evento</div></div>' +
        '<div class="titulo"><h1>Hoja del coordinador</h1><div>' + esc(ev.nombre) + (fecha ? ' · ' + esc(fecha) : '') + '</div></div></header>' +
      '<h2>Uniforme del día</h2><div class="kv">' + UNIFORME.map(function (u) { return '<div><b>' + u[1] + '</b>' + esc(c.uniforme[u[0]] || '') + '</div>'; }).join('') + '</div>' +
      '<h2>Brief con el equipo</h2><div class="kv"><div><b>¿Se hizo?</b>' + (c.briefEquipo.hecho ? 'Sí' : '☐ Sí  ☐ No') + '</div><div><b>Hora</b>' + esc(h12(c.briefEquipo.hora)) + '</div><div><b>Personas presentes</b></div></div>' +
      matriz('Equipo que trae cada persona', EQUIPO) +
      matriz('Presentación', PRESENTACION) +
      '<h2>Dinero y gastos</h2><div class="kv"><div><b>Dinero entregado</b>' + (c.fondo.monto ? dinero(c.fondo.monto) : '') + '</div><div><b>Lo entrega</b>' + esc(c.fondo.entrega || '') + '</div><div><b>Lo recibe</b>' + esc(c.fondo.recibe || '') + '</div></div>' +
      '<table style="margin-top:8px"><thead><tr><th class="izq">Concepto</th><th style="width:18%">Monto</th><th style="width:14%">Ticket</th></tr></thead><tbody>' + gastos + '</tbody></table>' +
      '<div class="tot"><span>Entregado <b>' + dinero(t.fondo) + '</b></span><span>Gastado <b>' + dinero(t.gastado) + '</b></span><span>' + (t.saldo < 0 ? 'A reponer' : 'A devolver') + ' <b>' + dinero(Math.abs(t.saldo)) + '</b></span></div>' +
      '<h2>Bitácora: notas, eventualidades e incidentes</h2><table><thead><tr><th style="width:12%">Hora</th><th style="width:16%">Tipo</th><th class="izq">Descripción</th></tr></thead><tbody>' + notas + '</tbody></table>' +
      '<div class="firma"><div>Nombre y firma del coordinador</div><div>Recibió (administración)</div></div>' +
      '<footer class="footer">Primavera Events Group® · Documento de control interno</footer></body></html>';
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('btn-coord');
    if (btn) btn.onclick = abrir;
  });

  window.PEGCoordinacion = { abrir: abrir, imprimir: imprimir };
})();
