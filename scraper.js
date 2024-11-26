const { chromium, devices, webkit, firefox } = require("@playwright/test"); // Import Playwright browser automation libraries
const fs = require("fs"); // Import file system module for saving data

(async () => {
  // Immediately Invoked Function Expression (IIFE) to run the async scraping script

  // Launch a headless Chromium browser
  const browser = await chromium.launch({ headless: true });

  // Array of user agents to simulate different browsers and prevent bot detection
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:92.0) Gecko/20100101 Firefox/92.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36",
  ];

  // Select a random user agent to rotate between
  const randomUserAgent =
    userAgents[Math.floor(Math.random() * userAgents.length)];

  // Create a new browser context with randomized user agent and viewport
  const context = await browser.newContext({
    userAgent: randomUserAgent,
    viewport: {
      width: 1280 + Math.floor(Math.random() * 100), // Random width between 1280-1380
      height: 800 + Math.floor(Math.random() * 100), // Random height between 800-900
    },
  });

  // Create a new page in the browser context
  const page = await context.newPage();

  // Array to store all scraped listing data
  let listingsData = [];

  // Base URL for the rental listings
  const baseUrl = "https://rentals.ca/ottawa";

  // Record the start time for performance tracking
  const startTime = new Date();

  try {
    // Set extra HTTP headers to mimic a real browser
    await context.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });

    // Navigate to the base URL and wait for DOM content to load
    await page.goto(baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120000, // 2-minute timeout
    });
    console.log(`Page Title: ${await page.title()}`);

    // Extract the total number of rentals from the page
    const totalRentals = await page.$eval(
      ".page-title__bottom-line p strong",
      (el) => parseInt(el.innerText.match(/\d+/)[0])
    );

    // Assume 25 listings per page (adjust if actual value differs)
    const listingsPerPage = 25;
    const totalPages = Math.ceil(totalRentals / listingsPerPage);
    console.log(`Total Rentals: ${totalRentals}, Total Pages: ${totalPages}`);

    // Loop through all pages of rental listings
    for (let currentPage = 1; currentPage <= totalRentals; currentPage++) {
      // Construct URL for each page
      const url = `${baseUrl}?p=${currentPage}`;
      console.log(`Navigating to Page ${currentPage}: ${url}`);

      // Navigate to each page
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });

      // Extract basic listing information from the current page
      const listings = await page.$$eval(
        ".listing-card__details",
        (listingCards) =>
          listingCards.map((card) => ({
            title:
              card.querySelector(".listing-card__title")?.innerText || "N/A",
            price:
              card.querySelector(".listing-card__price")?.innerText || "N/A",
            type: card.querySelector(".listing-card__type")?.innerText || "N/A",
            lastUpdated:
              card.querySelector(".listing-card__last-updated")?.innerText ||
              "N/A",
            bedrooms:
              card.querySelector(".listing-card__main-features li:nth-child(1)")
                ?.innerText || "N/A",
            bathrooms:
              card.querySelector(".listing-card__main-features li:nth-child(2)")
                ?.innerText || "N/A",
            area:
              card.querySelector(".listing-card__main-features li:nth-child(3)")
                ?.innerText || "N/A",
            detailsLink:
              card.querySelector(".listing-card__details-link")?.href || "N/A",
          }))
      );

      console.log(`Found ${listings.length} listings on page ${currentPage}`);

      // Stop scraping if no listings are found
      if (listings.length === 0) {
        console.log(`No listings found on page ${currentPage}`);
        break;
      }

      // Iterate through each listing to fetch detailed information
      for (const listing of listings) {
        // Skip listings without a details link
        if (!listing.detailsLink || listing.detailsLink === "N/A") {
          console.warn(
            `Skipping listing with missing details link: ${listing.title}`
          );
          continue;
        }

        try {
          // Navigate to the individual listing's detail page
          await page.goto(listing.detailsLink, {
            waitUntil: "domcontentloaded",
            timeout: 120000,
          });

          // Scroll down to trigger lazy-loading of content
          await page.evaluate(() => window.scrollBy(0, window.innerHeight));
          await page.waitForTimeout(2000);

          // Scrape detailed information from the listing's page
          const details = await page.evaluate(() => {
            // Extract highlighted information like contact details
            const highlightedInfo = Array.from(
              document.querySelectorAll(".listing-highlighted-info__item")
            ).reduce((info, item) => {
              const key = item.querySelector("h4")?.innerText || "N/A";
              const value = item.querySelector("p")?.innerText || "N/A";
              info[key] = value;
              return info;
            }, {});

            // Extract floor plans and unit details
            const floorPlansGrouped = Array.from(
              document.querySelectorAll(".floor-plan-group--collapsible")
            ).map((group) => {
              const bedroomType =
                group.querySelector("h3")?.innerText.trim() || "Unknown";
              const units = Array.from(
                group.querySelectorAll(".unit-details")
              ).map((unit) => ({
                price:
                  unit.querySelector(".unit-details__infos--price")
                    ?.innerText || "N/A",
                baths:
                  unit.querySelector(".unit-details__infos--baths")
                    ?.innerText || "N/A",
                dimensions:
                  unit.querySelector(".unit-details__infos--dimensions")
                    ?.innerText || "N/A",
                availability:
                  unit.querySelector(".unit-details__item--availability span")
                    ?.innerText || "N/A",
              }));
              return { bedroomType, units };
            });

            // Check if contact button is visible
            const contactVisible =
              document.querySelector(
                ".listing-overview__contact-property-button"
              )?.style.display !== "none";

            // Extract promotion details
            const promotionsTitle =
              document.querySelector(".listing-promotions__title")?.innerText ||
              "No Promotions";
            const promotionsDescription =
              document.querySelector(".listing-promotions__description")
                ?.innerText || "N/A";

            // Check if utilities are included
            const utilitiesIncluded = document
              .querySelector(".listing-overview__box h3")
              ?.innerText.includes("Utilities")
              ? "Utilities Included"
              : "None";

            // Extract neighborhood scores
            const neighborhoodScores = Array.from(
              document.querySelectorAll(".ll-module__item--radio")
            ).map((score) => ({
              title:
                score.querySelector(".ll-score__title span")?.innerText ||
                "N/A",
              value:
                score.querySelector(".ll-score__badge span")?.innerText ||
                "N/A",
            }));

            // Extract features and amenities by category
            const featuresAndAmenities = {};
            const categories = document.querySelectorAll(
              ".listing-features-and-amenities-desktop__title .btn-cta"
            );

            categories.forEach((category, index) => {
              const categoryName = category.innerText.trim();
              const items = Array.from(
                document
                  .querySelectorAll(
                    ".listing-features-and-amenities-desktop__content ul"
                  )
                  [index].querySelectorAll("li")
              ).map((li) => li.innerText.trim());

              featuresAndAmenities[categoryName] = items;
            });

            // Extract general amenities
            const amenities = Array.from(
              document.querySelectorAll(
                ".listing-features-and-amenities__content li"
              )
            ).map((item) => item.innerText);

            // Extract geolocation data from JSON-LD script
            const geoData = Array.from(
              document.querySelectorAll('script[type="application/ld+json"]')
            )
              .map((script) => {
                try {
                  const jsonData = JSON.parse(script.textContent);
                  if (jsonData.geo) {
                    return {
                      latitude: jsonData.geo.latitude || "N/A",
                      longitude: jsonData.geo.longitude || "N/A",
                    };
                  }
                } catch (error) {
                  return null;
                }
              })
              .find(Boolean);

            // Return all scraped data for the listing
            return {
              highlightedInfo,
              floorPlansGrouped,
              amenities,
              contactVisible,
              promotions: {
                title: promotionsTitle,
                description: promotionsDescription,
              },
              utilitiesIncluded,
              neighborhoodScores,
              featuresAndAmenities,
              latitude: geoData?.latitude || "N/A",
              longitude: geoData?.longitude || "N/A",
            };
          });

          // Combine basic and detailed listing information
          listingsData.push({
            ...listing,
            ...details,
          });
        } catch (error) {
          console.error(
            `Error while fetching details for listing: ${listing.title}`,
            error
          );
        }
      }

      // Wait between page scrapes to appear more human-like
      await page.waitForTimeout(2000);
    }

    // Calculate and log total scraping duration
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;
    const minutes = Math.floor(duration / 60);
    const seconds = Math.round(duration % 60);
    console.log(`Scraping completed in ${minutes}m ${seconds}s`);

    // Generate a timestamped filename for the output JSON
    const date = new Date();
    const formattedDate = date
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .split("Z")[0];
    const outputFilePath = `listingsData_${formattedDate}.json`;

    // Save scraped data to a JSON file
    try {
      fs.writeFileSync(outputFilePath, JSON.stringify(listingsData, null, 2));
      console.log(`Data saved to ${outputFilePath}`);
    } catch (error) {
      console.error("Error saving data to file:", error);
    }
  } catch (error) {
    console.error("An error occurred during scraping:", error);
  } finally {
    // Close the browser to release resources
    await browser.close();
  }
})();
