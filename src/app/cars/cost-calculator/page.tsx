// Place at: src/app/cars/cost-calculator/page.tsx
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { CarCostCalculatorForm } from '@/components/CarCostCalculatorForm';
import { getSession } from '@/lib/auth/session';
import { getPrimaryCar } from '@/lib/tracker/car';
import { CAR_BRAND_OPTIONS, slugifyCarMake, type CarBenchmarkClass } from '@/lib/carPriceData';
import { CarRelatedTools } from '@/components/CarRelatedTools';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'True cost of owning your car',
  description:
    'Work out the true annual cost of owning your car - servicing, tyres, MOT, road tax, and fuel - benchmarked against typical UK prices.',
  alternates: { canonical: '/cars/cost-calculator' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'RoadVerdict car cost calculator',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
  description:
    'Estimate the true annual cost of owning a car in the UK, covering servicing, tyres, MOT, road tax, and fuel.',
};

function classFromEngineLitres(engineLitres: number): CarBenchmarkClass {
  if (engineLitres <= 1.2) return 'small';
  if (engineLitres <= 2.0) return 'medium';
  return 'large';
}

export default async function CarCostCalculatorPage() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  let session: Awaited<ReturnType<typeof getSession>> = null;
  try {
    session = await getSession();
  } catch (err) {
    console.error('Car cost calculator: getSession() failed, continuing as anonymous:', err);
  }
  const car = session ? await getPrimaryCar(session.email).catch(() => null) : null;

  let initialBrand: string | undefined;
  let initialCarClass: CarBenchmarkClass | undefined;
  if (car) {
    const slug = slugifyCarMake(car.make);
    initialBrand = CAR_BRAND_OPTIONS.some((b) => b.value === slug) ? slug : 'other';
    if (car.fuelType !== 'electric' && car.engineLitres) {
      initialCarClass = classFromEngineLitres(car.engineLitres);
    }
  }

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="hero">
        <h1>What does this car actually cost you a year?</h1>
        <p>Servicing, tyres, MOT, tax, and fuel - one honest number, benchmarked against typical UK prices.</p>
      </div>
      <CarCostCalculatorForm
        signedIn={!!session}
        initialBrand={initialBrand}
        initialCarClass={initialCarClass}
      />
      <p className="disclaimer">
        This is an estimate built from typical UK prices for your car&apos;s size, fuel type,
        and region - not a quote, and not a substitute for checking your own running costs.
        Fully electric cars aren&apos;t supported yet - not enough sourced UK price data.
      </p>
      <CarRelatedTools current="/cars/cost-calculator" />
    </>
  );
}
