
import os
import sys
import threading
import time
import socketserver
from http.server import SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright, expect

# --- Configuration ---
PORT = 9005  # Different port to avoid conflicts
ROOT_DIR = os.getcwd()

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

def run_server():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving at port {PORT}")
        httpd.serve_forever()

def verify_debug_tab():
    # Start the server in a separate thread
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Give the server a moment to start
    time.sleep(1)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the mock webview
        url = f"http://localhost:{PORT}/verification/mock_debug_webview.html"
        print(f"Navigating to {url}")
        page.goto(url)

        # Wait for the Debug tab content to load
        # We expect "Recent Runs" text
        print("Waiting for 'Recent Runs'...")
        expect(page.get_by_text("Recent Runs (Run on Selection)")).to_be_visible()

        # Check for the files in the list
        print("Checking for file list...")
        expect(page.get_by_text("src/file1.ts")).to_be_visible()
        expect(page.get_by_text("src/file2.ts")).to_be_visible()
        expect(page.get_by_text("README.md")).to_be_visible()

        # Check for Re-run button
        print("Checking for Re-run button...")
        expect(page.get_by_role("button", name="Re-run").first).to_be_visible()

        # Take a screenshot
        screenshot_path = os.path.join(ROOT_DIR, "verification", "debug_tab_verification.png")
        print(f"Taking screenshot to {screenshot_path}")
        page.screenshot(path=screenshot_path)

        browser.close()
        print("Verification complete.")

if __name__ == "__main__":
    verify_debug_tab()
