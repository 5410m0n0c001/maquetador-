# Resumen de Cambios y Configuración del Repositorio

Hemos creado la carpeta independiente para el maquetador, configurado Git mediante SSH y optimizado la interfaz del inventario para corregir el tamaño de visualización.

## Cambios Realizados

1. **Creación del Directorio Destino**:
   - Se creó la carpeta [C:/Users/Lenovo/Documents/maquetador](file:///C:/Users/Lenovo/Documents/maquetador).

2. **Copiado de Archivos**:
   - Se copiaron todos los archivos del maquetador interactivo (HTML, CSS y JS, incluyendo el visualizador 3D y la base de datos de elementos).
   - Se omitió la carpeta de layouts locales para evitar subir datos de prueba temporales al repositorio.

3. **Archivos de Configuración**:
   - **[.gitignore](file:///C:/Users/Lenovo/Documents/maquetador/.gitignore)**: Añadido para ignorar `layouts/`, cachés de python y otros archivos del sistema.
   - **[README.md](file:///C:/Users/Lenovo/Documents/maquetador/README.md)**: Documentación en español explicando cómo ejecutar localmente y cómo usarlo en GitHub Pages.

4. **Inicialización y Conexión de Git (SSH)**:
   - Repositorio local inicializado en la carpeta `maquetador`.
   - Se configuró la URL remota utilizando SSH: `git@github.com:5410m0n0c001/maquetador-.git`.
   - Se subieron todos los cambios directamente al repositorio en GitHub.

5. **Optimización de UX/UI y Espacio del Inventario**:
   - **Sección de Capas Colapsable**: Se convirtió la sección de capas y flujos de circulación del sidebar izquierdo en un panel colapsable (`<details>`). Por defecto inicia cerrado, lo que libera más de **300px** de altura vertical para el catálogo de elementos.
   - **Ancho del Sidebar Incrementado**: Se aumentó el ancho del sidebar de `320px` a `360px`, dando más espacio horizontal a las tarjetas del inventario para que se organicen mejor.
   - **Corrección de Mismatch de Estilos**: Se alinearon los nombres de las clases CSS generadas dinámicamente por `app.js` (`toolbox-category-header`, `toolbox-category-grid`, `toolbox-item-btn`) con los estilos del archivo `styles.css`.
   - **Estilo de Selección**: Se añadió una clase `.active-placement` para que el elemento seleccionado en el inventario tenga un contorno y fondo resaltado de forma fluida mediante CSS.

6. **Nuevos Elementos Agregados**:
   - **Accesos**:
     - `Puerta Sencilla` (`door_single`): Para accesos estándar.
     - `Puerta Doble` (`door_double`): Para accesos más amplios.
     - `Portón de Acceso` (`gate_large`): Para entradas de vehículos o equipo pesado.
   - **Decoración**:
     - `Arco Estructural/Salón` (`arch_decor`): Arco de columnas o paredes de salón.
     - `Árbol Decorativo` (`tree_decor`): Árbol mediano procedimental.
   - **Modelado 3D**:
     - Se actualizó `visualizer3d.js` para renderizar el portón como acceso, arreglar el selector de arcos estructurales (`indexOf('arch') > -1`) y renderizar árboles tridimensionales procedimentales de forma nativa.

7. **Corrección de Catálogo de Sillas**:
   - Se retiraron las opciones de silla genéricas o incorrectas (como la silla Ghost o Napoleón).
   - Se actualizaron las opciones del selector de tipo de silla en el inspector de mesas (`index.html`) para reflejar los modelos reales de la base de datos `base_de_datos_primavera.json`:
     - **Tiffany** (Blanca/Dorada)
     - **Crossback** de Madera
     - **Lotus** Moderna
     - **Boss** Exclusiva
     - **Banquete** Tapizada
     - **Avant Garde** (Jardín)

8. **Ajuste de Alturas en 3D (Alineación de Piso y Mobiliario)**:
   - Se detectó que el piso del salón techado tenía una altura de 4 cm por encima de la cota de terreno, lo que hacía que las patas del mobiliario se "sumergieran" parcialmente al quedar en la cota cero.
   - Se redujo el grosor de la placa de concreto del salón techado a 2 cm.
   - Se programó en `visualizer3d.js` para que todos los elementos de categorías no-estructurales (como mobiliario, entretenimiento, decoración) se eleven automáticamente 2.5 cm en la vista 3D. Esto evita el solapamiento visual (Z-fighting) y hace que se apoyen perfectamente sobre las estructuras y pisos en lugar de quedar debajo de ellos.

## Personalización de Mesas (Dinámica)

Cuando el diseñador selecciona una mesa en el plano (2D o 3D):
1. El panel lateral derecho (**Inspector de Elementos**) detecta que es un objeto de tipo mesa.
2. Habilita una pestaña adicional llamada **"Mesa"**.
3. En esta pestaña se pueden configurar las propiedades específicas del montaje.

Toda esta información se guarda en la propiedad `mesaConfig` del JSON del plano.

## Estado de la Sincronización

El repositorio local está 100% al día y sincronizado con tu GitHub remoto.
- **Rama local**: `main`
- **Rama remota**: `origin/main`

---

## Correcciones Adicionales Recientes (23 de Junio de 2026)

1. **Solución a la Pantalla Negra en Vista 3D**:
   - **Causa**: Al cargarse la página por primera vez con el contenedor 3D oculto (`display: none`), Three.js inicializaba el canvas con ancho y alto igual a `0`. Esto resultaba en un renderizador de tamaño `0x0` y una cámara con relación de aspecto inválida (`NaN`). Al cambiar a la pestaña 3D, el canvas se volvía visible pero nunca actualizaba su tamaño.
   - **Solución**: Expusimos el método `resize` en la API pública de [visualizer3d.js](file:///C:/Users/Lenovo/Documents/maquetador/visualizer3d.js) y modificamos la función `setView` en [app.js](file:///C:/Users/Lenovo/Documents/maquetador/app.js) para invocar `resize()` inmediatamente después de hacer visible el contenedor de la vista 3D.
   
2. **Corrección de Colocación de Elementos sobre Estructuras (Salón Techado)**:
   - **Causa**: El salón techado y el terreno base interceptaban el evento de clic en el editor debido a que sus respectivos grupos SVG detenían la propagación del evento (`e.stopPropagation()`). Esto impedía que se registrara el clic de colocación de nuevos elementos en el fondo del plano al hacer clic sobre ellos, impidiendo colocarlos "encima".
   - **Solución**: Creamos la clase CSS `.placement-active` en [styles.css](file:///C:/Users/Lenovo/Documents/maquetador/styles.css) para forzar `pointer-events: none` en todos los elementos interactivos mientras el modo de colocación esté activo. En [app.js](file:///C:/Users/Lenovo/Documents/maquetador/app.js), activamos esta clase dinámicamente al seleccionar un elemento para colocar, permitiendo que el clic atraviese las estructuras y coloque el objeto correctamente en el plano.

3. **Corrección de "Terreno Base" catalogado devorando elementos en 3D**:
   - **Causa**: El elemento "Terreno Base" de la base de datos se clasificaba en la categoría de `estructuras`. Al no tener un caso específico en `_buildStructure` en [visualizer3d.js](file:///C:/Users/Lenovo/Documents/maquetador/visualizer3d.js), se dibujaba como una caja genérica de **1.2 metros de altura**, cubriendo las mesas, sillas y el suelo del salón.
   - **Solución**: Agregamos un caso especial para `terrain` en `_buildStructure` para que se dibuje como una placa extremadamente delgada (`0.005m`) a nivel del suelo, permitiendo que todo lo que esté encima de él se visualice perfectamente.

4. **Variables de Sillas Indefinidas**:
   - **Solución**: Definimos las propiedades de color `chairSeat` y `chairWood` dentro del objeto `COLORS` en [visualizer3d.js](file:///C:/Users/Lenovo/Documents/maquetador/visualizer3d.js) para evitar que los materiales utilicen referencias nulas en el render procedural de las sillas.

5. **Colocación y Ajuste Automático de Calles/Avenidas**:
   - **Alineación Inteligente al Borde Exterior**: Al seleccionar y colocar el elemento "Calle/Avenida", la aplicación calcula el borde del terreno más cercano al punto de clic (Norte, Sur, Este u Oeste). Automáticamente coloca la calle **fuera del terreno** en esa dirección, adaptando su ancho o largo para que **abarque el 100% de ese lado del terreno** (calzada estándar de 6 metros).
   - **Ajuste Dinámico al Redimensionar Terreno**: Al cambiar el tamaño del terreno en las configuraciones del paso 1, cualquier calle colocada se reajustará de forma automática en tamaño y posición de centrado para seguir cubriendo todo el lateral del terreno de manera sincronizada.
   - **Límites de Arrastre Expandidos**: Flexibilizamos las restricciones de coordenadas en `onMove` para permitir el arrastre de elementos hasta **40 metros fuera del límite del terreno**, permitiendo colocar de manera realista calles, entradas y otros elementos urbanos externos.
   - **Estética de Vía en 2D y 3D**: Implementamos una línea central discontinua amarilla para simular el divisor de carril. En 2D se genera dinámicamente como una línea discontinua SVG en la orientación correcta (horizontal o vertical). En 3D, el modelo se ajusta según la relación de aspecto del elemento para alinear la línea de forma longitudinal.

6. **División de Menús Colapsables y Corrección del Inventario**:
   - **Causa**: La sección de capas y flujos de circulación se encontraba fija y unificada, lo que reducía el espacio vertical disponible en el sidebar izquierdo y dificultaba la visibilidad de los paneles principales ("Terreno", "Inventario" y "Guardado"). Además, el catálogo de inventario tenía clases desalineadas y estilos en línea forzados por JS que desconfiguraban el grid.
   - **Solución**:
       - Separamos **Capas** y **Flujos de Circulación** en dos secciones colapsables independientes (`<details class="layers-section">` y `<details class="flows-section">`) en [index.html](file:///c:/Users/Lenovo/Documents/maquetador/index.html) y [styles.css](file:///c:/Users/Lenovo/Documents/maquetador/styles.css).
       - Restauramos las clases semánticas del catálogo (`toolbox-category-header`, `toolbox-category-grid` y `toolbox-item-btn`) en [app.js](file:///c:/Users/Lenovo/Documents/maquetador/app.js) y las vinculamos a las transiciones y estilos de [styles.css](file:///c:/Users/Lenovo/Documents/maquetador/styles.css), removiendo los overrides dinámicos de mouseenter/mouseleave en Javascript.
       - De este modo, el diseñador puede colapsar independientemente ambos paneles inferiores para recuperar el 100% del área de trabajo de las pestañas principales.

7. **Configuración de Salón Techado con Muros vs. Carpa sin Muros**:
   - **Nueva Característica**: Al seleccionar la estructura "Salón Techado", en la barra lateral del Inspector de Elementos (lado derecho, pestaña Propiedades) se habilita dinámicamente un dropdown para elegir el **"Tipo de Salón"**.
   - **Visualización en 3D**:
       - **Salón Techado con Muros**: Renderiza un piso de concreto, columnas, techado plano gris y muros perimetrales sólidos (laterales y trasero) con una entrada frontal libre de 5m de ancho.
       - **Salón Techado sin Muros (Carpa)**: Renderiza postes metálicos perimetrales delgados colocados cada 6m, elegantes drapes de lona blanca colgando de los postes, y un techo piramidal de lona blanca de 2 metros de altura sobre los postes, representando de forma fiel una carpa para eventos.
       - **Estabilidad de Sillas**: Declaramos los valores hexadecimales por defecto para `COLORS.chairSeat` y `COLORS.chairWood` evitando advertencias de valores indefinidos.
