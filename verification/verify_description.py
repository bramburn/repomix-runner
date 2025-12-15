
from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        # Navigate to the mock webview served by python http.server
        page.goto("http://localhost:8080/verification/my_mock_webview.html")

        # Wait for the bundles to be loaded and rendered
        # We expect "My Bundle" to appear
        expect(page.get_by_text("My Bundle")).to_be_visible()

        # We also expect the description "This is a description" to be visible
        expect(page.get_by_text("This is a description")).to_be_visible()

        # Take a screenshot
        page.screenshot(path="/home/jules/verification/verification.png")
        print("Screenshot saved to /home/jules/verification/verification.png")

        browser.close()

if __name__ == "__main__":
    run()
