import type { CoefficientVersion } from '../model/coefficients.ts';
import { COEFFICIENTS, COEFFICIENT_SOURCES } from '../model/coefficients.ts';

// TODO: set the real repo URL before release (no git remote configured in this checkout).
export const REPO_URL = 'https://github.com/<owner>/droplet';

const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;
const METHODOLOGY_URL = `${REPO_URL}/blob/main/METHODOLOGY.md`;

interface CoeffMeta { name: string; unit: string; }

const COEFFICIENT_META: Record<Exclude<keyof CoefficientVersion, 'modelVersion'>, CoeffMeta> = {
  whBase: { name: 'Wh_base', unit: 'Wh / request' },
  whPerToken: { name: 'Wh_per_token', unit: 'Wh / token' },
  reasoningMultiplier: { name: 'reasoning_multiplier', unit: '×' },
  wueDc: { name: 'WUE_dc', unit: 'mL / Wh' },
  ewifGrid: { name: 'EWIF_grid', unit: 'mL / Wh' },
  medianResponseTokens: { name: 'median_response_tokens', unit: 'tokens' },
};

const FORMULA = [
  'tokens_out    = char_count / 4',
  'E_Wh          = (Wh_base + tokens_out × Wh_per_token) × reasoning_multiplier',
  'water_onsite  = E_Wh × WUE_dc',
  'water_grid    = E_Wh × EWIF_grid',
  'water_total   = water_onsite + water_grid',
].join('\n');

const LIMITATIONS = [
  'Reasoning tokens are hidden, so a multiplier is applied only when reasoning UI is detected, blended by share.',
  'We do not know which data-center region served the request; WUE and grid intensity vary widely by region.',
  'tokens_out ≈ char_count / 4 is an approximation of token length from characters.',
  'Water embodied in chip fabrication and data-center construction is not counted.',
  'Input-token processing is folded into Wh_base rather than tracked separately.',
  'Water used by host-side retrieval, image generation, or tool calls is not counted.',
];

function el(tag: keyof HTMLElementTagNameMap, className?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function heading(text: string): HTMLElement {
  const h = el('h2', 'methodology-h2');
  h.textContent = text;
  return h;
}

function paragraph(text: string): HTMLElement {
  const p = el('p');
  p.textContent = text;
  return p;
}

function link(url: string, text: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noreferrer noopener';
  a.textContent = text;
  return a;
}

// Renders each source entry as a link when it carries a real URL, otherwise as plain text.
// COEFFICIENT_SOURCES entries currently point to METHODOLOGY.md until real URLs land (M3).
function sourceNodes(sources: Array<{ label: string; url?: string }>): HTMLElement[] {
  return sources.map((s) => {
    const isUrl = (s.url ?? '').startsWith('http');
    const node = isUrl ? link(s.url as string, s.label) : el('span');
    if (!isUrl) node.textContent = s.label;
    return node;
  });
}

function coefficientRows(): HTMLElement {
  const rows = el('tbody');
  const keys = Object.keys(COEFFICIENT_META) as Array<keyof typeof COEFFICIENT_META>;
  for (const key of keys) {
    const row = el('tr');
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = COEFFICIENT_META[key].name;
    const value = COEFFICIENTS[key];
    const cell = (text: string): HTMLTableCellElement => {
      const td = document.createElement('td');
      td.textContent = text;
      return td;
    };
    row.append(
      name,
      typeof value === 'number' ? cell(String(value)) : cell(String(value.low)),
      typeof value === 'number' ? cell('—') : cell(String(value.mid)),
      typeof value === 'number' ? cell('—') : cell(String(value.high)),
      cell(COEFFICIENT_META[key].unit),
    );
    rows.appendChild(row);
    const source = el('tr', 'coefficient-source');
    const sourceCell = document.createElement('td');
    sourceCell.colSpan = 5;
    sourceCell.append(...sourceNodes(COEFFICIENT_SOURCES[key]));
    source.appendChild(sourceCell);
    rows.appendChild(source);
  }
  return rows;
}

/**
 * Static, full-height methodology view (PRD §5.2): formula, coefficient table with sources,
 * on-site vs grid water explanation, named limitations, plus changelog + repo links.
 * When `onBack` is provided a "← Back" button is rendered that invokes it; otherwise the footer
 * omits the button (callers that never leave the panel pass no callback).
 * Direct DOM only (matches scopes.ts convention); no innerHTML.
 */
export function renderMethodology(container: HTMLElement, onBack?: () => void): void {
  container.replaceChildren();

  const formula = el('pre', 'formula');
  formula.textContent = FORMULA;

  const table = el('table', 'coefficient-table');
  const thead = el('thead');
  const headRow = el('tr');
  for (const label of ['Coefficient', 'Low', 'Mid', 'High', 'Unit']) {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.append(thead, coefficientRows());

  const onsite = paragraph(
    "On-site water cools the data center directly (WUE_dc). Indirect water (EWIF_grid) is the water used upstream to " +
    'generate the electricity that powers the request. "On-site cooling only" shows just the direct water; ' +
    '"Including electricity generation" adds both.',
  );

  const limitations = el('ul', 'limitations');
  for (const item of LIMITATIONS) {
    const li = el('li');
    li.textContent = item;
    limitations.appendChild(li);
  }

  const footer = el('div', 'methodology-footer');
  const footerNodes: Array<Node | string> = [
    link(CHANGELOG_URL, 'Model changelog'),
    link(METHODOLOGY_URL, 'METHODOLOGY.md'),
    link(REPO_URL, 'Source code'),
  ];
  if (onBack) {
    const back = document.createElement('button');
    back.className = 'methodology-back';
    back.type = 'button';
    back.textContent = '← Back';
    back.addEventListener('click', () => onBack());
    footerNodes.unshift(back);
  }
  footer.append(...footerNodes);

  container.append(
    heading('How the estimate is calculated'),
    formula,
    heading('On-site vs. grid water'),
    onsite,
    heading('Coefficients and sources'),
    table,
    heading('Known limitations'),
    limitations,
    footer,
  );
}
