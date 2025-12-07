#!/usr/bin/env python3
"""
Simple proxy server for SMF API
Forwards requests from localhost:8080/api/* to 127.0.0.2:8000/*
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.request
import json

class ProxyHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        # Handle experiment stats endpoint
        if self.path.startswith('/experiment/stats'):
            self.serve_experiment_stats()
            return
        
        # Handle API proxy requests
        if self.path.startswith('/api/'):
            # Remove /api prefix and forward to SMF
            smf_path = self.path[4:]  # Remove '/api'
            smf_url = f'http://127.0.0.2:8000{smf_path}'
            
            try:
                # Forward request to SMF
                req = urllib.request.Request(smf_url)
                with urllib.request.urlopen(req) as response:
                    data = response.read()
                    print(f"Proxy: Got {len(data)} bytes from {smf_url}")
                    
                    # Send response
                    self.send_response(response.status)
                    for key, value in response.getheaders():
                        if key.lower() not in ['server', 'date', 'transfer-encoding']:
                            self.send_header(key, value)
                    
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(data)
            except Exception as e:
                print(f"Proxy Error: {e}")
                # Error response
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                error_data = json.dumps({'error': str(e)}).encode()
                self.wfile.write(error_data)
            return

        # Fallback to serving static files
        super().do_GET()
    
    def serve_experiment_stats(self):
        """Serve experiment status from JSON file"""
        import os
        
        # Path to status file
        status_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "../script/two-slice-test-script/experiment_status.json"))
        
        try:
            if os.path.exists(status_file):
                with open(status_file, 'r') as f:
                    data = f.read()
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(data.encode())
                return # Important: Stop processing here
            else:
                # Return empty status if not started
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "not_started"}).encode())
                return # Important: Stop processing here
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())
            return # Important: Stop processing here
        else:
            # Serve static files normally
            super().do_GET()
    
    def end_headers(self):
        # Add CORS headers to all responses
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', 8080), ProxyHandler)
    print('🚀 Demo server with API proxy running on http://localhost:8080')
    print('📡 Proxying /api/* to http://127.0.0.2:8000/*')
    server.serve_forever()
