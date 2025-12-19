import os
import sys
import threading
import time
import shutil
from http.server import SimpleHTTPRequestHandler
import socketserver
from playwright.sync_api import sync_playwright
import pyperclip

# --- Configuration ---
HOST = "localhost"
PORT = 9008 
# Derive ROOT_DIR from the script location to ensure consistency
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class VerificationHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

def run_server():
    try:
        with ReusableTCPServer((HOST, PORT), VerificationHandler) as httpd:
            print(f"Serving at http://{HOST}:{PORT}")
            httpd.serve_forever()
    except Exception as e:
        print(f"Error starting server: {e}", file=sys.stderr)

def verify_copy_button():
    # --- PREPARE MOCK DEBUG OUTPUT ---
    verification_dir = os.path.join(ROOT_DIR, 'verification')
    mock_debug_dir = os.path.join(verification_dir, 'temp_debug_output_for_test')

    # Clean up previous runs if they exist
    if os.path.exists(mock_debug_dir):
        shutil.rmtree(mock_debug_dir)

    os.makedirs(mock_debug_dir, exist_ok=True)
    mock_debug_filename = 'repomix-output-test.log'
    mock_debug_filepath = os.path.join(mock_debug_dir, mock_debug_filename)

    # Unique string with timestamp
    expected_clipboard_content = f"This is a unique test string for clipboard verification: {time.time()}"
    with open(mock_debug_filepath, 'w') as f:
        f.write(expected_clipboard_content)
    print(f"Mock debug output created at: {mock_debug_filepath}")

    # --- START SERVER AND PLAYWRIGHT ---
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    time.sleep(1) # Give server a moment to start

    browser = None
    success = False

    try:
        with sync_playwright() as p:
            # Grant clipboard permissions
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            context.grant_permissions(['clipboard-read', 'clipboard-write'])

            page = context.new_page()
            url = f"http://{HOST}:{PORT}/verification/mock_debug_webview.html"
            print(f"Navigating to {url}")
            page.goto(url)

            print("Waiting for 'Copy Output' button...")
            # We look for the button with title "Copy Debug Output"
            copy_button = page.get_by_title("Copy Debug Output").first

            # Wait for it to be visible
            copy_button.wait_for(state="visible", timeout=10000)

            # Take a screenshot
            screenshot_path = os.path.join(ROOT_DIR, 'verification', 'copy_button_verification.png')
            print(f"Taking screenshot to {screenshot_path}")
            page.screenshot(path=screenshot_path)

            print("Button found. Clicking...")
            copy_button.click()
            print("Button clicked. Waiting for copy operation to complete...")

            # Helper to check clipboard with retries
            actual_clipboard_content = ""
            clipboard_matched = False

            # 1. Try system clipboard (pyperclip)
            print("Checking system clipboard (pyperclip)...")
            for i in range(10):
                time.sleep(0.5)
                try:
                    actual_clipboard_content = pyperclip.paste()
                    if actual_clipboard_content == expected_clipboard_content:
                        clipboard_matched = True
                        print("\033[92mSUCCESS: System Clipboard content matches expected output.\033[0m")
                        break
                except Exception:
                    # Ignore pyperclip errors in headless env
                    pass

            if not clipboard_matched:
                print("System clipboard check failed or not supported. Falling back to browser API...")
                # 2. Try browser clipboard API
                try:
                    browser_clipboard = page.evaluate("navigator.clipboard.readText()")
                    print(f"Browser clipboard: '{browser_clipboard}'")
                    if browser_clipboard == expected_clipboard_content:
                         print("\033[92mSUCCESS: Browser Clipboard content matches expected output.\033[0m")
                         clipboard_matched = True
                    else:
                         print(f"Expected: '{expected_clipboard_content}'")
                         print(f"Actual:   '{browser_clipboard}'")
                except Exception as e:
                    print(f"Browser clipboard read failed: {e}")

            if clipboard_matched:
                success = True
            else:
                print("\033[91mFAILURE: Clipboard content does NOT match expected output.\033[0m")

    except Exception as e:
        print(f"\033[91mAn error occurred during Playwright test: {e}\033[0m", file=sys.stderr)
        import traceback
        traceback.print_exc()
    finally:
        if browser:
            try:
                browser.close()
            except Exception:
                pass

        # --- CLEANUP MOCK FILES ---
        if os.path.exists(mock_debug_filepath):
            os.remove(mock_debug_filepath)
            print(f"Cleaned up mock file: {mock_debug_filepath}")
        if os.path.exists(mock_debug_dir):
            os.rmdir(mock_debug_dir)
            print(f"Cleaned up mock directory: {mock_debug_dir}")

    if success:
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == "__main__":
    verify_copy_button()