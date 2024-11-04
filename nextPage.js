const { chromium, devices, webkit, firefox } = require("@playwright/test");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:92.0) Gecko/20100101 Firefox/92.0",
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  try {
    await page.goto("https://rentals.ca/ottawa", {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    console.log(`Page Title: ${await page.title()}`);

    let currentPage = 1;

    while (true) {
      // Get the number of listings on the current page
      const listingCount = await page.$$eval(
        ".listing-card__details",
        (listings) => listings.length
      );
      console.log(`Page ${currentPage}: Found ${listingCount} listings`);

      // Check if the "Next" button is disabled, which means we've reached the last page
      const nextButtonDisabled = await page.$(
        ".pagination__item--disabled a[data-msgid='Next']"
      );
      if (nextButtonDisabled) {
        console.log("Reached the last page or pagination disabled.");
        break;
      }

      // Click the "Next" button to move to the next page
      const nextButton = await page.$("a[data-msgid='Next']");

      if (nextButton) {
        await nextButton.click();
        await page.waitForNavigation({ waitUntil: "domcontentloaded" });
        currentPage++;
      } else {
        console.log("No more pages found, exiting pagination loop.");
        break;
      }
    }
  } catch (error) {
    console.error("An error occurred during scraping:", error);
  } finally {
    await browser.close();
  }
})();
