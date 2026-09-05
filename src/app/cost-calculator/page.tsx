import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { CostCalculatorForm } from '@/components/CostCalculatorForm';
import { getSession } from '@/lib/auth/session';
import { getPrimaryBike } from '@/lib/tracker/bike';
import { BRAND_OPTIONS } from '@/lib/priceData';
import { getModelsForBrand, getBikeClassForCC, slugifyMake } from '@/lib/motorcycleModels';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'True cost of owning your motorcycle',
  description:
    'Work out the true annual cost of owning your motorcycle - servicing, tyres, MOT, road tax, and fuel - benchmarked against typical UK prices.',
  alternates: { canonical: '/cost-calculator' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'RoadVerdict cost calculator',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
  description:
    'Estimate the true annual cost of owning a motorcycle in the UK, covering servicing, tyres, MOT, road tax, and fuel.',
};

export default async function CostCalculatorPage() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  // Wrapped rather than called directly: this page previously had no
  // Cosmos dependency at all, and getContainer() throws unconditionally
  // if Cosmos config is ever missing/unavailable - a problem there
  // should degrade to "treat as anonymous", not take down a public,
  // no-account-needed tool for every visitor over something only
  // relevant to the small fraction who are signed in.
  let session: Awaited<ReturnType<typeof getSession>> = null;
  try {
    session = await getSession();
  } catch (err) {
    console.error("Cost calculator: getSession() failed, continuing as anonymous:", err);
  }
  const bike = session ? await getPrimaryBike(session.email).catch(() => null) : null;

  // Pre-fill from the signed-in user's own bike, matched against the
  // same curated brand/model list the form's dropdowns use - not a new
  // matching approach, the exact same one the plate-search handler in
  // the form uses for a freshly looked-up plate. A model-name match is
  // a nice-to-have; engineCC -> bikeClass is the one that actually
  // drives the price, and works even without a clean model match.
  let initialBrand: string | undefined;
  let initialModel: string | undefined;
  let initialBikeClass: 'small' | 'medium' | 'large' | undefined;
  if (bike) {
    const slug = slugifyMake(bike.make);
    initialBrand = BRAND_OPTIONS.some((b) => b.value === slug) ? slug : 'other';
    const candidates = getModelsForBrand(initialBrand);
    const matched = candidates.find(
      (m) => m.model.toLowerCase().includes(bike.model.toLowerCase()) || bike.model.toLowerCase().includes(m.model.toLowerCase())
    );
    initialModel = matched?.model;
    initialBikeClass = getBikeClassForCC(bike.engineCC);
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
        <h1>What does this bike actually cost you a year?</h1>
        <p>Servicing, tyres, MOT, tax, and fuel - one honest number, benchmarked against typical UK prices.</p>
      </div>
      <CostCalculatorForm
        signedIn={!!session}
        initialBrand={initialBrand}
        initialModel={initialModel}
        initialBikeClass={initialBikeClass}
      />
      <p className="disclaimer">
        This is an estimate built from typical UK prices for your bike&apos;s size, make, and
        region - not a quote, and not a substitute for checking your own riding costs.
      </p>
    </>
  );
}
