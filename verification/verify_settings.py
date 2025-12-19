
import http.server
import socketserver
import threading
import os
import time
from playwright.sync_api import sync_playwright, expect

# Configuration
PORT = 8081
DIRECTORY = os.getcwd()  # Serve from current directory to access /dist and /verification

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def start_server():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving at port {PORT}")
        httpd.allow_reuse_address = True
        httpd.serve_forever()

def verify_settings_tab():
    # Start the server in a separate thread
    thread = threading.Thread(target=start_server)
    thread.daemon = True
    thread.start()

    # Give the server a moment to start
    time.sleep(1)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # Navigate to the mock webview
            page.goto(f"http://localhost:{PORT}/verification/mock_settings_webview.html")

            # Wait for the app to load
            page.wait_for_selector("text=Repomix Runner")

            # Verify we are on the Settings tab (handled by mock getState)
            # Check for the Configuration header
            expect(page.get_by_text("Configuration", exact=True)).to_be_visible()

            # Check for "Google Gemini API Key" section
            gemini_section = page.get_by_text("Google Gemini API Key")
            expect(gemini_section).to_be_visible()

            # Check status (should be Missing based on mock)
            expect(page.get_by_text("Missing").first).to_be_visible()

            # Check that input is NOT visible initially (collapsed)
            # The input has a placeholder "Enter Gemini API Key..."
            gemini_input = page.get_by_placeholder("Enter Gemini API Key (starts with AIza...)")
            expect(gemini_input).not_to_be_visible()

            # Click to expand
            print("Clicking to expand Gemini section...")
            gemini_section.click()

            # Check that input IS visible now
            expect(gemini_input).to_be_visible()

            # Check Pinecone section
            pinecone_section = page.get_by_text("Pinecone API Key")
            expect(pinecone_section).to_be_visible()

            # Pinecone input should be hidden
            pinecone_input = page.get_by_placeholder("Enter Pinecone API Key")
            expect(pinecone_input).not_to_be_visible()

            # Click to expand Pinecone
            print("Clicking to expand Pinecone section...")
            pinecone_section.click()
            expect(pinecone_input).to_be_visible()

            # Take screenshot
            print("Taking screenshot...")
            page.screenshot(path="verification/settings_verification.png")

        except Exception as e:
            print(f"Verification failed: {e}")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    verify_settings_tab()
