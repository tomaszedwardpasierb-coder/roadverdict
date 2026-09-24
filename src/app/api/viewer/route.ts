// Place at: src/app/api/viewer/route.ts
//
// Client-side replacement for the getSession()/getPrimaryBike()/
// getPrimaryCar() reads the public tool and marketing pages used to do
// during server rendering - which forced every one of those pages to be
// rendered per request and made them impossible to cache. Those pages are
// now static; a signed-in visitor's own bike/car prefill and CTA state
// arrive from here instead, after the page has loaded.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getBikesForUser, pickActiveBike } from "@/lib/tracker/bike";
import { getCarsForUser, pickActiveCar } from "@/lib/tracker/car";
import { BRAND_OPTIONS } from "@/lib/priceData";
import { getBikeClassForCC, getModelsForBrand, slugifyMake } from "@/lib/motorcycleModels";
import { CAR_BRAND_OPTIONS, slugifyCarMake, type CarBenchmarkClass } from "@/lib/carPriceData";
import { ANONYMOUS_VIEWER, type ViewerInfo } from "@/lib/viewer";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function carClassFromEngineLitres(engineLitres: number): CarBenchmarkClass {
  if (engineLitres <= 1.2) return "small";
  if (engineLitres <= 2.0) return "medium";
  return "large";
}

export async function GET() {
  // Same defensive posture the pages had: a Cosmos problem degrades to
  // "treat as anonymous", never an error the page has to handle.
  let session: Awaited<ReturnType<typeof getSession>> = null;
  try {
    session = await getSession();
  } catch (err) {
    console.error("/api/viewer: getSession() failed, treating as anonymous:", err);
  }
  if (!session) return NextResponse.json(ANONYMOUS_VIEWER, { headers: NO_STORE });

  const [bikes, cars] = await Promise.all([
    getBikesForUser(session.email).catch(() => []),
    getCarsForUser(session.email).catch(() => []),
  ]);
  const [bikeDoc, carDoc] = await Promise.all([pickActiveBike(bikes), pickActiveCar(cars)]);

  const viewer: ViewerInfo = {
    signedIn: true,
    hasBike: bikes.length > 0,
    hasCar: cars.length > 0,
  };

  if (bikeDoc) {
    const slug = slugifyMake(bikeDoc.make);
    const brand = BRAND_OPTIONS.some((b) => b.value === slug) ? slug : "other";
    const modelLower = bikeDoc.model.toLowerCase();
    const matched = getModelsForBrand(brand).find(
      (m) => m.model.toLowerCase().includes(modelLower) || modelLower.includes(m.model.toLowerCase())
    );
    viewer.bike = { brand, bikeClass: getBikeClassForCC(bikeDoc.engineCC), model: matched?.model };
  }

  if (carDoc) {
    const slug = slugifyCarMake(carDoc.make);
    viewer.car = {
      brand: CAR_BRAND_OPTIONS.some((b) => b.value === slug) ? slug : "other",
      carClass:
        carDoc.fuelType !== "electric" && carDoc.engineLitres ? carClassFromEngineLitres(carDoc.engineLitres) : undefined,
    };
  }

  return NextResponse.json(viewer, { headers: NO_STORE });
}
