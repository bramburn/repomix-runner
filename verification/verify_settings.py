
import http.server
import socketserver
import threading
import os
from playwright.sync_api import sync_playwright

# Define the port for the mock server
PORT = 8000
DIRECTORY = os.getcwd()

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def start_server():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving at port {PORT}")
        httpd.serve_forever()

# Start the server in a separate thread
thread = threading.Thread(target=start_server, daemon=True)
thread.start()

def verify_settings_tab():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Load the mocked webview HTML which will load our compiled webview.js
        # We need a mock HTML file that mimics the webview environment

        # Since we don't have a dedicated mock html for settings, we can reuse or create one.
        # Let's create a temporary HTML file for this test

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
        // Mock VS Code API
        window.acquireVsCodeApi = () => ({
            postMessage: (msg) => {
                console.log("VS Code Message:", msg);
                // Mock responses
                if (msg.command === 'webviewLoaded') {
                     window.postMessage({ command: 'updateVersion', version: '0.0.0-test' }, '*');
                }
                if (msg.command === 'checkSecret') {
                    // Simulate keys existing
                    window.postMessage({ command: 'secretStatus', key: msg.key, exists: true }, '*');
                }
                if (msg.command === 'fetchPineconeIndexes') {
                    // Simulate fetching indexes
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
                    // Simulate confirming selection
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

        page.goto(f"http://localhost:{PORT}/verification/mock_settings.html")

        # Wait for the tab to be visible (should default to settings due to mock state)
        page.wait_for_selector("text=Configuration")

        # Verify the Accordion exists
        page.wait_for_selector("text=API Configuration")

        # Verify Pinecone API Key section
        page.wait_for_selector("text=Pinecone API Key")

        # Wait for indexes to load (simulated)
        page.wait_for_timeout(500)

        # Take a screenshot of the initial state (with mocked keys)
        page.screenshot(path="verification/settings_initial.png")

        # Verify Dropdown exists and interact
        # Fluent UI dropdowns can be tricky. Look for the placeholder or label.
        page.wait_for_selector("text=Select an Index")

        # Click the dropdown to open it (if possible headless)
        # Often FluentUI renders a button or similar for the dropdown trigger.
        # We can try to click the element containing the placeholder.
        page.click("text=Select an Index")

        page.wait_for_timeout(200)
        page.screenshot(path="verification/settings_dropdown_open.png")

        print("Verification complete. Screenshots saved.")
        browser.close()

if __name__ == "__main__":
    verify_settings_tab()
