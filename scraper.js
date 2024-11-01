const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    // Load the main page
    await page.goto("https://rentals.ca/ottawa", {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    console.log(`Page Title: ${await page.title()}`);

    // Collect listing data on the main page
    const listings = await page.$$eval(
      ".listing-card__details",
      (listingCards) =>
        listingCards.map((card) => ({
          title: card.querySelector(".listing-card__title")?.innerText || "N/A",
          price: card.querySelector(".listing-card__price")?.innerText || "N/A",
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

    const listingsData = [];

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

        // Scrape additional information from the details page
        const details = await page.evaluate(() => {
          // Scrape highlighted info
          const highlightedInfo = Array.from(
            document.querySelectorAll(".listing-highlighted-info__item")
          ).reduce((info, item) => {
            const key = item.querySelector("h4")?.innerText || "N/A";
            const value = item.querySelector("p")?.innerText || "N/A";
            info[key] = value;
            return info;
          }, {});

          // Group floor plans by bedroom count
          const floorPlansGrouped = Array.from(
            document.querySelectorAll(".floor-plan-group--collapsible")
          ).map((group) => {
            const bedroomType =
              group.querySelector("h3")?.innerText.trim() || "Unknown";
            const units = Array.from(
              group.querySelectorAll(".unit-details")
            ).map((unit) => ({
              price:
                unit.querySelector(".unit-details__infos--price")?.innerText ||
                "N/A",
              baths:
                unit.querySelector(".unit-details__infos--baths")?.innerText ||
                "N/A",
              dimensions:
                unit.querySelector(".unit-details__infos--dimensions")
                  ?.innerText || "N/A",
              availability:
                unit.querySelector(".unit-details__item--availability span")
                  ?.innerText || "N/A",
            }));
            return { bedroomType, units };
          });

          // Additional info
          const amenities = Array.from(
            document.querySelectorAll(
              ".listing-features-and-amenities__content li"
            )
          ).map((item) => item.innerText);

          const contactVisible =
            document.querySelector(".listing-overview__contact-property-button")
              ?.style.display !== "none";
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
            document.querySelectorAll(".ll-module__item")
          ).map((score) => ({
            title:
              score.querySelector(".ll-score__title span")?.innerText || "N/A",
            value: score.querySelector(".ll-score__badge")?.innerText || "N/A",
          }));

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

    // Save data to a JSON file
    const outputFilePath = "listingsData.json";
    try {
      fs.writeFileSync(outputFilePath, JSON.stringify(listingsData, null, 2));
      console.log(`Data saved to ${outputFilePath}`);
    } catch (error) {
      console.error("Error saving data to file:", error);
    }
  } catch (error) {
    console.error("An error occurred on the main page:", error);
  } finally {
    await browser.close();
  }
})();
