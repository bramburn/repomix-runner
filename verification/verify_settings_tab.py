import http.server
import socketserver
import threading
import os
import sys
import time
from playwright.sync_api import sync_playwright, expect

# Allow overriding the host and port via environment variables
HOST = os.environ.get("VERIFICATION_SERVER_HOST", "localhost")
PORT = int(os.environ.get("VERIFICATION_SERVER_PORT", 8082))

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, directory=None, **kwargs):
        serve_directory = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        super().__init__(*args, directory=serve_directory, **kwargs)

def start_mock_server(host, port):
    handler = MyHTTPRequestHandler
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer((host, port), handler)
    thread = threading.Thread(target=httpd.serve_forever)
    thread.daemon = True
    thread.start()
    return httpd

def run():
    server = None
    try:
        print(f"Starting mock server on {HOST}:{PORT}...")
        server = start_mock_server(HOST, PORT)
        time.sleep(1)

        with sync_playwright() as p:
            print("Launching browser...")
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            # Construct the URL pointing to the mock webview file
            url = f"http://{HOST}:{PORT}/verification/my_mock_webview.html"
            print(f"Navigating to {url}...")
            page.goto(url)

            # Set background to dark to match VS Code dark theme and make text visible
            page.add_style_tag(content="body { background-color: #1e1e1e; color: #cccccc; }")

            # Wait for the app to load
            expect(page.get_by_text("Repomix Runner")).to_be_visible()

            # Verify tab order
            tabs = page.get_by_role("tab").all_inner_texts()
            print(f"Tabs found: {tabs}")
            assert tabs == ["Bundles", "Smart Agent", "Settings", "Debug"], f"Expected tabs order to be ['Bundles', 'Smart Agent', 'Settings', 'Debug'], but got {tabs}"

            # Click on the Settings tab
            print("Clicking 'Settings' tab...")
            page.get_by_role("tab", name="Settings").click()

            # Verify the placeholder text is visible
            print("Verifying 'Settings Placeholder' is visible...")
            expect(page.get_by_text("Settings Placeholder")).to_be_visible()

            # --- Screenshots ---
            script_dir = os.path.dirname(os.path.abspath(__file__))
            screenshots_dir = os.path.join(script_dir, "screenshots")
            os.makedirs(screenshots_dir, exist_ok=True)

            screenshot_path = os.path.join(screenshots_dir, "settings_tab_dark.png")
            page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to {screenshot_path}")

            browser.close()
            print("Verification passed successfully.")

    except Exception as e:
        print(f"Verification failed: {e}")
        sys.exit(1)
    finally:
        if server:
            print("Shutting down server...")
            server.shutdown()
            server.server_close()

if __name__ == "__main__":
    run()
