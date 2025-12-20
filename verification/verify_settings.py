import http.server
import socketserver
import threading
import os
import time
from playwright.sync_api import sync_playwright, expect

# --- Configuration ---
# Using PORT 8081 and serve from current directory to access /dist and /verification
PORT = 8081
DIRECTORY = os.getcwd()

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def start_server():
    # allow_reuse_address is essential for stable test reruns
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving at port {PORT}")
        httpd.serve_forever()

def verify_settings_tab():
    # Start the server in a separate thread
    thread = threading.Thread(target=start_server, daemon=True)
    thread.start()

    # Give the server a moment to start
    time.sleep(1)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # --- Setup Mock Environment ---
        # Ensure the directory exists
        os.makedirs("verification", exist_ok=True)
        
        with open("verification/mock_settings.html", "w") as f:
            f.write("""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Repomix Settings Mock</title>
    <style>
        body { background-color: #1e1e1e; color: #cccccc; font-family: sans-serif; }
    </style>
</head>
<body>
    <div id="root"></div>
    <script type="module">
        window.acquireVsCodeApi = () => ({
            postMessage: (msg) => {
                console.log("VS Code Message:", msg);
                if (msg.command === 'webviewLoaded') {
                     window.postMessage({ command: 'updateVersion', version: '0.0.0-test' }, '*');
                }
                if (msg.command === 'checkSecret') {
                    window.postMessage({ command: 'secretStatus', key: msg.key, exists: true }, '*');
                }
                if (msg.command === 'fetchPineconeIndexes') {
                    setTimeout(() => {
                        window.postMessage({
                            command: 'updatePineconeIndexes',
                            indexes: [
                                { name: 'test-index-1', host: 'test-host-1', dimension: 1536 },
                                { name: 'test-index-2', host: 'test-host-2', dimension: 768 }
                            ]
                        }, '*');
                    }, 100);
                }
                if (msg.command === 'savePineconeIndex') {
                    window.postMessage({ command: 'updateSelectedIndex', index: msg.index }, '*');
                }
            },
            getState: () => ({ selectedTab: 'settings' }),
            setState: () => {}
        });
    </script>
    <script type="module" src="/dist/webview.js"></script>
</body>
</html>
            """)

        # --- Verification Steps ---
        page.goto(f"http://localhost:{PORT}/verification/mock_settings.html")

        # Use expect for more resilient assertions
        expect(page.get_by_text("Configuration")).to_be_visible()
        expect(page.get_by_text("API Configuration")).to_be_visible()
        expect(page.get_by_text("Pinecone API Key")).to_be_visible()

        # Wait for simulated async loads
        page.wait_for_timeout(500)
        page.screenshot(path="verification/settings_initial.png")

        # Interact with the index dropdown
        dropdown = page.get_by_text("Select an Index")
        expect(dropdown).to_be_visible()
        dropdown.click()

        page.wait_for_timeout(200)
        page.screenshot(path="verification/settings_dropdown_open.png")

        print("Verification complete. Screenshots saved.")
        browser.close()

if __name__ == "__main__":
    verify_settings_tab()