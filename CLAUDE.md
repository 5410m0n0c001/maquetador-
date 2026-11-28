# Virtual Planner (maquetador universal PEG) — criterios de negocio

App web (vanilla JS, Three.js, SVG) de Primavera Events Group. `main` se publica en
https://5410m0n0c001.github.io/maquetador-/ · datos en Supabase `fwqvkyeydykzleqowgqb`, tabla `maquetador_eventos`
(historial automático en `maquetador_eventos_versiones`). Al cambiar un .js, sube su `?v=` en `index.html`.

Estos criterios los definió la dirección de PEG. Valen para eventos pasados y futuros: si cambias lógica,
respétalos; si un evento no los cumple, avisa antes de corregirlo.

## Eventos y guardado
- Ningún evento se crea sin fecha (`pedirFechaEvento` en brief.js).
- Un plano no se puede perder: quitar 5+ elementos (o 5+ invitados), cambiarlo por otra plantilla/terreno o vaciarlo
  con "Reiniciar" pide la CONTRASEÑA DE PLANNER (`pedirClavePlanner`); sin ella no se guarda y el plano regresa a como
  estaba guardado. La base de datos (trigger `maquetador_guardar_version`) también rechaza un borrado masivo sin la marca
  `_autorizaBorrado` (que la app manda solo tras la contraseña y que nunca se guarda). Los eventos no se pueden borrar
  desde la app (sin política DELETE) y todo cambio grande deja copia en `maquetador_eventos_versiones`.
- Al ir al inicio / crear otro evento / maquetar un salón, el evento abierto se suelta (`soltarEvento`):
  nunca guardar una plantilla encima de otro evento.
- Si un plano exportado (JSON) viene de una pestaña vieja, fusiona: posiciones del archivo + invitados,
  numeración y sillas de la base. Nunca sobrescribas invitados con listas vacías.

## Mesas, lugares e invitados
- Lugares del banquete (mesas + mesa principal) = invitados. La mesa principal cuenta dentro de los invitados.
- Con lista de invitados, cada mesa lleva tantas sillas como personas.
- Numeración: la mesa principal es "Mesa principal" (mesaNum 0); las de invitados van de 1 en adelante,
  como las numere el cliente en su croquis.
- Un invitado puede estar en dos mesas si es la misma familia repartida (confirmarlo, no borrarlo).
- Mesas de 8 a 12 personas. Cóctel (salas lounge, periqueras) no cuenta para el banquete.

## Requisición (calculo-requisicion.js)
- Cada mesa lleva arreglo floral BAJO o ALTO, nunca ambos. Por lo regular la mayoría bajo y unas cuantas alto;
  el alto lleva su estructura ("Base metálica alta (centro de mesa)").
- Barras: la fija del venue se nombra "Barra fija…" y no se cuenta como montable; cada montable lleva barra montable,
  mesa tablón y bambalina. Kits de barra (exprimidor, cuchillo, pica hielo, pinzas, tarja): 1 por barra (fija o montable).
- Back en el plano → su estructura es una portería metálica (elegir dorada o negra). En 3D: portería de 2.6 m,
  cortinas plisadas (`cortinaColor`) y guirnalda de globos con la PALETA DE LA DECORACIÓN del evento (brief
  `paleta`/`paletas`, o si no hay, colores de caminos, servilletas y manteles); `globosColores` solo para forzar otros.
- Cada periquera lleva sombrilla; pendiente: cuántas de madera y cuántas de metal.
- Mesa campirana cuadrada (≥1.5 m por lado, p. ej. 1.6×1.6) = 2 mesas rectangulares de madera juntas (o su campo `tablones`);
  caminos: 1 por mesa rectangular/tablón (10 campiranas + principal = 21 caminos).
- Cubiertos: el servicio siempre lleva cuchara, tenedor y cuchillo por invitado; si hay postre (en el menú o pastel en el minuto) se agregan plato de postre y cucharita.
- Mesa principal sobre templete de madera: piezas en `templetePiezas` de la mesa principal; si no, "Falta definir" las pide (no se inventa).
- Barra: 1 tapete de bar cuadrado y 1 largo por barra (fija o montable), además del kit.
- Jarras de plástico con tapa: cuántas se envían es pendiente (`brief.jarras`); no se supone 1 por mesa.
- Vitroleros: `brief.vitroleros` (cantidad fija, elegir cristal pequeño o plástico grande) o uno por sabor de agua.
- Por mesero: 1 descanso (madera o metálico), 1 charola de bar y 1 de grasa.
- Letras gigantes del plano llevan su texto (campo `letras`, p. ej. "M&E"); en bodega solo hay E, L, O, V y XV.
  `letrasPorConfirmar` = aún no se sabe si van (queda en "Falta definir"); `letrasSinFocos` = van sin focos (no se piden focos ni extensiones).
