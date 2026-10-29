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
  var PLANNER_FLAG = 'peg_modo_planner';
  var LOCAL_PREFIX = 'peg_evento_';
  var MAX_FOTOS = 4;
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
      { k: 'venue_red', label: 'Venue de la red Primavera', type: 'radio', options: ['C. Convenciones Presidente', 'Finca Las Isabeles', 'Jardín La Flor', 'Jardín Tsu Nuum', 'Quinta Zarabanda', 'Salón & Jardín Solaire', 'Salón Jardín Yolomecatl', 'Salón Los Caballos', 'Salón Los Potrillos', 'Villa Leona'] },
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
    { id: 'montaje_elegido', title: 'Montaje elegido y fotos' }
  ];

  // ── Estado ────────────────────────────────────────────────
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
    return { brief: {}, minuto: [], montaje: { fotos: [] }, layout: null };
  }

  // ── Modo planner / solo lectura ───────────────────────────
  function applyMode() {
    document.body.classList.toggle('peg-view-only', !_isPlanner);
    var btn = $('btn-planner-mode');
    if (btn) {
      btn.innerHTML = _isPlanner ? '<i class="fa-solid fa-unlock"></i>' : '<i class="fa-solid fa-lock"></i>';
      btn.title = _isPlanner ? 'Modo planner activo (clic para salir)' : 'Entrar a modo planner';
      btn.classList.toggle('active', _isPlanner);
    }
    updateEventBar();
    if (_panel) renderPanel();
  }

  function togglePlanner() {
    if (_isPlanner) {
      if (!confirm('¿Salir del modo planner? Quedará en modo de solo lectura.')) return;
      _isPlanner = false;
      try { localStorage.removeItem(PLANNER_FLAG); } catch (e) { /* sin almacenamiento */ }
      applyMode();
      toast('Modo solo lectura.', 'info');
      return;
    }
    var pwd = prompt('Contraseña de planner:');
    if (pwd === null) return;
    if (pwd !== PLANNER_PASSWORD) { toast('Contraseña incorrecta.', 'error'); return; }
    _isPlanner = true;
    try { localStorage.setItem(PLANNER_FLAG, '1'); } catch (e) { /* sin almacenamiento */ }
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
      _event = row;
      if (row.data.layout && window.App && window.App.loadLayout) {
        window.App.loadLayout(row.data.layout);
      }
      _lastLayoutJson = window.App && window.App.getLayout ? JSON.stringify(window.App.getLayout()) : '';
      saveLocalCopy();
      updateEventBar();
      setStatus(_isPlanner ? 'Guardado' : 'Solo lectura', _isPlanner ? 'ok' : '');
      // Quien abre el enlace o el QR ve primero el brief del evento
      if (!_isPlanner) openPanel();
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
      location.href = eventUrl(res.data.id) + '&brief=1';
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
    try { localStorage.setItem(PLANNER_FLAG, '1'); } catch (e) { /* sin almacenamiento */ }
    applyMode();
    next();
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
          card.onclick = function () { location.href = eventUrl(ev.id); };
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
      html += '<div class="brief-chips">' + f.options.map(function (o) {
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
    var html = '<div class="brief-grid">' + MONTAJE_FIELDS.map(function (f) {
      var v = m[f.k];
      return '<div class="brief-field' + (f.type === 'textarea' ? ' wide' : '') + '"><label class="form-label">' + esc(f.label) + '</label>' +
        (f.type === 'textarea'
          ? '<textarea class="form-input form-textarea" data-mt="' + f.k + '"' + dis + '>' + esc(v) + '</textarea>'
          : '<input class="form-input" data-mt="' + f.k + '" value="' + esc(v) + '"' + dis + ' />') + '</div>';
    }).join('') + '</div>';
    var fotos = m.fotos || [];
    html += '<div class="foto-grid">';
    fotos.forEach(function (f, i) {
      html += '<figure class="foto-card"><img src="' + esc(f.url) + '" alt="Foto del montaje ' + (i + 1) + '" loading="lazy" />' +
        (ro ? '' : '<button type="button" class="foto-del" data-i="' + i + '" title="Quitar foto"><i class="fa-solid fa-xmark"></i></button>') +
        '</figure>';
    });
    if (!ro && fotos.length < MAX_FOTOS) {
      html += '<label class="foto-add"><i class="fa-solid fa-camera"></i><span>Agregar foto</span><small>' + fotos.length + ' de ' + MAX_FOTOS + '</small>' +
        '<input type="file" accept="image/*" id="foto-input" hidden /></label>';
    }
    if (ro && !fotos.length) html += '<p class="brief-empty">Sin fotos del montaje.</p>';
    return html + '</div>';
  }

  function renderPanel() {
    if (!_panel || !_event) return;
    var ro = !_isPlanner;
    var d = _event.data;
    // En solo lectura no se muestran las secciones ni los campos internos (presupuesto, contacto, contrato, seguimiento)
    var all = SECTIONS.concat(EXTRA_SECTIONS).filter(function (s) { return !(ro && s.internal); });
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
        '<nav class="brief-nav">' + all.map(function (s, i) {
          return '<a href="#brief-' + s.id + '">' + (i + 1) + '. ' + esc(s.title) + '</a>';
        }).join('') + '</nav>' +
        // En el teléfono: lista desplegable con todas las secciones
        '<div class="brief-nav-mobile"><select class="form-input" id="brief-nav-select">' +
          '<option value="">Ir a la sección…</option>' + all.map(function (s, i) {
            return '<option value="brief-' + s.id + '">' + (i + 1) + '. ' + esc(s.title) + '</option>';
          }).join('') + '</select></div>' +
        '<div class="brief-body">';
    all.forEach(function (s, i) {
      html += '<section class="brief-section" id="brief-' + s.id + '"><h3><span>' + (i + 1) + '</span>' + esc(s.title) + '</h3>';
      if (s.id === 'minuto') html += minutoHtml(d.minuto || [], ro);
      else if (s.id === 'montaje_elegido') html += montajeHtml(d.montaje || { fotos: [] }, ro);
      else html += '<div class="brief-grid">' + s.fields
        .filter(function (f) { return !(ro && f.internal); })
        .map(function (f) { return fieldHtml(f, d.brief, ro); }).join('') + '</div>';
      html += '</section>';
    });
    html += '</div></div>';
    var scroll = _panel.querySelector('.brief-body');
    var top = scroll ? scroll.scrollTop : 0;
    _panel.innerHTML = html;
    if (top) _panel.querySelector('.brief-body').scrollTop = top;
    wirePanel();
  }

  function wirePanel() {
    var d = _event.data;
    $('brief-close').onclick = closePanel;
    $('brief-share').onclick = shareEvent;
    $('brief-pdf').onclick = function () { if (window.App && window.App.exportPDF) window.App.exportPDF(); };
    _panel.querySelectorAll('.brief-nav a').forEach(function (a) {
      a.onclick = function (e) {
        e.preventDefault();
        var t = _panel.querySelector(a.getAttribute('href'));
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });
    var navSel = $('brief-nav-select');
    if (navSel) navSel.onchange = function () {
      var t = navSel.value && $(navSel.value);
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      navSel.value = '';
    };
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

    _panel.querySelectorAll('[data-k]:not(.brief-chip)').forEach(function (el) {
      el.addEventListener('input', function () {
        d.brief[el.getAttribute('data-k')] = el.value;
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
          _panel.querySelectorAll('.brief-chip[data-k="' + k + '"]').forEach(function (c) { c.classList.remove('on'); });
          if (!same) chip.classList.add('on');
        }
        scheduleSave();
      };
    });

    // Minuto a minuto
    _panel.querySelectorAll('.minuto-row').forEach(function (row) {
      var i = parseInt(row.getAttribute('data-i'), 10);
      row.querySelectorAll('[data-m]').forEach(function (el) {
        el.addEventListener('input', function () { d.minuto[i][el.getAttribute('data-m')] = el.value; scheduleSave(); });
      });
      row.querySelector('[data-m="hora"]').addEventListener('change', function () {
        d.minuto.sort(function (a, b) { return (a.hora || '99').localeCompare(b.hora || '99'); });
        renderPanel();
      });
      var del = row.querySelector('.minuto-del');
      if (del) del.onclick = function () { d.minuto.splice(i, 1); scheduleSave(); renderPanel(); };
    });
    var add = $('minuto-add');
    if (add) add.onclick = function () { d.minuto.push({ hora: '', actividad: '', responsable: '' }); renderPanel(); };
    var imp = $('minuto-import');
    if (imp) imp.onclick = function () {
      var nuevos = timedFromBrief(d.brief).filter(function (r) {
        return !d.minuto.some(function (m) { return m.hora === r.hora && m.actividad === r.actividad; });
      });
      if (!nuevos.length) { toast('No hay horarios nuevos en el brief. Marca ceremonias, momentos o tiempos y anota su hora.', 'info'); return; }
      d.minuto = d.minuto.concat(nuevos).sort(function (a, b) { return (a.hora || '99').localeCompare(b.hora || '99'); });
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
    var input = $('foto-input');
    if (input) input.onchange = function () { if (input.files[0]) uploadPhoto(input.files[0]); };
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
    compressImage(file).then(function (blob) {
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
    try { _isPlanner = localStorage.getItem(PLANNER_FLAG) === '1'; } catch (e) { _isPlanner = false; }
    applyMode();
    var bind = function (id, fn) { var el = $(id); if (el) el.onclick = fn; };
    bind('btn-planner-mode', togglePlanner);
    bind('btn-eventos', openEventsModal);
    bind('btn-brief', openPanel);
    bind('btn-share-event', shareEvent);
    watchLayout();

    var id = eventIdFromUrl();
    if (id) {
      loadEvent(id).then(function () {
        if (new URLSearchParams(location.search).get('brief') === '1') openPanel();
      });
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
