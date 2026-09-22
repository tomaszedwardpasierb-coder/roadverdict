// Place at: src/lib/tracker/vaultCategories.ts
//
// Pure, Cosmos/Blob-free Vault category catalog - split out of
// vaultDocument.ts specifically so VaultTab.tsx (a 'use client'
// component) can read the category list without importing
// vaultDocument.ts itself, which imports @/lib/cosmos and
// @/lib/blobStorage - both now guarded with `import "server-only"`,
// which is exactly what caught this leak (confirmed via a failed build
// naming this precise import chain, alongside the identical proPlan.ts/
// onboardingSteps.ts leaks fixed the same way).
export type VaultDocumentCategory =
  | "dvlaLegal"
  | "insurance"
  | "purchaseFinance"
  | "licences"
  | "modifications"
  | "warranties"
  | "overseas";

export const VAULT_CATEGORIES: { key: VaultDocumentCategory; label: string; examples: string[] }[] = [
  {
    key: "dvlaLegal",
    label: "DVLA / Legal",
    examples: [
      "V5C logbook",
      "MOT certificate",
      "SORN confirmation",
      "Change of keeper confirmation",
      "Personalised plate assignment / retention certificate",
      "Age-related registration letter (classic vehicles)",
    ],
  },
  {
    key: "insurance",
    label: "Insurance",
    examples: ["Certificate of insurance", "Policy schedule", "Breakdown cover confirmation", "Track day insurance documents"],
  },
  {
    key: "purchaseFinance",
    label: "Purchase & Finance",
    examples: ["Original bill of sale / receipt", "Finance agreement / settlement letter", "Part-exchange paperwork", "HPI / VDI check report"],
  },
  {
    key: "licences",
    label: "Licences & Entitlements",
    examples: ["Driving licence (both sides)", "CBT certificate", "DAS / full motorcycle test pass certificate", "Advanced rider qualification (IAM, RoSPA)"],
  },
  {
    key: "modifications",
    label: "Modifications & Homologation",
    examples: ["IVA certificate", "Engineer's letter for non-standard modifications", "SVA certificate (older vehicles)", "Recall completion certificate"],
  },
  {
    key: "warranties",
    label: "Warranties",
    examples: ["Manufacturer warranty document", "Extended warranty"],
  },
  {
    key: "overseas",
    label: "Overseas / Touring",
    examples: ["Carnet de passages", "Green card (international insurance)", "Foreign registration documents (imported vehicles)"],
  },
];
