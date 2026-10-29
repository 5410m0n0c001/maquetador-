// ============================================================
// brief.js — Eventos de Primavera Events Group
// Brief del evento, minuto a minuto, montaje elegido con fotos,
// guardado en Supabase y modo planner / solo lectura.
// Standalone, no ES modules. Se carga antes de app.js; app.js llama PEGEventos.init().
// ============================================================

(function () {
  'use strict';

  // ── Configuración ─────────────────────────────────────────
  var SUPABASE_URL = 'https://fwqvkyeydykzleqowgqb.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_z5o9iiif7jSmnG2rLi_seA_BYeKhph8'; // llave pública (publishable)
  var TABLE = 'maquetador_eventos';
  var BUCKET = 'maquetador-fotos';
  // La contraseña solo evita cambios accidentales: la información del evento es pública por diseño.
  var PLANNER_PASSWORD = 'PrimaveraVIP';
  var PLANNER_FLAG = 'peg_modo_planner'; // ya no se usa: al recargar siempre se entra en solo lectura (se borra si quedó de antes)
  var LOCAL_PREFIX = 'peg_evento_';
  var MAX_FOTOS = 8;
  var FOTO_ETIQUETAS = ['Montaje', 'Loza', 'Plato', 'Cubertería', 'Cristalería', 'Centro de mesa', 'Mantelería', 'Otro'];
  // Límites del plan gratuito de Supabase (confirmar en el panel de Supabase → Usage)
  var LIMITE_DB = 500 * 1024 * 1024;
  var LIMITE_ARCHIVOS = 1024 * 1024 * 1024;

  // ── Paletas y colores más usados en bodas y XV años (para mostrarlas al cliente) ──
  var PALETTES = [
    { name: 'Blush & Oro', colors: ['#F4C2C2', '#E8B4B8', '#C9A96E', '#FFF8F0'] },
    { name: 'Champagne & Marfil', colors: ['#F7E7CE', '#E6D2B5', '#FFFFF0', '#C9A96E'] },
    { name: 'Verde salvia & Blanco', colors: ['#9CAF88', '#B2C2A4', '#FFFFFF', '#E8E4D9'] },
    { name: 'Terracota boho', colors: ['#C8553D', '#D9A441', '#F4E3C1', '#8B5E3C'] },
    { name: 'Azul marino & Dorado', colors: ['#1F2A44', '#2E4057', '#C9A96E', '#F8F6F4'] },
    { name: 'Vino & Oro', colors: ['#6D1A36', '#8E2C48', '#C9A96E', '#F5E6E8'] },
    { name: 'Lavanda & Plata', colors: ['#B9A7D1', '#D8CCE8', '#C0C0C0', '#FFFFFF'] },
    { name: 'Rosa mexicano & Fucsia', colors: ['#E4007C', '#FF4F9A', '#F9C6DA', '#C9A96E'] },
    { name: 'Azul cielo & Plata', colors: ['#A7C7E7', '#D6E6F5', '#C0C0C0', '#FFFFFF'] },
    { name: 'Negro & Dorado (gala)', colors: ['#1F1F1F', '#3A3A3A', '#C9A96E', '#F8F6F4'] },
    { name: 'Total white', colors: ['#FFFFFF', '#F8F6F4', '#EFE7E1', '#D9D4CC'] },
    { name: 'Esmeralda & Oro', colors: ['#0B6E4F', '#2E8B57', '#C9A96E', '#F8F6F4'] },
    { name: 'Lila & Rosa pastel', colors: ['#C8A2C8', '#F7C6D9', '#FBE3EC', '#FFFFFF'] },
    { name: 'Durazno & Coral', colors: ['#FFCBA4', '#FF9F80', '#F6E0D5', '#C9A96E'] },
    { name: 'Dusty blue & Blanco', colors: ['#8DA9C4', '#B7C9D9', '#FFFFFF', '#E5E5E5'] },
    { name: 'Rojo & Blanco', colors: ['#B22222', '#D7263D', '#FFFFFF', '#F5F5F5'] }
  ];
  var DRESS_COLORS = [
    { name: 'Blanco', hex: '#FFFFFF' }, { name: 'Marfil', hex: '#FFFFF0' }, { name: 'Champagne', hex: '#F7E7CE' },
    { name: 'Rosa palo', hex: '#F4C2C2' }, { name: 'Rosa mexicano', hex: '#E4007C' }, { name: 'Fucsia', hex: '#FF00A0' },
    { name: 'Lila', hex: '#C8A2C8' }, { name: 'Lavanda', hex: '#B57EDC' }, { name: 'Azul cielo', hex: '#A7C7E7' },
    { name: 'Azul rey', hex: '#4169E1' }, { name: 'Azul marino', hex: '#1F2A44' }, { name: 'Verde esmeralda', hex: '#0B6E4F' },
    { name: 'Verde menta', hex: '#98E6B8' }, { name: 'Rojo', hex: '#C1121F' }, { name: 'Vino', hex: '#6D1A36' },
    { name: 'Durazno', hex: '#FFCBA4' }, { name: 'Dorado', hex: '#D4AF37' }, { name: 'Plateado', hex: '#C0C0C0' },
    { name: 'Negro', hex: '#1F1F1F' }
  ];

  // Planos ya maquetados (templates.js) + desde cero
  var PLANOS_BASE = ['Jardín con alberca', 'Yolomecatl · Versión A', 'Yolomecatl · Versión B', 'Centro de Convenciones Presidente', 'Salón Manzanares', 'Empezar desde cero'];
  // Venue elegido → plano base sugerido
  var VENUE_A_PLANO = { 'C. Convenciones Presidente': 'Centro de Convenciones Presidente', 'Salón Jardín Yolomecatl': 'Yolomecatl · Versión A', 'Salón Manzanares': 'Salón Manzanares' };

  // Servicios que el cliente contrata por fuera → elemento del inventario para el plano (si existe)
  var SERVICIOS_EXTERNOS = {
    'Banda': 'vendor_banda', 'Grupo norteño': 'vendor_banda', 'Mariachi': 'vendor_mariachi', 'Saxofonista': 'vendor_saxo',
    'Grupo versátil / en vivo': 'vendor_banda', 'DJ': 'dj_booth', 'Fotografía y video': '', 'Cabina de fotos': 'photobooth_mirror',
    'Pastel / repostería': 'table_cake', 'Mesa de dulces / postres': 'table_candy', 'Banquete / taquiza': 'vendor_taquiza',
    'Bebidas / barra': '', 'Decoración / flores': '', 'Show / animación': 'showmen_inflatables', 'Pirotecnia / efectos': '', 'Otro': ''
  };

  // Al llenar el campo (clave) se marca sola la opción relacionada [campo, valor]
  var AUTO_MARCA = {
    venue_red: ['tiene_venue', 'Venue de la red Primavera'],
    venue_externo: ['tiene_venue', 'Sí (propio / externo)'],
    tipo_evento_otro: ['tipo_evento', 'Otro'],
    chambelanes_cuantos: ['chambelanes', 'Sí'],
    chambelanes_nombres: ['chambelanes', 'Sí'],
    menu_infantil_cant: ['menu_infantil', 'Sí'],
    pastel_detalle: ['pastel', 'Sí'],
    estilo_tematico: ['estilo_montaje', 'Temático'],
    foto_paquete: ['foto_incluye', 'Sí'],
    foto_extras: ['foto_incluye', 'Sí']
  };

  function vacio(v) {
    if (v == null || v === '') return true;
    if (Array.isArray(v)) return !v.length;
    if (typeof v === 'object') return !Object.keys(v).length;
    return false;
  }

  // ── Esquema del brief (formato "Brief de Evento" de PEG) ──
  var SI_NO = ['Sí', 'No'];
  var SECTIONS = [
    { id: 'cita', title: 'Datos de la cita', fields: [
      { k: 'folio', label: 'Folio' },
      { k: 'fecha_cita', label: 'Fecha de la cita', type: 'date' },
      { k: 'planner', label: 'Planner que atiende' },
      { k: 'como_nos_conocio', label: '¿Cómo nos conoció?', placeholder: 'Red social / referido', internal: true }
    ] },
    { id: 'cliente', title: 'Datos del cliente', fields: [
      { k: 'cliente_nombre', label: 'Nombre completo' },
      { k: 'cliente_tel', label: 'WhatsApp / Tel.', type: 'tel', internal: true },
      { k: 'cliente_correo', label: 'Correo electrónico', type: 'email', internal: true },
      { k: 'contacto_preferido', label: 'Contacto preferido', type: 'radio', options: ['WhatsApp', 'Llamada', 'Correo'], internal: true },
      { k: 'festejados', label: 'Festejado(s) / Nombre del evento' },
      { k: 'parentesco', label: 'Parentesco con el cliente' }
    ] },
    { id: 'evento', title: 'Datos del evento', fields: [
      { k: 'tipo_evento', label: 'Tipo de evento', type: 'radio', options: ['Boda', 'XV años', 'Graduación', 'Bautizo', 'Corporativo', 'Aniversario', 'Infantil', 'Otro'] },
      { k: 'tipo_evento_otro', label: 'Otro tipo de evento' },
      { k: 'fecha_evento', label: 'Fecha del evento', type: 'date' },
      { k: 'fecha_alterna', label: 'Fecha alterna', type: 'date' },
      { k: 'dia_semana', label: 'Día de la semana' },
      { k: 'hora_inicio', label: 'Hora de inicio', type: 'time' },
      { k: 'hora_cierre', label: 'Hora de cierre', type: 'time' },
      { k: 'duracion', label: 'Duración estimada' },
      { k: 'invitados', label: '# Invitados (aprox.)', type: 'number' },
      { k: 'adultos', label: 'Adultos', type: 'number' },
      { k: 'ninos', label: 'Niños', type: 'number' },
      { k: 'confirmados', label: 'Confirmados', type: 'radio', options: SI_NO },
      { k: 'formalidad', label: 'Formalidad', type: 'radio', options: ['Formal / Gala', 'Semiformal', 'Casual'] },
      { k: 'momento', label: 'Momento', type: 'radio', options: ['Día', 'Tarde', 'Noche'] },
      { k: 'tematica', label: 'Temática / estilo' },
      { k: 'paletas', label: 'Paleta de colores (puedes elegir varias para mostrarlas al cliente)', type: 'palette', options: PALETTES },
      { k: 'paleta', label: 'Paleta personalizada / notas de color' }
    ] },
    { id: 'especificos', title: 'Datos específicos por tipo de evento', fields: [
      { type: 'heading', label: 'Ceremonias (boda, XV años, bautizo…)' },
      { k: 'ceremonias', label: 'Marca cada ceremonia y anota hora, lugar y quién la oficia', type: 'detail', timed: true,
        options: ['Ceremonia civil', 'Ceremonia religiosa / misa', 'Ceremonia simbólica'],
        sub: [{ k: 'hora', label: 'Hora', type: 'time' }, { k: 'lugar', label: 'Lugar' }, { k: 'quien', label: 'Oficia (juez / sacerdote / ministro)' }] },

      { type: 'heading', label: 'Si es XV años' },
      { k: 'color_vestido', label: 'Color del vestido', type: 'swatches', options: DRESS_COLORS },
      { k: 'color_vestido_otro', label: 'Otro color / detalle del vestido' },
      { k: 'xv_mesa_principal', label: 'Mesa principal de la quinceañera', type: 'radio', options: ['Imperial con chambelanes', 'Imperial con familia', 'Redonda', 'Sin mesa principal'] },
      { k: 'chambelanes', label: 'Chambelanes', type: 'radio', options: SI_NO },
      { k: 'chambelanes_cuantos', label: '¿Cuántos?', type: 'number' },
      { k: 'chambelanes_nombres', label: 'Nombres de los chambelanes', type: 'textarea' },
      { k: 'coreografo', label: 'Coreógrafo (nombre)' },
      { k: 'coreografo_tel', label: 'Tel. coreógrafo', type: 'tel' },
      { k: 'coreografo_peg', label: 'Coreógrafo', type: 'checks', options: ['PEG lo proporciona'] },
      { k: 'xv_momentos', label: 'Momentos de la fiesta (hora y con quién)', type: 'detail', timed: true,
        options: ['Entrada de la quinceañera', 'Presentación / bendición', 'Vals con papá', 'Vals con chambelanes', 'Baile con el padrino / compadre', 'Baile con padrinos', 'Baile sorpresa', 'Show de chambelanes', 'Ceremonia de las 15 velas', 'Entrega de la última muñeca', 'Cambio de zapatilla', 'Coronación / entrega de tiara', 'Brindis', 'Partida de pastel', 'Semblanza / video'],
        sub: [{ k: 'hora', label: 'Hora', type: 'time' }, { k: 'quien', label: 'Con quién / responsable' }] },
      { k: 'xv_padrinos', label: 'Padrinos', type: 'detail',
        options: ['Padrinos de velación / misa', 'Padrinos de anillo', 'Padrinos de tiara / corona', 'Padrinos de zapatilla', 'Padrinos de última muñeca', 'Padrinos de cojín', 'Padrinos de biblia y rosario', 'Padrinos de ramo', 'Padrinos de pastel', 'Padrinos de brindis / copas'],
        sub: [{ k: 'nombre', label: 'Nombre(s)' }] },

      { type: 'heading', label: 'Si es Boda' },
      { k: 'boda_mesa_honor', label: 'Mesa principal de los novios', type: 'radio', options: ['Imperial con cortejo', 'Imperial solo novios', 'Mesa de novios (sweetheart)', 'Sin mesa principal'] },
      { k: 'damas_nombres', label: 'Damas de honor (nombres)', type: 'textarea' },
      { k: 'caballeros_nombres', label: 'Caballeros de honor (nombres)', type: 'textarea' },
      { k: 'pajes_nombres', label: 'Pajes y niñas de las flores (nombres)', type: 'textarea' },
      { k: 'boda_padrinos', label: 'Padrinos', type: 'detail',
        options: ['Padrinos de velación', 'Padrinos de anillos', 'Padrinos de arras', 'Padrinos de lazo', 'Padrinos de biblia y rosario', 'Padrinos de cojines', 'Padrinos de ramo', 'Padrinos de pastel', 'Padrinos de brindis / copas'],
        sub: [{ k: 'nombre', label: 'Nombre(s)' }] },
      { k: 'boda_momentos', label: 'Momentos de la fiesta (hora y con quién)', type: 'detail', timed: true,
        options: ['Entrada de los novios', 'Primer baile', 'Baile con papás', 'Baile con padrinos', 'Brindis', 'Partida de pastel', 'Lanzamiento de ramo', 'Lanzamiento de liga', 'Víbora de la mar', 'Show / sorpresa'],
        sub: [{ k: 'hora', label: 'Hora', type: 'time' }, { k: 'quien', label: 'Con quién / responsable' }] },

      { type: 'heading', label: 'Si es Graduación' },
      { k: 'institucion', label: 'Institución / empresa' },
      { k: 'generacion', label: 'Generación' },
      { k: 'grad_protocolo', label: 'Protocolo (hora y quién lo conduce)', type: 'detail', timed: true,
        options: ['Honores a la bandera', 'Himno Nacional', 'Presentación del presídium', 'Palabras de bienvenida', 'Mensaje del director', 'Discurso de generación', 'Pase de lista', 'Entrega de documentos / reconocimientos', 'Toma de protesta / juramento', 'Entrega de anillos de generación', 'Brindis', 'Vals de graduación', 'Último pase de lista', 'Lanzamiento de birretes', 'Foto de generación'],
        sub: [{ k: 'hora', label: 'Hora', type: 'time' }, { k: 'quien', label: 'Quién lo conduce / entrega' }] },

      { type: 'heading', label: 'Si es Corporativo' },
      { k: 'corp_programa', label: 'Programa (hora y responsable)', type: 'detail', timed: true,
        options: ['Bienvenida', 'Conferencia / ponencia', 'Reconocimientos / premiación', 'Brindis', 'Coffee break', 'Comida / cena', 'Rifa', 'Show / entretenimiento', 'Cierre'],
        sub: [{ k: 'hora', label: 'Hora', type: 'time' }, { k: 'quien', label: 'Responsable / ponente' }] }
    ] },
    { id: 'venue', title: 'Locación / Venue', fields: [
      { k: 'tiene_venue', label: '¿Ya tiene venue?', type: 'radio', options: ['Sí (propio / externo)', 'Quiere recomendación', 'Venue de la red Primavera'] },
      { k: 'venue_red', label: 'Venue de la red Primavera', type: 'radio', options: ['C. Convenciones Presidente', 'Finca Las Isabeles', 'Jardín La Flor', 'Jardín Tsu Nuum', 'Quinta Zarabanda', 'Salón & Jardín Solaire', 'Salón Jardín Yolomecatl', 'Salón Los Caballos', 'Salón Los Potrillos', 'Salón Manzanares', 'Villa Leona'] },
      { k: 'plano_base', label: 'Plano base para el maquetador (se usa al generar el plano)', type: 'radio', options: PLANOS_BASE },
      { k: 'venue_externo', label: 'Venue aliado / externo' },
      { k: 'tipo_espacio', label: 'Tipo de espacio', type: 'radio', options: ['Jardín', 'Salón', 'Mixto'] },
      { k: 'zona', label: 'Zona / municipio' },
      { k: 'area_techada', label: 'Área techada', type: 'radio', options: SI_NO },
      { k: 'capacidad', label: 'Capacidad requerida (pax)', type: 'number' },
      { k: 'plan_lluvia', label: 'Plan en caso de lluvia', type: 'radio', options: ['Carpa', 'Salón', 'N/A'] }
    ] },
    { id: 'menu', title: 'Banquete / Menú', fields: [
      { k: 'tipo_servicio', label: 'Tipo de servicio', type: 'radio', options: ['Emplatado (a la mesa)', 'Buffet', 'Estaciones de autor', 'Familiar', 'Taquiza', 'Parrillada de cortes'] },
      { k: 'num_tiempos', label: '# tiempos', type: 'radio', options: ['2', '3', '4', '5'] },
      { k: 'tiempos_menu', label: 'Tiempos del banquete (hora y platillo)', type: 'detail', timed: true,
        options: ['Cóctel de bienvenida', 'Entrada', 'Sopa / Crema', 'Ensalada', 'Plato fuerte', 'Postre', 'Tornafiesta'],
        sub: [{ k: 'hora', label: 'Hora', type: 'time' }, { k: 'platillo', label: 'Platillo / descripción', type: 'textarea' }] },
      { k: 'proteina', label: 'Carnes / proteína del plato fuerte', type: 'textarea' },
      { k: 'guarniciones', label: 'Guarniciones', type: 'textarea' },
      { k: 'menu_notas', label: 'Notas del menú', type: 'textarea' },
      { k: 'menu_infantil', label: 'Menú infantil', type: 'radio', options: SI_NO },
      { k: 'menu_infantil_cant', label: 'Cantidad menú infantil', type: 'number' },
      { k: 'menu_especial', label: 'Menú especial', type: 'checks', options: ['Vegetariano', 'Vegano', 'Sin gluten'] },
      { k: 'alergias', label: 'Alergias / restricciones', type: 'textarea' },
      { k: 'degustacion_fecha', label: 'Degustación — fecha', type: 'date' },
      { k: 'degustacion_personas', label: 'N° de personas', type: 'number' },
      { k: 'platillos_probar', label: 'Platillos a probar', type: 'textarea' },
      { k: 'pastel', label: 'Pastel', type: 'radio', options: SI_NO },
      { k: 'pastel_detalle', label: 'Sabores / pisos' },
      { k: 'dulces', label: 'Repostería y estaciones dulces', type: 'checks', options: ['Mesa de postres', 'Candy bar', 'Barra de snacks / botanas', 'Carrito de shots dulces', 'Barra de café'] },
      { k: 'dulces_otro', label: 'Otro' }
    ] },
    { id: 'bebidas', title: 'Bebidas / Barra', fields: [
      { k: 'esquema_bebidas', label: 'Esquema', type: 'radio', options: ['Barra libre', 'Descorche', 'Bebidas incluidas en paquete', 'Cliente lleva alcohol'] },
      { k: 'tipo_barra', label: 'Tipo de barra', type: 'checks', options: ['Nacional', 'Premium', 'Barra de mixología (12 toppings)', 'Cóctel de bienvenida', 'Tequila / licor personalizado'] },
      { k: 'bebidas_incluye', label: 'Incluye', type: 'checks', options: ['Vinos', 'Cerveza', 'Refrescos', 'Hidratación / agua', 'Café', 'Carrito de shots'] },
      { k: 'bebidas_otro', label: 'Otro' }
    ] },
    { id: 'mobiliario', title: 'Montaje y Mobiliario', fields: [
      { k: 'estilo_montaje', label: 'Estilo de montaje', type: 'radio', options: ['Clásico elegante', 'Imperial de salón', 'Rústico / Campirano', 'Boho pastel', 'Temático'] },
      { k: 'estilo_tematico', label: 'Temático: ¿cuál?' },
      { k: 'sillas', label: 'Sillas', type: 'checks', options: ['Tiffany (blanca / chocolate)', 'Crossback (miel / nogal)', 'Boss', 'Lotus', 'Sillón Rey & Reyna / palo de rosa (novios)', 'Banca larga', 'Banco puff individual', 'Silla negra plegable (económica)'] },
      { k: 'mesas', label: 'Mesas', type: 'checks', options: ['Redonda', 'Tablón / imperial', 'Rect. madera (miel/nogal)', 'Tipo mármol', 'Plegable cuadrada', 'Infantil'] },
      { k: 'centros', label: 'Centros', type: 'radio', options: ['Altos', 'Bajos', 'Mixtos'] },
      { k: 'centros_notas', label: 'Notas de centros de mesa (altos / bajos)', type: 'textarea' },
      { k: 'follaje_flores', label: 'Follaje y flores', type: 'textarea' },
      { k: 'colores_deco', label: 'Colores de la decoración', type: 'textarea' },
      { k: 'manteleria', label: 'Mantelería y caminos — color', type: 'textarea' },
      { k: 'vajilla_color', label: 'Vajilla / cristalería / cubertería — color', type: 'textarea' },
      { k: 'mesa_novios', label: 'Mesa de novios / festejada', type: 'radio', options: ['Imperial', 'Redonda'] },
      { k: 'floral', label: 'Diseño floral / arco / backdrop', type: 'textarea' }
    ] },
    { id: 'amenidades', title: 'Amenidades y entretenimiento', fields: [
      { k: 'amenidades', label: 'Amenidades', type: 'checks', options: ['DJ profesional', 'Pista de baile LED Pixel 5x5', 'Letra gigante XV (1.10 / 1.80 m)', 'Letras L-O-V-E', 'Corazón gigante iluminado', 'Set de chisperos en frío (4 inalámbricos)', 'Detonación estelar en frío (6)', 'Fuegos artificiales tradicionales (exterior)', 'Show men animador (cabezones)', 'Cabina inflable de fotos', 'Espejo selfie / Cabina espejo', 'Cabina 360°', 'Magazine Cover Booth (portada de revista VOGUE)', 'Banda en vivo', 'Mariachi', 'Saxofonista', 'Robot LED', 'Torres iluminadas 2 m', 'Back redondo metálico', 'Portería dorada / negra (ecuestre)', 'Alfombra roja', 'Números de mesa personalizados', 'Máquina de humo', 'Láser / pantallas'] },
      { k: 'amenidades_otro', label: 'Otro' }
    ] },
    { id: 'foto', title: 'Fotografía y Video', fields: [
      { k: 'foto_incluye', label: '¿Incluye?', type: 'radio', options: SI_NO },
      { k: 'foto_paquete', label: 'Paquete', type: 'radio', options: ['Experiencia Deluxe', 'Cinematic Prestige', 'Royal Cinematic', 'Eternal Promise', 'Memoria Clásica', 'A medida'] },
      { k: 'foto_extras', label: 'Extras', type: 'checks', options: ['Sesión previa (E-Session)', 'Álbum impreso', 'Fotos impresas', 'Videoclip para proyección', 'Doble cámara', 'Dron', 'USB / película'] }
    ] },
    { id: 'servicios', title: 'Servicios adicionales e integrales', fields: [
      { k: 'invitacion_digital', label: 'Invitación digital (INIT IDEA)', type: 'radio', options: ['Básica', 'Premium', 'Deluxe', 'Personalizada'] },
      { k: 'servicios', label: 'Servicios', type: 'checks', options: ['Coordinación día del evento', 'Wedding / Event planner integral', 'Planeación bodas destino', 'Meseros / capitán', 'Bartender', 'Hostess', 'Coordinador general', 'Servicios de emergencia / salud', 'Valet parking', 'Transporte / Limusinas', 'Hospedaje / convenio hotel', 'Maquillaje y peinado', 'Diseño floral', 'Ceremonia civil', 'Ceremonia religiosa / misa', 'Ceremonia simbólica', 'Cruz de madera / arco', 'Tequila personalizado Don Ramón', 'Souvenirs personalizados', 'Merchandising Store', 'Coffee break (corporativo)'] },
      { k: 'servicios_otro', label: 'Otro' }
    ] },
    { id: 'presupuesto', title: 'Presupuesto y paquete', internal: true, fields: [
      { k: 'presupuesto', label: 'Presupuesto estimado (MXN)' },
      { k: 'rango', label: 'Rango', type: 'radio', options: ['<50k', '50–100k', '100–150k', '150k+'] },
      { k: 'por_persona', label: 'Inversión por persona objetivo' },
      { k: 'forma_pago', label: 'Forma de pago', type: 'checks', options: ['Contado', 'Mensualidades', 'Transf.', 'Tarjeta'] },
      { k: 'anticipo', label: 'Anticipo a reservar' },
      { k: 'fecha_limite', label: 'Fecha límite de decisión', type: 'date' },
      { k: 'paquete', label: 'Paquete de interés', type: 'radio', options: ['Presidente', 'Gobernador', 'Linaje Pura Sangre', 'Imperial Ecuestre', "Nature's Majesty", 'Esencia Floral', 'Destino Yolomecatl', 'Glow Graduation', 'Elite', 'Armonía', 'Vuelo Esmeralda', 'A medida / Personalizado'] },
      { k: 'inclusiones', label: 'Inclusiones solicitadas / notas de paquete', type: 'textarea' }
    ] },
    { id: 'logistica', title: 'Logística y accesos', fields: [
      { k: 'hora_montaje', label: 'Horario de montaje', type: 'time' },
      { k: 'hora_desmontaje', label: 'Horario de desmontaje', type: 'time' },
      { k: 'restricciones', label: 'Restricciones del venue / permisos / accesos', type: 'textarea' },
      { k: 'observaciones', label: 'Observaciones / peticiones especiales', type: 'textarea' }
    ] },
    { id: 'contrato', title: 'Notas para la redacción del contrato', internal: true, fields: [
      { type: 'notice', label: 'Restricción de servicios externos', text: 'Queda prohibido el uso de servicios o proveedores externos que impliquen pirotecnia, show de lumbre/fuego, efectos incandescentes, chisperos ajenos o similares que puedan quemar, dañar o comprometer la integridad del mobiliario, equipo, instalaciones o estructura de la locación. Cualquier daño ocasionado será responsabilidad del contratante. Todo proveedor externo deberá ser autorizado por escrito por Primavera Events Group.' },
      { k: 'clausulas', label: 'Acuerdos / cláusulas especiales a incluir en el contrato', type: 'textarea' }
    ] },
    { id: 'seguimiento', title: 'Seguimiento del planner', internal: true, fields: [
      { k: 'cotizacion_fecha', label: 'Cotización enviada — fecha', type: 'date' },
      { k: 'seguimiento', label: 'Avance', type: 'checks', options: ['Kit Planner entregado', 'Invitación demo enviada', 'Degustación agendada'] },
      { k: 'proxima_accion', label: 'Próxima cita / acción' },
      { k: 'estatus', label: 'Estatus', type: 'radio', options: ['Prospecto', 'En negociación', 'Cerrado'] }
    ] }
  ];
  // Secciones propias del maquetador (no están en el formato impreso)
  var EXTRA_SECTIONS = [
    { id: 'minuto', title: 'Minuto a minuto' },
    { id: 'montaje_elegido', title: 'Montaje elegido y álbum de fotos' },
    { id: 'proveedores', title: 'Proveedores externos contratados por el cliente' }
  ];

  // Pasos del brief (un paso por pantalla); 'generar' es el cierre del planner
  var STEPS = [
    { title: 'Cliente y evento', sections: ['cita', 'cliente', 'evento', 'especificos'] },
    { title: 'Venue', sections: ['venue'] },
    { title: 'Banquete y bebidas', sections: ['menu', 'bebidas'] },
    { title: 'Montaje y mobiliario', sections: ['mobiliario'] },
    { title: 'Amenidades y proveedores', sections: ['amenidades', 'proveedores'] },
    { title: 'Foto, video y servicios', sections: ['foto', 'servicios'] },
    { title: 'Álbum del montaje', sections: ['montaje_elegido'] },
    { title: 'Minuto a minuto', sections: ['minuto'] },
    { title: 'Logística', sections: ['logistica'] },
    { title: 'Interno del planner', sections: ['presupuesto', 'contrato', 'seguimiento'], internal: true },
    { title: 'Generar plano', sections: [], generar: true, internal: true }
  ];

  // ── Estado ────────────────────────────────────────────────
  var _step = 0;
  var _sb = null;
  var _event = null;          // { id, nombre, fecha_evento, venue_id, data: { brief, minuto, montaje, layout } }
  var _isPlanner = false;
  var _saveTimer = null;
  var _lastLayoutJson = '';
  var _panel = null;

  function $(id) { return document.getElementById(id); }
  function toast(msg, type) { if (window.App && window.App.showToast) window.App.showToast(msg, type); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function eventIdFromUrl() {
    return new URLSearchParams(location.search).get('evento');
  }
  function eventUrl(id) {
    return location.origin + location.pathname + '?evento=' + id;
  }
  function client() {
    if (!_sb && window.supabase && window.supabase.createClient) {
      _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return _sb;
  }
  function emptyData() {
    return { brief: {}, minuto: [], montaje: { fotos: [] }, proveedores: [], layout: null };
  }

  // ── Modo planner / solo lectura ───────────────────────────
  function applyMode() {
    document.body.classList.toggle('peg-view-only', !_isPlanner);
    var btn = $('btn-planner-mode');
    if (btn) {
      btn.innerHTML = _isPlanner
        ? '<i class="fa-solid fa-unlock"></i> <b>Modo planner</b>'
        : '<i class="fa-solid fa-lock"></i> <b>Solo lectura</b>';
      btn.title = _isPlanner ? 'Modo planner activo (clic para salir)' : 'Solo lectura: clic para entrar como planner';
      btn.classList.toggle('active', _isPlanner);
    }
    updateEventBar();
    if (_panel) renderPanel();
  }

  function togglePlanner() {
    if (_isPlanner) {
      if (!confirm('¿Salir del modo planner? Quedará en modo de solo lectura.')) return;
      _isPlanner = false;
      applyMode();
      toast('Modo solo lectura.', 'info');
      return;
    }
    var pwd = prompt('Contraseña de planner:');
    if (pwd === null) return;
    if (pwd !== PLANNER_PASSWORD) { toast('Contraseña incorrecta.', 'error'); return; }
    _isPlanner = true;
    applyMode();
    toast('Modo planner activado.', 'success');
  }

  // ── Guardado ──────────────────────────────────────────────
  function setStatus(text, kind) {
    var el = $('event-save-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'event-status' + (kind ? ' ' + kind : '');
  }

  function saveLocalCopy() {
    if (!_event) return;
    try { localStorage.setItem(LOCAL_PREFIX + _event.id, JSON.stringify(_event)); } catch (e) { /* cuota llena */ }
  }

  function scheduleSave() {
    if (!_event || !_isPlanner) return;
    setStatus('Guardando…', 'pending');
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(saveNow, 1200);
  }

  function saveNow() {
    if (!_event || !_isPlanner || !client()) return;
    var b = _event.data.brief || {};
    _event.nombre = b.festejados || b.cliente_nombre || _event.nombre || 'Evento sin nombre';
    _event.fecha_evento = b.fecha_evento || null;
    _event.venue_id = (_event.data.layout && _event.data.layout.venueId) || null;
    saveLocalCopy();
    updateEventBar();
    client().from(TABLE).update({
      nombre: _event.nombre,
      fecha_evento: _event.fecha_evento,
      venue_id: _event.venue_id,
      data: _event.data
    }).eq('id', _event.id).then(function (res) {
      if (res.error) {
        setStatus('Sin conexión · guardado en este equipo', 'error');
        console.warn('[Eventos] Error al guardar:', res.error);
      } else {
        setStatus('Guardado', 'ok');
      }
    });
  }

  // El plano cambia dentro de app.js: se compara cada pocos segundos y se guarda si cambió
  function watchLayout() {
    setInterval(function () {
      if (!_event || !_isPlanner || !window.App || !window.App.getLayout) return;
      var json = JSON.stringify(window.App.getLayout());
      if (json !== _lastLayoutJson) {
        _lastLayoutJson = json;
        _event.data.layout = JSON.parse(json);
        scheduleSave();
      }
    }, 4000);
  }

  // ── Cargar / crear eventos ────────────────────────────────
  function loadEvent(id) {
    setStatus('Cargando evento…', 'pending');
    var local = null;
    try { local = JSON.parse(localStorage.getItem(LOCAL_PREFIX + id) || 'null'); } catch (e) { local = null; }
    var sb = client();
    var req = sb ? sb.from(TABLE).select('*').eq('id', id).maybeSingle() : Promise.resolve({ error: { message: 'Sin Supabase' } });
    return req.then(function (res) {
      var row = res && !res.error ? res.data : null;
      if (!row && local) {
        row = local;
        toast('Sin conexión: se muestra la última copia guardada en este equipo.', 'warning');
      }
      if (!row) {
        setStatus('', '');
        toast('No se encontró el evento.', 'error');
        return;
      }
      row.data = Object.assign(emptyData(), row.data || {});
      row.data.montaje = Object.assign({ fotos: [] }, row.data.montaje || {});
      if (!Array.isArray(row.data.proveedores)) row.data.proveedores = [];
      _event = row;
      if (row.data.layout && window.App && window.App.loadLayout) {
        window.App.loadLayout(row.data.layout);
      }
      _lastLayoutJson = window.App && window.App.getLayout ? JSON.stringify(window.App.getLayout()) : '';
      saveLocalCopy();
      updateEventBar();
      setStatus(_isPlanner ? 'Guardado' : '', _isPlanner ? 'ok' : '');
      return row;
    });
  }

  function createEvent() {
    if (!client()) { toast('No hay conexión con Supabase.', 'error'); return; }
    var data = emptyData();
    data.layout = window.App && window.App.getLayout ? window.App.getLayout() : null;
    client().from(TABLE).insert({
      nombre: 'Nuevo evento',
      venue_id: data.layout && data.layout.venueId,
      data: data
    }).select('id').single().then(function (res) {
      if (res.error) { toast('No se pudo crear el evento: ' + res.error.message, 'error'); return; }
      goToEvent(res.data.id, function () { openPanel(); });
    });
  }

  function updateEventBar() {
    var name = $('event-name');
    var has = !!_event;
    if (name) {
      name.textContent = has ? _event.nombre : '';
      name.classList.toggle('hidden', !has);
    }
    // El planner siempre ve "Brief" (si no hay evento, lo crea); los demás solo dentro de un evento
    var brief = $('btn-brief');
    if (brief) brief.classList.toggle('hidden', !has && !_isPlanner);
    var share = $('btn-share-event');
    if (share) share.classList.toggle('hidden', !has);
  }

  // Pide la contraseña si hace falta y luego continúa
  function ensurePlanner(next) {
    if (_isPlanner) { next(); return; }
    var pwd = prompt('Contraseña de planner:');
    if (pwd === null) return;
    if (pwd !== PLANNER_PASSWORD) { toast('Contraseña incorrecta.', 'error'); return; }
    _isPlanner = true;
    applyMode();
    next();
  }

  // Abre otro evento sin recargar la página (así no se pierde el modo planner)
  function goToEvent(id, then) {
    history.pushState(null, '', eventUrl(id));
    loadEvent(id).then(function (row) { if (row && then) then(); });
  }

  function closeModals() {
    Array.prototype.forEach.call(document.querySelectorAll('.venue-picker-overlay'), function (m) { m.remove(); });
  }

  // ── Bienvenida al abrir el enlace de un evento: ¿qué quieres ver? ──
  function openEventWelcome() {
    var b = _event.data.brief || {};
    var fecha = b.fecha_evento ? new Date(b.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
    var modal = document.createElement('div');
    modal.className = 'venue-picker-overlay';
    modal.innerHTML =
      '<div class="venue-picker">' +
        '<div class="venue-picker-head"><h2>' + esc(_event.nombre) + '</h2>' +
        '<button class="venue-picker-close" title="Cerrar"><i class="fa-solid fa-xmark"></i></button></div>' +
        '<p>' + (fecha ? esc(fecha.charAt(0).toUpperCase() + fecha.slice(1)) + ' · ' : '') + 'Estás en <strong>solo lectura</strong>. ¿Qué quieres hacer?</p>' +
        '<div class="venue-grid">' +
          '<button class="venue-card" data-w="brief"><i class="fa-solid fa-clipboard-list"></i><strong>Ver el brief</strong><span>Datos del evento, minuto a minuto y fotos del montaje.</span></button>' +
          '<button class="venue-card" data-w="plano"><i class="fa-solid fa-map-location-dot"></i><strong>Ver el plano</strong><span>Distribución del salón en 2D y 3D.</span></button>' +
          '<button class="venue-card" data-w="editar"><i class="fa-solid fa-unlock"></i><strong>Editar como planner</strong><span>Pide la contraseña de planner.</span></button>' +
          '<button class="venue-card venue-card-empty" data-w="inicio"><i class="fa-solid fa-house"></i><strong>Ir al inicio</strong><span>Crear otro evento o abrir uno guardado.</span></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    var close = function () { modal.remove(); };
    modal.querySelector('.venue-picker-close').onclick = close;
    modal.onclick = function (e) { if (e.target === modal) close(); };
    Array.prototype.forEach.call(modal.querySelectorAll('[data-w]'), function (btn) {
      btn.onclick = function () {
        var w = btn.getAttribute('data-w');
        if (w === 'inicio') { location.href = location.pathname; return; }
        if (w === 'editar') { ensurePlanner(function () { close(); openPanel(); }); return; }
        close();
        if (w === 'brief') openPanel();
      };
    });
  }

  // ── Pantalla de inicio: ¿brief o maquetar? ────────────────
  function openStartChooser() {
    var modal = document.createElement('div');
    modal.className = 'venue-picker-overlay';
    modal.innerHTML =
      '<div class="venue-picker start-chooser">' +
        '<div class="venue-picker-head"><h2>¿Qué quieres hacer primero?</h2>' +
        '<button class="venue-picker-close" title="Cerrar"><i class="fa-solid fa-xmark"></i></button></div>' +
        '<p>Puedes empezar por cualquiera: el brief y el plano quedan guardados en el mismo evento.</p>' +
        '<div class="venue-grid">' +
          '<button class="venue-card" data-go="brief"><i class="fa-solid fa-clipboard-list"></i>' +
            '<strong>Llenar el brief</strong><span>Cuestionario del evento con el cliente: datos, menú, montaje, minuto a minuto y fotos.</span></button>' +
          '<button class="venue-card" data-go="maquetar"><i class="fa-solid fa-map-location-dot"></i>' +
            '<strong>Maquetar</strong><span>Elige un salón ya maquetado o empieza desde cero.</span></button>' +
          '<button class="venue-card venue-card-empty" data-go="abrir"><i class="fa-solid fa-folder-open"></i>' +
            '<strong>Abrir un evento</strong><span>Continúa un evento guardado.</span></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    var close = function () { modal.remove(); };
    modal.querySelector('.venue-picker-close').onclick = close;
    modal.onclick = function (e) { if (e.target === modal) close(); };
    Array.prototype.forEach.call(modal.querySelectorAll('[data-go]'), function (btn) {
      btn.onclick = function () {
        var go = btn.getAttribute('data-go');
        ensurePlanner(function () {
          close();
          if (go === 'brief') createEvent();
          else if (go === 'maquetar') { if (window.App && window.App.openVenuePicker) window.App.openVenuePicker(); }
          else openEventsModal();
        });
      };
    });
  }

  function shareEvent() {
    if (!_event) return;
    var url = eventUrl(_event.id);
    if (navigator.share) {
      navigator.share({ title: _event.nombre + ' · Primavera Events Group', url: url }).catch(function () { /* cancelado */ });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () { toast('Enlace copiado.', 'success'); });
    } else {
      prompt('Enlace del evento:', url);
    }
  }

  // ── Mis eventos ───────────────────────────────────────────
  function fmtBytes(b) {
    if (b > 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
    return Math.round(b / 1024) + ' KB';
  }

  function openEventsModal() {
    if (!client()) { toast('No hay conexión con Supabase.', 'error'); return; }
    var modal = document.createElement('div');
    modal.className = 'venue-picker-overlay';
    modal.innerHTML =
      '<div class="venue-picker">' +
        '<div class="venue-picker-head"><h2>Mis eventos</h2>' +
        '<button class="venue-picker-close" title="Cerrar"><i class="fa-solid fa-xmark"></i></button></div>' +
        '<p>Cada evento guarda el plano, el brief, el minuto a minuto y las fotos del montaje.</p>' +
        '<div class="venue-grid" id="events-grid">' +
          '<button class="venue-card venue-card-empty" id="btn-new-event"><i class="fa-solid fa-plus"></i>' +
          '<strong>Nuevo evento</strong><span>Empieza con el plano que tienes abierto</span></button>' +
        '</div>' +
        '<div class="usage-meter" id="usage-meter">Calculando espacio usado…</div>' +
      '</div>';
    document.body.appendChild(modal);
    var close = function () { modal.remove(); };
    modal.querySelector('.venue-picker-close').onclick = close;
    modal.onclick = function (e) { if (e.target === modal) close(); };
    $('btn-new-event').onclick = createEvent;

    client().from(TABLE).select('id,nombre,fecha_evento,venue_id,updated_at')
      .order('updated_at', { ascending: false }).limit(60)
      .then(function (res) {
        var grid = $('events-grid');
        if (!grid) return;
        if (res.error) { toast('No se pudieron cargar los eventos.', 'error'); return; }
        res.data.forEach(function (ev) {
          var card = document.createElement('button');
          card.className = 'venue-card';
          var fecha = ev.fecha_evento ? new Date(ev.fecha_evento + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Sin fecha';
          card.innerHTML = '<i class="fa-solid fa-champagne-glasses"></i><strong>' + esc(ev.nombre) + '</strong>' +
            '<span>' + esc(fecha) + '</span>' +
            '<small>Editado ' + esc(new Date(ev.updated_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })) + '</small>';
          card.onclick = function () { closeModals(); goToEvent(ev.id, function () { openPanel(); }); };
          grid.appendChild(card);
        });
      });

    client().rpc('maquetador_uso').then(function (res) {
      var el = $('usage-meter');
      if (!el) return;
      if (res.error || !res.data) { el.textContent = ''; return; }
      var u = res.data;
      var pctDb = Math.round(u.db_bytes / LIMITE_DB * 100);
      var pctFiles = Math.round(u.storage_bytes / LIMITE_ARCHIVOS * 100);
      el.className = 'usage-meter' + (Math.max(pctDb, pctFiles) >= 70 ? ' warn' : '');
      el.innerHTML = '<i class="fa-solid fa-database"></i> Base de datos ' + fmtBytes(u.db_bytes) + ' (' + pctDb + '%) · ' +
        'Archivos ' + fmtBytes(u.storage_bytes) + ' (' + pctFiles + '%) · ' +
        u.eventos + ' eventos · ' + u.fotos + ' fotos del maquetador' +
        (Math.max(pctDb, pctFiles) >= 70 ? ' — <strong>revisa el espacio en Supabase</strong>' : '');
    });
  }

  // ── Panel del brief ───────────────────────────────────────
  function openPanel() {
    if (!_event) {
      // Planner sin evento abierto: se crea el evento con el plano actual y se abre su brief
      if (_isPlanner) createEvent();
      return;
    }
    if (!_panel) {
      _panel = document.createElement('div');
      _panel.id = 'brief-panel';
      _panel.className = 'brief-overlay';
      document.body.appendChild(_panel);
    }
    _panel.classList.remove('hidden');
    _step = 0;
    renderPanel();
  }

  function closePanel() {
    if (_panel) _panel.classList.add('hidden');
  }

  function fieldHtml(f, brief, ro) {
    var dis = ro ? ' disabled' : '';
    if (f.type === 'heading') return '<h4 class="brief-subhead">' + esc(f.label) + '</h4>';
    if (f.type === 'notice') {
      return '<div class="brief-notice"><strong><i class="fa-solid fa-triangle-exclamation"></i> ' + esc(f.label) + '</strong><p>' + esc(f.text) + '</p></div>';
    }
    var v = brief[f.k];
    if (ro && vacio(v)) return '';
    var wide = ['checks', 'radio', 'textarea', 'palette', 'swatches', 'detail'].indexOf(f.type) > -1;
    var html = '<div class="brief-field' + (wide ? ' wide' : '') + '">' +
      '<label class="form-label">' + esc(f.label) + '</label>';
    if (f.type === 'palette' || f.type === 'swatches') {
      // Tarjetas con muestras de color (selección múltiple); en solo lectura solo las elegidas
      var chosen = Array.isArray(v) ? v : [];
      var opts = ro ? f.options.filter(function (o) { return chosen.indexOf(o.name) > -1; }) : f.options;
      if (ro && !opts.length) return html + '<p class="brief-empty">—</p></div>';
      html += '<div class="' + (f.type === 'palette' ? 'palette-grid' : 'brief-chips') + '">' + opts.map(function (o) {
        var on = chosen.indexOf(o.name) > -1;
        var dots = f.type === 'palette'
          ? '<span class="palette-swatches">' + o.colors.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</span>'
          : '<i class="color-dot" style="background:' + o.hex + '"></i>';
        return '<button type="button" class="brief-chip ' + (f.type === 'palette' ? 'palette-card' : 'swatch-chip') + (on ? ' on' : '') +
          '" data-k="' + f.k + '" data-v="' + esc(o.name) + '" data-multi="1"' + dis + '>' + dots + '<span>' + esc(o.name) + '</span></button>';
      }).join('') + '</div>';
      return html + '</div>';
    }
    if (f.type === 'detail') {
      // Lista de opciones; cada una marcada lleva sus datos (hora, lugar, quién, nombre…)
      var val = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
      var names = f.options.concat(Object.keys(val).filter(function (n) { return f.options.indexOf(n) === -1; }));
      if (ro) names = names.filter(function (n) { return val[n]; });
      if (ro && !names.length) return html + '<p class="brief-empty">—</p></div>';
      html += '<div class="detail-list">' + names.map(function (n) {
        var on = !!val[n];
        var row = '<div class="detail-row' + (on ? ' on' : '') + '">' +
          '<button type="button" class="detail-toggle" data-dt="' + f.k + '" data-v="' + esc(n) + '"' + dis + '>' +
          '<i class="fa-solid ' + (on ? 'fa-circle-check' : 'fa-circle') + '"></i> ' + esc(n) + '</button>';
        if (on) {
          row += '<div class="detail-sub">' + f.sub.map(function (s) {
            var sv = val[n][s.k];
            var attrs = ' data-dk="' + f.k + '" data-dv="' + esc(n) + '" data-ds="' + s.k + '"' + dis;
            return s.type === 'textarea'
              ? '<textarea class="form-input detail-wide" placeholder="' + esc(s.label) + '"' + attrs + '>' + esc(sv) + '</textarea>'
              : '<input class="form-input" type="' + (s.type || 'text') + '" placeholder="' + esc(s.label) + '" title="' + esc(s.label) + '" value="' + esc(sv) + '"' + attrs + ' />';
          }).join('') + '</div>';
        }
        return row + '</div>';
      }).join('') + '</div>';
      if (!ro) html += '<button type="button" class="detail-add" data-da="' + f.k + '"><i class="fa-solid fa-plus"></i> Agregar otro</button>';
      return html + '</div>';
    }
    if (f.type === 'radio' || f.type === 'checks') {
      var multi = f.type === 'checks';
      var sel = multi ? (Array.isArray(v) ? v : []) : v;
      var visibles = ro ? f.options.filter(function (o) { return multi ? sel.indexOf(o) > -1 : sel === o; }) : f.options;
      html += '<div class="brief-chips">' + visibles.map(function (o) {
        var on = multi ? sel.indexOf(o) > -1 : sel === o;
        return '<button type="button" class="brief-chip' + (on ? ' on' : '') + '" data-k="' + f.k + '" data-v="' + esc(o) + '" data-multi="' + (multi ? 1 : 0) + '"' + dis + '>' + esc(o) + '</button>';
      }).join('') + '</div>';
    } else if (f.type === 'textarea') {
      html += '<textarea class="form-input form-textarea" data-k="' + f.k + '"' + dis + '>' + esc(v) + '</textarea>';
    } else {
      html += '<input class="form-input" type="' + (f.type || 'text') + '" data-k="' + f.k + '" value="' + esc(v) + '"' +
        (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + dis + ' />';
    }
    return html + '</div>';
  }

  function minutoHtml(rows, ro) {
    var dis = ro ? ' disabled' : '';
    var html = '<div class="minuto-list">';
    if (!rows.length) html += '<p class="brief-empty">Aún no hay actividades en el minuto a minuto.</p>';
    rows.forEach(function (r, i) {
      html += '<div class="minuto-row" data-i="' + i + '">' +
        '<input class="form-input" type="time" data-m="hora" value="' + esc(r.hora) + '"' + dis + ' />' +
        '<input class="form-input" data-m="actividad" placeholder="Actividad" value="' + esc(r.actividad) + '"' + dis + ' />' +
        '<input class="form-input" data-m="responsable" placeholder="Responsable" value="' + esc(r.responsable) + '"' + dis + ' />' +
        (ro ? '' : '<button type="button" class="minuto-del" title="Quitar"><i class="fa-solid fa-xmark"></i></button>') +
        '</div>';
    });
    html += '</div>';
    if (!ro) {
      html += '<div class="minuto-actions">' +
        '<button type="button" class="btn-ghost" id="minuto-add"><i class="fa-solid fa-plus"></i> Agregar actividad</button>' +
        '<button type="button" class="btn-gold" id="minuto-import"><i class="fa-solid fa-clock-rotate-left"></i> Traer horarios del brief</button>' +
        '</div>';
    }
    return html;
  }

  var PROV_CAMPOS = [
    { k: 'nombre', label: 'Nombre del proveedor' },
    { k: 'telefono', label: 'Teléfono / WhatsApp', type: 'tel' },
    { k: 'llegada', label: 'Llegada / montaje', type: 'time' },
    { k: 'inicio', label: 'Inicia', type: 'time' },
    { k: 'fin', label: 'Termina', type: 'time' },
    { k: 'condiciones', label: 'Condiciones de contratación (horas, pagos, qué incluye)', type: 'textarea' },
    { k: 'requerimientos', label: 'Requerimientos en el salón (luz, espacio, comida del staff, estacionamiento)', type: 'textarea' }
  ];

  function proveedoresHtml(list, ro) {
    var html = '';
    if (!ro) html += '<p class="panel-hint">Servicios que el cliente contrató por su cuenta (aunque sean de la red Primavera). Sirve para coordinar llegadas y montaje el día del evento.</p>';
    if (!list.length) html += '<p class="brief-empty">' + (ro ? 'Sin proveedores externos registrados.' : 'Aún no hay proveedores externos.') + '</p>';
    html += '<div class="prov-list">';
    list.forEach(function (p, i) {
      if (ro) {
        var horario = [p.llegada && 'llega ' + p.llegada, p.inicio && 'inicia ' + p.inicio, p.fin && 'termina ' + p.fin].filter(Boolean).join(' · ');
        html += '<div class="prov-card"><strong>' + esc(p.servicio || 'Proveedor') + (p.red ? ' <span class="prov-red">Red Primavera</span>' : '') + '</strong>' +
          (p.nombre ? '<div>' + esc(p.nombre) + (p.telefono ? ' · <a href="tel:' + esc(p.telefono) + '">' + esc(p.telefono) + '</a>' : '') + '</div>' : '') +
          (horario ? '<div class="prov-horario"><i class="fa-regular fa-clock"></i> ' + esc(horario) + '</div>' : '') +
          (p.condiciones ? '<p><b>Condiciones:</b> ' + esc(p.condiciones) + '</p>' : '') +
          (p.requerimientos ? '<p><b>Requerimientos:</b> ' + esc(p.requerimientos) + '</p>' : '') + '</div>';
        return;
      }
      html += '<div class="prov-card" data-pi="' + i + '">' +
        '<div class="prov-head"><select class="form-input" data-pk="servicio">' +
          '<option value="">Servicio…</option>' + Object.keys(SERVICIOS_EXTERNOS).map(function (sv) {
            return '<option' + (p.servicio === sv ? ' selected' : '') + '>' + sv + '</option>';
          }).join('') + '</select>' +
        '<label class="prov-check"><input type="checkbox" data-pk="red"' + (p.red ? ' checked' : '') + ' /> Es de la red Primavera</label>' +
        '<button type="button" class="minuto-del prov-del" title="Quitar proveedor"><i class="fa-solid fa-xmark"></i></button></div>' +
        (p.servicio === 'Pirotecnia / efectos' ? '<div class="brief-notice"><strong><i class="fa-solid fa-triangle-exclamation"></i> Requiere autorización por escrito</strong><p>Ver la restricción de servicios externos en las notas del contrato.</p></div>' : '') +
        '<div class="brief-grid">' + PROV_CAMPOS.map(function (f) {
          var v = p[f.k];
          return '<div class="brief-field' + (f.type === 'textarea' ? ' wide' : '') + '"><label class="form-label">' + esc(f.label) + '</label>' +
            (f.type === 'textarea'
              ? '<textarea class="form-input form-textarea" data-pk="' + f.k + '">' + esc(v) + '</textarea>'
              : '<input class="form-input" type="' + (f.type || 'text') + '" data-pk="' + f.k + '" value="' + esc(v) + '" />') + '</div>';
        }).join('') + '</div></div>';
    });
    html += '</div>';
    if (!ro) html += '<button type="button" class="btn-ghost" id="prov-add"><i class="fa-solid fa-plus"></i> Agregar proveedor externo</button>';
    return html;
  }

  // Orden del minuto a minuto: lo que pasa antes de las 6:00 es madrugada del día siguiente
  function minutosDelEvento(h) {
    if (!h) return 9999;
    var p = h.split(':'), m = parseInt(p[0], 10) * 60 + (parseInt(p[1], 10) || 0);
    return m < 360 ? m + 1440 : m;
  }
  function porHora(a, b) { return minutosDelEvento(a.hora) - minutosDelEvento(b.hora); }

  // Ceremonias, momentos, protocolo y tiempos del banquete con hora → filas del minuto a minuto
  function timedFromBrief(brief) {
    var rows = [];
    SECTIONS.forEach(function (s) {
      s.fields.forEach(function (f) {
        if (f.type !== 'detail' || !f.timed) return;
        var val = brief[f.k] || {};
        Object.keys(val).forEach(function (n) {
          var it = val[n] || {};
          if (!it.hora) return;
          var extra = [it.lugar, it.platillo].filter(Boolean).join(' · ');
          rows.push({ hora: it.hora, actividad: n + (extra ? ' — ' + extra : ''), responsable: it.quien || '' });
        });
      });
    });
    return rows;
  }

  // Texto legible de cualquier valor del brief (lo usa también la ficha PDF)
  function formatValue(f, v) {
    if (v == null || v === '') return '';
    if (f.type === 'detail') {
      return Object.keys(v || {}).map(function (n) {
        var it = v[n] || {};
        var parts = f.sub.map(function (s) { return it[s.k]; }).filter(Boolean);
        return n + (parts.length ? ': ' + parts.join(' · ') : '');
      }).join('\n');
    }
    if (Array.isArray(v)) return v.join(' · ');
    return String(v);
  }

  var MONTAJE_FIELDS = [
    { k: 'nombre', label: 'Montaje seleccionado' },
    { k: 'cubierteria', label: 'Cubertería' },
    { k: 'loza', label: 'Loza' },
    { k: 'plato', label: 'Plato base / trinche' },
    { k: 'cristaleria', label: 'Cristalería' },
    { k: 'notas', label: 'Notas del montaje', type: 'textarea' }
  ];

  function montajeHtml(m, ro) {
    var dis = ro ? ' disabled' : '';
    var fotos = m.fotos || [];
    var html = '';
    // Álbum primero: es lo que se llena en la degustación con el teléfono
    if (!ro) {
      html += '<div class="album-actions">' + (fotos.length < MAX_FOTOS
        ? '<label class="btn-primary album-btn"><i class="fa-solid fa-camera"></i> Tomar foto' +
            '<input type="file" accept="image/*" capture="environment" class="foto-input" hidden /></label>' +
          '<label class="btn-ghost album-btn"><i class="fa-solid fa-images"></i> Galería' +
            '<input type="file" accept="image/*" multiple class="foto-input" hidden /></label>'
        : '') +
        '<span class="album-count">' + fotos.length + ' de ' + MAX_FOTOS + ' fotos</span></div>';
    }
    html += '<div class="foto-grid">';
    fotos.forEach(function (f, i) {
      html += '<figure class="foto-card"><img src="' + esc(f.url) + '" alt="' + esc(f.etiqueta || 'Foto del montaje') + '" loading="lazy" data-zoom="' + i + '" />' +
        (ro
          ? (f.etiqueta ? '<figcaption>' + esc(f.etiqueta) + '</figcaption>' : '')
          : '<select class="foto-tag" data-i="' + i + '">' + ['<option value="">Etiqueta…</option>'].concat(FOTO_ETIQUETAS.map(function (t) {
              return '<option' + (f.etiqueta === t ? ' selected' : '') + '>' + t + '</option>';
            })).join('') + '</select>' +
            '<button type="button" class="foto-del" data-i="' + i + '" title="Quitar foto"><i class="fa-solid fa-xmark"></i></button>') +
        '</figure>';
    });
    if (ro && !fotos.length) html += '<p class="brief-empty">Sin fotos del montaje.</p>';
    html += '</div>';
    html += '<div class="brief-grid" style="margin-top:18px">' + MONTAJE_FIELDS.map(function (f) {
      var v = m[f.k];
      return '<div class="brief-field' + (f.type === 'textarea' ? ' wide' : '') + '"><label class="form-label">' + esc(f.label) + '</label>' +
        (f.type === 'textarea'
          ? '<textarea class="form-input form-textarea" data-mt="' + f.k + '"' + dis + '>' + esc(v) + '</textarea>'
          : '<input class="form-input" data-mt="' + f.k + '" value="' + esc(v) + '"' + dis + ' />') + '</div>';
    }).join('') + '</div>';
    return html;
  }

  // Vista ampliada de una foto del álbum
  function openLightbox(i) {
    var fotos = _event.data.montaje.fotos || [];
    if (!fotos[i]) return;
    var box = document.createElement('div');
    box.className = 'lightbox';
    var show = function () {
      box.innerHTML = '<button class="lightbox-close" title="Cerrar"><i class="fa-solid fa-xmark"></i></button>' +
        (fotos.length > 1 ? '<button class="lightbox-nav prev"><i class="fa-solid fa-chevron-left"></i></button><button class="lightbox-nav next"><i class="fa-solid fa-chevron-right"></i></button>' : '') +
        '<figure><img src="' + esc(fotos[i].url) + '" alt="" /><figcaption>' + esc(fotos[i].etiqueta || '') + ' · ' + (i + 1) + ' / ' + fotos.length + '</figcaption></figure>';
      box.querySelector('.lightbox-close').onclick = function () { box.remove(); };
      var p = box.querySelector('.prev'), n = box.querySelector('.next');
      if (p) p.onclick = function (e) { e.stopPropagation(); i = (i - 1 + fotos.length) % fotos.length; show(); };
      if (n) n.onclick = function (e) { e.stopPropagation(); i = (i + 1) % fotos.length; show(); };
    };
    box.onclick = function (e) { if (e.target === box) box.remove(); };
    show();
    document.body.appendChild(box);
  }

  // ── Generar el plano desde el brief ───────────────────────
  function generarHtml() {
    var b = _event.data.brief;
    var adultos = parseInt(b.adultos, 10) || 0, ninos = parseInt(b.ninos, 10) || 0;
    var total = parseInt(b.invitados, 10) || (adultos + ninos);
    var falta = [];
    if (!total) falta.push('# de invitados (paso 1)');
    if (!b.plano_base) falta.push('plano base (paso 2: Venue)');
    return '<div class="generar-box">' +
      '<p>Con lo que se llenó en el brief se arma un <strong>plano de partida</strong>: se carga el plano base, se calculan las mesas, ' +
      'se colocan la mesa principal, la pista y las amenidades elegidas. Después lo ajustas a mano en el maquetador.</p>' +
      '<ul class="generar-resumen">' +
        '<li><b>Plano base:</b> ' + esc(b.plano_base || '—') + '</li>' +
        '<li><b>Invitados:</b> ' + (total || '—') + (ninos ? ' (' + ninos + ' niños)' : '') + '</li>' +
        '<li><b>Mesas:</b> ' + esc((b.mesas || []).join(' · ') || 'Redonda (por defecto)') + '</li>' +
        '<li><b>Amenidades:</b> ' + ((b.amenidades || []).length || 0) + ' elegidas</li>' +
      '</ul>' +
      (falta.length ? '<p class="generar-falta"><i class="fa-solid fa-triangle-exclamation"></i> Falta: ' + falta.join(', ') + '</p>' : '') +
      '<button type="button" class="btn-primary" id="btn-generar-plano"' + (falta.length ? ' disabled' : '') + '>' +
        '<i class="fa-solid fa-wand-magic-sparkles"></i> Generar plano desde el brief</button>' +
      '</div>';
  }

  var AMENIDAD_ELEMENTO = {
    'DJ profesional': ['dj_booth', 'Cabina de DJ'],
    'Letra gigante XV (1.10 / 1.80 m)': ['giant_letters', 'Letra gigante XV'],
    'Letras L-O-V-E': ['giant_letters', 'Letras L-O-V-E'],
    'Corazón gigante iluminado': ['heart_illuminated', 'Corazón iluminado'],
    'Set de chisperos en frío (4 inalámbricos)': ['sparklers', 'Chisperos en frío'],
    'Detonación estelar en frío (6)': ['sparklers', 'Detonación estelar'],
    'Show men animador (cabezones)': ['showmen_inflatables', 'Show men'],
    'Cabina inflable de fotos': ['photobooth_inflatable', 'Cabina inflable'],
    'Espejo selfie / Cabina espejo': ['photobooth_mirror', 'Cabina espejo'],
    'Cabina 360°': ['photobooth_360', 'Cabina 360°'],
    'Magazine Cover Booth (portada de revista VOGUE)': ['backdrop', 'Magazine Cover Booth'],
    'Banda en vivo': ['vendor_banda', 'Banda en vivo'],
    'Mariachi': ['vendor_mariachi', 'Mariachi'],
    'Saxofonista': ['vendor_saxo', 'Saxofonista'],
    'Robot LED': ['robot_led', 'Robot LED'],
    'Back redondo metálico': ['backdrop', 'Back redondo metálico'],
    'Alfombra roja': ['red_carpet', 'Alfombra roja'],
    'Láser / pantallas': ['projector_screen', 'Pantalla / láser']
  };
  var MESA_TIPO = {
    'Redonda': 'table_round', 'Tablón / imperial': 'table_imperial', 'Rect. madera (miel/nogal)': 'table_rectangular',
    'Tipo mármol': 'table_marble_round', 'Plegable cuadrada': 'table_square'
  };

  function generarPlano() {
    var b = _event.data.brief;
    var cat = window.getCatalogEntry;
    if (!cat || !window.App) return;

    // 1. Plano base sin mesas ni amenidades (se conserva el salón, accesos, croquis y flujos)
    var base;
    var tpl = (window.VENUE_TEMPLATES || []).find(function (t) { return t.name === b.plano_base; });
    if (tpl) base = tpl.layout;
    else if (b.plano_base === 'Jardín con alberca' && window.DEFAULT_LAYOUT) base = window.DEFAULT_LAYOUT;
    else base = { terrain: { w: 50, h: 60 }, elements: [], flows: [] };
    var layout = JSON.parse(JSON.stringify(base));
    layout.elements = (layout.elements || []).filter(function (e) {
      return e.bg2d || e.category === 'estructuras' || e.category === 'accesos';
    });
    layout.venueId = tpl ? tpl.id : null;

    var cur = window.App.getLayout();
    var tieneMesas = cur.elements.some(function (e) { return !e.bg2d && e.category !== 'estructuras' && e.category !== 'accesos'; });
    if (tieneMesas && !confirm('Se reemplazarán las mesas y amenidades del plano actual por las del brief. Puedes deshacer con Ctrl+Z. ¿Continuar?')) return;

    // 2. Zona útil: el salón más grande del plano base (o el terreno completo)
    var zonas = layout.elements.filter(function (e) { return /^(salon|salon_carpa|terrace|garden)$/.test(e.type); })
      .sort(function (a, c) { return c.w * c.h - a.w * a.h; });
    var z = zonas[0] && /^salon/.test(zonas[0].type) ? zonas[0] : (zonas[0] || null);
    var area = z
      ? { x: z.x - z.w / 2 + 1.5, y: z.y - z.h / 2 + 1.5, w: z.w - 3, h: z.h - 3 }
      : { x: 2, y: 2, w: layout.terrain.w - 4, h: layout.terrain.h - 4 };
    // Empezar debajo de escenario, baños o barra que estén en la parte alta del salón
    layout.elements.forEach(function (e) {
      if (e === z || !/^(stage|bathroom|bar_area|kitchen|dressing_room|lobby_reception)$/.test(e.type)) return;
      var top = e.y - e.h / 2, bottom = e.y + e.h / 2;
      var dentroX = e.x + e.w / 2 > area.x && e.x - e.w / 2 < area.x + area.w;
      if (dentroX && top < area.y + area.h * 0.35 && bottom > area.y) {
        var recorte = bottom + 1 - area.y;
        area.y += recorte;
        area.h -= recorte;
      }
    });

    var n = 0;
    var mesaNum = 0;
    var nuevos = [];
    var silla = (b.sillas || []).join(' ');
    var tipoSilla = /Crossback/.test(silla) ? 'crossback' : 'tiffany';
    function mk(type, props) {
      var c = cat(type);
      if (!c) return null;
      var isMesa = c.defaultChairs > 0 || type.indexOf('table_') === 0 || type === 'lounge_set';
      var e = {
        id: 'gen_' + Date.now() + '_' + (++n), type: type, category: c.category, name: c.name,
        x: 0, y: 0, w: c.defaultW, h: c.defaultH, rotation: 0, color: c.color, chairs: c.defaultChairs,
        editable: true, removable: true, layer: c.layer || c.category
      };
      if (isMesa) {
        var floral = b.centros === 'Altos' ? 'alto' : b.centros === 'Bajos' ? 'bajo' : b.centros === 'Mixtos' ? (mesaNum % 2 ? 'alto' : 'bajo') : 'bajo';
        e.mesaConfig = {
          mesaNum: ++mesaNum, capacidadMax: null, mantelColor: 'blanco', caminoColor: 'dorado', caminoAcomodo: 'diagonal',
          servilletaColorCorazon: 'dorado', servilletaColorCorbata: 'champagne', servilletaColorOtros: 'blanco',
          servilletaDoblez: ['corazon', 'corbata'], cubiertos: 'plateado', platoBase: 'ninguno', platoTrinche: 'redondo_blanco',
          cristal: 'cubero', copasColor: 'transparente', cristal2: 'ninguno', copasColor2: 'transparente',
          tipoSilla: tipoSilla, menu: '', arregloFloralTipo: floral, arregloFloralAcomodo: 'diagonal', ensambleTipo: 'angosto', invitados: []
        };
      }
      Object.keys(props || {}).forEach(function (k) { e[k] = props[k]; });
      nuevos.push(e);
      return e;
    }

    var cx = area.x + area.w / 2;
    var y = area.y;

    // 3. Mesa principal arriba, al centro
    var tipoEv = b.tipo_evento;
    var principal = tipoEv === 'XV años' ? b.xv_mesa_principal : tipoEv === 'Boda' ? b.boda_mesa_honor : '';
    if (principal && !/^Sin /.test(principal)) {
      var hType = principal === 'Redonda' || principal === 'Mesa de novios (sweetheart)'
        ? 'table_round' : (tipoEv === 'XV años' ? 'table_honor_xv' : 'table_honor_bride');
      var h = mk(hType, { name: tipoEv === 'XV años' ? 'Mesa principal XV' : 'Mesa principal novios' });
      if (h) { h.x = cx; h.y = y + h.h / 2 + 1; y += h.h + 2.5; }
    }

    // Pastel y dulces a los lados de la mesa principal
    var lateral = [];
    if (b.pastel === 'Sí') lateral.push(['table_cake', 'Mesa de pastel']);
    if ((b.dulces || []).some(function (d) { return d === 'Mesa de postres' || d === 'Candy bar'; })) lateral.push(['table_candy', 'Mesa de dulces']);

    // 4. Pista (LED pixel si se eligió) con DJ al lado
    var guests = parseInt(b.invitados, 10) || ((parseInt(b.adultos, 10) || 0) + (parseInt(b.ninos, 10) || 0));
    var amen = (b.amenidades || []).slice();
    var pixel = amen.indexOf('Pista de baile LED Pixel 5x5') > -1;
    var lado = pixel ? 5 : Math.max(5, Math.min(12, Math.round(Math.sqrt(guests) * 0.7)));
    var pista = mk(pixel ? 'dancefloor_pixel' : 'dancefloor', { name: pixel ? 'Pista LED Pixel 5x5' : 'Pista de baile', w: lado, h: lado });
    pista.x = cx; pista.y = y + lado / 2;
    var iDj = amen.indexOf('DJ profesional');
    if (iDj > -1) {
      amen.splice(iDj, 1);
      var dj = mk('dj_booth', { name: 'Cabina de DJ' });
      dj.x = cx + lado / 2 + dj.w / 2 + 1; dj.y = pista.y;
    }
    lateral.forEach(function (l, i) {
      var e = mk(l[0], { name: l[1] });
      if (e) { e.x = cx + (i % 2 ? 1 : -1) * (lado / 2 + e.w / 2 + 1.5); e.y = pista.y - lado / 4; }
    });
    y += lado + 2;

    // 5. Mesas en cuadrícula debajo de la pista
    var ninos = parseInt(b.ninos, 10) || 0;
    var kidsAparte = ninos > 0 && ((b.mesas || []).indexOf('Infantil') > -1 || b.menu_infantil === 'Sí');
    var adultos = kidsAparte ? Math.max(0, guests - ninos) : guests;
    var tipoMesa = MESA_TIPO[(b.mesas || []).filter(function (m) { return MESA_TIPO[m]; })[0]] || 'table_round';
    var cMesa = cat(tipoMesa);
    var porMesa = cMesa.defaultChairs || 10;
    var lista = [];
    for (var i = 0; i < Math.ceil(adultos / porMesa); i++) lista.push(tipoMesa);
    if (kidsAparte) { var ck = cat('table_kids'); for (i = 0; i < Math.ceil(ninos / (ck.defaultChairs || 8)); i++) lista.push('table_kids'); }
    var cellW = cMesa.defaultW + 2.6, cellH = cMesa.defaultH + 2.6;
    // Columnas según la proporción del espacio libre, para repartir las mesas a lo ancho y a lo alto
    var altoDisp = Math.max(cellH, area.y + area.h - y - 4);
    var maxCols = Math.max(1, Math.floor(area.w / cellW));
    var cols = Math.max(1, Math.min(maxCols, Math.round(Math.sqrt(lista.length * (area.w / altoDisp) * (cellH / cellW)))));
    var filas = Math.ceil(lista.length / cols);
    var pasoX = Math.min(cellW * 1.8, area.w / Math.min(cols, lista.length));
    var startX = cx - (Math.min(cols, lista.length) - 1) * pasoX / 2;
    lista.forEach(function (t, idx) {
      var e = mk(t, { name: (t === 'table_kids' ? 'Mesa infantil ' : 'Mesa ') + (mesaNum + 1) });
      var col = idx % cols, row = Math.floor(idx / cols);
      e.x = Math.round((startX + col * pasoX) * 10) / 10;
      e._fila = row;
    });
    // Repartir las filas en el alto disponible (sin separarlas de más)
    var paso = filas > 1 ? Math.min(cellH * 1.8, Math.max(cellH, altoDisp / filas)) : cellH;
    nuevos.forEach(function (e) {
      if (!e._fila && e._fila !== 0) return;
      e.y = Math.round((y + cellH / 2 + e._fila * paso) * 10) / 10;
      delete e._fila;
    });
    var fondoMesas = y + (filas - 1) * paso + cellH;
    var desborde = fondoMesas > area.y + area.h;

    // 6. Amenidades y servicios en una fila bajo las mesas
    var extras = [];
    amen.forEach(function (a) { if (AMENIDAD_ELEMENTO[a]) extras.push(AMENIDAD_ELEMENTO[a]); });
    if (b.tipo_servicio === 'Buffet') extras.push(['table_buffet', 'Mesa de buffet']);
    if (b.tipo_servicio === 'Taquiza') extras.push(['vendor_taquiza', 'Taquiza']);
    if ((b.bebidas_incluye || []).indexOf('Carrito de shots') > -1 || (b.dulces || []).indexOf('Carrito de shots dulces') > -1) extras.push(['table_shots', 'Carrito de shots']);
    (_event.data.proveedores || []).forEach(function (p) {
      var tipo = SERVICIOS_EXTERNOS[p.servicio];
      if (tipo === 'dj_booth' && nuevos.some(function (e) { return e.type === 'dj_booth'; })) return;
      if (tipo) extras.push([tipo, (p.nombre || p.servicio) + ' (externo)']);
    });
    var ex = area.x, ey = fondoMesas + 1.5, altoFila = 0;
    extras.forEach(function (x) {
      var e = mk(x[0], { name: x[1] });
      if (!e) return;
      if (ex + e.w > area.x + area.w) { ex = area.x; ey += altoFila + 1.5; altoFila = 0; }
      e.x = Math.round((ex + e.w / 2) * 10) / 10;
      e.y = Math.round((ey + e.h / 2) * 10) / 10;
      ex += e.w + 1.5;
      altoFila = Math.max(altoFila, e.h);
    });
    var noColocadas = (b.amenidades || []).filter(function (a) { return a !== 'DJ profesional' && a !== 'Pista de baile LED Pixel 5x5' && !AMENIDAD_ELEMENTO[a]; });

    // 7. Cargar en el maquetador
    layout.elements = layout.elements.concat(nuevos);
    var maxY = Math.max.apply(null, layout.elements.map(function (e) { return e.y + (e.h || 0) / 2; }));
    if (maxY + 2 > layout.terrain.h) layout.terrain.h = Math.ceil(maxY + 2);
    window.App.loadLayout(layout);
    _event.data.brief.plano_generado = new Date().toISOString();
    scheduleSave();
    closePanel();
    var v2 = $('btn-view-2d');
    if (v2) v2.click();
    var capacidad = nuevos.reduce(function (s2, e) { return s2 + (e.mesaConfig ? (parseInt(e.chairs, 10) || 0) : 0); }, 0);
    toast('Plano generado: ' + lista.length + ' mesas (' + capacidad + ' lugares)' +
      (desborde ? '. Las mesas no caben en el salón: revisa el acomodo.' : '') +
      (noColocadas.length ? '. Sin elemento en el inventario: ' + noColocadas.join(', ') : '') + '.', desborde ? 'warning' : 'success');
  }

  function visibleSteps(ro) {
    return STEPS.filter(function (st) { return !(ro && st.internal); });
  }

  function renderPanel() {
    if (!_panel || !_event) return;
    var ro = !_isPlanner;
    var d = _event.data;
    var steps = visibleSteps(ro);
    if (_step >= steps.length) _step = steps.length - 1;
    var step = steps[_step];
    var byId = {};
    SECTIONS.concat(EXTRA_SECTIONS).forEach(function (sec) { byId[sec.id] = sec; });
    var pct = Math.round((_step + 1) / steps.length * 100);
    var html =
      '<div class="brief-shell">' +
        '<header class="brief-head">' +
          '<div><span class="brief-kicker">Brief de Evento · Primavera Events Group</span>' +
          '<h2>' + esc(_event.nombre) + '</h2></div>' +
          '<div class="brief-head-actions">' +
            (ro ? '<span class="brief-ro"><i class="fa-solid fa-eye"></i> Solo lectura</span>' : '') +
            '<button type="button" class="btn-ghost" id="brief-share"><i class="fa-solid fa-share-nodes"></i> Compartir</button>' +
            '<button type="button" class="btn-ghost" id="brief-pdf"><i class="fa-solid fa-file-pdf"></i> Ficha PDF</button>' +
            '<button type="button" class="btn-primary" id="brief-close"><i class="fa-solid fa-map"></i> Ver plano</button>' +
          '</div>' +
        '</header>' +
        '<div class="brief-progress"><span style="width:' + pct + '%"></span></div>' +
        // Pasos: chips en varias líneas (escritorio) y lista desplegable (teléfono)
        '<nav class="brief-nav">' + steps.map(function (st, i) {
          return '<a href="#" data-step="' + i + '" class="' + (i === _step ? 'active' : '') + '">' + (i + 1) + '. ' + esc(st.title) + '</a>';
        }).join('') + '</nav>' +
        '<div class="brief-nav-mobile"><select class="form-input" id="brief-nav-select">' + steps.map(function (st, i) {
          return '<option value="' + i + '"' + (i === _step ? ' selected' : '') + '>Paso ' + (i + 1) + ' de ' + steps.length + ': ' + esc(st.title) + '</option>';
        }).join('') + '</select></div>' +
        '<div class="brief-body">';
    if (ro) {
      html += '<div class="ro-banner"><div><strong><i class="fa-solid fa-eye"></i> Estás en solo lectura.</strong> ' +
        'Aquí se muestra solo lo que ya se capturó. Para llenar o editar el brief, entra como planner.</div>' +
        '<button type="button" class="btn-gold" id="ro-editar"><i class="fa-solid fa-unlock"></i> Editar como planner</button></div>';
    }
    if (step.generar) {
      html += '<section class="brief-section"><h3><span>' + (_step + 1) + '</span>' + esc(step.title) + '</h3>' + generarHtml() + '</section>';
    }
    step.sections.forEach(function (id) {
      var sec = byId[id];
      if (!sec || (ro && sec.internal)) return;
      html += '<section class="brief-section" id="brief-' + sec.id + '"><h3>' + esc(sec.title) + '</h3>';
      if (sec.id === 'minuto') html += minutoHtml(d.minuto || [], ro);
      else if (sec.id === 'montaje_elegido') html += montajeHtml(d.montaje || { fotos: [] }, ro);
      else if (sec.id === 'proveedores') html += proveedoresHtml(d.proveedores || [], ro);
      else {
        var parts = sec.fields
          .filter(function (f) { return !(ro && f.internal); })
          .map(function (f) { return { f: f, html: fieldHtml(f, d.brief, ro) }; });
        if (ro) {
          // Un subtítulo solo se muestra si debajo hay algo respondido
          parts = parts.filter(function (p, i) {
            if (p.f.type !== 'heading') return p.html !== '';
            for (var j = i + 1; j < parts.length && parts[j].f.type !== 'heading'; j++) if (parts[j].html) return true;
            return false;
          });
        }
        var inner = parts.map(function (p) { return p.html; }).join('');
        html += inner ? '<div class="brief-grid">' + inner + '</div>' : '<p class="brief-empty">Sin datos capturados todavía.</p>';
      }
      html += '</section>';
    });
    html += '<div class="brief-steps-nav">' +
      (_step > 0 ? '<button type="button" class="btn-ghost" id="step-prev"><i class="fa-solid fa-arrow-left"></i> Anterior</button>' : '<span></span>') +
      (_step < steps.length - 1 ? '<button type="button" class="btn-primary" id="step-next">Siguiente: ' + esc(steps[_step + 1].title) + ' <i class="fa-solid fa-arrow-right"></i></button>' : '') +
      '</div>';
    html += '</div></div>';
    var scroll = _panel.querySelector('.brief-body');
    var top = scroll ? scroll.scrollTop : 0;
    var sameStep = _panel.getAttribute('data-step') === String(_step);
    _panel.innerHTML = html;
    _panel.setAttribute('data-step', _step);
    if (top && sameStep) _panel.querySelector('.brief-body').scrollTop = top;
    wirePanel();
  }

  function goStep(i) {
    _step = i;
    renderPanel();
  }

  function wirePanel() {
    var d = _event.data;
    $('brief-close').onclick = closePanel;
    $('brief-share').onclick = shareEvent;
    $('brief-pdf').onclick = function () { if (window.App && window.App.exportPDF) window.App.exportPDF(); };
    _panel.querySelectorAll('.brief-nav a').forEach(function (a) {
      a.onclick = function (e) { e.preventDefault(); goStep(parseInt(a.getAttribute('data-step'), 10)); };
    });
    var navSel = $('brief-nav-select');
    if (navSel) navSel.onchange = function () { goStep(parseInt(navSel.value, 10)); };
    var prev = $('step-prev'), next = $('step-next');
    if (prev) prev.onclick = function () { goStep(_step - 1); };
    if (next) next.onclick = function () { goStep(_step + 1); };
    _panel.querySelectorAll('[data-zoom]').forEach(function (img) {
      img.onclick = function () { openLightbox(parseInt(img.getAttribute('data-zoom'), 10)); };
    });
    var gen = $('btn-generar-plano');
    if (gen) gen.onclick = generarPlano;
    var roEdit = $('ro-editar');
    if (roEdit) roEdit.onclick = function () { ensurePlanner(function () { renderPanel(); }); };
    if (!_isPlanner) return;

    // Campos con detalle: marcar/desmarcar, editar datos y agregar opciones propias
    _panel.querySelectorAll('.detail-toggle').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-dt'), n = b.getAttribute('data-v');
        var obj = (d.brief[k] && typeof d.brief[k] === 'object' && !Array.isArray(d.brief[k])) ? d.brief[k] : {};
        if (obj[n]) delete obj[n]; else obj[n] = {};
        d.brief[k] = obj;
        scheduleSave();
        renderPanel();
      };
    });
    _panel.querySelectorAll('[data-dk]').forEach(function (el) {
      el.addEventListener('input', function () {
        var obj = d.brief[el.getAttribute('data-dk')];
        obj[el.getAttribute('data-dv')][el.getAttribute('data-ds')] = el.value;
        scheduleSave();
      });
    });
    _panel.querySelectorAll('.detail-add').forEach(function (b) {
      b.onclick = function () {
        var n = prompt('Nombre del elemento a agregar:');
        if (!n || !n.trim()) return;
        var k = b.getAttribute('data-da');
        var obj = (d.brief[k] && typeof d.brief[k] === 'object' && !Array.isArray(d.brief[k])) ? d.brief[k] : {};
        obj[n.trim()] = obj[n.trim()] || {};
        d.brief[k] = obj;
        scheduleSave();
        renderPanel();
      };
    });

    // Marca la opción relacionada sin redibujar (para no perder el foco del campo)
    function autoMarca(k, v) {
      var rel = AUTO_MARCA[k];
      if (!rel || vacio(v) || d.brief[rel[0]] === rel[1]) return;
      d.brief[rel[0]] = rel[1];
      _panel.querySelectorAll('.brief-chip[data-k="' + rel[0] + '"]').forEach(function (c) {
        c.classList.toggle('on', c.getAttribute('data-v') === rel[1]);
      });
    }

    _panel.querySelectorAll('[data-k]:not(.brief-chip)').forEach(function (el) {
      el.addEventListener('input', function () {
        d.brief[el.getAttribute('data-k')] = el.value;
        autoMarca(el.getAttribute('data-k'), el.value);
        scheduleSave();
      });
    });
    _panel.querySelectorAll('.brief-chip').forEach(function (chip) {
      chip.onclick = function () {
        var k = chip.getAttribute('data-k'), v = chip.getAttribute('data-v');
        if (chip.getAttribute('data-multi') === '1') {
          var arr = Array.isArray(d.brief[k]) ? d.brief[k] : [];
          var i = arr.indexOf(v);
          if (i > -1) arr.splice(i, 1); else arr.push(v);
          d.brief[k] = arr;
          chip.classList.toggle('on', i === -1);
        } else {
          var same = d.brief[k] === v;
          d.brief[k] = same ? '' : v;
          if (k === 'venue_red' && !same && VENUE_A_PLANO[v] && !d.brief.plano_base) {
            d.brief.plano_base = VENUE_A_PLANO[v];
            d.brief.tiene_venue = 'Venue de la red Primavera';
            scheduleSave();
            renderPanel();
            return;
          }
          _panel.querySelectorAll('.brief-chip[data-k="' + k + '"]').forEach(function (c) { c.classList.remove('on'); });
          if (!same) chip.classList.add('on');
        }
        autoMarca(k, d.brief[k]);
        scheduleSave();
      };
    });

    // Proveedores externos
    _panel.querySelectorAll('.prov-card[data-pi]').forEach(function (card) {
      var p = d.proveedores[parseInt(card.getAttribute('data-pi'), 10)];
      card.querySelectorAll('[data-pk]').forEach(function (el) {
        var k = el.getAttribute('data-pk');
        el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', function () {
          p[k] = el.type === 'checkbox' ? el.checked : el.value;
          scheduleSave();
          if (k === 'servicio') renderPanel(); // muestra/oculta el aviso de pirotecnia
        });
      });
      card.querySelector('.prov-del').onclick = function () {
        if (!confirm('¿Quitar este proveedor?')) return;
        d.proveedores.splice(d.proveedores.indexOf(p), 1);
        scheduleSave();
        renderPanel();
      };
    });
    var provAdd = $('prov-add');
    if (provAdd) provAdd.onclick = function () { d.proveedores.push({}); renderPanel(); };

    // Minuto a minuto
    _panel.querySelectorAll('.minuto-row').forEach(function (row) {
      var i = parseInt(row.getAttribute('data-i'), 10);
      row.querySelectorAll('[data-m]').forEach(function (el) {
        el.addEventListener('input', function () { d.minuto[i][el.getAttribute('data-m')] = el.value; scheduleSave(); });
      });
      row.querySelector('[data-m="hora"]').addEventListener('change', function () {
        d.minuto.sort(porHora);
        renderPanel();
      });
      var del = row.querySelector('.minuto-del');
      if (del) del.onclick = function () { d.minuto.splice(i, 1); scheduleSave(); renderPanel(); };
    });
    var add = $('minuto-add');
    if (add) add.onclick = function () { d.minuto.push({ hora: '', actividad: '', responsable: '' }); renderPanel(); };
    var imp = $('minuto-import');
    if (imp) imp.onclick = function () {
      var timed = timedFromBrief(d.brief);
      (d.proveedores || []).forEach(function (p) {
        var quien = [p.servicio, p.nombre].filter(Boolean).join(' — ') || 'Proveedor externo';
        if (p.llegada) timed.push({ hora: p.llegada, actividad: 'Llegada y montaje: ' + quien, responsable: p.telefono || '' });
        if (p.inicio) timed.push({ hora: p.inicio, actividad: 'Inicia: ' + quien, responsable: p.telefono || '' });
        if (p.fin) timed.push({ hora: p.fin, actividad: 'Termina: ' + quien, responsable: p.telefono || '' });
      });
      var nuevos = timed.filter(function (r) {
        return !d.minuto.some(function (m) { return m.hora === r.hora && m.actividad === r.actividad; });
      });
      if (!nuevos.length) { toast('No hay horarios nuevos en el brief. Marca ceremonias, momentos o tiempos y anota su hora.', 'info'); return; }
      d.minuto = d.minuto.concat(nuevos).sort(porHora);
      scheduleSave();
      renderPanel();
      toast(nuevos.length + ' actividad(es) agregadas al minuto a minuto.', 'success');
    };

    // Montaje elegido
    _panel.querySelectorAll('[data-mt]').forEach(function (el) {
      el.addEventListener('input', function () { d.montaje[el.getAttribute('data-mt')] = el.value; scheduleSave(); });
    });
    _panel.querySelectorAll('.foto-del').forEach(function (b) {
      b.onclick = function () {
        if (!confirm('¿Quitar esta foto del evento?')) return;
        d.montaje.fotos.splice(parseInt(b.getAttribute('data-i'), 10), 1);
        scheduleSave();
        renderPanel();
      };
    });
    _panel.querySelectorAll('.foto-input').forEach(function (input) {
      input.onchange = function () {
        var libres = MAX_FOTOS - d.montaje.fotos.length;
        var files = Array.prototype.slice.call(input.files, 0, libres);
        if (input.files.length > libres) toast('Solo caben ' + libres + ' foto(s) más (máximo ' + MAX_FOTOS + ').', 'warning');
        // Una por una para no saturar la conexión del teléfono
        files.reduce(function (p, f) { return p.then(function () { return uploadPhoto(f); }); }, Promise.resolve());
      };
    });
    _panel.querySelectorAll('.foto-tag').forEach(function (sel) {
      sel.onchange = function () {
        d.montaje.fotos[parseInt(sel.getAttribute('data-i'), 10)].etiqueta = sel.value;
        scheduleSave();
      };
    });
  }

  // ── Fotos: se comprimen en el teléfono y se suben a Supabase Storage ──
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var MAX = 1600;
        var scale = Math.min(1, MAX / Math.max(img.width, img.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (blob && blob.size > 900 * 1024) {
            canvas.toBlob(resolve, 'image/jpeg', 0.6);
          } else {
            resolve(blob);
          }
        }, 'image/jpeg', 0.8);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });
  }

  function uploadPhoto(file) {
    if (!_event || !client()) return;
    toast('Subiendo foto…', 'info');
    return compressImage(file).then(function (blob) {
      var path = _event.id + '/' + Date.now() + '.jpg';
      return client().storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' }).then(function (res) {
        if (res.error) throw res.error;
        var pub = client().storage.from(BUCKET).getPublicUrl(path);
        _event.data.montaje.fotos.push({ url: pub.data.publicUrl, path: path, kb: Math.round(blob.size / 1024) });
        scheduleSave();
        renderPanel();
        toast('Foto agregada (' + Math.round(blob.size / 1024) + ' KB).', 'success');
      });
    }).catch(function (err) {
      toast('No se pudo subir la foto: ' + (err.message || err), 'error');
    });
  }

  // ── Arranque ──────────────────────────────────────────────
  function init() {
    _isPlanner = false;
    try { localStorage.removeItem(PLANNER_FLAG); } catch (e) { /* sin almacenamiento */ }
    applyMode();
    var bind = function (id, fn) { var el = $(id); if (el) el.onclick = fn; };
    bind('btn-planner-mode', togglePlanner);
    bind('btn-eventos', openEventsModal);
    bind('btn-brief', openPanel);
    bind('btn-share-event', shareEvent);
    watchLayout();

    var id = eventIdFromUrl();
    if (id) {
      loadEvent(id).then(function (row) { if (row) openEventWelcome(); });
    } else {
      openStartChooser();
    }
  }

  window.PEGEventos = {
    init: init,
    // Al inicio se muestra la pantalla "¿brief o maquetar?" de brief.js en lugar del selector de salón
    suppressStartPicker: function () { return true; },
    getEvent: function () { return _event; },
    getSchema: function () { return { sections: SECTIONS, montajeFields: MONTAJE_FIELDS }; },
    formatValue: formatValue,
    isPlanner: function () { return _isPlanner; }
  };
})();
