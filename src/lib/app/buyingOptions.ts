// Place at: src/lib/app/buyingOptions.ts
//
// The Android app's buying guide: the choices the web's BuyingGuideForm and
// CarBuyingGuideForm offer for the buyer's checklist - make, size and age -
// for a bike or a car. It's about a vehicle the person is thinking of
// buying, not one of theirs, so it isn't tied to their garage.
import { BIKE_CLASS_LABELS, BRAND_OPTIONS } from "@/lib/priceData";
import { AGE_BAND_LABELS } from "@/lib/buyerChecklist";
import { CAR_BRAND_OPTIONS } from "@/lib/carPriceData";
import { CAR_AGE_BAND_LABELS, CAR_CLASS_LABELS_FOR_BUYING_GUIDE } from "@/lib/tracker/carBuyerChecklist";

type Option = { value: string; label: string };
type KindOptions = { brands: Option[]; classes: Option[]; ageBands: Option[] };

export type BuyingOptions = { bike: KindOptions; car: KindOptions };

const toOptions = (labels: Record<string, string>): Option[] => Object.entries(labels).map(([value, label]) => ({ value, label }));

export function getBuyingOptions(): BuyingOptions {
  return {
    bike: {
      brands: BRAND_OPTIONS.map(({ value, label }) => ({ value, label })),
      classes: toOptions(BIKE_CLASS_LABELS),
      ageBands: toOptions(AGE_BAND_LABELS),
    },
    car: {
      brands: CAR_BRAND_OPTIONS.map(({ value, label }) => ({ value, label })),
      classes: toOptions(CAR_CLASS_LABELS_FOR_BUYING_GUIDE),
      ageBands: toOptions(CAR_AGE_BAND_LABELS),
    },
  };
}
