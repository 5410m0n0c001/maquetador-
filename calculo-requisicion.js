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
  var MESAS_SIN_LUGARES = /^(table_cake|table_gifts|table_candy|table_shots|table_buffet|table_photographers)$/;

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
    chocolate: 'Plato base chocolate', concha_dorado: 'Plato base concha dorado', espiral: 'Plato base tipo espiral', cristal_aperlado: 'Plato base cristal aperlado',
    hacienda: 'Plato base hacienda' };
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
  var SILLA = { tiffany: 'Silla Tiffany blanca', crossback: 'Silla cross back (miel o nogal)', metalica: 'Silla metálica (Boss o Lotus)',
    princesa: 'Sillón principal (elegir color)', napoleon: 'Silla Napoleón', ghost: 'Silla ghost', banquete: 'Silla de banquete' };
  var MESA = { table_rectangular: 'Mesa rectangular de madera (miel o nogal)', table_marble_square: 'Mesa rectangular tipo marmol',
    table_marble_round: 'Mesa redonda tipo mármol', table_round: 'Mesa redonda', table_square: 'Mesa cuadrada — elegir modelo',
    table_campirana: 'Mesa rectangular de madera (miel o nogal)', table_kids: 'Mesa infantil', table_umbrella: 'Mesa con sombrilla' };
  // Artículos que hay que elegir entre varios del inventario: la cantidad sugerida va en cada opción ("elegir uno")
  var OPCIONES = {
    'Mesa rectangular de madera (miel o nogal)': ['Mesa rectangular de madera color miel', 'Mesa rectangular de madera color nogal clasico'],
    'Silla cross back (miel o nogal)': ['Silla cross back madera tono miel', 'Silla cross back madera tono nogal'],
    'Silla metálica (Boss o Lotus)': ['Silla metálica Boss', 'Silla metálica Lotus'],
    'Sillón principal (elegir color)': ['Sillón principal beige', 'Sillón principal gris Oxford', 'Sillón principal palo de rosa (alita)'],
    'Periquera (madera o metal)': ['Periquera alta madera', 'Periquera alta metal'],
    'Descanso (madera o metálico)': ['Descanso de madera', 'Descanso metálico'],
    'Portería metálica (dorada o negra)': ['Portería metálica dorada', 'Portería metálica negra'],
    'Banco alto (elegir modelo)': ['Banco madera alto', 'Banco metálico alto', 'Banco alto tejido plástico negro'],
    'Números de mesa (acrílico o madera)': ['Números de mesa acrilicos', 'Números para mesa en madera'],
    'Letra gigante XV (1.10 o 1.80 m)': ['Letra gigante XV 1.10 mt', 'Letra gigante XV 1.80 mt']
  };

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
      items.push({ nombre: nombre, categoria: categoria || 'Otros', cant: cant, nota: nota || '', alt: alt || [], opciones: OPCIONES[nombre] || null });
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
    var sinMenu = !Object.keys(tm).some(function (k) { return hay(k); }) && !b.proteina && !String(b.menu_notas || '').trim();
    if (sinMenu) pendientes.push('No hay menú registrado: falta definir entrada, sopa o crema, plato fuerte y postre (de ahí salen la loza y los cubiertos por invitado).');
    else if (!hayFuerte) pendientes.push('No hay plato fuerte en el menú: confirmar cuchillo y tenedor.');
    // Back detrás de la mesa principal: si el plano no tiene uno, se pregunta
    var hayPrincipal = elements.some(function (e) { return /^table_honor/.test(e.type); });
    var hayBack = elements.some(function (e) { return /backdrop|arch|back_/.test(e.type) || /\bback\b/i.test(e.name || ''); });
    if (hayPrincipal && !hayBack) pendientes.push('Falta definir si habrá back detrás de la mesa principal (si sí, agrégalo al plano).');

    // Todo lo escrito en el brief (para detectar lo que se va a ocupar aunque no esté en el plano)
    var textoBrief = norm(JSON.stringify(b));
    var principalMarmol = /mesa principal[^.]{0,40}marmol/.test(textoBrief);
    var sillonPrincesa = /sillon de princesa/.test(textoBrief);

    // Mesas del banquete y mesa principal: montaje por lugar
    var copasSinReparto = false;
    L.banquete.concat(L.principal).forEach(function (e) {
      var c = e.mesaConfig || {}, n = parseInt(e.chairs, 10) || 0;
      var principal = MESAS_PRINCIPALES.test(e.type);
      var inv = e.inventario || {};
      var mesa = inv.mesa ? inv.mesa : principal ? (principalMarmol ? 'Mesa rectangular tipo marmol' : 'Mesa principal — tipo por confirmar') : (e.type === 'table_imperial' ? 'Mesa tablón' : MESA[e.type] || ('Mesa — ' + (e.name || e.type)));
      sumar(mesa, e.type === 'table_imperial' ? (e.tablones || 1) : 1, 'Mesas y periqueras', principal ? '1 es la mesa principal' : '');
      if (!n) return;
      if (principal && c.tipoSilla === 'princesa' && parseInt(c.sillonesPrincesa, 10) > 0) {
        // Sillones de princesa al centro y sillas normales a los lados (p. ej. para las mamás)
        var nSillones = Math.min(n, parseInt(c.sillonesPrincesa, 10));
        sumar(c.sillonPrincesaNombre || 'Sillón de princesa', nSillones, 'Sillas y bancos', 'mesa principal');
        if (n > nSillones) sumar(SILLA[c.sillaAcompanantes || 'tiffany'], n - nSillones, 'Sillas y bancos', 'mesa principal, a los lados de los sillones');
        if (n > nSillones && c.sillaCojin && c.sillaAcompanantes === 'crossback') sumar('Cojín para silla cross back', n - nSillones, 'Sillas y bancos', 'mesa principal');
      } else if (principal && sillonPrincesa) {
        // Mesa principal de XV: sillón de princesa para la festejada; los demás lugares (chambelanes) con otra silla
        sumar('Sillón de princesa', 1, 'Sillas y bancos', 'mesa principal');
        if (n > 1) sumar('Silla para la mesa principal — elegir modelo', n - 1, 'Sillas y bancos', 'chambelanes / acompañantes');
      } else if (inv.silla) sumar(inv.silla, n, 'Sillas y bancos');
      else if (c.tipoSilla) sumar(SILLA[c.tipoSilla] || ('Silla ' + cap(c.tipoSilla)), n, 'Sillas y bancos');
      if (c.sillaFunda && c.sillaFunda !== 'ninguna') sumar('Funda completa para silla Tiffany color ' + norm(c.sillaFunda), n, 'Sillas y bancos');
      // Cojín por silla (opción de la mesa): cross back, Tiffany, Boss o Lotus
      if (c.sillaCojin && !principal) {
        var COJIN = { crossback: 'Cojín para silla cross back', tiffany: 'Cojín para silla tiffany', metalica: 'Cojín para silla boss' };
        if (COJIN[c.tipoSilla]) sumar(COJIN[c.tipoSilla], n, 'Sillas y bancos', c.sillaCojin === true ? '' : 'color ' + c.sillaCojin);
      }
      // Plato base: uno, o dos alternados (la mitad de los lugares cada uno; el mismo reparto que las copas)
      if (c.platoBase && c.platoBase !== 'ninguno') {
        var pb1 = PLATO_BASE[c.platoBase] || ('Plato base ' + cap(c.platoBase));
        if (c.platoBase2 && c.platoBase2 !== 'ninguno' && c.platoBase2 !== c.platoBase) {
          var repPb = parseInt(c.copasReparto, 10);
          var nPb1 = isNaN(repPb) ? Math.ceil(n / 2) : Math.max(0, Math.min(n, repPb));
          if (nPb1) sumar(pb1, nPb1, 'Loza', 'alternado');
          if (n - nPb1) sumar(PLATO_BASE[c.platoBase2] || ('Plato base ' + cap(c.platoBase2)), n - nPb1, 'Loza', 'alternado');
        } else sumar(pb1, n, 'Loza');
      }
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
      // Una copa por lugar: con dos copas se reparten (copasReparto llevan la 1; si no se indica, mitad y mitad)
      if (c1 && c2) {
        var rep1 = parseInt(c.copasReparto, 10);
        var n1 = isNaN(rep1) ? Math.ceil(n / 2) : Math.max(0, Math.min(n, rep1));
        if (isNaN(rep1)) copasSinReparto = true;
        if (n1) sumar(c1, n1, 'Cristalería');
        if (n - n1) sumar(c2, n - n1, 'Cristalería');
      } else if (c1) sumar(c1, n, 'Cristalería');
      else if (c2) sumar(c2, n, 'Cristalería');
      // Servilletas: UNA por lugar. Con dos dobleces se reparten como las copas (copasReparto o mitad y mitad),
      // separadas por color
      var folds = Array.isArray(c.servilletaDoblez) ? c.servilletaDoblez : (c.servilletaDoblez ? [c.servilletaDoblez] : []);
      var repSv = parseInt(c.copasReparto, 10);
      var nSv1 = isNaN(repSv) ? Math.ceil(n / 2) : Math.max(0, Math.min(n, repSv));
      folds.forEach(function (f, i) {
        var piezas = folds.length === 1 ? n : folds.length === 2 ? (i === 0 ? nSv1 : n - nSv1)
          : Math.floor(n / folds.length) + (i < n % folds.length ? 1 : 0);
        if (!piezas) return;
        var color = c['servilletaColor_' + f] || (f === 'corazon' ? c.servilletaColorCorazon : f === 'corbata' ? c.servilletaColorCorbata : c.servilletaColorOtros) || 'blanco';
        // En el inventario: "Servilleta azul cielo", "Servilleta corrugada azul plumbago"… o la genérica "Servilleta de tela"
        var tono = norm(String(color).replace(/_/g, ' '));
        sumar('Servilleta ' + tono, piezas, 'Mantelería', 'doblez ' + f, ['Servilleta corrugada ' + tono]);
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
      var numInv = L.banquete.map(function (e) { return e.inventario && e.inventario.numero; }).find(Boolean);
      sumar(numInv || 'Números de mesa (acrílico o madera)', numeradas, 'Identificadores de mesa');
      sumar('Base metálica para numeración de mesas', numeradas, 'Identificadores de mesa');
    }
    if (/cojin/.test(norm(b.vajilla_color || '')) && L.banquete.some(function (e) { return e.mesaConfig && e.mesaConfig.tipoSilla === 'crossback'; })) {
      var cb = L.banquete.filter(function (e) { return e.mesaConfig && e.mesaConfig.tipoSilla === 'crossback'; }).reduce(function (s, e) { return s + (parseInt(e.chairs, 10) || 0); }, 0);
      sumar('Cojín para silla cross back', cb, 'Sillas y bancos', 'el brief dice "con cojín"');
    }

    // Cóctel: periqueras, sombrillas, bancos y salas lounge
    L.coctel.forEach(function (e) {
      if (e.type === 'lounge_set') { sumar('Sala lounge madera', 1, 'Salas y sombrillas'); return; }
      sumar((e.inventario && e.inventario.mesa) || 'Periquera (madera o metal)', 1, 'Mesas y periqueras');
      if (/umbrella/.test(e.type)) sumar('Sombrilla', 1, 'Salas y sombrillas');
      if (parseInt(e.chairs, 10)) sumar((e.inventario && e.inventario.silla) || 'Banco alto (elegir modelo)', parseInt(e.chairs, 10), 'Sillas y bancos');
    });
    L.otras.forEach(function (e) {
      if (/carrito/.test(norm(e.name))) sumar('Carrito de snacks', 1, 'Snacks y estaciones');
      else if (e.type === 'table_gifts') sumar('Mesa de regalos — elegir mesa', 1, 'Mesas y periqueras');
      else if (e.type === 'table_cake') sumar('Mesa de pastel — elegir mesa', 1, 'Mesas y periqueras');
      // table_photographers: la llevan los fotógrafos; solo se ubica en el croquis (no sale de bodega)
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
      var letraPlano = elements.find(function (e) { return e.type === 'giant_letters_xv' && e.inventario && e.inventario.articulo; });
      sumar(letraPlano ? letraPlano.inventario.articulo : 'Letra gigante XV (1.10 o 1.80 m)', 1, 'Letras gigantes');
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
      // Un kit por barra (fija o montable)
      var k = Math.max(1, barras.length);
      ['Exprimidor de limon', 'Cuchillo de barra', 'Pica hielo', 'Pinzas para hielo', 'Tarja para hielo'].forEach(function (p) { sumar(p, k, 'Barra y cocina', k === 1 ? '1 kit de barra' : k + ' kits de barra (uno por barra)'); });
    }

    // ── Lo que se arma desde el plano ──
    var deTipo = function (re) { return elements.filter(function (e) { return re.test(e.type || ''); }); };
    // Back: su estructura es una portería
    var backs = elements.filter(function (e) { return /backdrop|back_/.test(e.type) || /\bback\b/i.test(e.name || ''); });
    backs.forEach(function (e) {
      var p = e.porteria === 'negra' ? 'Portería metálica negra' : e.porteria === 'dorada' ? 'Portería metálica dorada' : 'Portería metálica (dorada o negra)';
      sumar(p, 1, 'Decoración y estructuras', 'estructura del back');
    });
    // Alfombra roja colocada en el plano
    if (deTipo(/^red_carpet$/).length) sumar('Alfombra roja', deTipo(/^red_carpet$/).length, 'Decoración y estructuras');
    // Letras gigantes del plano con su texto (p. ej. "M & E"): las que hay en bodega se piden; las que no, quedan pendientes
    deTipo(/^giant_letters$/).forEach(function (e) {
      var letras = String(e.letras || '').toUpperCase().replace(/\s+/g, '').split('');
      if (!letras.length) { pendientes.push('Letras gigantes: indicar qué letras lleva "' + (e.name || 'Letras') + '".'); return; }
      var hay = { E: 1, L: 1, O: 1, V: 1 }, faltan = [];
      // letrasPorConfirmar: aún no se sabe si van; letrasSinFocos: van sin focos (no piden focos ni extensiones)
      var notaL = e.letras + (e.letrasPorConfirmar ? ' · POR CONFIRMAR si van' : '') + (e.letrasSinFocos ? ' · sin focos' : '');
      letras.forEach(function (l) { if (hay[l]) sumar('Letra gigante ' + l, 1, 'Letras gigantes', notaL); else faltan.push(l === '&' ? '"&"' : l); });
      if (e.letrasPorConfirmar) pendientes.push('Letras gigantes "' + e.letras + '": por confirmar si van' + (e.letrasSinFocos ? ' (si van, sin focos)' : '') + (faltan.length ? '; en bodega solo hay E, L, O, V y XV, falta quién consigue ' + faltan.join(', ') : '') + '.');
      else if (faltan.length) pendientes.push('Letras gigantes "' + e.letras + '": en bodega solo hay E, L, O, V y XV; confirmar si van y quién consigue ' + faltan.join(', ') + '.');
      if (!e.letrasSinFocos) ilumina = true;
    });
    if (ilumina && !items.some(function (i) { return i.nombre === 'Focos para letras gigantes'; })) {
      sumar('Focos para letras gigantes', '', 'Iluminación y eléctrico', 'POR CONFIRMAR: cuántos focos lleva cada letra');
      sumar('Extensión eléctrica', '', 'Iluminación y eléctrico', 'POR CONFIRMAR: cuántas');
      pendientes.push('Letras gigantes: definir cuántos focos lleva cada letra y cuántas extensiones se ocupan.');
    }
    if (!ilumina) pendientes.push('Extensiones eléctricas: definir si se llevan y cuántas.');
    // Chisperos colocados en el plano
    var chisperos = deTipo(/^sparklers$/).length;
    var provChisp = (d.proveedores || []).find(function (p) { return /chispero/.test(norm((p.servicio || '') + ' ' + (p.servicioOtro || ''))); });
    if (chisperos) pendientes.push('Chisperos: ' + chisperos + ' en el plano; ' + (provChisp ? 'los proporciona ' + provChisp.nombre + '; confirmar' : 'confirmar proveedor,') + ' en qué momento se detonan y quién los detona.');
    // Periqueras: cada una con su sombrilla; definir cuántas de madera y cuántas de metal
    var nPeri = L.coctel.filter(function (e) { return e.type !== 'lounge_set'; }).length;
    if (nPeri) {
      var conSombrilla = L.coctel.filter(function (e) { return /umbrella/.test(e.type); }).length;
      if (nPeri - conSombrilla > 0) sumar('Sombrilla', nPeri - conSombrilla, 'Salas y sombrillas', 'una por periquera');
      pendientes.push('Periqueras: definir cuántas de las ' + nPeri + ' van de madera y cuántas de metal.');
    }

    // ── Por mesero: descanso, charola de bar y charola de grasa (1 de cada uno) ──
    var meseros = (d.staff || []).filter(function (p) { return /mesero/i.test(p.rol || ''); }).length;
    sumar('Descanso (madera o metálico)', meseros || '', 'Mesas y periqueras', '1 por mesero');
    sumar('Charola de bar', meseros || '', 'Barra y cocina', '1 por mesero');
    sumar('Charola de grasa', meseros || '', 'Barra y cocina', '1 por mesero');
    if (!meseros) pendientes.push('Meseros: faltan en el staff; con ellos se calculan descansos (de madera o metálicos), charolas de bar y de grasa (1 de cada uno por mesero).');
    // Jarras de plástico con tapa: una por mesa
    var nMesas = L.banquete.length + L.principal.length;
    if (nMesas) sumar('Jarra de plástico', nMesas, 'Barra y cocina', 'con tapa · 1 por mesa');
    // Limpieza
    ['Bolsas de basura', 'Esponja / fibra para trastes'].forEach(function (p) { sumar(p, '', 'Limpieza', 'POR CONFIRMAR: cuántas'); });
    pendientes.push('Limpieza: definir cuántas bolsas de basura y fibras para trastes.');

    // ── Bebidas, hielo e insumos ──
    if (hayBarra || /cerveza|whisk|tequila|refresco|bebida/.test(textoBrief)) {
      pendientes.push('Bebidas y mezcladores: definir cuántos de agua mineral, Coca-Cola, refresco de manzana y de toronja, jugo de limón y azúcar.');
      pendientes.push('Garrafones: cuántos, si van llenos o vacíos y quién los surte.');
      pendientes.push('Hielo: cuántas barras y cuántas bolsas de hielo en cubo, y quién las deja.');
      pendientes.push('Fruta: si se manda, cuál y qué cantidad.');
    }
    // Copas: con vaso solamente, o con brindis en el minuto a minuto
    var hayCopa = L.banquete.concat(L.principal).some(function (e) {
      var c = e.mesaConfig || {};
      return [c.cristal, c.cristal2].some(function (x) { return x && x !== 'ninguno' && !/cubero|old|vaso/.test(x); });
    });
    var hayBrindis = (d.minuto || []).some(function (m) { return /brindis/i.test(m.actividad || ''); });
    if (!hayCopa) pendientes.push('Copas: falta definir qué copas llevan las mesas' + (hayBrindis ? ' (hay brindis en el minuto a minuto)' : '') + '.');
    // Pétalos y conos para una dinámica
    var textoMinuto = norm((d.minuto || []).map(function (m) { return m.actividad; }).join(' '));
    if (/petalo|conos?\b/.test(textoBrief + ' ' + textoMinuto)) pendientes.push('Pétalos y conos: definir quién los surte y quién los reparte a los invitados.');
    // Pastel: si hay pastel en el minuto o el brief, falta saber quién lo provee y a qué hora llega
    var provs = d.proveedores || [];
    var provPastel = provs.find(function (p) { return /pastel/.test(norm((p.servicio || '') + ' ' + (p.nombre || '') + ' ' + (p.servicioOtro || ''))); });
    if (/pastel/.test(textoMinuto + ' ' + textoBrief)) {
      var llega = provPastel && (provPastel.llegada || provPastel.llega || provPastel.hora);
      if (!provPastel) pendientes.push('Pastel: definir quién lo provee y a qué hora llega.');
      else if (!llega) pendientes.push('Pastel: definir a qué hora llega (lo provee ' + (provPastel.nombre || provPastel.servicio) + ').');
    }
    // Kit de fiesta
    if (/infantil|xv|cumple/.test(norm(b.tipo_evento || '')) && !/kit de fiesta/.test(textoBrief)) pendientes.push('Kit de fiesta (pulseras, gorros, globos): definir si habrá y cuántos.');
    // Fotos del montaje
    if (!((d.montaje && d.montaje.fotos) || []).length) pendientes.push('Faltan las fotos del montaje (álbum del brief).');

    // Lugares contra invitados
    if (invitados && L.total !== invitados) {
      pendientes.unshift('El plano tiene ' + L.total + ' lugares (mesas + principal) y son ' + invitados + ' invitados: usa "Cuadrar sillas con invitados" para ajustar las mesas en el plano. ' +
        'Las cantidades por lugar de esta requisición salen del plano.');
    }
    var conLista = L.banquete.some(function (e) { return e.mesaConfig && e.mesaConfig.invitados && e.mesaConfig.invitados.length; });
    if (invitados && !conLista) pendientes.push('Falta definir cuántas sillas va en cada mesa: depende de la lista de invitados.');
    if (copasSinReparto) pendientes.push('Copas: hay mesas con dos copas sin reparto definido; se calculó mitad y mitad (una copa por lugar). Indica en la mesa cuántos lugares llevan la copa 1.');
    return { items: items, pendientes: pendientes, lugares: L };
  }

  // Cambios de sillas para que los lugares (mesas + principal) sean exactamente los invitados.
  // Se quita (o agrega) una silla por mesa empezando por la mesa 1, sin bajar de 8 ni pasar de 12.
  // Devuelve { cambios: [{ id, mesa, antes, despues }], falta } (falta ≠ 0 si no alcanzó con 8–12 por mesa).
  function cuadrar(elements, invitados) {
    var L = lugares(elements, invitados);
    var dif = L.total - invitados, cambios = {};
    var mesas = L.banquete.slice().sort(function (a, b) {
      return ((a.mesaConfig && parseInt(a.mesaConfig.mesaNum, 10)) || 999) - ((b.mesaConfig && parseInt(b.mesaConfig.mesaNum, 10)) || 999);
    });
    var sillas = function (e) { return cambios[e.id] ? cambios[e.id].despues : (parseInt(e.chairs, 10) || 0); };
    var guard = 0;
    while (dif !== 0 && mesas.length && guard++ < 1000) {
      var movio = false;
      for (var i = 0; i < mesas.length && dif !== 0; i++) {
        var e = mesas[i], n = sillas(e);
        if (dif > 0 && n > 8) { n--; dif--; } else if (dif < 0 && n < 12) { n++; dif++; } else continue;
        cambios[e.id] = { id: e.id, mesa: e.mesaConfig && e.mesaConfig.mesaNum, antes: cambios[e.id] ? cambios[e.id].antes : (parseInt(e.chairs, 10) || 0), despues: n };
        movio = true;
      }
      if (!movio) break;
    }
    return { cambios: Object.keys(cambios).map(function (k) { return cambios[k]; }), falta: dif };
  }

  // Al elegir una opción en la requisición se guarda en estos elementos del plano (element.inventario[clave])
  var ELEGIR_EN_PLANO = {
    'Mesa rectangular de madera (miel o nogal)': { clave: 'mesa', filtro: function (e) { return e.type === 'table_rectangular' || e.type === 'table_campirana'; } },
    'Silla cross back (miel o nogal)': { clave: 'silla', filtro: function (e) { return e.mesaConfig && e.mesaConfig.tipoSilla === 'crossback'; } },
    'Silla metálica (Boss o Lotus)': { clave: 'silla', filtro: function (e) { return e.mesaConfig && e.mesaConfig.tipoSilla === 'metalica'; } },
    'Sillón principal (elegir color)': { clave: 'silla', filtro: function (e) { return e.mesaConfig && e.mesaConfig.tipoSilla === 'princesa'; } },
    'Periquera (madera o metal)': { clave: 'mesa', filtro: function (e) { return /^table_periquera/.test(e.type); } },
    'Banco alto (elegir modelo)': { clave: 'silla', filtro: function (e) { return /^table_periquera/.test(e.type); } },
    'Números de mesa (acrílico o madera)': { clave: 'numero', filtro: function (e) { return e.mesaConfig && parseInt(e.mesaConfig.mesaNum, 10) > 0; } },
    'Letra gigante XV (1.10 o 1.80 m)': { clave: 'articulo', filtro: function (e) { return e.type === 'giant_letters_xv'; } }
  };
  // Color de la madera en el croquis según el tono elegido
  function colorMadera(nombre) {
    var n = norm(nombre);
    return /miel/.test(n) ? '#B07A3B' : /nogal/.test(n) ? '#5C3A21' : null;
  }

  // Servicios que deben tener su lugar en el plano: [nombre, cómo se escribe, tipo de elemento]
  var SERVICIOS_PLANO = [
    ['DJ', /(^|[^a-z])dj([^a-z]|$)/, /^dj_booth$/, 'dj_booth'], ['Pista de baile', /pista/, /^dancefloor/, 'dancefloor'],
    ['Cabina inflable', /inflable/, /^photobooth_inflatable$/, 'photobooth_inflatable'], ['Cabina 360°', /cabina 360|(^|[^/] )360( |°|$)/, /^photobooth_360$/, 'photobooth_360'],
    ['Espejo selfie', /espejo/, /^photobooth_mirror$/, 'photobooth_mirror'], ['Robot LED', /robot/, /^robot_led$/, 'robot_led'],
    ['Chisperos', /chispero/, /^sparklers$/, 'sparklers'], ['Grupo norteño', /norteno/, /^vendor_norteno$/, 'vendor_norteno'],
    ['Grupo versátil', /versatil/, /^vendor_versatil$/, 'vendor_versatil'], ['Banda', /(^|[^a-z])banda([^a-z]|$)/, /^vendor_banda$/, 'vendor_banda'],
    ['Mariachi', /mariachi/, /^vendor_mariachi$/, 'vendor_mariachi'], ['Chinelos', /chinelo/, /^vendor_chinelos$/, 'vendor_chinelos'],
    ['Saxofonista', /saxo/, /^vendor_saxo$/, 'vendor_saxo'], ['Show men (cabezones)', /cabezones|show ?men/, /^showmen/, 'showmen_inflatables'],
    ['Letras XV', /letras? (gigantes? )?xv/, /^giant_letters_xv$/, 'giant_letters_xv']
  ];
  // Lo que no cuadra entre el plano, el minuto a minuto y el brief.
  // Devuelve [{ texto, agregar: tipo de elemento que falta en el plano (opcional) }]
  function diferencias(ev, elements) {
    var d = ev.data || {}, b = d.brief || {}, out = [];
    var invitados = parseInt(b.invitados, 10) || 0;
    var L = lugares(elements, invitados);
    if (invitados && L.total !== invitados) out.push({ texto: 'Lugares: el plano tiene ' + L.total + ' (mesas + principal) y son ' + invitados + ' invitados.', cuadrar: true });
    var fuentes = [
      ['el minuto a minuto', (d.minuto || []).map(function (r) { return r.actividad; })],
      ['los proveedores', (d.proveedores || []).map(function (p) { return [p.servicio, p.nombre].join(' '); })],
      ['las amenidades del brief', b.amenidades || []]
    ];
    SERVICIOS_PLANO.forEach(function (sv) {
      if (elements.some(function (e) { return sv[2].test(e.type || ''); })) return;
      var donde = fuentes.filter(function (f) { return f[1].some(function (t) { return sv[1].test(norm(t)); }); }).map(function (f) { return f[0]; });
      if (donde.length) out.push({ texto: sv[0] + ': está en ' + donde.join(' y ') + ', pero no tiene lugar en el plano.', agregar: sv[3], nombre: sv[0] });
    });
    return out;
  }

  window.PEGCalculo = { calcular: calcular, lugares: lugares, cuadrar: cuadrar, diferencias: diferencias, ELEGIR_EN_PLANO: ELEGIR_EN_PLANO, colorMadera: colorMadera };
})();
