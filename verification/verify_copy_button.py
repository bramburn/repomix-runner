
import os
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler
import socketserver
from playwright.sync_api import sync_playwright

# Configuration
PORT = 9001
HOST = "127.0.0.1"
ROOT_DIR = os.getcwd()

class VerificationHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Allow accessing files from root
        path = super().translate_path(path)
        return path

def run_server():
    try:
        with socketserver.TCPServer((HOST, PORT), VerificationHandler) as httpd:
            httpd.allow_reuse_address = True
            print(f"Serving at http://{HOST}:{PORT}")
            httpd.serve_forever()
    except Exception as e:
        print(f"Server error: {e}")

def verify_webview_copy_button():
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Give server a moment to start
    time.sleep(2)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the compiled webview HTML wrapper
        # We need to construct a mock environment since the real one is inside VSCode
        # For verifying the React component, we can try to serve the App directly
        # but it depends on 'vscode-api' mock.

        # NOTE: Since we cannot easily replicate the full VS Code webview environment
        # with message passing in a simple static serve, we will attempt to load
        # the verification HTML if one exists, or create a mock wrapper.

        # Assuming the 'dist/webview.js' is the built React app
        # We need an HTML file to host it.

        mock_html = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Mock Webview</title>
        </head>
        <body>
            <div id="root"></div>
            <script>
                // Mock VS Code API
                window.acquireVsCodeApi = () => ({{
                    postMessage: (msg) => console.log('Mock postMessage:', msg),
                    getState: () => ({{ selectedTab: 'debug' }}),
                    setState: () => {{}}
                }});

                // Mock Webview Message Event to trigger updates
                setTimeout(() => {{
                    const event = new MessageEvent('message', {{
                        data: {{
                            command: 'updateDebugRuns',
                            runs: [
                                {{
                                    id: 1,
                                    timestamp: Date.now(),
                                    files: ['src/test.ts', 'src/utils.ts']
                                }}
                            ]
                        }}
                    }});
                    window.dispatchEvent(event);
                }}, 1000);
            </script>
            <script type="module" src="http://{HOST}:{PORT}/dist/webview.js"></script>
        </body>
        </html>
        """

        with open("mock_webview.html", "w") as f:
            f.write(mock_html)

        page.goto(f"http://{HOST}:{PORT}/mock_webview.html")

        # Wait for the Debug tab to be active and runs to populate
        # The React app mounts, checks state (default 'debug' via mock), and listens for messages

        try:
            # Wait for the Recent Runs header
            page.wait_for_selector("text=Recent Runs", timeout=5000)

            # Wait for the Copy button (title="Copy Output")
            # Using selector based on title attribute we added
            copy_button = page.locator('button[title="Copy Output"]')
            copy_button.wait_for(state="visible", timeout=5000)

            print("Copy button found!")

            # Take a screenshot
            os.makedirs("verification", exist_ok=True)
            page.screenshot(path="verification/copy_button_check.png")
            print("Screenshot saved to verification/copy_button_check.png")

        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/error.png")
            raise e
        finally:
            browser.close()
            if os.path.exists("mock_webview.html"):
                os.remove("mock_webview.html")

if __name__ == "__main__":
    verify_webview_copy_button()
