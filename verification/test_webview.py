from playwright.sync_api import sync_playwright
import os

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()

    # Use the running http server
    url = "http://localhost:8080/verification/mock_webview.html"
    print(f"Loading {url}")

    page.goto(url)

    # Wait for the react app to load and process the message
    page.wait_for_selector("text=My Bundle")

    # Check if "My Bundle" has the copy button (it should, outputFileExists=true)
    # The copy button has title "Copy Output File to Clipboard"
    copy_btn = page.locator('button[title="Copy Output File to Clipboard"]')

    if copy_btn.count() > 0:
        print("Copy button found for My Bundle")
    else:
        print("Copy button NOT found for My Bundle")

    # Check "Missing Output" bundle (should NOT have copy button)
    # We can check by text "Missing Output" and then look for button in that row?
    # Or just count buttons. We expect 1 copy button total.

    count = copy_btn.count()
    print(f"Found {count} copy buttons")

    page.screenshot(path="verification/webview_test.png")
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