- Alfombra roja y chisperos salen del plano. Si un proveedor tiene servicio "Chisperos", "Falta definir" solo pregunta momento y quién los detona.
- Mesa de fotógrafos (`table_photographers`): la llevan los fotógrafos; solo va en el croquis (no cuenta lugares ni va en la requisición).
- Back: `porteria` del elemento ("negra" | "dorada") define la portería en requisición y 3D; sin ella queda "elegir uno".
- "Falta definir" (en la requisición y en la ficha) se recalcula al momento: menú, back, copas (sobre todo si hay brindis),
  bebidas y mezcladores, garrafones, hielo, fruta, limpieza, meseros, periqueras, chisperos, letras, pétalos y conos,
  kit de fiesta, fotos del montaje y pastel (quién lo provee y a qué hora llega).
- Servicios de la ficha: lo nuevo del plano o del minuto (chisperos, pastel…) se agrega solo sin borrar lo ya capturado.
- Menú: si no hay menú registrado, "Falta definir" pide entrada, sopa o crema, plato fuerte y postre (de ahí salen loza y cubiertos).
- Si hay mesa principal y el plano no tiene back, "Falta definir" pregunta si habrá back detrás de ella.
- Servilletas: UNA por lugar. Con dos dobleces (p. ej. corbata negra y corazón rojo) se alternan con el mismo reparto que las copas
  (el 1er doblez con la copa 1); nunca dos en el mismo lugar. Corbata = franja que cruza el plato de lado a lado (no moño).
- Servilletas de colores que no están en inventario van como "Servilleta de tela <color>", UN RENGLÓN POR COLOR (roja, negra…) con su doblez en la nota.
- Cojín de silla: opción de la mesa (`sillaCojin`), 1 cojín por silla (cross back, Tiffany o Boss).
- Plato base: uno, o dos alternados (`platoBase` y `platoBase2`), mitad y mitad con el mismo reparto que las copas.
- Vitroleros: uno por sabor de agua. Si falta un dato, se deja como pendiente ("Falta definir"), no se inventa.
- Artículos con opciones (miel o nogal, madera o metal…): se elige una o se REPARTEN las piezas entre las opciones
  ("O reparte las piezas" en la requisición; la plantilla impresa deja la cantidad de cada opción para escribirla).
- Recalcular no pisa lo que el planner eligió a mano (origen manual/kit); quita los "elegir uno" ya resueltos.

## Ficha técnica (PDF)
- Montaje: UN solo montaje para todas las mesas de invitados; lo que cambia entre mesas (centro alto/bajo, menú, tipo de mesa) se anota como variación con sus números de mesa. La mesa principal va aparte.
- Orden: datos → mesas y lugares → minuto a minuto → staff → proveedores → montaje → croquis →
  INVITADOS POR MESA (mesa principal primero) → requisición.
- Hora de término del minuto: la escrita en la actividad "(H:MM PM – H:MM PM)"; si no hay, se deduce (en gris).
- Planos con zonas (Rancho Los Potrillos): vista Salón solo el salón (sin puente ni cóctel), vista Cóctel aparte;
  Áreas verdes solo si hay ceremonia en el jardín.

## Rancho Los Potrillos (rancho.js)
- Salón abierto con arcos; palapa de concreto ABIERTA con arcos en los 4 lados, con 2 mesas metálicas
  rectangulares de 10 sillas metálicas al centro, una tras otra a lo largo, y una barrita en la esquina del puente
  y del camino a la entrada (noreste) (mobiliario del venue,
  no cuenta en lugares ni requisición).
- Cascada = canal de agua horizontal entre salón y palapa, bajo el puente; puente recto con medio arco.
- Alberca azul.
- Jardín de habitaciones: juegos infantiles del rancho (`rancho_playground`: columpio, resbaladilla, sube y baja), no van en requisición.

## Hoja del DJ
- Croquis del salón con la cabina marcada ("AQUÍ VA EL DJ") + minuto a minuto con sus momentos en rosa.

## Perfiles
- Planner: todo. Capitán: solo sus eventos asignados (Staff). Perfiles de SOLO VER (dj.js, sin ningún otro botón): DJ y
  anfitrión (p. ej. las mamás). LA CONTRASEÑA IDENTIFICA EL EVENTO, no la URL: cada evento guarda sus accesos en
  `data.accesos = [{ rol: "dj" | "cliente", nombre, clave }]`. Con un solo evento entra directo; con varios ve la lista
  de SOLO esos (como los capitanes). Dos opciones: "Plano en 3D" (pantalla completa, con Todo/Salón/Cóctel/Áreas verdes)
  y "Minuto a minuto" (croquis arriba; el anfitrión ve además los invitados por mesa).
- Al tocar la cabina del DJ en el plano se muestra el DJ (proveedor con servicio "DJ" del evento).
- Al tocar una mesa se muestran sus invitados, también en pantalla completa.
