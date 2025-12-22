
import os
import sys
import time
import http.server
import socketserver
import threading
from playwright.sync_api import sync_playwright, expect

# Set up a simple HTTP server to serve the verification directory and dist
PORT = 9005
DIRECTORY = os.getcwd()

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def start_server():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving at port {PORT}")
        httpd.allow_reuse_address = True
        httpd.serve_forever()

def verify_settings():
    # Start the server in a separate thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    # Wait a bit for server to start
    time.sleep(2)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the mock webview
        page.goto(f"http://localhost:{PORT}/verification/mock_settings_webview.html")

        # Wait for the settings tab to load
        # We look for the "Configuration" header which is common
        expect(page.get_by_text("Configuration")).to_be_visible(timeout=10000)

        # 1. Verify "General Settings" section exists
        expect(page.get_by_text("General Settings")).to_be_visible()

        # 2. Verify the Switch exists and check initial state (should be "file" -> unchecked or checked depending on logic)
        # Our mock sends "file", so copyMode === 'file'.
        # Logic: label={copyMode === 'content' ? "Copy content..." : "Copy file..."}
        # checked={copyMode === 'content'}
        # So it should be unchecked, and label should be "Copy file to clipboard (File Object)"

        switch_locator = page.get_by_role("switch")
        expect(switch_locator).to_be_visible()
        expect(page.get_by_text("Copy file to clipboard (File Object)")).to_be_visible()
        expect(switch_locator).not_to_be_checked()

        # Take initial screenshot
        page.screenshot(path="verification/settings_initial_copy_mode.png")
        print("Initial screenshot taken: verification/settings_initial_copy_mode.png")

        # 3. Toggle the switch
        switch_locator.click()

        # 4. Verify state update (mock echoes setCopyMode -> updateCopyMode)
        # It should now be checked, and label should change to "Copy content to clipboard (Text)"
        expect(switch_locator).to_be_checked()
        expect(page.get_by_text("Copy content to clipboard (Text)")).to_be_visible()

        # Take updated screenshot
        page.screenshot(path="verification/settings_updated_copy_mode.png")
        print("Updated screenshot taken: verification/settings_updated_copy_mode.png")

        browser.close()

if __name__ == "__main__":
    verify_settings()
