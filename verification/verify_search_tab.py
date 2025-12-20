from playwright.sync_api import sync_playwright
import os
import sys
import http.server
import socketserver
import threading
import time

# --- Mock Server ---
PORT = 8083

class MockHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            # Serve the mock HTML
            with open('verification/mock_search_webview.html', 'rb') as f:
                self.wfile.write(f.read())
        elif self.path == '/dist/webview.js':
             self.send_response(200)
             self.send_header('Content-type', 'application/javascript')
             self.end_headers()
             # We can't easily serve the real bundle without build, so we'll serve a mock script
             # OR we try to serve the real one if compiled.
             # For visual verification of React components, we usually need the build.
             # BUT here we want to test the UI structure.
             if os.path.exists('dist/webview.js'):
                 with open('dist/webview.js', 'rb') as f:
                     self.wfile.write(f.read())
             else:
                 self.wfile.write(b"console.log('Mock bundle loaded');")
        else:
            super().do_GET()

def start_server():
    with socketserver.TCPServer(("", PORT), MockHandler) as httpd:
        print(f"Serving at port {PORT}")
        httpd.serve_forever()

# We need to compile the webview first or assume it is compiled.
# The user's instructions imply we should verify the React component.
# Since we can't easily spin up the VS Code environment, we will create a mock HTML
# that mounts the component if possible, OR just verify the component code structure
# via unit tests.
# However, the user asked for "Visual Verify".
# The best way to visually verify a VS Code webview component without VS Code is
# to render it in a standalone HTML with the bundle.

# Prerequisite: npm run compile must have run.

if __name__ == "__main__":
    # Start server in background
    daemon = threading.Thread(target=start_server, daemon=True)
    daemon.start()
    time.sleep(1) # Wait for server

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # We need a way to mock the VS Code API and inject the React app.
        # Since we modified App.tsx, we rely on dist/webview.js to contain the React logic.
        # But dist/webview.js expects 'vscode' global.

        # We will use a mock html that defines the global and loads the script.
        page.goto(f"http://localhost:{PORT}")

        # Wait for the Search tab to appear or be clickable
        # Note: The App component defaults to 'bundles' tab.
        # We need to click "Search" tab.

        # 1. Click Search Tab
        page.get_by_role("tab", name="Search").click()

        # 2. Verify UI elements
        # Expect "Repository Indexing" label
        page.get_by_text("Repository Indexing").wait_for()

        # Expect "Index Repository" button
        page.get_by_role("button", name="Index Repository").wait_for()

        # Expect "Destroy Index" button
        page.get_by_role("button", name="Destroy Index").wait_for()

        # 3. Take screenshot
        page.screenshot(path="verification/search_tab.png")

        print("Verification screenshot saved to verification/search_tab.png")
        browser.close()
