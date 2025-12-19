
import http.server
import socketserver
import threading
import os
import time
from playwright.sync_api import sync_playwright

# Configuration
PORT = 8000
DIRECTORY = "."

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def start_server():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving at port {PORT}")
        httpd.allow_reuse_address = True
        httpd.serve_forever()

# Start the server in a separate thread
server_thread = threading.Thread(target=start_server, daemon=True)
server_thread.start()

# Give the server a moment to start
time.sleep(2)

def verify_debug_disclaimer():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # We need to simulate the VS Code webview environment.
        # Since we can't easily run the actual VS Code extension in this script,
        # we will load the compiled webview HTML directly if possible, or a mock.
        # However, the webview.js expects 'acquireVsCodeApi' which is not present in standard browser.
        # A common trick is to inject a mock for it.

        # NOTE: The webview expects 'vscode' object.
        # We need to serve the 'dist/webview.js' and an HTML file that uses it.
        # The App.tsx renders the UI.

        # Let's try to verify by creating a simple wrapper HTML that mimics the extension's webview
        # and imports the built JS.

        html_content = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Repomix Runner Control Panel</title>
            <script>
                // Mock VS Code API
                window.acquireVsCodeApi = () => ({
                    postMessage: (msg) => console.log('postMessage:', msg),
                    getState: () => ({ selectedTab: 'debug' }), // Force 'debug' tab
                    setState: (state) => console.log('setState:', state)
                });
            </script>
        </head>
        <body>
            <div id="root"></div>
            <script type="module" src="/dist/webview.js"></script>
        </body>
        </html>
        """

        with open("verification/test.html", "w") as f:
            f.write(html_content)

        page.goto(f"http://localhost:{PORT}/verification/test.html")

        # Wait for the app to load
        # The app might send 'webviewLoaded' message.
        # We initialized state with 'selectedTab: debug', so it should render DebugTab.

        # We need to wait for the React app to mount and render.
        # The 'Debug output may contain sensitive data' text should be visible.

        try:
            # Look for the disclaimer text
            disclaimer = page.get_by_text("Debug output may contain sensitive data.")
            disclaimer.wait_for(timeout=5000)

            # Take a screenshot
            page.screenshot(path="verification/debug_tab_disclaimer.png")
            print("Screenshot taken: verification/debug_tab_disclaimer.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    verify_debug_disclaimer()
