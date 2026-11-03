// Place at: src/app/mot-statistics/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";
import { MOT_STATISTICS as S } from "@/lib/mot/motStatistics";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

const cars = S.byClass.cars;
const bikes = S.byClass.motorcycles;
const carRate = ((100 * (cars.fails + cars.passedAfterRectification)) / cars.tests).toFixed(1);
const bikeRate = ((100 * (bikes.fails + bikes.passedAfterRectification)) / bikes.tests).toFixed(1);

export default function Image() {
  return renderOgImage(
    "DVSA data · Cars & Motorcycles",
    `UK MOT Statistics ${S.year.slice(-4)}`,
    `${carRate}% of cars and ${bikeRate}% of motorcycles failed first time. Top failures, dangerous defects and the trend since 2013.`
  );
}
