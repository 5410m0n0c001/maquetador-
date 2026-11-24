// ============================================================
// vale.js — Requisición de material y vale de salida
// 1. Requisición: el planner palomea del inventario completo de PEG lo que necesita
//    (en la app o en la versión impresa en blanco).
// 2. Vale de salida: se genera de la requisición y lo cuentan bodega, chofer y coordinador.
// Se guarda en el evento: data.vale = { items: [{ id, nombre, categoria, cant, nota, origen }] }
// ============================================================
(function () {
  'use strict';

  var ORDEN_CATEGORIAS = ['Mesas y periqueras', 'Identificadores de mesa', 'Sillas y bancos', 'Salas y sombrillas', 'Mantelería', 'Loza', 'Cubiertos',
    'Cristalería', 'Barra y cocina', 'Bebidas y hielo', 'Cocina e insumos', 'Snacks y estaciones', 'Kits de fiesta', 'Decoración y estructuras', 'Arreglos florales', 'Letras gigantes',
    'Iluminación y eléctrico', 'Utilería', 'Limpieza', 'Equipo del staff', 'Otros'];
  var PASOS = [
    { n: 1, titulo: 'Surtido', quien: 'Bodega' },
    { n: 2, titulo: 'Carga', quien: 'Chofer' },
    { n: 3, titulo: 'Recepción', quien: 'Coordinador en locación' },
    { n: 4, titulo: 'Recolección', quien: 'Coordinador → chofer' },
    { n: 5, titulo: 'Regreso', quien: 'Bodega' }
  ];

  var PROV_CAMPOS = [["nombre","Proveedor"],["telefono","Teléfono"],["hora","Hora"],["entrega","Quién entrega"],["recibe","Quién recibe"]];

  // "Hielo Polar · 777 123 4567 · 4:00 PM · entrega Juan · recibe capitán"
  function textoProveedor(i) {
    var p = i.prov || {};
    var hora = p.hora && PE() && PE().hora12 ? PE().hora12(p.hora) : p.hora;
    return [p.nombre || 'Proveedor externo', p.telefono, hora, p.entrega && 'entrega ' + p.entrega, p.recibe && 'recibe ' + p.recibe].filter(Boolean).join(' · ');
  }

  var _inventario = null;
  var _modal = null;
  var _filtro = '';
  var _enfocar = null; // renglón recién agregado: se muestra y se pone el cursor en su cantidad

  function PE() { return window.PEGEventos; }
  function evento() { return PE() && PE().getEvent ? PE().getEvent() : null; }
  function esPlanner() { return !!(PE() && PE().isPlanner && PE().isPlanner()); }
  function toast(m, t) { if (window.App && window.App.showToast) window.App.showToast(m, t); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }

  function vale() {
    var ev = evento();
    if (!ev) return null;
    if (!ev.data.vale) ev.data.vale = { items: [] };
    return ev.data.vale;
  }
  function guardar() {
    if (PE() && PE().scheduleSave) PE().scheduleSave();
  }
  function invitados() {
    var ev = evento();
    return parseInt(ev && ev.data.brief && ev.data.brief.invitados, 10) || 0;
  }

  function cargarInventario() {
    if (_inventario) return Promise.resolve(_inventario);
    var sb = PE() && PE().client ? PE().client() : null;
    if (!sb) return Promise.reject(new Error('Sin conexión con la base'));
    return sb.from('inventario_peg').select('id,nombre,categoria,existencia,notas').eq('activo', true).order('nombre')
      .then(function (res) {
        if (res.error) throw res.error;
        _inventario = res.data;
        return _inventario;
      });
  }
  function buscarArticulo(nombre) {
    var n = norm(nombre);
    return (_inventario || []).find(function (a) { return norm(a.nombre) === n; }) || null;
  }

  // ── Lista del vale ─────────────────────────────────────────
  function agregar(art, cant, origen) {
    var v = vale();
    var ya = v.items.find(function (i) { return art.id ? i.id === art.id : norm(i.nombre) === norm(art.nombre); });
    if (ya) { if (cant !== '') ya.cant = (parseInt(ya.cant, 10) || 0) + cant; return; }
    v.items.push({ id: art.id || null, nombre: art.nombre, categoria: art.categoria || 'Otros', cant: cant, nota: '', origen: origen || 'manual' });
  }
  // ── Ventana del vale ───────────────────────────────────────
  function abrir() {
    var ev = evento();
    if (!ev) { toast('Abre un evento primero.', 'warning'); return; }
    if (!_modal) {
      _modal = document.createElement('div');
      _modal.className = 'venue-picker-overlay vale-overlay';
      _modal.addEventListener('click', function (e) { if (e.target === _modal) cerrar(); });
    }
    document.body.appendChild(_modal);
    _modal.innerHTML = '<div class="venue-picker vale-modal"><p>Cargando inventario…</p></div>';
    cargarInventario().then(pintar).catch(function (err) {
      _modal.querySelector('.vale-modal').innerHTML = '<p>No se pudo cargar el inventario: ' + esc(err.message || err) + '</p>';
    });
  }
  function cerrar() { if (_modal) _modal.remove(); }

  function agrupar(items) {
    var g = {};
    items.forEach(function (i) { (g[i.categoria || 'Otros'] = g[i.categoria || 'Otros'] || []).push(i); });
    return ORDEN_CATEGORIAS.concat(Object.keys(g).filter(function (c) { return ORDEN_CATEGORIAS.indexOf(c) < 0; }))
      .filter(function (c) { return g[c]; }).map(function (c) { return { categoria: c, items: g[c] }; });
  }

  function pintar() {
    if (!_modal || !_modal.isConnected) return;
    // Al redibujar se conserva dónde ibas en el inventario y en la lista
    var scrolls = ['.vale-modal', '.vale-inv-lista', '.vale-lista'].map(function (sel) { var el = _modal.querySelector(sel); return el ? el.scrollTop : 0; });
    var v = vale(), editar = esPlanner();
    var total = v.items.reduce(function (s, i) { return s + (parseInt(i.cant, 10) || 0); }, 0);

    var lista = agrupar(v.items).map(function (grupo) {
      return '<tr class="vale-grupo"><td colspan="' + (editar ? 5 : 3) + '">' + esc(grupo.categoria) + '</td></tr>' +
        grupo.items.map(function (i) {
          var idx = v.items.indexOf(i);
          return editar
            ? '<tr data-i="' + idx + '"><td><input type="number" min="0" class="form-input vale-cant" placeholder="¿?" value="' + esc(i.cant) + '"></td>' +
              '<td>' + esc(i.nombre) + (i.origen === 'plano' ? ' <span class="vale-tag">plano</span>' : '') + '</td>' +
              '<td><input class="form-input vale-nota" placeholder="Color, medida…" value="' + esc(i.nota) + '"></td>' +
              '<td><select class="form-input vale-surte" title="Quién lo surte"><option value="">Bodega PEG</option><option value="externo"' + (i.surte === 'externo' ? ' selected' : '') + '>Proveedor externo</option></select></td>' +
              '<td><button type="button" class="btn-icon-sm vale-quitar" title="Quitar"><i class="fa-solid fa-xmark"></i></button></td></tr>' +
              (i.surte === 'externo' ? '<tr class="vale-prov-fila" data-p="' + idx + '"><td colspan="5"><div class="vale-prov">' + PROV_CAMPOS.map(function (c) {
                return '<input class="form-input" data-pk="' + c[0] + '"' + (c[0] === 'hora' ? ' type="time"' : c[0] === 'telefono' ? ' type="tel"' : '') + ' placeholder="' + c[1] + '" title="' + c[1] + '" value="' + esc((i.prov || {})[c[0]]) + '">';
              }).join('') + '</div></td></tr>' : '')
            : '<tr><td><b>' + esc(i.cant) + '</b></td><td>' + esc(i.nombre) + (i.surte === 'externo' ? '<br><span class="vale-externo">' + esc(textoProveedor(i)) + '</span>' : '') + '</td><td>' + esc(i.nota) + '</td></tr>';
        }).join('');
    }).join('');

    var inventarioHtml = '';
    if (editar) {
      var f = norm(_filtro);
      inventarioHtml = agrupar((_inventario || []).filter(function (a) { return !f || norm(a.nombre + ' ' + a.categoria).indexOf(f) > -1; }))
        .map(function (grupo) {
          return '<div class="vale-inv-cat">' + esc(grupo.categoria) + '</div>' + grupo.items.map(function (a) {
            var dentro = v.items.some(function (i) { return i.id === a.id; });
            return '<button type="button" class="vale-inv-item' + (dentro ? ' dentro' : '') + '" data-id="' + a.id + '" title="' + esc(a.notas || '') + '">' +
              '<i class="fa-solid ' + (dentro ? 'fa-check' : 'fa-plus') + '"></i> ' + esc(a.nombre) +
              (a.existencia != null ? ' <small>(' + a.existencia + ')</small>' : '') + '</button>';
          }).join('');
        }).join('') || '<p class="vale-vacio">Sin resultados.</p>';
    }

    _modal.querySelector('.vale-modal').innerHTML =
      '<div class="venue-picker-head"><h2>Requisición de material · ' + esc(evento().nombre) + '</h2>' +
        '<button class="venue-picker-close" title="Cerrar"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<p class="vale-sub">' + v.items.length + ' artículos · ' + total + ' piezas' + (invitados() ? ' · ' + invitados() + ' invitados' : '') +
        (editar ? ' · Palomea en el inventario lo que se va a ocupar y escribe la cantidad de cada artículo.' : '') + '</p>' +
      '<div class="vale-acciones">' +
        (editar ? '<button type="button" class="event-btn" id="vale-inventario"><i class="fa-solid fa-list-check"></i> Imprimir requisición en blanco</button>' +
          '<button type="button" class="event-btn" id="vale-libre"><i class="fa-solid fa-pen"></i> Artículo que no está en inventario</button>' : '') +
        '<button type="button" class="event-btn active" id="vale-imprimir"><i class="fa-solid fa-dolly"></i> Generar vale de salida</button>' +
      '</div>' +
      '<div class="vale-cuerpo' + (editar ? '' : ' solo-lista') + '">' +
        (editar ? '<div class="vale-inv"><input class="form-input" id="vale-buscar" placeholder="Buscar en el inventario…" value="' + esc(_filtro) + '">' +
          '<div class="vale-inv-lista">' + inventarioHtml + '</div></div>' : '') +
        '<div class="vale-lista">' + (v.items.length
          ? '<table><thead><tr><th>Cant.</th><th>Artículo</th><th>Nota</th>' + (editar ? '<th>Surte</th><th></th>' : '') + '</tr></thead><tbody>' + lista + '</tbody></table>'
          : '<p class="vale-vacio">' + (editar ? 'Palomea en el inventario lo que vas a necesitar.' : 'Este evento todavía no tiene requisición de material.') + '</p>') +
        '</div>' +
      '</div>';

    var m = _modal;
    ['.vale-modal', '.vale-inv-lista', '.vale-lista'].forEach(function (sel, k) { var el = m.querySelector(sel); if (el) el.scrollTop = scrolls[k]; });
    if (_enfocar != null) {
      var fila = m.querySelector('tr[data-i="' + _enfocar + '"]');
      _enfocar = null;
      if (fila) {
        fila.classList.add('vale-nuevo');
        fila.scrollIntoView({ block: 'center' });
        var cant = fila.querySelector('.vale-cant');
        if (cant) cant.focus({ preventScroll: true });
      }
    }
    m.querySelector('.venue-picker-close').onclick = cerrar;
    m.querySelector('#vale-imprimir').onclick = imprimir;
    if (!editar) return;
    m.querySelector('#vale-inventario').onclick = imprimirInventario;
    m.querySelector('#vale-libre').onclick = function () {
      var nombre = prompt('Artículo que no está en el inventario (por ejemplo: Refresco Coca-Cola 2 L):');
      if (!nombre || !nombre.trim()) return;
      agregar({ nombre: nombre.trim(), categoria: 'Otros' }, '', 'manual');
      _enfocar = vale().items.length - 1;
      guardar();
      pintar();
    };
    var buscar = m.querySelector('#vale-buscar');
    buscar.oninput = function () {
      _filtro = buscar.value;
      var pos = buscar.selectionStart;
      pintar();
      var b = _modal.querySelector('#vale-buscar');
      b.focus();
      b.setSelectionRange(pos, pos);
    };
    Array.prototype.forEach.call(m.querySelectorAll('.vale-inv-item'), function (btn) {
      btn.onclick = function () {
        var art = _inventario.find(function (a) { return a.id === btn.getAttribute('data-id'); });
        var ya = v.items.find(function (i) { return i.id === art.id; });
        if (ya) v.items.splice(v.items.indexOf(ya), 1);
        else { agregar(art, '', 'manual'); _enfocar = v.items.length - 1; }
        guardar();
        pintar();
      };
    });
    Array.prototype.forEach.call(m.querySelectorAll('tr[data-i]'), function (tr) {
      var item = v.items[parseInt(tr.getAttribute('data-i'), 10)];
      tr.querySelector('.vale-cant').onchange = function (e) { item.cant = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0); guardar(); pintar(); };
      tr.querySelector('.vale-nota').onchange = function (e) { item.nota = e.target.value; guardar(); };
      tr.querySelector('.vale-quitar').onclick = function () { v.items.splice(v.items.indexOf(item), 1); guardar(); pintar(); };
      tr.querySelector('.vale-surte').onchange = function (e) {
        item.surte = e.target.value;
        if (item.surte && !item.prov) item.prov = {};
        guardar();
        pintar();
      };
    });
    Array.prototype.forEach.call(m.querySelectorAll('tr[data-p]'), function (tr) {
      var item = v.items[parseInt(tr.getAttribute('data-p'), 10)];
      Array.prototype.forEach.call(tr.querySelectorAll('[data-pk]'), function (el) {
        el.onchange = function () { item.prov = item.prov || {}; item.prov[el.getAttribute('data-pk')] = el.value; guardar(); };
      });
    });
  }

  // ── Vale impreso ───────────────────────────────────────────
  function imprimir() {
    var ev = evento(), v = vale();
    if (!v.items.length) { toast('La requisición está vacía: palomea primero lo que se va a ocupar.', 'warning'); return; }
    var sinCant = v.items.filter(function (i) { return i.cant === '' || i.cant == null; }).length;
    if (sinCant && !confirm(sinCant + ' artículos no tienen cantidad. ¿Imprimir así?')) return;
    var w = window.open('', '_blank');
    if (!w) { toast('El navegador bloqueó la ventana emergente. Permite las ventanas emergentes en este sitio.', 'error'); return; }
    var b = ev.data.brief || {};
    var url = PE().publicEventUrl ? PE().publicEventUrl(ev.id) : '';
    var qr = '';
    if (url && window.qrcode) {
      var q = window.qrcode(0, 'M');
      q.addData(url);
      q.make();
      qr = q.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
    }
    var fecha = b.fecha_evento ? new Date(b.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
    var lugar = b.venue_red || b.venue_externo || '';
    var logo = new URL('assets/logo-primavera.png', location.href).href;
    var cajas = PASOS.map(function () { return '<td class="caja"></td>'; }).join('');
    var n = 0;
    var dePEG = v.items.filter(function (i) { return i.surte !== 'externo'; });
    var externos = v.items.filter(function (i) { return i.surte === 'externo'; });
    var filas = agrupar(dePEG).map(function (grupo) {
      return '<tr class="grupo"><td colspan="' + (4 + PASOS.length) + '">' + esc(grupo.categoria) + '</td></tr>' + grupo.items.map(function (i) {
        n++;
        return '<tr><td class="num">' + n + '</td><td class="cant">' + esc(i.cant) + '</td><td>' + esc(i.nombre) +
          (i.nota ? ' <span class="nota">· ' + esc(i.nota) + '</span>' : '') + '</td>' + cajas + '<td class="caja"></td></tr>';
      }).join('');
    }).join('');

    var html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Vale de salida · ' + esc(ev.nombre) + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">' +
      '<style>:root{--pink:#F65C7A;--gold:#C9A96E;--ink:#1F1F1F;--gray:#6D6D6D;--line:#E2D9D0;--soft:#F8F6F4}' +
      '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      'html,body{background:#fff}body{font-family:Poppins,sans-serif;color:var(--ink);font-size:10px;margin:18px auto;max-width:1040px;padding:0 14px}' +
      'h1,h2{font-family:"Playfair Display",serif;margin:0}' +
      '.toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;color:var(--gray)}.toolbar button{background:var(--pink);color:#fff;border:0;border-radius:6px;padding:8px 14px;cursor:pointer}' +
      '.head{display:flex;align-items:center;gap:12px;padding-bottom:8px;border-bottom:2px solid var(--gold)}.head img{width:46px;height:46px;border-radius:50%;object-fit:cover}' +
      '.marca{font-family:"Playfair Display",serif;font-size:15px;color:var(--pink)}.sub{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}' +
      '.titulo{margin-left:auto;text-align:right}.titulo h1{font-size:17px}.titulo div{color:var(--gray)}.qr svg{width:64px;height:64px;display:block}' +
      '.datos{display:grid;grid-template-columns:2fr 1.4fr 1fr 1.4fr;gap:4px 14px;margin:10px 0}.datos div{border-bottom:1px solid var(--line);padding:3px 0}.datos b{font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);display:block}' +
      '.inst{background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:6px 10px;margin-bottom:8px;line-height:1.45}' +
      'table{width:100%;border-collapse:collapse}th{background:var(--ink);color:#fff;font-weight:500;padding:4px 5px;text-align:center;font-size:9px;line-height:1.2}th small{display:block;color:#EFE7E1;font-weight:400}' +
      'th.izq{text-align:left}td{border-bottom:1px solid var(--line);padding:3px 5px;vertical-align:middle}tr{break-inside:avoid}' +
      'tr.grupo td{background:#FAF2ED;font-weight:600;color:var(--pink);padding:4px 5px}td.num{color:var(--gray);width:22px}td.cant{font-weight:600;width:40px;text-align:center}' +
      'td.caja{width:62px;border-left:1px solid var(--line)}.nota{color:var(--gray)}' +
      'h2.externos{font-size:13px;color:var(--pink);margin:14px 0 6px}table.ext td{font-size:9.5px}td.centro{text-align:center}' +
      '.firmas{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:12px;break-inside:avoid}.firma{border:1px solid var(--line);border-radius:6px;padding:6px 8px;min-height:92px}' +
      '.firma b{display:block;color:var(--pink);font-size:10px}.firma span{display:block;color:var(--gray);font-size:8.5px;margin-bottom:12px}.firma i{display:block;border-top:1px solid var(--ink);margin-top:14px;padding-top:2px;font-style:normal;color:var(--gray);font-size:8px}' +
      '.obs{border:1px solid var(--line);border-radius:6px;padding:6px 8px;min-height:50px;margin-top:8px;break-inside:avoid}.obs b{color:var(--gray)}' +
      '.footer{margin-top:10px;padding-top:6px;border-top:1px solid var(--gold);font-size:8px;color:var(--gray);text-align:center}' +
      '@media print{.toolbar{display:none}body{margin:0;max-width:none}@page{size:letter landscape;margin:1cm}thead{display:table-header-group}}</style></head><body>' +
      '<div class="toolbar"><span>Vista previa · Vale de salida</span><button onclick="window.print()">Imprimir / Guardar PDF</button></div>' +
      '<header class="head"><img src="' + esc(logo) + '" alt="Primavera Events Group"><div><div class="marca">Primavera Events Group®</div><div class="sub">Control de mobiliario</div></div>' +
        '<div class="titulo"><h1>Vale de salida y regreso</h1><div>Folio PEG-' + esc(ev.id.slice(0, 6).toUpperCase()) + ' · Emitido ' + esc(new Date().toLocaleDateString('es-MX')) + '</div></div>' +
        (qr ? '<div class="qr">' + qr + '</div>' : '') + '</header>' +
      '<section class="datos"><div><b>Evento</b>' + esc(ev.nombre) + '</div><div><b>Fecha</b>' + esc(fecha || '______________') + '</div>' +
        '<div><b>Personas</b>' + esc(b.invitados || '____') + '</div><div><b>Locación</b>' + esc(lugar || '______________') + '</div></section>' +
      '<div class="inst"><b>Cómo se usa:</b> la columna Solicitado viene de la requisición de material. Cada persona cuenta en su columna y anota la cantidad que recibe. Si su número no coincide con el de la columna anterior, lo anota en Observaciones antes de firmar. ' +
        'Al regresar a bodega se marca la condición: <b>B</b> bien · <b>D</b> dañado · <b>F</b> faltante.</div>' +
      '<table><thead><tr><th>#</th><th>Solicitado</th><th class="izq">Artículo</th>' +
        PASOS.map(function (p) { return '<th>' + p.n + '. ' + p.titulo + '<small>' + p.quien + '</small></th>'; }).join('') +
        '<th>Condición<small>B / D / F</small></th></tr></thead><tbody>' + (filas || '<tr><td colspan="' + (4 + PASOS.length) + '">Todo lo surte un proveedor externo.</td></tr>') + '</tbody></table>' +
      (externos.length ? '<h2 class="externos">Lo surte un proveedor externo (no pasa por bodega)</h2><table class="ext"><thead><tr><th>#</th><th>Solicitado</th><th class="izq">Artículo</th><th class="izq">Proveedor y teléfono</th><th>Hora</th><th>Entrega</th><th>Recibe (firma)</th><th>Cant. recibida</th></tr></thead><tbody>' +
        externos.map(function (i) {
          n++;
          var p = i.prov || {};
          var hora = p.hora && PE().hora12 ? PE().hora12(p.hora) : (p.hora || '');
          return '<tr><td class="num">' + n + '</td><td class="cant">' + esc(i.cant) + '</td><td>' + esc(i.nombre) + (i.nota ? ' <span class="nota">· ' + esc(i.nota) + '</span>' : '') + '</td>' +
            '<td>' + esc(p.nombre || '') + (p.telefono ? '<br>' + esc(p.telefono) : '') + '</td><td class="centro">' + esc(hora) + '</td><td>' + esc(p.entrega || '') + '</td><td>' + esc(p.recibe || '') + '</td><td class="caja"></td></tr>';
        }).join('') + '</tbody></table>' : '') +
      '<section class="firmas">' + PASOS.map(function (p) {
        return '<div class="firma"><b>' + p.n + '. ' + p.titulo + '</b><span>' + p.quien + '</span><i>Nombre y firma</i><i>Fecha y hora</i></div>';
      }).join('') + '</section>' +
      '<div class="obs"><b>Observaciones (diferencias, daños, faltantes):</b></div>' +
      '<footer class="footer">Primavera Events Group® · Documento de control interno de mobiliario · No es comprobante fiscal</footer></body></html>';
    w.document.open();
    w.document.write(html);
    w.document.close();
  }


  // ── Requisición de material en blanco ─────────────────────
  // Todo el inventario de PEG: el planner marca lo que ocupa y anota la cantidad
  function imprimirInventario() {
    var w = window.open('', '_blank');
    if (!w) { toast('El navegador bloqueó la ventana emergente. Permite las ventanas emergentes en este sitio.', 'error'); return; }
    var ev = evento(), b = ev ? ev.data.brief || {} : {};
    var fecha = b.fecha_evento ? new Date(b.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    var logo = new URL('assets/logo-primavera.png', location.href).href;
    var grupos = agrupar(_inventario || []).map(function (g) {
      return '<section class="grupo"><h3>' + esc(g.categoria) + '</h3>' + g.items.map(function (a) {
        return '<div class="art"><span class="caja"></span><span class="nom">' + esc(a.nombre) + '</span><span class="cant"></span></div>';
      }).join('') + '</section>';
    }).join('');
    var libres = '';
    for (var i = 0; i < 8; i++) libres += '<div class="art"><span class="caja"></span><span class="nom linea"></span><span class="cant"></span></div>';

    var html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Requisición de material</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">' +
      '<style>:root{--pink:#F65C7A;--gold:#C9A96E;--ink:#1F1F1F;--gray:#6D6D6D;--line:#E2D9D0}' +
      '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      'html,body{background:#fff}body{font-family:Poppins,sans-serif;color:var(--ink);font-size:9.5px;margin:18px auto;max-width:800px;padding:0 14px}' +
      'h1,h3{font-family:"Playfair Display",serif;margin:0}' +
      '.toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;color:var(--gray)}.toolbar button{background:var(--pink);color:#fff;border:0;border-radius:6px;padding:8px 14px;cursor:pointer}' +
      '.head{display:flex;align-items:center;gap:12px;padding-bottom:8px;border-bottom:2px solid var(--gold)}.head img{width:44px;height:44px;border-radius:50%;object-fit:cover}' +
      '.marca{font-family:"Playfair Display",serif;font-size:15px;color:var(--pink)}.sub{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}' +
      '.titulo{margin-left:auto;text-align:right}.titulo h1{font-size:16px}.titulo div{color:var(--gray)}' +
      '.datos{display:grid;grid-template-columns:2fr 1fr 1fr 1.4fr;gap:4px 14px;margin:10px 0}.datos div{border-bottom:1px solid var(--line);padding:3px 0;min-height:30px}.datos b{font-size:7.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);display:block}' +
      '.inst{color:var(--gray);margin-bottom:8px}' +
      '.cols{column-count:2;column-gap:22px}.grupo{break-inside:auto;margin-bottom:8px}' +
      '.grupo h3{font-size:11px;color:var(--pink);border-bottom:1px solid var(--gold);padding-bottom:1px;margin-bottom:2px;break-after:avoid}' +
      '.art{display:flex;align-items:center;gap:6px;padding:2px 0;border-bottom:1px dotted var(--line);break-inside:avoid}' +
      '.caja{width:10px;height:10px;border:1px solid var(--ink);border-radius:2px;flex:none}.nom{flex:1}.nom.linea{border-bottom:1px solid var(--gray);height:11px}' +
      '.cant{width:52px;border-bottom:1px solid var(--gray);height:11px;flex:none}' +
      '.firma{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:22px;break-inside:avoid}.firma div{border-top:1px solid var(--ink);padding-top:3px;color:var(--gray)}' +
      '.footer{margin-top:12px;padding-top:6px;border-top:1px solid var(--gold);font-size:8px;color:var(--gray);text-align:center}' +
      '@media print{.toolbar{display:none}body{margin:0;max-width:none}@page{size:letter;margin:1cm}}</style></head><body>' +
      '<div class="toolbar"><span>Vista previa · Requisición de material</span><button onclick="window.print()">Imprimir / Guardar PDF</button></div>' +
      '<header class="head"><img src="' + esc(logo) + '" alt="Primavera Events Group"><div><div class="marca">Primavera Events Group®</div><div class="sub">Inventario de mobiliario y suministros</div></div>' +
        '<div class="titulo"><h1>Requisición de material</h1><div>' + (_inventario || []).length + ' artículos</div></div></header>' +
      '<section class="datos"><div><b>Evento</b>' + esc(ev ? ev.nombre : '') + '</div><div><b>Fecha</b>' + esc(fecha) + '</div>' +
        '<div><b>Personas</b>' + esc(b.invitados || '') + '</div><div><b>Planner</b></div></section>' +
      '<p class="inst">Marca con ✓ lo que se va a ocupar y escribe la cantidad en la línea. Lo que no esté en la lista, anótalo en "Otros" al final.</p>' +
      '<div class="cols">' + grupos + '<section class="grupo"><h3>Otros (no está en el inventario)</h3>' + libres + '</section></div>' +
      '<div class="firma"><div>Nombre y firma del planner</div><div>Fecha</div></div>' +
      '<footer class="footer">Primavera Events Group® · Documento de control interno</footer></body></html>';
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // Lista para la ficha técnica del coordinador
  function filasFicha() {
    var ev = evento();
    var items = ev && ev.data.vale ? ev.data.vale.items : [];
    if (!items.length) return '';
    return agrupar(items).map(function (g) {
      return '<tr><td colspan="3"><strong>' + esc(g.categoria) + '</strong></td></tr>' + g.items.map(function (i) {
        return '<tr><td style="width:10%"><strong>' + esc(i.cant) + '</strong></td><td>' + esc(i.nombre) + '</td><td style="width:38%">' + esc(i.nota) +
          (i.surte === 'externo' ? (i.nota ? '<br>' : '') + 'Lo surte: ' + esc(textoProveedor(i)) : '') + '</td></tr>';
      }).join('');
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('btn-vale');
    if (btn) btn.onclick = abrir;
  });

  window.PEGVale = { abrir: abrir, imprimir: imprimir, imprimirInventario: imprimirInventario, filasFicha: filasFicha };
})();
