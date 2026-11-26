// ============================================================
// calculo-requisicion.js — Requisición calculada desde el evento
// Lee el plano (mesas, sillas y montaje de cada mesa), el menú y las amenidades del brief
// y propone las cantidades de la requisición. Lo que no se puede saber queda como
// "Por confirmar" para que el planner, el capitán o el coordinador lo definan.
// Devuelve { items: [{ nombre, categoria, cant, nota }], pendientes: [texto], lugares: {...} }
// ============================================================
(function () {
  'use strict';

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
  function cap(s) { s = String(s || '').replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); }

  var MESAS_COCTEL = /^(table_periquera|lounge_set)/;
  var MESAS_PRINCIPALES = /^table_honor/;
  var MESAS_SIN_LUGARES = /^(table_cake|table_gifts|table_candy|table_shots|table_buffet)$/;

  // Mesas, mesa principal y mesas del cóctel del plano; lugares contra invitados
  function lugares(elements, invitados) {
    var banquete = [], principal = [], coctel = [], otras = [];
    (elements || []).forEach(function (e) {
      if (e.bg2d || !e.type) return;
      if (MESAS_COCTEL.test(e.type)) coctel.push(e);
      else if (MESAS_PRINCIPALES.test(e.type)) principal.push(e);
      else if (e.type === 'table_imperial' || (/^table_/.test(e.type) && !MESAS_SIN_LUGARES.test(e.type))) banquete.push(e);
      else if (MESAS_SIN_LUGARES.test(e.type)) otras.push(e);
    });
    var sum = function (l) { return l.reduce(function (s, e) { return s + (parseInt(e.chairs, 10) || 0); }, 0); };
    var lugBanquete = sum(banquete), lugPrincipal = sum(principal);
    var r = { banquete: banquete, principal: principal, coctel: coctel, otras: otras,
      lugaresBanquete: lugBanquete, lugaresPrincipal: lugPrincipal, total: lugBanquete + lugPrincipal, invitados: invitados };
    // Reparto sugerido: los invitados (menos la mesa principal) entre las mesas, de 8 a 12 por mesa
    if (invitados && banquete.length) {
      var porRepartir = invitados - lugPrincipal, n = banquete.length;
      var base = Math.floor(porRepartir / n), extra = porRepartir - base * n;
      r.sugerido = { base: base, extra: extra, mesas: n, porRepartir: porRepartir, valido: base >= 8 && (base + (extra ? 1 : 0)) <= 12 };
    }
    return r;
  }

  var PLATO_BASE = { vintage: 'Plato base vintage', romano: 'Plato base romano', plateado: 'Plato base plateado', gotico: 'Plato base gótico',
    chocolate: 'Plato base chocolate', concha_dorado: 'Plato base concha dorado', espiral: 'Plato base tipo espiral', cristal_aperlado: 'Plato base cristal aperlado' };
  var TRINCHE = { redondo_blanco: 'Plato trinche 27cm', entremes_blanco: 'Plato entremés blanco', negro: 'Plato sopero negro' };
  // Color de cubiertos como se llama en el inventario: [masculino, femenino] (cuchillo plateado, cucharita plateada)
  var CUBIERTO = { plateado: ['plateado', 'plateada'], dorado: ['dorado', 'dorada'], gold_rose: ['gold rose', 'gold rose'], negro: ['negro', 'negra'] };
  function copa(tipo, color) {
    color = norm(color || 'transparente');
    switch (tipo) {
      case 'romana': return 'Copa agua romana';
      case 'standard': return color === 'roja' ? 'Copa de agua roja' : 'Copa de agua transparente';
      case 'vino': return 'Copa de vino ' + (color === 'ambar' ? 'ámbar' : color);
      case 'flauta': return 'Copa flauta';
      case 'martinera': return 'Copa martinera';
      case 'cubero': return 'Vaso cubero';
      case 'old_fashion': return 'Vaso old fashion';
      case 'tequilero': return 'Tequilero';
    }
    return null;
  }
  var SILLA = { tiffany: 'Silla Tiffany blanca', crossback: 'Silla cross back — elegir miel o nogal', metalica: 'Silla metálica — elegir Boss o Lotus',
    princesa: 'Sillón principal — elegir color', napoleon: 'Silla Napoleón', ghost: 'Silla ghost', banquete: 'Silla de banquete' };
  var MESA = { table_rectangular: 'Mesa rectangular de madera — elegir miel o nogal', table_marble_square: 'Mesa rectangular tipo marmol',
    table_marble_round: 'Mesa redonda tipo mármol', table_round: 'Mesa redonda', table_square: 'Mesa cuadrada — elegir modelo',
    table_campirana: 'Mesa rectangular de madera — elegir miel o nogal', table_kids: 'Mesa infantil', table_umbrella: 'Mesa con sombrilla' };

  function calcular(ev) {
    var d = ev.data || {}, b = d.brief || {};
    var elements = (d.layout && d.layout.elements) || [];
    var invitados = parseInt(b.invitados, 10) || 0;
    var L = lugares(elements, invitados);
    var items = [], pendientes = [];
    function sumar(nombre, cant, categoria, nota, alt) {
      if (!nombre || cant === 0 || cant == null) return; // '' = por confirmar
      var ya = items.find(function (i) { return norm(i.nombre) === norm(nombre); });
      if (ya) { if (cant !== '') ya.cant = (parseInt(ya.cant, 10) || 0) + cant; if (nota && ya.nota.indexOf(nota) < 0) ya.nota = [ya.nota, nota].filter(Boolean).join(' · '); return; }
      items.push({ nombre: nombre, categoria: categoria || 'Otros', cant: cant, nota: nota || '', alt: alt || [] });
    }

    // Menú: qué tiempos hay (define platos y cubiertos)
    var tm = b.tiempos_menu || {};
    var textoMenu = norm(JSON.stringify(tm) + ' ' + (b.menu_notas || '') + ' ' + (b.proteina || ''));
    var hay = function (k) { return !!(tm[k] && (tm[k].platillo || tm[k].hora)); };
    var hayFuerte = hay('Plato fuerte') || !!b.proteina;
    var haySopa = hay('Sopa / Crema') || /\b(sopa|crema de|consome|caldo)\b/.test(textoMenu);
    var hayEnsalada = hay('Ensalada') || hay('Entrada');
    var hayPostre = hay('Postre');
    if (!hayPostre && /postre/.test(norm((b.observaciones || '') + ' ' + (b.menu_notas || '')))) pendientes.push('Postre por confirmar: si se sirve, agregar plato de postre y cucharita por invitado.');
    if (!hayFuerte) pendientes.push('No hay plato fuerte en el menú: confirmar cuchillo y tenedor.');

    // Todo lo escrito en el brief (para detectar lo que se va a ocupar aunque no esté en el plano)
    var textoBrief = norm(JSON.stringify(b));
    var principalMarmol = /mesa principal[^.]{0,40}marmol/.test(textoBrief);
    var sillonPrincesa = /sillon de princesa/.test(textoBrief);

    // Mesas del banquete y mesa principal: montaje por lugar
    L.banquete.concat(L.principal).forEach(function (e) {
      var c = e.mesaConfig || {}, n = parseInt(e.chairs, 10) || 0;
      var principal = MESAS_PRINCIPALES.test(e.type);
      var mesa = principal ? (principalMarmol ? 'Mesa rectangular tipo marmol' : 'Mesa principal — tipo por confirmar') : (e.type === 'table_imperial' ? 'Mesa tablón' : MESA[e.type] || ('Mesa — ' + (e.name || e.type)));
      sumar(mesa, e.type === 'table_imperial' ? (e.tablones || 1) : 1, 'Mesas y periqueras');
      if (!n) return;
      if (principal && sillonPrincesa) {
        // Mesa principal de XV: sillón de princesa para la festejada; los demás lugares (chambelanes) con otra silla
        sumar('Sillón de princesa', 1, 'Sillas y bancos', 'mesa principal');
        if (n > 1) sumar('Silla para la mesa principal — elegir modelo', n - 1, 'Sillas y bancos', 'chambelanes / acompañantes');
      } else if (c.tipoSilla) sumar(SILLA[c.tipoSilla] || ('Silla ' + cap(c.tipoSilla)), n, 'Sillas y bancos');
      if (c.sillaFunda && c.sillaFunda !== 'ninguna') sumar('Funda completa para silla Tiffany color ' + norm(c.sillaFunda), n, 'Sillas y bancos');
      if (c.platoBase && c.platoBase !== 'ninguno') sumar(PLATO_BASE[c.platoBase] || ('Plato base ' + cap(c.platoBase)), n, 'Loza');
      if (hayFuerte && c.platoTrinche && c.platoTrinche !== 'ninguno') sumar(TRINCHE[c.platoTrinche] || ('Plato trinche ' + cap(c.platoTrinche)), n, 'Loza');
      if (haySopa) sumar('Plato sopero redondo blanco', n, 'Loza', 'Sopa / crema en el menú');
      if (hayPostre) sumar('Plato postre', n, 'Loza');
      var col = CUBIERTO[c.cubiertos] || CUBIERTO.plateado;
      if (hayFuerte) { sumar('Cuchillo ' + col[0], n, 'Cubiertos'); sumar('Tenedor ' + col[0] + ' carne', n, 'Cubiertos'); }
      if (hayEnsalada) sumar('Tenedor ' + col[0] + ' ensalada', n, 'Cubiertos', '1er / 2do tiempo');
      if (haySopa) sumar('Cuchara sopera ' + col[1], n, 'Cubiertos');
      if (hayPostre) sumar('Cucharita ' + col[1], n, 'Cubiertos');
      var c1 = c.cristal && c.cristal !== 'ninguno' ? copa(c.cristal, c.copasColor) : null;
      var c2 = c.cristal2 && c.cristal2 !== 'ninguno' ? copa(c.cristal2, c.copasColor2) : null;
      if (c1) sumar(c1, n, 'Cristalería');
      if (c2) sumar(c2, n, 'Cristalería');
      // Servilletas: una por doblez y lugar, separadas por color
      var folds = Array.isArray(c.servilletaDoblez) ? c.servilletaDoblez : (c.servilletaDoblez ? [c.servilletaDoblez] : []);
      folds.forEach(function (f) {
        var color = c['servilletaColor_' + f] || (f === 'corazon' ? c.servilletaColorCorazon : f === 'corbata' ? c.servilletaColorCorbata : c.servilletaColorOtros) || 'blanco';
        // En el inventario: "Servilleta azul cielo", "Servilleta corrugada azul plumbago"… o la genérica "Servilleta de tela"
        var tono = norm(String(color).replace(/_/g, ' '));
        sumar('Servilleta ' + tono, n, 'Mantelería', 'doblez ' + f, ['Servilleta corrugada ' + tono]);
      });
      if (c.mantelColor && c.mantelColor !== 'sin_mantel') sumar('Mantel ' + cap(c.mantelColor).toLowerCase(), e.type === 'table_imperial' ? (e.tablones || 1) : 1, 'Mantelería', 'confirmar forma (redondo / cuadrado / tablón)');
      if (c.caminoColor && c.caminoColor !== 'ninguno') sumar('Camino ' + cap(c.caminoColor).toLowerCase(), e.type === 'table_imperial' ? (e.tablones || 1) : 1, 'Mantelería');
      if (principal) sumar('Arreglo floral para mesa principal', 1, 'Arreglos florales');
      else if (c.arregloFloralTipo === 'alto') { sumar('Arreglo floral alto (redondo)', 1, 'Arreglos florales'); sumar('Base metálica alta (centro de mesa)', 1, 'Arreglos florales'); }
      else if (c.arregloFloralTipo === 'bajo') sumar('Arreglo floral bajo (largo, rectangular)', 1, 'Arreglos florales');
    });
    var altos = items.find(function (i) { return i.nombre === 'Base metálica alta (centro de mesa)'; });
    if (altos && altos.cant > 4) pendientes.push('Hay ' + altos.cant + ' arreglos altos y solo existen 4 bases metálicas altas.');
    var numeradas = L.banquete.filter(function (e) { return e.mesaConfig && parseInt(e.mesaConfig.mesaNum, 10) > 0; }).length;
    if (numeradas) {
      sumar('Números de mesa — elegir acrílicos o madera', numeradas, 'Identificadores de mesa');
      sumar('Base metálica para numeración de mesas', numeradas, 'Identificadores de mesa');
    }
    if (/cojin/.test(norm(b.vajilla_color || '')) && L.banquete.some(function (e) { return e.mesaConfig && e.mesaConfig.tipoSilla === 'crossback'; })) {
      var cb = L.banquete.filter(function (e) { return e.mesaConfig && e.mesaConfig.tipoSilla === 'crossback'; }).reduce(function (s, e) { return s + (parseInt(e.chairs, 10) || 0); }, 0);
      sumar('Cojín para silla cross back', cb, 'Sillas y bancos', 'el brief dice "con cojín"');
    }

    // Cóctel: periqueras, sombrillas, bancos y salas lounge
    L.coctel.forEach(function (e) {
      if (e.type === 'lounge_set') { sumar('Sala lounge madera', 1, 'Salas y sombrillas'); return; }
      sumar('Periquera — elegir madera o metal', 1, 'Mesas y periqueras');
      if (/umbrella/.test(e.type)) sumar('Sombrilla', 1, 'Salas y sombrillas');
      if (parseInt(e.chairs, 10)) sumar('Banco alto — elegir modelo', parseInt(e.chairs, 10), 'Sillas y bancos');
    });
    L.otras.forEach(function (e) {
      if (/carrito/.test(norm(e.name))) sumar('Carrito de snacks', 1, 'Snacks y estaciones');
      else if (e.type === 'table_gifts') sumar('Mesa de regalos — elegir mesa', 1, 'Mesas y periqueras');
      else if (e.type === 'table_cake') sumar('Mesa de pastel — elegir mesa', 1, 'Mesas y periqueras');
    });

    // Templete (por ejemplo, para dar altura a la mesa principal)
    if (/templete/.test(textoBrief)) {
      sumar('Pieza de templete de madera', '', 'Decoración y estructuras', 'POR CONFIRMAR: cuántas piezas');
      pendientes.push('Templete: definir cuántas piezas de templete se ocupan.');
    }
    // Aguas y bebidas que se sirven en vitrolero: uno por cada sabor
    var SABORES = [['agua fresca', /agua(s)? fresca/], ['margaritas', /margarita/], ['piñadas', /pinada/], ['limonada', /limonada/], ['naranjada', /naranjada/],
      ['jamaica', /jamaica/], ['horchata', /horchata/], ['tamarindo', /tamarindo/], ['agua de sabor', /agua(s)? de (sabor|frutas?)/]];
    var sabores = SABORES.filter(function (x) { return x[1].test(textoBrief); }).map(function (x) { return x[0]; });
    if (sabores.indexOf('agua fresca') > -1 && sabores.indexOf('agua de sabor') > -1) sabores.splice(sabores.indexOf('agua de sabor'), 1);
    if (sabores.length) {
      sumar('Vitrolero de cristal pequeño', sabores.length, 'Barra y cocina', 'uno por sabor: ' + sabores.join(', ') + ' (o vitrolero de plástico grande)');
      pendientes.push('Aguas: se sugiere 1 vitrolero por sabor (' + sabores.join(', ') + '). Si hay más sabores, uno más por cada sabor.');
    }
    // Hielo en barra que se menciona en el brief (extras, observaciones)
    var hielo = textoBrief.match(/(\d+)?\s*barras? de hielo/);
    if (hielo) sumar('Hielo en barra', parseInt(hielo[1], 10) || 1, 'Bebidas y hielo', 'mencionado en el brief');

    // Amenidades que salen de bodega
    var amen = (b.amenidades || []).map(norm);
    var ilumina = false;
    if (amen.some(function (a) { return /letra gigante xv/.test(a); })) {
      sumar('Letra gigante XV — confirmar 1.10 o 1.80 m', 1, 'Letras gigantes');
      ilumina = true;
    }
    if (amen.some(function (a) { return /l-o-v-e|love/.test(a); })) {
      ['Letra gigante L', 'Letra gigante O', 'Letra gigante V', 'Letra gigante E'].forEach(function (l) { sumar(l, 1, 'Letras gigantes'); });
      ilumina = true;
    }
    if (amen.some(function (a) { return /corazon gigante/.test(a); })) { sumar('Corazon gigante', 1, 'Decoración y estructuras'); ilumina = true; }
    if (amen.some(function (a) { return /alfombra roja/.test(a); })) sumar('Alfombra roja', 1, 'Decoración y estructuras');
    if (ilumina) {
      sumar('Focos para letras gigantes', '', 'Iluminación y eléctrico', 'POR CONFIRMAR: cuántos focos lleva cada letra');
      sumar('Extensión eléctrica', '', 'Iluminación y eléctrico', 'POR CONFIRMAR: cuántas');
      pendientes.push('Letras gigantes: definir cuántos focos lleva cada letra y cuántas extensiones se ocupan.');
    }

    // Barras: la barra fija es del venue (siempre está); las montables las lleva PEG.
    // En el plano, una barra es fija si su nombre dice "fija" o es parte de la plantilla del salón.
    var barras = elements.filter(function (e) { return e.type === 'bar_area'; });
    var fijas = barras.filter(function (e) { return e.bg2d || /fija/.test(norm(e.name)); }).length;
    var montables = barras.length - fijas;
    if (montables) {
      sumar('Barra montable', montables, 'Decoración y estructuras');
      sumar('Mesa tablón', montables, 'Mesas y periqueras', 'un tablón por barra montable');
      sumar('Bambalinas negras para tablon', montables, 'Mantelería', 'cubre el tablón de cada barra montable');
      pendientes.push('Barras: ' + montables + ' montable' + (montables === 1 ? '' : 's') + ' (las lleva PEG)' + (fijas ? ' y ' + fijas + ' fija' + (fijas === 1 ? '' : 's') + ' del venue' : '') +
        '. Si una barra del plano es la fija del venue, ponle "fija" en el nombre para que no se cuente.');
    }
    var hayBarra = barras.length || (b.tipo_barra && b.tipo_barra.length) || /barra/.test(norm(b.esquema_bebidas || ''));
    if (hayBarra) {
      var k = Math.max(2, montables);
      ['Exprimidor de limon', 'Cuchillo de barra', 'Pica hielo', 'Pinzas para hielo', 'Tarja para hielo'].forEach(function (p) { sumar(p, k, 'Barra y cocina', k + ' kits de barra'); });
    }

    // Lugares contra invitados
    if (invitados && L.total !== invitados) {
      pendientes.unshift('El plano tiene ' + L.total + ' lugares (mesas + principal) y son ' + invitados + ' invitados: ajustar las sillas de las mesas. ' +
        'Las cantidades por lugar de esta requisición salen del plano.');
    }
    pendientes.push('Copas: confirmar cuántas piezas de cada color van por mesa (el plano pone las dos copas en todos los lugares).');
    return { items: items, pendientes: pendientes, lugares: L };
  }

  window.PEGCalculo = { calcular: calcular, lugares: lugares };
})();
