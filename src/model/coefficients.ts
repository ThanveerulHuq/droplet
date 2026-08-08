export interface CoeffSet { low: number; mid: number; high: number; }

export interface CoefficientVersion {
  modelVersion: string;
  whBase: CoeffSet;          // Wh per request
  whPerToken: CoeffSet;      // Wh per output token
  reasoningMultiplier: CoeffSet;
  wueDc: CoeffSet;           // Water Usage Effectiveness, on-site, mL/Wh
  ewifGrid: CoeffSet;        // indirect (grid) water, mL/Wh
  medianResponseTokens: number;
}

export const COEFFICIENTS: CoefficientVersion = {
  modelVersion: '0.1.0',
  whBase:            { low: 0.02,    mid: 0.05,    high: 0.30 },
  whPerToken:        { low: 0.0002,  mid: 0.00063, high: 0.009 },
  reasoningMultiplier: { low: 1.5,   mid: 3,       high: 10 },
  wueDc:             { low: 0.2,     mid: 1.1,     high: 1.9 },
  ewifGrid:          { low: 1.0,     mid: 4.5,     high: 6.5 },
  medianResponseTokens: 75,
};

export const MEDIAN_RESPONSE_TOKENS = COEFFICIENTS.medianResponseTokens;

export interface CoefficientSource { label: string; url?: string; }

export const COEFFICIENT_SOURCES: Record<keyof CoefficientVersion, CoefficientSource[]> = {
  modelVersion: [{ label: 'Droplet model version; changelog in repo (R6.4)', url: 'see METHODOLOGY.md' }],
  whBase: [
    { label: 'Calibrated so a median ~300-token response matches Google\u2019s published 0.24 Wh at Mid (PRD \u00a76.2)', url: 'see METHODOLOGY.md' },
    { label: 'ChatGPT latency/energy figures', url: 'see METHODOLOGY.md' },
  ],
  whPerToken: [
    { label: 'Low/Mid from current-gen disclosures', url: 'see METHODOLOGY.md' },
    { label: 'High reflects 2023-era per-response estimates', url: 'see METHODOLOGY.md' },
  ],
  reasoningMultiplier: [
    { label: 'Hidden thinking tokens; applied only when reasoning UI is detected', url: 'see METHODOLOGY.md' },
  ],
  wueDc: [
    { label: 'Hyperscaler best', url: 'see METHODOLOGY.md' },
    { label: 'Fleet typical', url: 'see METHODOLOGY.md' },
    { label: 'Published industry average', url: 'see METHODOLOGY.md' },
  ],
  ewifGrid: [
    { label: 'US power-sector water consumption per kWh; region-dependent', url: 'see METHODOLOGY.md' },
  ],
  medianResponseTokens: [
    { label: 'Median response-length assumption when char_count is unknown (R6.5)', url: 'see METHODOLOGY.md' },
  ],
};
