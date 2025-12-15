
import os
from playwright.sync_api import sync_playwright, TimeoutError

def verify_webview():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the mock page served by python http.server
        # We need to make sure we hit the right URL relative to where the server was started
        # The server was started in repo root, so verification/mock_index.html is the path
        page.goto("http://localhost:8080/verification/mock_index.html")

        # Wait for the webview content to load
        # We look for "No bundles found" or the "Bundles" tab
        try:
            page.wait_for_selector("text=Bundles", timeout=5000)
            print("Found Bundles tab")
        except TimeoutError:
            print("Timeout waiting for Bundles tab")

        # Inject some mock data via postMessage to simulate the extension sending data
        # We need to execute this in the page context
        page.evaluate("""
            window.postMessage({
                command: 'updateBundles',
                bundles: [
                    {
                        id: '1',
                        name: 'Test Bundle',
                        description: 'A test bundle',
                        files: ['file1.ts', 'file2.ts'],
                        outputFileExists: true,
                        stats: { files: 2, folders: 0, totalSize: 100 }
                    }
                ]
            }, '*')
        """)

        # Wait for the bundle item to appear
        try:
            page.wait_for_selector("text=Test Bundle", timeout=2000)
            print("Found Test Bundle")
        except TimeoutError:
            print("Timeout waiting for Test Bundle")

        # Take a screenshot with an absolute path
        script_dir = os.path.dirname(os.path.abspath(__file__))
        screenshot_path = os.path.join(script_dir, "webview_screenshot.png")
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    verify_webview()
