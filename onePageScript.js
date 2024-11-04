const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  try {
    // Load a sample listing details page
    const listingDetailsUrl =
      "https://rentals.ca/gatineau?bbox=-75.75559,45.33689,-75.60968,45.59717&active-listing-id=852522";
    await page.goto(listingDetailsUrl, {
      waitUntil: "networkidle",
      timeout: 180000,
    });
    console.log(`Page Title: ${await page.title()}`);

    // Scroll down the page to trigger lazy-loading
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
    await page.waitForTimeout(2000); // Wait briefly after scrolling

    // Attempt to find the neighborhood score elements
    try {
      await page.waitForSelector(".ll-module__item--radio", { timeout: 10000 });
      console.log("Neighborhood score divs loaded after scrolling.");

      // Fetch neighborhood scores data
      const neighborhoodScores = await page.evaluate(() => {
        return Array.from(
          document.querySelectorAll(".ll-module__item--radio")
        ).map((score) => ({
          title:
            score.querySelector(".ll-score__title span")?.innerText || "N/A",
          value:
            score.querySelector(".ll-score__badge span")?.innerText || "N/A",
        }));
      });

      console.log("Neighborhood Scores:", neighborhoodScores);
    } catch (error) {
      console.log(
        "Neighborhood score divs did not load in time or are not present after scrolling."
      );
    }
  } catch (error) {
    console.error("An error occurred on the details page:", error);
  } finally {
    await browser.close();
  }
})();
