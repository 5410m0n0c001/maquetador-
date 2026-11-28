# Maquetador universal PEG — criterios de negocio

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
- Por mesero: 1 descanso (madera o metálico), 1 charola de bar y 1 de grasa. Jarra de plástico con tapa: 1 por mesa.
- Letras gigantes del plano llevan su texto (campo `letras`, p. ej. "M&E"); en bodega solo hay E, L, O, V y XV.
- Alfombra roja, chisperos, mesa de fotógrafos (`table_photographers`, no cuenta lugares) salen del plano.
- "Falta definir" (en la requisición y en la ficha) se recalcula al momento: menú, back, copas (sobre todo si hay brindis),
  bebidas y mezcladores, garrafones, hielo, fruta, limpieza, meseros, periqueras, chisperos, letras, pétalos y conos,
  kit de fiesta, fotos del montaje y pastel (quién lo provee y a qué hora llega).
- Servicios de la ficha: lo nuevo del plano o del minuto (chisperos, pastel…) se agrega solo sin borrar lo ya capturado.
- Menú: si no hay menú registrado, "Falta definir" pide entrada, sopa o crema, plato fuerte y postre (de ahí salen loza y cubiertos).
- Si hay mesa principal y el plano no tiene back, "Falta definir" pregunta si habrá back detrás de ella.
- Servilletas de colores que no están en inventario van como "Servilleta de tela" con la cantidad de cada color y doblez en la nota.
- Vitroleros: uno por sabor de agua. Si falta un dato, se deja como pendiente ("Falta definir"), no se inventa.
- Recalcular no pisa lo que el planner eligió a mano (origen manual/kit); quita los "elegir uno" ya resueltos.

## Ficha técnica (PDF)
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
- Planner: todo. Capitán: solo sus eventos asignados (Staff). Perfiles de SOLO VER (dj.js, sin ningún otro botón):
  DJ (contraseña fija, ve los eventos con DJ) y cliente (p. ej. la mamá: contraseña guardada en el evento,
  `data.accesos = [{rol, nombre, clave}]`, solo ve SU evento). Ambos solo tienen dos opciones: "Plano en 3D"
  (pantalla completa, con el selector de zonas Todo/Salón/Cóctel/Áreas verdes) y "Minuto a minuto" (con el croquis arriba).
- Al tocar la cabina del DJ en el plano se muestra el DJ (proveedor con servicio "DJ" del evento).
- Al tocar una mesa se muestran sus invitados, también en pantalla completa.
