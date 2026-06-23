import http.server
import json
import os
import sys

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# Change working directory to project directory (ensures SimpleHTTPRequestHandler serves correct files)
os.chdir(DIRECTORY)

class LocalServerHandler(http.server.SimpleHTTPRequestHandler):
    # Force correct MIME types (crucial for Windows registry compatibility)
    extensions_map = http.server.SimpleHTTPRequestHandler.extensions_map.copy()
    extensions_map.update({
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
    })

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_POST(self):
        # Endpoint to save layout JSON files locally
        if self.path == '/api/save':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                name = data.get('name', 'plano_sin_nombre')
                # Clean name to prevent path traversal or invalid characters
                safe_name = "".join([c for c in name if c.isalnum() or c in (' ', '_', '-')]).strip()
                safe_name = safe_name.replace(' ', '_')
                if not safe_name:
                    safe_name = 'plano_sin_nombre'
                
                layouts_dir = os.path.join(DIRECTORY, 'layouts')
                if not os.path.exists(layouts_dir):
                    os.makedirs(layouts_dir)
                
                file_path = os.path.join(layouts_dir, f'{safe_name}.json')
                
                # Write formatting with nice indentation
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                response = {
                    'status': 'success',
                    'message': f'Guardado localmente como layouts/{safe_name}.json',
                    'filename': safe_name
                }
                self.wfile.write(json.dumps(response).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                response = {
                    'status': 'error',
                    'message': f'Error al guardar archivo local: {str(e)}'
                }
                self.wfile.write(json.dumps(response).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        # Endpoint to list saved layout names
        if self.path == '/api/list':
            try:
                layouts_dir = os.path.join(DIRECTORY, 'layouts')
                files = []
                if os.path.exists(layouts_dir):
                    # List all JSON files inside layouts/
                    files = [f.replace('.json', '') for f in os.listdir(layouts_dir) if f.endswith('.json')]
                    files.sort()
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(files).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                response = {
                    'status': 'error',
                    'message': f'Error al listar archivos locales: {str(e)}'
                }
                self.wfile.write(json.dumps(response).encode('utf-8'))
        else:
            # Handle static files through the super class do_GET method
            super().do_GET()

    def do_OPTIONS(self):
        # Support CORS pre-flight requests
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == '__main__':
    # Print start instructions
    print("======================================================")
    print(f"Iniciando Servidor Local de Primavera Planner en puerto {PORT}...")
    print(f"Raíz del proyecto: {DIRECTORY}")
    print("Soporta guardado automático local en /layouts")
    print("======================================================")
    
    server_address = ('', PORT)
    try:
        httpd = http.server.HTTPServer(server_address, LocalServerHandler)
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido por el usuario.")
        sys.exit(0)
    except Exception as e:
        print(f"Error al iniciar el servidor: {e}")
        sys.exit(1)
