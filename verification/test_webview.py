
from playwright.sync_api import sync_playwright

def verify_webview():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the mock page served by python http.server
        page.goto("http://localhost:8080/mock_index.html")

        # Wait for the webview content to load
        # We look for "No bundles found" or the "Bundles" tab
        try:
            page.wait_for_selector("text=Bundles", timeout=5000)
            print("Found Bundles tab")
        except:
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
        except:
            print("Timeout waiting for Test Bundle")

        # Take a screenshot
        page.screenshot(path="verification/webview_screenshot.png")
        print("Screenshot saved to verification/webview_screenshot.png")

        browser.close()

if __name__ == "__main__":
    verify_webview()
