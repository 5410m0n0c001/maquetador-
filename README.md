# Maquetador Universal - Primavera Events Group

Herramienta interactiva de diseño y maquetación de planos para eventos. Permite crear terrenos, posicionar elementos (estructuras, avenidas, mobiliario), controlar flujos de circulación y previsualizar en 3D.

## Características

- **Diseño en 2D interactivo**: Arrastra y mueve la cámara por el plano, añade y acomoda elementos tanto dentro como fuera del terreno de construcción.
- **Control de Capas**: Muestra u oculta elementos organizados en categorías (Estructuras, Servicios, Áreas de Apoyo, Seguridad, Escenarios, Carpas, etc.).
- **Flujos de Circulación**: Capas especiales dedicadas a visualizar los flujos de Invitados, Proveedores y Personal (Staff).
- **Vista 3D Interactiva**: Renderizado tridimensional en tiempo real utilizando Three.js.
- **Portabilidad del Proyecto**: Guarda y carga tus diseños fácilmente mediante importación y exportación de archivos JSON.
- **Soporte Offline / Servidor Local**: Guarda layouts de forma persistente a nivel local al ejecutar el servidor en tu computadora.

## Cómo Utilizar Localmente

Para ejecutar el maquetador en tu computadora con persistencia de layouts:

1. Asegúrate de tener Python instalado.
2. Inicia el servidor de desarrollo ejecutando:
   ```bash
   python server.py
   ```
3. Abre tu navegador en [http://localhost:8000](http://localhost:8000).

## Despliegue en GitHub Pages

Este proyecto es totalmente estático y puede alojarse en GitHub Pages de forma gratuita. Los proyectos se pueden guardar descargándolos en formato JSON (`Exportar`) y cargándolos en cualquier otra sesión (`Importar`).
