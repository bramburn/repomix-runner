from playwright.sync_api import sync_playwright
import http.server
import socketserver
import threading
import os
import sys

# Define port and server
PORT = 8080
DIRECTORY = os.getcwd()

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def log_message(self, format, *args):
        # Suppress logging
        pass

def start_server():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving at port {PORT}")
        httpd.serve_forever()

if __name__ == "__main__":
    # Start server in background
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        url = f"http://localhost:{PORT}/verification/my_mock_webview.html"
        print(f"Navigating to {url}")

        try:
            page.goto(url)

            # Wait for content to load
            page.wait_for_selector('text=Repomix Runner')
            page.wait_for_selector('text=My Bundle')
            page.wait_for_selector('text=This is a description')

            # Screenshot
            screenshot_path = os.path.join(DIRECTORY, "verification/screenshots/refactor_verification.png")
            page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to {screenshot_path}")

        except Exception as e:
            print(f"Error: {e}")
            sys.exit(1)
        finally:
            browser.close()
