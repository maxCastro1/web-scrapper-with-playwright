const { chromium, devices, webkit, firefox } = require("@playwright/test");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:92.0) Gecko/20100101 Firefox/92.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36",
  ];
  const randomUserAgent =
    userAgents[Math.floor(Math.random() * userAgents.length)];

  const context = await browser.newContext({
    userAgent: randomUserAgent,
    viewport: {
      width: 1280 + Math.floor(Math.random() * 100),
      height: 800 + Math.floor(Math.random() * 100),
    },
  });
  const page = await context.newPage();

  let listingsData = [];
  const baseUrl = "https://rentals.ca/ottawa";

  const startTime = new Date();
  try {
    await context.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });
    // Load the first page
    await page.goto(baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    console.log(`Page Title: ${await page.title()}`);

    // Extract the total number of rentals and calculate total pages
    const totalRentals = await page.$eval(
      ".page-title__bottom-line p strong",
      (el) => parseInt(el.innerText.match(/\d+/)[0])
    );
    const listingsPerPage = 25; // Example assumption, adjust based on actual value
    const totalPages = Math.ceil(totalRentals / listingsPerPage);
    console.log(`Total Rentals: ${totalRentals}, Total Pages: ${totalPages}`);

    for (let currentPage = 1; currentPage <= totalRentals; currentPage++) {
      const url = `${baseUrl}?p=${currentPage}`;
      console.log(`Navigating to Page ${currentPage}: ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });

      // Collect listing data on the current page
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

      if (listings.length === 0) {
        console.log(`No listings found on page ${currentPage}`);
        break;
      }

      // Iterate over each listing and fetch details
      for (const listing of listings) {
        if (!listing.detailsLink || listing.detailsLink === "N/A") {
          console.warn(
            `Skipping listing with missing details link: ${listing.title}`
          );
          continue;
        }

        try {
          await page.goto(listing.detailsLink, {
            waitUntil: "domcontentloaded",
            timeout: 120000,
          });

          // Scroll down to trigger lazy-loading for neighborhood scores
          await page.evaluate(() => window.scrollBy(0, window.innerHeight));
          await page.waitForTimeout(2000);

          // Scrape additional information from the details page
          const details = await page.evaluate(() => {
            const highlightedInfo = Array.from(
              document.querySelectorAll(".listing-highlighted-info__item")
            ).reduce((info, item) => {
              const key = item.querySelector("h4")?.innerText || "N/A";
              const value = item.querySelector("p")?.innerText || "N/A";
              info[key] = value;
              return info;
            }, {});

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

            const contactVisible =
              document.querySelector(
                ".listing-overview__contact-property-button"
              )?.style.display !== "none";
            const promotionsTitle =
              document.querySelector(".listing-promotions__title")?.innerText ||
              "No Promotions";
            const promotionsDescription =
              document.querySelector(".listing-promotions__description")
                ?.innerText || "N/A";
            const utilitiesIncluded = document
              .querySelector(".listing-overview__box h3")
              ?.innerText.includes("Utilities")
              ? "Utilities Included"
              : "None";

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

            const amenities = Array.from(
              document.querySelectorAll(
                ".listing-features-and-amenities__content li"
              )
            ).map((item) => item.innerText);

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
            };
          });

          // Append data into listingsData
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

      await page.waitForTimeout(2000); // Delay for human-like behavior
    }

    const endTime = new Date();
    const duration = (endTime - startTime) / 1000; // Duration in seconds
    const minutes = Math.floor(duration / 60);
    const seconds = Math.round(duration % 60);
    console.log(`Scraping completed in ${minutes}m ${seconds}s`);

    // Save scraped data with formatted timestamp
    const date = new Date();
    const formattedDate = date
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .split("Z")[0];
    const outputFilePath = `listingsData_${formattedDate}.json`;

    try {
      fs.writeFileSync(outputFilePath, JSON.stringify(listingsData, null, 2));
      console.log(`Data saved to ${outputFilePath}`);
    } catch (error) {
      console.error("Error saving data to file:", error);
    }
  } catch (error) {
    console.error("An error occurred during scraping:", error);
  } finally {
    await browser.close();
  }
})();
