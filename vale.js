// ============================================================
// vale.js — Requisición de material y vale de salida
// 1. Requisición: el planner palomea del inventario completo de PEG lo que necesita
//    (en la app o en la versión impresa en blanco).
// 2. Vale de salida: se genera de la requisición y lo cuentan bodega, chofer y coordinador.
// Se guarda en el evento: data.vale = {
//   items: [{ id, nombre, categoria, cant, nota, origen, surte, prov }],        ← artículos
//   servicios: [{ nombre, surte, nota, prov: { nombre, telefono, llega, inicia, termina, recibe } }] ← DJ, pista, cabinas…
// }
// surte: '' = Bodega PEG · 'externo' = proveedor externo que contrata PEG · 'cliente' = proveedor externo del cliente
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

  // Quién surte cada cosa (artículos y servicios)
  var SURTE = [
    { v: '', corto: 'B', label: 'Bodega PEG' },
    { v: 'externo', corto: 'P', label: 'Proveedor externo · lo contrata PEG' },
    { v: 'cliente', corto: 'C', label: 'Proveedor externo · lo contrata el cliente' }
  ];
  function textoSurte(v) {
    var s = SURTE.find(function (x) { return x.v === (v || ''); });
    return s ? s.label : 'Por definir';
  }
  function surteOpciones(actual, conPendiente) {
    return (conPendiente ? '<option value="?"' + (actual == null ? ' selected' : '') + '>— ¿Quién lo surte? —</option>' : '') +
      SURTE.map(function (s) { return '<option value="' + s.v + '"' + (actual === s.v || (!conPendiente && !actual && !s.v) ? ' selected' : '') + '>' + s.label + '</option>'; }).join('');
  }

  // Datos del proveedor de un artículo externo
  var PROV_CAMPOS = [["nombre","Proveedor (nombre)"],["telefono","Teléfono"],["hora","Hora de llegada"],["entrega","Quién entrega"],["recibe","Quién recibe en locación"]];
  // Datos del proveedor de un servicio (DJ, pista, cabina…)
  var SERV_CAMPOS = [["nombre","Proveedor (nombre)"],["telefono","Teléfono"],["llega","Llega / instala","time"],["inicia","Inicia","time"],["termina","Termina","time"],["recibe","Quién lo recibe en locación"]];

  function hora12(h) { return h && PE() && PE().hora12 ? PE().hora12(h) : (h || ''); }

  // "Hielo Polar · 777 123 4567 · 4:00 PM · entrega Juan · recibe capitán"
  function textoProveedor(i) {
    var p = i.prov || {};
    return [p.nombre || 'Proveedor externo', p.telefono, hora12(p.hora), p.entrega && 'entrega ' + p.entrega, p.recibe && 'recibe ' + p.recibe].filter(Boolean).join(' · ');
  }
  function textoServicio(s) {
    var p = s.prov || {};
    return [textoSurte(s.surte), p.nombre, p.telefono, p.llega && 'llega ' + hora12(p.llega), p.inicia && 'inicia ' + hora12(p.inicia),
      p.termina && 'termina ' + hora12(p.termina), p.recibe && 'recibe ' + p.recibe].filter(Boolean).join(' · ');
  }

  // ── Servicios y equipo del evento (lo que no sale del inventario de bodega) ──
  // Nombre único para no repetir el mismo servicio que viene del brief, de los proveedores y del plano
  var CANON = [
    ['DJ', /(^|\W)dj(\W|$)|dj_booth/], ['Pista de baile', /pista|dancefloor/], ['Cabina inflable', /inflable|photobooth_inflatable/],
    ['Cabina 360°', /360/], ['Espejo selfie', /espejo|photobooth_mirror/], ['Magazine Cover Booth', /magazine/], ['Robot LED', /robot/],
    ['Show men (cabezones)', /show ?men|cabezones|showmen/], ['Chisperos', /chispero|sparklers|detonacion/], ['Mariachi', /mariachi/],
    ['Saxofonista', /saxo/], ['Grupo norteño', /norteno/], ['Grupo versátil', /versatil/], ['Chinelos', /chinelo/], ['Banda', /(^| )banda( |$)|vendor_banda/], ['Fotografía y video', /fotografia|foto y video/], ['Pantalla / proyección', /pantalla|projector|laser/]
  ];
  function canon(texto) {
    var t = norm(texto);
    var c = CANON.find(function (x) { return x[1].test(t); });
    return c ? c[0] : null;
  }
  // Amenidades que son artículos de bodega (van en la lista de artículos, no aquí)
  var AMENIDAD_DE_BODEGA = /letra|corazon|alfombra|back redondo|porteria|numeros de mesa/;
  var SERVICIOS_CON_PROVEEDOR = ['Valet parking', 'Transporte / Limusinas', 'Maquillaje y peinado', 'Diseño floral', 'Servicios de emergencia / salud',
    'Tequila personalizado Don Ramón', 'Souvenirs personalizados', 'Merchandising Store'];
  var TIPOS_SERVICIO = /^(dancefloor|dj_booth|photobooth_|robot_led|showmen_inflatables|sparklers|projector_screen|vendor_|limo)/;

  function sugerirServicios(ev) {
    var d = ev.data || {}, b = d.brief || {}, lista = [];
    function sumar(nombre, extra) {
      if (!nombre) return;
      var c = canon(nombre), key = norm(c || nombre);
      var ya = lista.find(function (s) { return s._key === key; });
      if (!ya) { ya = { _key: key, nombre: c || nombre, surte: null, nota: '', prov: {} }; lista.push(ya); }
      if (extra) {
        if (ya.surte == null && extra.surte != null) ya.surte = extra.surte;
        Object.keys(extra.prov || {}).forEach(function (k) { if (!ya.prov[k] && extra.prov[k]) ya.prov[k] = extra.prov[k]; });
      }
    }
    // 1) Proveedores externos del brief (traen nombre, teléfono y horarios)
    (d.proveedores || []).forEach(function (p) {
      var contrata = norm(p.contrata);
      sumar(p.servicio && p.servicio !== 'Otro' ? p.servicio : p.nombre, {
        surte: /peg|primavera/.test(contrata) ? 'externo' : /cliente|anfitri/.test(contrata) ? 'cliente' : null,
        prov: { nombre: p.servicio && p.servicio !== 'Otro' ? p.nombre : '', telefono: p.telefono, llega: p.llegada, inicia: p.inicio, termina: p.fin, recibe: p.recibe }
      });
    });
    // 2) Amenidades y servicios marcados en el brief: las amenidades del paquete las surte PEG
    (b.amenidades || []).forEach(function (a) { if (!AMENIDAD_DE_BODEGA.test(norm(a))) sumar(a, { surte: '' }); });
    (b.servicios || []).forEach(function (s) { if (SERVICIOS_CON_PROVEEDOR.indexOf(s) > -1) sumar(s); });
    // 3) Lo que está dibujado en el plano
    ((d.layout && d.layout.elements) || []).forEach(function (e) { if (TIPOS_SERVICIO.test(e.type || '')) sumar(canon(e.type) || e.name, /^vendor_|^limo/.test(e.type) ? null : { surte: '' }); });
    return lista.map(function (s) { delete s._key; return s; });
  }
  function servicios() {
    var v = vale();
    if (!v) return [];
    if (!Array.isArray(v.servicios)) v.servicios = sugerirServicios(evento());
    return v.servicios;
  }

  function serviciosFicha() {
    var ev = evento();
    if (!ev) return [];
    var deProveedores = (ev.data.proveedores || []).map(function (p) {
      var n = p.servicio && p.servicio !== 'Otro' ? p.servicio : p.nombre;
      return norm(canon(n) || n);
    });
    return servicios().filter(function (s) { return deProveedores.indexOf(norm(s.nombre)) < 0; }).map(function (s) {
      return { nombre: s.nombre, surte: s.surte == null ? 'Por definir quién lo surte' : s.surte === '' ? 'PEG' : textoSurte(s.surte), prov: s.prov || {}, nota: s.nota || '' };
    });
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
  // Guarda en el plano el modelo elegido (p. ej. madera miel) para que salga en el croquis y la ficha
  function guardarEleccionEnPlano(nombreElegir, articulo) {
    var C = window.PEGCalculo, app = window.App;
    var regla = C && C.ELEGIR_EN_PLANO && C.ELEGIR_EN_PLANO[nombreElegir];
    if (!regla || !app || !app.getState) return 0;
    var els = app.getState().elements.filter(regla.filtro);
    els.forEach(function (e) {
      var inv = Object.assign({}, e.inventario || {});
      inv[regla.clave] = articulo;
      var cambios = { inventario: inv };
      var color = regla.clave === 'mesa' && C.colorMadera(articulo);
      if (color) cambios.color = color;
      app.updateElement(e.id, cambios);
    });
    return els.length;
  }
  // Lo que no cuadra entre plano, requisición y minuto (para la ventana y la ficha)
  function diferencias() {
    var ev = evento(), app = window.App;
    if (!ev || !window.PEGCalculo || !app || !app.getState) return [];
    var els = app.getState().elements;
    var out = window.PEGCalculo.diferencias(ev, els);
    // Cantidades que alguien cambió en la requisición y ya no son las del plano
    var v = ev.data.vale;
    if (v && v.items && v.items.length && _inventario) {
      var calc = calculoItems(ev).items;
      v.items.forEach(function (i) {
        if (!i.id || i.origen === 'calculo' || i.cant === '' || i.cant == null) return;
        var c = calc.find(function (x) { return x.id === i.id; });
        if (c && c.cant !== '' && parseInt(c.cant, 10) !== parseInt(i.cant, 10)) {
          out.push({ texto: i.nombre + ': la requisición dice ' + i.cant + ' y el plano da ' + c.cant + '. Corrige el plano (mesas, sillas o montaje) o confirma la cantidad.' });
        }
      });
    }
    return out;
  }
  function agregarAlPlano(tipo) {
    var app = window.App;
    if (!app || !app.addElement) return;
    var els = app.getState().elements;
    var salon = els.find(function (e) { return e.type === 'salon' || e.type === 'salon_carpa'; });
    var t = app.getState().terrain || { w: 40, h: 40 };
    var el = app.addElement(tipo, salon ? salon.x : t.w / 2, salon ? salon.y : t.h / 2);
    if (el) toast('Agregado al centro del salón: muévelo a su lugar en el plano.', 'success');
  }
  function cuadre() {
    var inv = invitados(), app = window.App;
    if (!inv || !app || !app.getState || !window.PEGCalculo) return '';
    var t = window.PEGCalculo.lugares(app.getState().elements, inv).total;
    return t === inv ? '' : t + ' lugares → ' + inv;
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
  // Requisición calculada desde el plano, el menú y las amenidades (calculo-requisicion.js).
  // Recalcular solo reemplaza lo calculado; lo que alguien ajustó a mano o agregó se respeta.
  function calculoItems(ev) {
    var r = window.PEGCalculo ? window.PEGCalculo.calcular(ev) : { items: [], pendientes: [] };
    var porId = {};
    r.items = r.items.reduce(function (lista, i) {
      var opciones = (i.opciones || []).map(buscarArticulo).filter(Boolean).map(function (a) { return { id: a.id, nombre: a.nombre }; });
      if (opciones.length > 1) {
        lista.push({ id: null, nombre: i.nombre, categoria: i.categoria, cant: i.cant, nota: i.nota || '', origen: 'calculo', opciones: opciones });
        return lista;
      }
      var art = [i.nombre].concat(i.alt || []).map(buscarArticulo).find(Boolean) || (opciones[0] ? buscarArticulo(opciones[0].nombre) : null);
      var nota = i.nota || '';
      // Servilleta de un color que no está en el inventario: va como servilleta de tela con el color en la nota
      // (con la cantidad de cada color, para que bodega sepa cuántas de cada una)
      if (!art && /^Servilleta /.test(i.nombre)) { art = buscarArticulo('Servilleta de tela'); nota = i.cant + ' ' + i.nombre.replace(/^Servilleta /, '') + (nota ? ' (' + nota + ')' : ''); }
      var it = { id: art ? art.id : null, nombre: art ? art.nombre : i.nombre, categoria: art ? art.categoria : i.categoria, cant: i.cant, nota: nota, origen: 'calculo' };
      var ya = it.id && porId[it.id];
      if (ya) { ya.cant = (parseInt(ya.cant, 10) || 0) + (parseInt(it.cant, 10) || 0); ya.nota = [ya.nota, it.nota].filter(Boolean).join(' · '); return lista; }
      if (it.id) porId[it.id] = it;
      lista.push(it);
      return lista;
    }, []);
    return r;
  }
  function calcularDesdeEvento() {
    var ev = evento(), v = vale();
    var r = calculoItems(ev);
    v.items = v.items.filter(function (i) { return i.origen !== 'calculo'; });
    r.items.forEach(function (it) {
      var ya = v.items.some(function (i) { return it.id ? i.id === it.id : norm(i.nombre) === norm(it.nombre); });
      if (!ya) v.items.push(it);
    });
    var porElegir = v.items.filter(function (i) { return i.opciones && i.opciones.length; });
    v.pendientes = r.pendientes.concat(porElegir.map(function (i) { return 'Elegir uno: ' + i.nombre + ' — ' + i.cant + ' pz (' + i.opciones.map(function (o) { return o.nombre; }).join(' / ') + ').'; }));
    v.calculado = new Date().toISOString();
    guardar();
    return r;
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
    cargarInventario().then(function () {
      var v = vale();
      if (esPlanner() && !v.calculado && !v.items.length) calcularDesdeEvento();
      pintar();
    }).catch(function (err) {
      _modal.querySelector('.vale-modal').innerHTML = '<p>No se pudo cargar el inventario: ' + esc(err.message || err) + '</p>';
    });
  }
  function cerrar() { if (_modal) _modal.remove(); if (PE() && PE().guardarPendiente) PE().guardarPendiente(); }

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
              '<td>' + (i.opciones && i.opciones.length
                ? '<select class="form-input vale-elegir" title="Elige cuál se va a ocupar"><option value="">' + esc(i.nombre) + ' — elegir uno…</option>' +
                  i.opciones.map(function (o, k) { return '<option value="' + k + '">' + esc(o.nombre) + '</option>'; }).join('') + '</select>'
                : esc(i.nombre)) +
                (i.origen === 'plano' ? ' <span class="vale-tag">plano</span>' : i.origen === 'calculo' ? ' <span class="vale-tag">calculado</span>' : '') + '</td>' +
              '<td><input class="form-input vale-nota" placeholder="Color, medida…" value="' + esc(i.nota) + '"></td>' +
              '<td><select class="form-input vale-surte" title="Quién lo surte">' + surteOpciones(i.surte || '') + '</select></td>' +
              '<td><button type="button" class="btn-icon-sm vale-quitar" title="Quitar"><i class="fa-solid fa-xmark"></i></button></td></tr>' +
              (i.surte ? '<tr class="vale-prov-fila" data-p="' + idx + '"><td colspan="5"><div class="vale-prov">' + PROV_CAMPOS.map(function (c) {
                return '<label class="vale-campo"><span>' + c[1] + '</span><input class="form-input" data-pk="' + c[0] + '"' + (c[0] === 'hora' ? ' type="time"' : c[0] === 'telefono' ? ' type="tel"' : '') + ' value="' + esc((i.prov || {})[c[0]]) + '"></label>';
              }).join('') + '</div></td></tr>' : '')
            : '<tr><td><b>' + esc(i.cant) + '</b></td><td>' + esc(i.nombre) + '<br><span class="vale-externo">Surte: ' + esc(textoSurte(i.surte)) + (i.surte ? ' · ' + esc(textoProveedor(i)) : '') + '</span></td><td>' + esc(i.nota) + '</td></tr>';
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

    // Servicios y equipo: cada uno con quién lo surte, proveedor, teléfono y horarios
    var servs = servicios();
    var pendientes = servs.filter(function (s) { return s.surte == null; }).length;
    var serviciosHtml = servs.map(function (s, k) {
      var p = s.prov || {};
      if (!editar) {
        return '<div class="vale-serv"><b>' + esc(s.nombre) + '</b><span class="vale-externo">' + esc(textoServicio(s)) + '</span>' + (s.nota ? '<span>' + esc(s.nota) + '</span>' : '') + '</div>';
      }
      return '<div class="vale-serv' + (s.surte == null ? ' sin-definir' : '') + '" data-s="' + k + '">' +
        '<div class="vale-serv-head"><input class="form-input" data-sk="nombre" value="' + esc(s.nombre) + '" title="Servicio o equipo">' +
          '<select class="form-input" data-sk="surte" title="Quién lo surte">' + surteOpciones(s.surte, true) + '</select>' +
          '<button type="button" class="btn-icon-sm vale-serv-quitar" title="Quitar"><i class="fa-solid fa-xmark"></i></button></div>' +
        (s.surte ? '<div class="vale-prov vale-prov-serv">' + SERV_CAMPOS.map(function (c) {
          return '<label class="vale-campo"><span>' + c[1] + '</span><input class="form-input" data-spk="' + c[0] + '"' + (c[2] ? ' type="' + c[2] + '"' : c[0] === 'telefono' ? ' type="tel"' : '') + ' value="' + esc(p[c[0]]) + '"></label>';
        }).join('') + '</div>' : s.surte === '' ? '<div class="vale-prov vale-prov-serv">' + SERV_CAMPOS.filter(function (c) { return c[0] !== 'nombre' && c[0] !== 'telefono'; }).map(function (c) {
          return '<label class="vale-campo"><span>' + c[1] + '</span><input class="form-input" data-spk="' + c[0] + '"' + (c[2] ? ' type="' + c[2] + '"' : '') + ' value="' + esc(p[c[0]]) + '"></label>';
        }).join('') + '</div>' : '') +
        '<input class="form-input vale-serv-nota" data-sk="nota" placeholder="Nota (medidas, color, requerimientos: luz, espacio…)" value="' + esc(s.nota) + '">' +
      '</div>';
    }).join('');

    _modal.querySelector('.vale-modal').innerHTML =
      '<div class="venue-picker-head"><h2>Requisición de material · ' + esc(evento().nombre) + '</h2>' +
        '<button class="venue-picker-close" title="Cerrar"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<p class="vale-sub">' + v.items.length + ' artículos · ' + total + ' piezas · ' + servs.length + ' servicios' + (invitados() ? ' · ' + invitados() + ' invitados' : '') +
        (evento().data.brief && evento().data.brief.planner ? ' · Planner: ' + esc(evento().data.brief.planner) : '') +
        (editar ? ' · Palomea en el inventario lo que se va a ocupar, escribe la cantidad y define quién surte cada cosa.' : '') + '</p>' +
      '<section class="vale-servicios"><div class="vale-servicios-head"><h3>Servicios y equipo del evento</h3>' +
        (editar ? '<button type="button" class="event-btn" id="vale-serv-traer"><i class="fa-solid fa-rotate"></i> Traer del brief y del plano</button>' +
          '<button type="button" class="event-btn" id="vale-serv-agregar"><i class="fa-solid fa-plus"></i> Agregar servicio</button>' : '') + '</div>' +
        '<p class="vale-sub">DJ, pista de baile, cabinas, música en vivo… Lo que no sale de bodega: define quién lo surte, el proveedor, su teléfono, a qué hora llega o se instala y quién lo recibe.' +
          (pendientes ? ' <b class="vale-alerta">' + pendientes + (pendientes === 1 ? ' servicio no tiene' : ' servicios no tienen') + ' quién lo surte.</b>' : '') + '</p>' +
        (servs.length ? '<div class="vale-servicios-lista">' + serviciosHtml + '</div>' : '<p class="vale-vacio">Sin servicios registrados.</p>') +
      '</section>' +
      (function () {
        var dif = diferencias();
        return dif.length ? '<div class="vale-pendientes vale-diferencias"><b><i class="fa-solid fa-scale-unbalanced"></i> No cuadra entre plano, requisición y minuto</b><ul>' +
          dif.map(function (x, k) {
            return '<li>' + esc(x.texto) + (editar && x.agregar ? ' <button type="button" class="event-btn vale-agregar-plano" data-tipo="' + esc(x.agregar) + '">Agregar al plano</button>' : '') + '</li>';
          }).join('') + '</ul></div>' : '';
      })() +
      (function () {
        var pend = pendientesActuales(evento(), v);
        return pend.length ? '<div class="vale-pendientes"><b><i class="fa-solid fa-circle-exclamation"></i> Falta definir</b><ul>' +
          pend.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></div>' : '';
      })() +
      '<div class="vale-acciones">' +
        (editar && cuadre() ? '<button type="button" class="event-btn" id="vale-cuadrar" title="Quita o agrega sillas en las mesas del plano (empezando por la mesa 1, de 8 a 12 por mesa) para que los lugares sean exactamente los invitados"><i class="fa-solid fa-chair"></i> Cuadrar sillas con invitados (' + cuadre() + ')</button>' : '') +
        (editar ? '<button type="button" class="event-btn" id="vale-calcular" title="Calcula loza, cubiertos, cristalería, mantelería, sillas, mesas y arreglos desde el plano, el menú y las amenidades"><i class="fa-solid fa-calculator"></i> Calcular desde el evento</button>' : '') +
        (editar ? '<button type="button" class="event-btn" id="vale-inventario"><i class="fa-solid fa-list-check"></i> Imprimir requisición para llenar a mano</button>' +
          '<button type="button" class="event-btn" id="vale-libre"><i class="fa-solid fa-pen"></i> Artículo que no está en inventario</button>' : '') +
        '<button type="button" class="event-btn active" id="vale-imprimir"><i class="fa-solid fa-dolly"></i> Generar vale de salida</button>' +
        (editar ? '<button type="button" class="event-btn btn-guardar" data-guardar="1" title="Guarda los cambios en la base de datos"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>' : '') +
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
    m.querySelector('[data-guardar]').onclick = function () { if (PE() && PE().guardarAhora) PE().guardarAhora(); };
    Array.prototype.forEach.call(m.querySelectorAll('.vale-agregar-plano'), function (btn) {
      btn.onclick = function () { agregarAlPlano(btn.getAttribute('data-tipo')); calcularDesdeEvento(); pintar(); };
    });
    var btnCuadrar = m.querySelector('#vale-cuadrar');
    if (btnCuadrar) btnCuadrar.onclick = function () {
      var app = window.App, inv = invitados();
      if (!app || !app.getState || !window.PEGCalculo) return;
      var r = window.PEGCalculo.cuadrar(app.getState().elements, inv);
      if (!r.cambios.length) { toast('No se pudo cuadrar: las mesas ya están en el mínimo (8) o máximo (12) de sillas.', 'warning'); return; }
      if (!confirm('Se ajustarán las sillas en el plano:\n' + r.cambios.map(function (c) { return 'Mesa ' + (c.mesa || '?') + ': ' + c.antes + ' → ' + c.despues; }).join('\n') +
        (r.falta ? '\n\nAun así ' + (r.falta > 0 ? 'sobran ' + r.falta : 'faltan ' + (-r.falta)) + ' lugares: hay que cambiar el número de mesas.' : '') + '\n\n¿Continuar?')) return;
      r.cambios.forEach(function (c) { app.updateElement(c.id, { chairs: c.despues }); });
      calcularDesdeEvento();
      guardar();
      toast('Sillas cuadradas con ' + inv + ' invitados. Falta definir quién va en cada mesa (lista de invitados).', 'success');
      pintar();
    };
    m.querySelector('#vale-calcular').onclick = function () {
      var r = calcularDesdeEvento();
      toast('Requisición calculada: ' + r.items.length + ' artículos' + (r.pendientes.length ? ' · ' + r.pendientes.length + ' cosas por definir' : ''), 'success');
      pintar();
    };
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
      tr.querySelector('.vale-cant').onchange = function (e) { if (item.origen === 'calculo') item.origen = 'ajustado'; item.cant = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0); guardar(); pintar(); };
      var elegir = tr.querySelector('.vale-elegir');
      if (elegir) elegir.onchange = function () {
        var o = item.opciones[parseInt(elegir.value, 10)];
        if (!o) return;
        var enPlano = guardarEleccionEnPlano(item.nombre, o.nombre);
        var art = (_inventario || []).find(function (a) { return a.id === o.id; }) || o;
        item.id = o.id; item.nombre = o.nombre; item.categoria = art.categoria || item.categoria; item.origen = 'ajustado';
        delete item.opciones;
        var v = vale();
        if (v.pendientes) v.pendientes = v.pendientes.filter(function (p) { return p.indexOf('Elegir uno: ') !== 0 || v.items.some(function (x) { return x.opciones && p.indexOf(x.nombre) > -1; }); });
        guardar(); pintar();
        if (enPlano) toast(o.nombre + ': se guardó en ' + enPlano + (enPlano === 1 ? ' elemento' : ' elementos') + ' del plano.', 'success');
      };
      tr.querySelector('.vale-nota').onchange = function (e) { if (item.origen === 'calculo') item.origen = 'ajustado'; item.nota = e.target.value; guardar(); };
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
    // Servicios
    m.querySelector('#vale-serv-agregar').onclick = function () {
      var nombre = prompt('Servicio o equipo (por ejemplo: Pista de baile, DJ, Cabina inflable):');
      if (!nombre || !nombre.trim()) return;
      servs.push({ nombre: nombre.trim(), surte: null, nota: '', prov: {} });
      guardar();
      pintar();
    };
    m.querySelector('#vale-serv-traer').onclick = function () {
      var antes = servs.length;
      sugerirServicios(evento()).forEach(function (s) {
        var key = norm(s.nombre);
        if (!servs.some(function (x) { return norm(canon(x.nombre) || x.nombre) === key; })) servs.push(s);
      });
      toast(servs.length - antes ? (servs.length - antes) + ' servicios agregados del brief y del plano.' : 'No hay servicios nuevos en el brief ni en el plano.', 'info');
      guardar();
      pintar();
    };
    Array.prototype.forEach.call(m.querySelectorAll('.vale-serv[data-s]'), function (box) {
      var s = servs[parseInt(box.getAttribute('data-s'), 10)];
      box.querySelector('.vale-serv-quitar').onclick = function () { servs.splice(servs.indexOf(s), 1); guardar(); pintar(); };
      Array.prototype.forEach.call(box.querySelectorAll('[data-sk]'), function (el) {
        el.onchange = function () {
          var k = el.getAttribute('data-sk');
          s[k] = k === 'surte' ? (el.value === '?' ? null : el.value) : el.value;
          guardar();
          if (k === 'surte') pintar();
        };
      });
      Array.prototype.forEach.call(box.querySelectorAll('[data-spk]'), function (el) {
        el.onchange = function () { s.prov = s.prov || {}; s.prov[el.getAttribute('data-spk')] = el.value; guardar(); };
      });
    });
  }

  // ── Vale impreso ───────────────────────────────────────────
  function imprimir() {
    var ev = evento(), v = vale();
    var servs = servicios();
    if (!v.items.length && !servs.length) { toast('La requisición está vacía: palomea primero lo que se va a ocupar.', 'warning'); return; }
    var sinSurte = servs.filter(function (s) { return s.surte == null; }).length;
    if (sinSurte && !confirm(sinSurte + ' servicios no tienen quién los surte. ¿Imprimir así?')) return;
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
    var dePEG = v.items.filter(function (i) { return !i.surte; });
    var externos = v.items.filter(function (i) { return !!i.surte; });
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
      (externos.length ? '<h2 class="externos">Artículos que surte un proveedor externo (no pasan por bodega)</h2><table class="ext"><thead><tr><th>#</th><th>Solicitado</th><th class="izq">Artículo</th><th class="izq">Lo contrata</th><th class="izq">Proveedor y teléfono</th><th>Hora de llegada</th><th>Quién entrega</th><th>Quién recibe (firma)</th><th>Cant. recibida</th></tr></thead><tbody>' +
        externos.map(function (i) {
          n++;
          var p = i.prov || {};
          return '<tr><td class="num">' + n + '</td><td class="cant">' + esc(i.cant) + '</td><td>' + esc(i.nombre) + (i.nota ? ' <span class="nota">· ' + esc(i.nota) + '</span>' : '') + '</td>' +
            '<td>' + (i.surte === 'cliente' ? 'Cliente' : 'PEG') + '</td>' +
            '<td>' + esc(p.nombre || '') + (p.telefono ? '<br>' + esc(p.telefono) : '') + '</td><td class="centro">' + esc(hora12(p.hora)) + '</td><td>' + esc(p.entrega || '') + '</td><td>' + esc(p.recibe || '') + '</td><td class="caja"></td></tr>';
        }).join('') + '</tbody></table>' : '') +
      (servs.length ? '<h2 class="externos">Servicios y equipo del evento</h2><table class="ext"><thead><tr><th>#</th><th class="izq">Servicio / equipo</th><th class="izq">Quién lo surte</th><th class="izq">Proveedor y teléfono</th><th>Llega / instala</th><th>Inicia</th><th>Termina</th><th>Quién lo recibe</th><th>Llegó<small>hora y firma</small></th></tr></thead><tbody>' +
        servs.map(function (s, k) {
          var p = s.prov || {};
          return '<tr><td class="num">' + (k + 1) + '</td><td>' + esc(s.nombre) + (s.nota ? ' <span class="nota">· ' + esc(s.nota) + '</span>' : '') + '</td>' +
            '<td>' + esc(textoSurte(s.surte)) + '</td><td>' + esc(p.nombre || '') + (p.telefono ? '<br>' + esc(p.telefono) : '') + '</td>' +
            '<td class="centro">' + esc(hora12(p.llega)) + '</td><td class="centro">' + esc(hora12(p.inicia)) + '</td><td class="centro">' + esc(hora12(p.termina)) + '</td>' +
            '<td>' + esc(p.recibe || '') + '</td><td class="caja"></td></tr>';
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


  // ── Requisición de material para llenar a mano ────────────
  // 1. Todo el inventario de PEG: ✓, cantidad y quién lo surte (B / P / C)
  // 2. Servicios, equipo y proveedores externos: proveedor, teléfono, horarios y quién recibe
  // 3. Otros artículos que no están en el inventario
  // Lo que ya se capturó en la app sale prellenado; lo demás queda en blanco con su rótulo.
  // soloHtml: devuelve el documento en vez de abrirlo (la ficha técnica lo incluye).
  // Si el evento aún no tiene requisición, sale prellenada con la sugerida (calculada desde el evento).
  function imprimirInventario(soloHtml) {
    var w = soloHtml === true ? null : window.open('', '_blank');
    if (soloHtml !== true && !w) { toast('El navegador bloqueó la ventana emergente. Permite las ventanas emergentes en este sitio.', 'error'); return; }
    var ev = evento(), b = ev ? ev.data.brief || {} : {};
    var v = ev ? { items: datosFicha().items } : { items: [] };
    var servs = ev ? servicios() : [];
    var fecha = b.fecha_evento ? new Date(b.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
    var lugar = b.venue_red || b.venue_externo || '';
    var logo = new URL('assets/logo-primavera.png', location.href).href;
    // Casillas B / P / C con la que aplica marcada
    function cajasSurte(surte) {
      return SURTE.map(function (s) { return '<span class="sb' + (surte != null && (surte || '') === s.v ? ' on' : '') + '">' + s.corto + '</span>'; }).join('');
    }
    var cabeza = '<div class="art rot"><span class="ok">✓</span><span class="nom">Artículo</span><span class="cant">Cant.</span><span class="surte">Surte</span></div>';
    var grupos = agrupar(_inventario || []).map(function (g) {
      return '<section class="grupo"><h3>' + esc(g.categoria) + '</h3>' + cabeza + g.items.map(function (a) {
        var it = v.items.find(function (i) { return i.id === a.id; });
        var op = !it && v.items.find(function (i) { return i.opciones && i.opciones.some(function (o) { return o.id === a.id; }); });
        if (op) return '<div class="art elegir"><span class="caja"></span><span class="nom">' + esc(a.nombre) + ' <em>elegir uno</em></span>' +
          '<span class="cant">' + esc(op.cant) + '</span><span class="surte">' + cajasSurte(null) + '</span></div>';
        return '<div class="art"><span class="caja">' + (it ? '✓' : '') + '</span><span class="nom">' + esc(a.nombre) + '</span>' +
          '<span class="cant">' + (it ? esc(it.cant) : '') + '</span><span class="surte">' + cajasSurte(it ? it.surte || '' : null) + '</span></div>';
      }).join('') + '</section>';
    }).join('');

    // Sección 2: servicios + artículos que surte un proveedor externo
    var filasServ = servs.map(function (s) {
      var p = s.prov || {};
      return { nombre: s.nombre + (s.nota ? ' · ' + s.nota : ''), surte: s.surte, prov: p.nombre, tel: p.telefono, llega: hora12(p.llega), inicia: hora12(p.inicia), termina: hora12(p.termina), recibe: p.recibe };
    }).concat(v.items.filter(function (i) { return i.surte; }).map(function (i) {
      var p = i.prov || {};
      return { nombre: (i.cant ? i.cant + ' × ' : '') + i.nombre, surte: i.surte, prov: p.nombre, tel: p.telefono, llega: hora12(p.hora), inicia: '', termina: '', recibe: p.recibe };
    }));
    for (var k = 0; k < 6; k++) filasServ.push({ surte: null });
    var tablaServ = filasServ.map(function (r, n) {
      return '<tr><td class="num">' + (n + 1) + '</td><td>' + esc(r.nombre || '') + '</td><td class="centro">' + cajasSurte(r.surte) + '</td>' +
        '<td>' + esc(r.prov || '') + '</td><td>' + esc(r.tel || '') + '</td><td class="centro">' + esc(r.llega || '') + '</td>' +
        '<td class="centro">' + esc(r.inicia || '') + '</td><td class="centro">' + esc(r.termina || '') + '</td><td>' + esc(r.recibe || '') + '</td></tr>';
    }).join('');

    // Sección 3: otros artículos (capturados en la app sin estar en el inventario + renglones en blanco)
    var otros = v.items.filter(function (i) { return !i.id && !i.surte && !(i.opciones && i.opciones.length); });
    var filasOtros = otros.map(function (i) {
      return '<tr><td class="caja-td">✓</td><td>' + esc(i.nombre) + '</td><td class="centro">' + esc(i.cant) + '</td><td class="centro">' + cajasSurte('') + '</td><td>' + esc(i.nota) + '</td></tr>';
    }).join('');
    for (var o = 0; o < 6; o++) filasOtros += '<tr><td class="caja-td"><span class="caja"></span></td><td></td><td></td><td class="centro">' + cajasSurte(null) + '</td><td></td></tr>';

    var html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Requisición de material · ' + esc(ev ? ev.nombre : '') + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">' +
      '<style>:root{--pink:#F65C7A;--gold:#C9A96E;--ink:#1F1F1F;--gray:#6D6D6D;--line:#E2D9D0;--soft:#F8F6F4}' +
      '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      'html,body{background:#fff}body{font-family:Poppins,sans-serif;color:var(--ink);font-size:9.5px;margin:18px auto;max-width:800px;padding:0 14px}' +
      'h1,h2,h3{font-family:"Playfair Display",serif;margin:0}' +
      '.toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;color:var(--gray)}.toolbar button{background:var(--pink);color:#fff;border:0;border-radius:6px;padding:8px 14px;cursor:pointer}' +
      '.head{display:flex;align-items:center;gap:12px;padding-bottom:8px;border-bottom:2px solid var(--gold)}.head img{width:44px;height:44px;border-radius:50%;object-fit:cover}' +
      '.marca{font-family:"Playfair Display",serif;font-size:15px;color:var(--pink)}.sub{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}' +
      '.titulo{margin-left:auto;text-align:right}.titulo h1{font-size:16px}.titulo div{color:var(--gray)}' +
      '.datos{display:grid;grid-template-columns:1.6fr 1.4fr 1.3fr .7fr;gap:4px 14px;margin:10px 0}.datos div{border-bottom:1px solid var(--line);padding:3px 0;min-height:30px}.datos b{font-size:7.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);display:block}' +
      '.inst{background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:7px 10px;margin-bottom:10px;line-height:1.5}.inst b{color:var(--ink)}.inst ul{margin:3px 0 0;padding-left:16px}' +
      'h2{font-size:13px;color:var(--pink);margin:12px 0 4px}h2 small{font-family:Poppins,sans-serif;font-size:8.5px;color:var(--gray);font-weight:400;margin-left:6px}' +
      '.cols{column-count:2;column-gap:22px}.grupo{break-inside:auto;margin-bottom:8px}' +
      '.grupo h3{font-size:11px;color:var(--pink);border-bottom:1px solid var(--gold);padding-bottom:1px;margin-bottom:1px;break-after:avoid}' +
      '.art{display:flex;align-items:center;gap:6px;padding:2px 0;border-bottom:1px dotted var(--line);break-inside:avoid}' +
      '.art.elegir{background:#FFF6E5}.art.elegir em{font-style:normal;font-size:7px;letter-spacing:.06em;text-transform:uppercase;color:#B7791F;border:1px solid #E7C27A;border-radius:3px;padding:0 3px;margin-left:3px}' +
      '.art.rot{border-bottom:0;padding:0;color:var(--gray);font-size:7px;text-transform:uppercase;letter-spacing:.06em;break-after:avoid}.art.rot .cant{border:0;text-align:center}.art.rot .ok{width:10px;text-align:center;flex:none}' +
      '.caja{width:10px;height:10px;border:1px solid var(--ink);border-radius:2px;flex:none;display:inline-flex;align-items:center;justify-content:center;font-size:8px;line-height:1}.nom{flex:1}' +
      '.cant{width:40px;border-bottom:1px solid var(--gray);height:11px;flex:none;text-align:center;font-weight:600}' +
      '.surte{flex:none;width:52px;display:flex;gap:3px;justify-content:center}' +
      '.sb{display:inline-flex;align-items:center;justify-content:center;width:13px;height:11px;border:1px solid var(--gray);border-radius:2px;font-size:6.5px;color:var(--gray)}.sb.on{background:var(--ink);color:#fff;border-color:var(--ink)}' +
      'table{width:100%;border-collapse:collapse}th{background:var(--ink);color:#fff;font-weight:500;padding:4px 5px;text-align:left;font-size:8px;line-height:1.2}' +
      'td{border-bottom:1px solid var(--line);border-left:1px solid var(--line);padding:3px 5px;vertical-align:middle;height:24px}td:first-child{border-left:0}tr{break-inside:avoid}' +
      'td.num{color:var(--gray);width:20px}td.centro{text-align:center;white-space:nowrap}td.centro .sb{margin:0 1px}td.caja-td{width:20px;text-align:center}' +
      '.seccion{break-inside:auto}' +
      '.firmas{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px;break-inside:avoid}.firma{border:1px solid var(--line);border-radius:6px;padding:6px 8px;min-height:84px}' +
      '.firma b{display:block;color:var(--pink);font-size:10px}.firma span{display:block;color:var(--gray);font-size:8.5px;margin-bottom:8px}.firma i{display:block;border-top:1px solid var(--ink);margin-top:18px;padding-top:2px;font-style:normal;color:var(--gray);font-size:8px}' +
      '.footer{margin-top:12px;padding-top:6px;border-top:1px solid var(--gold);font-size:8px;color:var(--gray);text-align:center}' +
      '@media print{.toolbar{display:none}body{margin:0;max-width:none}@page{size:letter;margin:1cm}thead{display:table-header-group}}</style></head><body>' +
      '<div class="toolbar"><span>Vista previa · Requisición de material</span><button onclick="window.print()">Imprimir / Guardar PDF</button></div>' +
      '<header class="head"><img src="' + esc(logo) + '" alt="Primavera Events Group"><div><div class="marca">Primavera Events Group®</div><div class="sub">Inventario de mobiliario, equipo y servicios</div></div>' +
        '<div class="titulo"><h1>Requisición de material</h1><div>' + (_inventario || []).length + ' artículos de bodega · ' + servs.length + ' servicios</div></div></header>' +
      '<section class="datos">' +
        '<div><b>Evento</b>' + esc(ev ? ev.nombre : '') + '</div><div><b>Fecha del evento</b>' + esc(fecha) + '</div>' +
        '<div><b>Locación</b>' + esc(lugar) + '</div><div><b>Personas</b>' + esc(b.invitados || '') + '</div>' +
        '<div><b>Planner que elabora</b>' + esc(b.planner || '') + '</div><div><b>Coordinador del evento</b></div>' +
        '<div><b>Surte en bodega (nombre)</b></div><div><b>Sale de bodega (fecha y hora)</b></div>' +
      '</section>' +
      '<div class="inst"><b>Cómo se llena:</b><ul>' +
        '<li><b>✓</b> marca lo que se va a ocupar en el evento.</li>' +
        '<li><b>Cant.</b> número de piezas que se necesitan.</li>' +
        '<li><b>Surte</b> quién lo pone: <b>B</b> = Bodega PEG · <b>P</b> = proveedor externo que contrata PEG · <b>C</b> = proveedor externo que contrata el cliente.</li>' +
        '<li>Todo lo que sea <b>P</b> o <b>C</b>, y todos los servicios (DJ, pista, cabinas, música en vivo…), van en la sección 2 con proveedor, teléfono, horarios y quién lo recibe.</li>' +
      '</ul></div>' +
      '<h2>1. Artículos del inventario de PEG</h2>' +
      '<div class="cols">' + grupos + '</div>' +
      '<section class="seccion"><h2>2. Servicios, equipo y proveedores externos<small>DJ, pista de baile, cabinas, música en vivo, foto y video… y los artículos marcados P o C</small></h2>' +
        '<table><thead><tr><th>#</th><th>Servicio / equipo / artículo</th><th style="text-align:center;width:62px">Surte<br>B · P · C</th><th>Proveedor (nombre)</th><th>Teléfono</th><th>Llega / instala</th><th>Inicia</th><th>Termina</th><th>Quién lo recibe en locación</th></tr></thead>' +
        '<tbody>' + tablaServ + '</tbody></table></section>' +
      '<section class="seccion"><h2>3. Otros artículos (no están en el inventario)</h2>' +
        '<table><thead><tr><th>✓</th><th>Artículo</th><th style="text-align:center">Cant.</th><th style="text-align:center">Surte<br>B · P · C</th><th>Nota (color, medida…)</th></tr></thead>' +
        '<tbody>' + filasOtros + '</tbody></table></section>' +
      '<section class="firmas">' +
        '<div class="firma"><b>Elabora</b><span>Planner' + (b.planner ? ': ' + esc(b.planner) : '') + '</span><i>Nombre y firma</i><i>Fecha y hora</i></div>' +
        '<div class="firma"><b>Surte</b><span>Bodega PEG</span><i>Nombre y firma</i><i>Fecha y hora</i></div>' +
        '<div class="firma"><b>Recibe</b><span>Coordinador en locación</span><i>Nombre y firma</i><i>Fecha y hora</i></div>' +
      '</section>' +
      '<footer class="footer">Primavera Events Group® · Documento de control interno</footer></body></html>';
    if (soloHtml === true) return html;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // Lista para la ficha técnica del coordinador
  // "Falta definir" siempre al día: lo que el cálculo detecta ahora mismo (menú, back, copas, bebidas…)
  // más los "elegir uno" que sigan sin resolverse en la requisición guardada
  function pendientesActuales(ev, v) {
    if (!ev || !window.PEGCalculo) return (v && v.pendientes) || [];
    var r = window.PEGCalculo.calcular(ev);
    var elegir = ((v && v.items) || []).filter(function (i) { return i.opciones && i.opciones.length; }).map(function (i) {
      return 'Elegir uno: ' + i.nombre + ' — ' + (i.cant || 'cantidad por definir') + (i.cant ? ' pz' : '') + ' (' + i.opciones.map(function (o) { return o.nombre; }).join(' / ') + ').';
    });
    return r.pendientes.concat(elegir);
  }
  function datosFicha() {
    var ev = evento();
    var v = ev && ev.data.vale;
    if (v && v.items && v.items.length) return { items: v.items, pendientes: pendientesActuales(ev, v), calculada: false };
    var r = ev ? calculoItems(ev) : { items: [], pendientes: [] };
    var elegir = r.items.filter(function (i) { return i.opciones && i.opciones.length; }).map(function (i) {
      return 'Elegir uno: ' + i.nombre + ' — ' + i.cant + ' pz (' + i.opciones.map(function (o) { return o.nombre; }).join(' / ') + ').';
    });
    return { items: r.items, pendientes: r.pendientes.concat(elegir), calculada: true };
  }
  function filasFicha() {
    var ev = evento();
    var items = datosFicha().items;
    var servs = ev && ev.data.vale && Array.isArray(ev.data.vale.servicios) ? ev.data.vale.servicios : [];
    if (!items.length && !servs.length) return '';
    return agrupar(items).map(function (g) {
      return '<tr><td colspan="3"><strong>' + esc(g.categoria) + '</strong></td></tr>' + g.items.map(function (i) {
        return '<tr><td style="width:10%"><strong>' + esc(i.cant) + '</strong></td><td>' + esc(i.nombre) + '</td><td style="width:38%">' + esc(i.nota) +
          (i.surte ? (i.nota ? '<br>' : '') + 'Lo surte: ' + esc(textoSurte(i.surte) + ' · ' + textoProveedor(i)) : '') + '</td></tr>';
      }).join('');
    }).join('') + (servs.length ? '<tr><td colspan="3"><strong>Servicios y equipo del evento</strong></td></tr>' + servs.map(function (s) {
      return '<tr><td style="width:10%"></td><td>' + esc(s.nombre) + '</td><td style="width:38%">' + esc(textoServicio(s)) + (s.nota ? '<br>' + esc(s.nota) : '') + '</td></tr>';
    }).join('') : '');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('btn-vale');
    if (btn) btn.onclick = abrir;
  });

  window.PEGVale = { abrir: abrir, imprimir: imprimir, imprimirInventario: imprimirInventario, filasFicha: filasFicha, datosFicha: datosFicha, cargarInventario: cargarInventario,
    inventarioListo: function () { return !!_inventario; }, serviciosFicha: serviciosFicha, diferencias: diferencias };
})();
