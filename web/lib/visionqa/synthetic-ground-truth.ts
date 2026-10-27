export const SYNTHETIC_TROUSERS_CASE_ID =
  "SYN-VQA-BURGUNDY-TROUSERS-001" as const;

export const SYNTHETIC_TROUSERS_SOURCE_SHA256 =
  "D57A189C93CB209818EB5AF0F9A427E846041CB4618337B1760895E9A72A7C9E" as const;

export const SYNTHETIC_TROUSERS_REFERENCE_NAME =
  "product-truth-grid.png" as const;

export function isSyntheticTrousersGroundTruthEligible(input: {
  candidateCount: number;
  candidateSha256?: string | null;
  referenceFileNames: string[];
}) {
  return (
    input.candidateCount === 1 &&
    input.candidateSha256?.toUpperCase() ===
      SYNTHETIC_TROUSERS_SOURCE_SHA256 &&
    input.referenceFileNames.includes(SYNTHETIC_TROUSERS_REFERENCE_NAME)
  );
}
