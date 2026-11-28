// ============================================================
// dj.js — Perfil DJ: solo lectura del plano y del minuto a minuto,
// e impresión de su hoja (croquis del salón con la cabina marcada + minuto a minuto).
// ============================================================
(function () {
  'use strict';

  function PE() { return window.PEGEventos; }
  function evento() { return PE() && PE().getEvent ? PE().getEvent() : null; }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function h12(h) {
    if (!h) return '';
    var p = String(h).split(':'), H = parseInt(p[0], 10), M = p[1] || '00';
    return ((H % 12) || 12) + ':' + M + (H < 12 ? ' am' : ' pm');
  }
  // Momentos en los que el DJ pone o acompaña la música
  function esDelDJ(r) {
    return /\bDJ\b/i.test((r.responsable || '') + ' ' + (r.actividad || '')) ||
      /vals|pista|robot|chinelo|entrada|brindis|coronaci|juguete|regalo|pastel|chispero/i.test(r.actividad || '');
  }
  // Término: el rango escrito en la actividad "(6:50 PM – 10:30 PM)"; si no hay, en blanco
  function filaMinuto(r) {
    var texto = r.actividad || '', termina = r.fin ? h12(r.fin) : '';
    var rango = /\s*\((\d{1,2}:\d{2}\s*[AP]M)\s*[–-]\s*([^)]*)\)/i.exec(texto);
    if (rango) {
      if (!termina) termina = rango[2].replace(/\s*\/\s*/g, ' o ').replace(/([AP])M/gi, function (m, a) { return a.toLowerCase() + 'm'; });
      texto = texto.replace(rango[0], '');
    }
    return { inicia: h12(r.hora), termina: termina, texto: texto, responsable: r.responsable || '', dj: esDelDJ(r) };
  }
  function minuto() {
    var ev = evento();
    return ((ev && ev.data.minuto) || []).filter(function (r) { return r.hora || r.actividad; }).map(filaMinuto);
  }
  function nombreDJ() {
    var ev = evento();
    var p = ((ev && ev.data.proveedores) || []).find(function (x) { return /(^|[^a-z])dj([^a-z]|$)/i.test((x.servicio || '') + ' ' + (x.servicioOtro || '')); });
    return p ? (p.nombre || '') : '';
  }

  // Croquis del salón (2D) como SVG, con la cabina del DJ marcada; ancho/alto de la caja donde se mostrará
  function croquisSVG(anchoPx, altoPx) {
    var st = window.App.getLayout();
    if (window.Editor2D) window.Editor2D.update(st.elements);
    var S = 15;
    var v = (st.vistas || []).find(function (x) { return /sal/i.test(x.nombre); }) || { x: st.terrain.w / 2, y: st.terrain.h / 2, w: st.terrain.w, h: st.terrain.h };
    var vbx = [(v.x - v.w / 2) * S, (v.y - v.h / 2) * S, v.w * S, v.h * S];
    var k = Math.min(anchoPx / vbx[2], altoPx / vbx[3]);
    var c = document.getElementById('svg-canvas').cloneNode(true);
    ['.active-selection', '#svg-ruler-h', '#svg-ruler-v', '#svg-terrain-border'].forEach(function (sel) { var n = c.querySelector(sel); if (n) n.remove(); });
    Array.prototype.forEach.call(c.querySelectorAll('.resize-handle'), function (h) { h.remove(); });
    var bg = c.querySelector('#svg-background'); if (bg) { bg.setAttribute('width', st.terrain.w * S); bg.setAttribute('height', st.terrain.h * S); }
    var zg = c.querySelector('#svg-zoom-group'); if (zg) zg.removeAttribute('transform');
    Array.prototype.forEach.call(c.querySelectorAll('.elem-label'), function (l) {
      var fs = 9 / k; l.setAttribute('font-size', fs); l.setAttribute('font-weight', '700');
      var bd = l.nextElementSibling;
      if (bd && bd.classList.contains('elem-badge')) { bd.setAttribute('font-size', 7 / k); bd.setAttribute('y', parseFloat(l.getAttribute('y')) + fs * 1.1); }
    });
    c.removeAttribute('id');
    c.setAttribute('viewBox', vbx.join(' '));
    c.setAttribute('width', '100%'); c.setAttribute('height', '100%');
    c.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    var dj = st.elements.find(function (e) { return e.type === 'dj_booth'; });
    if (dj) {
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g'), cx = dj.x * S, cy = dj.y * S, r = 2.6 * S;
      g.innerHTML = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="rgba(246,92,122,0.18)" stroke="#F65C7A" stroke-width="' + (3 / k) + '" stroke-dasharray="' + (8 / k) + ' ' + (5 / k) + '"/>' +
        '<rect x="' + (cx - 60 / k) + '" y="' + (cy - r - 30 / k) + '" width="' + (120 / k) + '" height="' + (22 / k) + '" rx="' + (11 / k) + '" fill="#F65C7A"/>' +
        '<text x="' + cx + '" y="' + (cy - r - 15 / k) + '" text-anchor="middle" font-family="Arial" font-weight="700" font-size="' + (12 / k) + '" fill="#fff">' + (_rol === 'dj' ? 'AQUÍ VA EL DJ' : 'DJ') + '</text>';
      (c.querySelector('#svg-zoom-group') || c).appendChild(g);
    }
    return new XMLSerializer().serializeToString(c);
  }

  // ── Ventana del minuto a minuto con el croquis (solo lectura) ──
  function verMinuto() {
    var filas = minuto();
    var m = document.createElement('div');
    m.className = 'venue-picker-overlay';
    m.innerHTML = '<div class="venue-picker dj-minuto">' +
      '<div class="venue-picker-head"><h2>Croquis y minuto a minuto</h2><button class="venue-picker-close" title="Cerrar"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<div class="dj-croquis">' + croquisSVG(860, 620) + '</div>' +
      '<p>' + esc((evento() || {}).nombre || '') + '. En rosa, los momentos en que el DJ pone o acompaña la música.</p>' +
      '<table class="dj-tabla"><thead><tr><th>Inicia</th><th>Termina</th><th>Actividad</th><th>Responsable</th></tr></thead><tbody>' +
      filas.map(function (f) {
        return '<tr class="' + (f.dj ? 'dj' : '') + '"><td>' + esc(f.inicia) + '</td><td>' + esc(f.termina) + '</td><td>' + esc(f.texto) + '</td><td>' + esc(f.responsable) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    document.body.appendChild(m);
    var cerrar = function () { m.remove(); };
    m.querySelector('.venue-picker-close').onclick = cerrar;
    m.onclick = function (e) { if (e.target === m) cerrar(); };
  }

  // ── Hoja para imprimir: croquis del salón con la cabina marcada + minuto a minuto ──
  function imprimir() {
    var ev = evento();
    if (!ev || !window.App) return;
    var w = window.open('', '_blank');
    if (!w) { if (window.App.showToast) window.App.showToast('El navegador bloqueó la ventana: permite las ventanas emergentes.', 'error'); return; }
    var st = window.App.getLayout();
    if (window.Editor2D) window.Editor2D.update(st.elements);
    var S = 15;
    var v = (st.vistas || []).find(function (x) { return /sal/i.test(x.nombre); }) || { x: st.terrain.w / 2, y: st.terrain.h / 2, w: st.terrain.w, h: st.terrain.h };
    var vbx = [(v.x - v.w / 2) * S, (v.y - v.h / 2) * S, v.w * S, v.h * S];
    var k = Math.min(695 / vbx[2], 760 / vbx[3]);
    var c = document.getElementById('svg-canvas').cloneNode(true);
    ['.active-selection', '#svg-ruler-h', '#svg-ruler-v', '#svg-terrain-border'].forEach(function (sel) { var n = c.querySelector(sel); if (n) n.remove(); });
    Array.prototype.forEach.call(c.querySelectorAll('.resize-handle'), function (h) { h.remove(); });
    var bg = c.querySelector('#svg-background'); if (bg) { bg.setAttribute('width', st.terrain.w * S); bg.setAttribute('height', st.terrain.h * S); }
    var zg = c.querySelector('#svg-zoom-group'); if (zg) zg.removeAttribute('transform');
    Array.prototype.forEach.call(c.querySelectorAll('.elem-label'), function (l) {
      var fs = 9 / k; l.setAttribute('font-size', fs); l.setAttribute('font-weight', '700');
      var bd = l.nextElementSibling;
      if (bd && bd.classList.contains('elem-badge')) { bd.setAttribute('font-size', 7 / k); bd.setAttribute('y', parseFloat(l.getAttribute('y')) + fs * 1.1); }
    });
    c.setAttribute('viewBox', vbx.join(' '));
    c.setAttribute('width', '100%'); c.setAttribute('height', '100%');
    c.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    var dj = st.elements.find(function (e) { return e.type === 'dj_booth'; });
    if (dj) {
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g'), cx = dj.x * S, cy = dj.y * S, r = 2.6 * S;
      g.innerHTML = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="rgba(246,92,122,0.18)" stroke="#F65C7A" stroke-width="' + (3 / k) + '" stroke-dasharray="' + (8 / k) + ' ' + (5 / k) + '"/>' +
        '<rect x="' + (cx - 60 / k) + '" y="' + (cy - r - 30 / k) + '" width="' + (120 / k) + '" height="' + (22 / k) + '" rx="' + (11 / k) + '" fill="#F65C7A"/>' +
        '<text x="' + cx + '" y="' + (cy - r - 15 / k) + '" text-anchor="middle" font-family="Arial" font-weight="700" font-size="' + (12 / k) + '" fill="#fff">AQUÍ VA EL DJ</text>';
      (c.querySelector('#svg-zoom-group') || c).appendChild(g);
    }
    var svg = new XMLSerializer().serializeToString(c);
    var b = ev.data.brief || {};
    var fecha = b.fecha_evento ? new Date(b.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
    var tpl = (window.VENUE_TEMPLATES || []).find(function (t) { return t.id === st.venueId; });
    var venue = tpl ? tpl.name : (b.venue_red || b.venue_externo || '');
    var quien = nombreDJ();
    var cab = function (t) {
      return '<div class="cab"><div><h1>' + esc(t) + '</h1><div class="sub">' + esc(ev.nombre) + (venue ? ' · ' + esc(venue) : '') + (fecha ? ' · ' + esc(fecha) : '') +
        (b.hora_inicio ? ' · ' + h12(b.hora_inicio) + ' a ' + h12(b.hora_cierre) : '') + (quien ? ' · DJ: ' + esc(quien) : '') + '</div></div><div class="marca">PRIMAVERA<br>EVENTS GROUP</div></div>';
    };
    var pista = st.elements.find(function (e) { return e.type === 'dancefloor'; });
    var html = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>DJ · ' + esc(ev.nombre) + '</title><style>' +
      '@page{size:letter portrait;margin:12mm}body{margin:0;font-family:Poppins,Arial,sans-serif;color:#1F1F1F}' +
      '.hoja{page-break-after:always}.hoja:last-child{page-break-after:auto}' +
      '.cab{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #F65C7A;padding-bottom:6px;margin-bottom:10px}' +
      '.cab h1{font-family:Georgia,serif;font-size:22px;margin:0}.sub{font-size:12px;color:#555;margin-top:2px}.marca{font-size:11px;color:#C9A96E;font-weight:700;text-align:right}' +
      '.plano{width:100%;height:760px;border:1px solid #ddd;border-radius:6px;overflow:hidden}' +
      '.datos{display:flex;gap:10px;margin-top:10px;font-size:12px}.datos div{flex:1;border:1px solid #eee;border-left:4px solid #F65C7A;border-radius:6px;padding:6px 10px}' +
      '.datos b{display:block;color:#F65C7A;font-size:11px;text-transform:uppercase}' +
      'table{width:100%;border-collapse:collapse;font-size:12.5px}th{background:#1F1F1F;color:#fff;text-align:left;padding:7px 8px;font-size:11.5px}' +
      'td{padding:6px 8px;border-bottom:1px solid #e5e5e5;vertical-align:top}td.h{white-space:nowrap;font-weight:700}' +
      'tr.dj td{background:#FFE3EA}tr.dj td:first-child{border-left:5px solid #F65C7A}' +
      '.etq{display:inline-block;font-size:10px;font-weight:700;color:#fff;background:#F65C7A;border-radius:10px;padding:1px 7px;margin-left:6px}' +
      '.nota{font-size:11px;color:#666;margin-top:8px}.ap div{border-bottom:1px solid #ccc;height:22px}' +
      '</style></head><body>' +
      '<section class="hoja">' + cab('DJ · Dónde se coloca') + '<div class="plano">' + svg + '</div><div class="datos">' +
      '<div><b>Cabina del DJ</b>' + (dj ? dj.w + ' × ' + dj.h + ' m' : 'Ver croquis') + (quien ? ' · ' + esc(quien) : '') + '</div>' +
      '<div><b>Pista de baile</b>' + (pista ? pista.w + ' × ' + pista.h + ' m' : '') + '</div>' +
      '<div><b>Mesa principal</b>Del otro lado de la pista</div></div></section>' +
      '<section class="hoja">' + cab('Minuto a minuto') + '<table><thead><tr><th>Inicia</th><th>Termina</th><th>Actividad</th><th>Responsable</th></tr></thead><tbody>' +
      minuto().map(function (f) {
        return '<tr class="' + (f.dj ? 'dj' : '') + '"><td class="h">' + esc(f.inicia) + '</td><td class="h">' + esc(f.termina) + '</td><td>' + esc(f.texto) +
          (f.dj ? '<span class="etq">DJ</span>' : '') + '</td><td>' + esc(f.responsable) + '</td></tr>';
      }).join('') + '</tbody></table><p class="nota">En rosa: momentos en los que el DJ pone o acompaña la música. Término en blanco: lo marca la coordinación en el momento.</p>' +
      '<div class="ap"><b>Apuntes</b><div></div><div></div><div></div></div></section>' +
      '<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>';
    w.document.open(); w.document.write(html); w.document.close();
  }

  // ── Plano en 3D en pantalla completa ──
  function verPlano3D() {
    var b3 = document.getElementById('btn-view-3d');
    if (b3) b3.click();
    var pc = document.getElementById('btn-pantalla-completa');
    var area = document.querySelector('.canvas-area');
    var yaCompleta = document.fullscreenElement || (area && area.classList.contains('pantalla-completa'));
    if (pc && !yaCompleta) setTimeout(function () { pc.click(); }, 50);
  }

  // ── Perfiles de solo ver (DJ y cliente): dos opciones, plano 3D en pantalla completa o minuto a minuto ──
  var _rol = 'dj';
  function elegir() {
    var ev = evento();
    if (!ev) return;
    var m = document.createElement('div');
    m.className = 'venue-picker-overlay';
    m.innerHTML = '<div class="venue-picker" style="max-width:560px">' +
      '<div class="venue-picker-head"><h2>' + esc(ev.nombre) + '</h2></div>' +
      '<p>' + (_rol === 'dj' ? 'Perfil DJ' : 'Bienvenida') + ' · solo ver. ¿Qué quieres ver?</p>' +
      '<div class="venue-grid">' +
        '<button class="venue-card" data-ver="plano"><i class="fa-solid fa-cube"></i><strong>Plano en 3D</strong><span>En pantalla completa. Gíralo y acércate con los dedos o el mouse.</span></button>' +
        '<button class="venue-card" data-ver="minuto"><i class="fa-solid fa-clock"></i><strong>Minuto a minuto</strong><span>Horarios del evento.</span></button>' +
      '</div></div>';
    document.body.appendChild(m);
    Array.prototype.forEach.call(m.querySelectorAll('[data-ver]'), function (b) {
      b.onclick = function () { m.remove(); if (b.getAttribute('data-ver') === 'plano') verPlano3D(); else verMinuto(); };
    });
  }
  function activar(rol) {
    _rol = rol || 'dj';
    var vieja = document.getElementById('dj-barra');
    if (vieja) vieja.remove();
    var barra = document.createElement('div');
    barra.id = 'dj-barra';
    barra.innerHTML =
      '<span class="dj-titulo"><i class="fa-solid ' + (_rol === 'dj' ? 'fa-headphones' : 'fa-eye') + '"></i> ' + (_rol === 'dj' ? 'Perfil DJ' : 'Solo ver') + '</span>' +
      '<button type="button" class="event-btn" id="dj-plano"><i class="fa-solid fa-cube"></i> Plano en 3D</button>' +
      '<button type="button" class="event-btn" id="dj-minuto"><i class="fa-solid fa-clock"></i> Minuto a minuto</button>';
    document.body.appendChild(barra);
    barra.querySelector('#dj-plano').onclick = function () { if (evento()) verPlano3D(); };
    barra.querySelector('#dj-minuto').onclick = function () { if (evento()) verMinuto(); };
  }

  window.PEGDJ = { activar: activar, elegir: elegir, verPlano3D: verPlano3D, verMinuto: verMinuto, imprimir: imprimir, nombreDJ: nombreDJ };
})();
