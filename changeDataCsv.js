const fs = require("fs");
const Papa = require("papaparse");

function flattenAndConvert(inputFilePath) {
  try {
    const jsonData = JSON.parse(fs.readFileSync(inputFilePath, "utf8"));
    const flattenedData = [];

    jsonData.forEach((listing) => {
      const flattenedInfo = {
        ...listing,
        ...(listing.highlightedInfo || {}),
        promotionTitle: listing.promotions ? listing.promotions.title : "",
        promotionDescription: listing.promotions
          ? listing.promotions.description
          : "",
        amenities: listing.amenities ? listing.amenities.join(", ") : "",
      };

      // Process neighborhoodScores
      if (listing.neighborhoodScores && listing.neighborhoodScores.length > 0) {
        listing.neighborhoodScores.forEach((score) => {
          const sanitizedTitle = `neighborhoodScore_${score.title.replace(
            /[^a-zA-Z0-9]/g,
            "_"
          )}`;
          flattenedInfo[sanitizedTitle] = score.value;
        });
      }

      // Remove already flattened data
      delete flattenedInfo.highlightedInfo;
      delete flattenedInfo.promotions;
      delete flattenedInfo.floorPlansGrouped;
      delete flattenedInfo.neighborhoodScores;

      if (listing.floorPlansGrouped && listing.floorPlansGrouped.length > 0) {
        listing.floorPlansGrouped.forEach((floorPlan) => {
          floorPlan.units.forEach((unit) => {
            flattenedData.push({
              ...flattenedInfo,
              bedroomType: floorPlan.bedroomType,
              unitPrice: unit.price,
              unitBaths: unit.baths,
              unitDimensions: unit.dimensions,
              unitAvailability: unit.availability,
            });
          });
        });
      } else {
        flattenedData.push(flattenedInfo);
      }
    });

    const csvData = Papa.unparse(flattenedData);
    const outputFilePath = inputFilePath.replace(".json", ".csv");
    fs.writeFileSync(outputFilePath, csvData);
    console.log(`CSV file created: ${outputFilePath}`);
  } catch (error) {
    console.error("Error during JSON to CSV conversion:", error);
  }
}

const inputFilePath = "listingsData_2024-11-02_01-26-56-182.json";
flattenAndConvert(inputFilePath);
