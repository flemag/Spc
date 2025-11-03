
import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        try:
            # Add listeners for console messages and errors
            page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))
            page.on("pageerror", lambda exc: print(f"Page Error: {exc}"))

            await page.goto("http://localhost:8000")

            # **FIX:** Navigate to the "Graphiques" page first
            await page.click('a[data-page="graphiques"]')
            await page.wait_for_selector("#graphiques-page:not(.hidden)", timeout=5000)
            print("Navigated to Graphiques page.")

            # Click the detailed view button to switch to the table
            await page.click("#detailedViewBtn")

            # Wait for the table to be visible
            await page.wait_for_selector("#dataTableContainer:not(.hidden)", timeout=10000)
            print("Switched to Table View.")

            # Click the first "Details" button in the table
            details_button_selector = "#dataTableBody .btn-primary"
            await page.wait_for_selector(details_button_selector, timeout=10000)
            await page.click(details_button_selector)
            print("Clicked on the first details button.")

            # Wait for the modal to appear
            modal_selector = "#dataPointDetailsModal"
            await page.wait_for_selector(f"{modal_selector}.show", timeout=10000)
            print("Modal is visible.")

            # Check if the modal title is correct
            await expect(page.locator(f"{modal_selector} .modal-title")).to_contain_text("Détails du Point de Données")

            # Take a screenshot of the modal
            await page.screenshot(path="modal_screenshot.png")
            print("Screenshot taken: modal_screenshot.png")

            print("Verification successful: Modal is displayed correctly.")

        except Exception as e:
            print(f"An error occurred: {e}")
            await page.screenshot(path="error_screenshot.png")
            print("Error screenshot taken: error_screenshot.png")

        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
