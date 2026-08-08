import type { AccountingMode, ComparisonSet, EnergyTier, Settings, Units, WueSetting } from '../storage/schema.ts';
import { repo } from '../storage/repo.ts';
import { log } from '../lib/log.ts';

interface SettingOption<V extends string> { value: V; label: string; }

const ACCOUNTING_OPTIONS: SettingOption<AccountingMode>[] = [
  { value: 'onsite', label: 'On-site cooling only' },
  { value: 'total', label: 'Including electricity generation' },
];

const ENERGY_OPTIONS: SettingOption<EnergyTier>[] = [
  { value: 'efficient', label: 'Current-gen efficient' },
  { value: 'mid', label: 'Mid' },
  { value: 'legacy', label: 'Legacy / heavy' },
];

const WUE_OPTIONS: SettingOption<WueSetting>[] = [
  { value: 'best', label: 'Hyperscaler best' },
  { value: 'fleet', label: 'Fleet typical' },
  { value: 'industry', label: 'Industry average' },
];

const UNITS_OPTIONS: SettingOption<Units>[] = [
  { value: 'auto', label: 'Auto (locale)' },
  { value: 'metric', label: 'mL / L' },
  { value: 'imperial', label: 'fl oz / gal' },
];

const COMPARISON_OPTIONS: SettingOption<ComparisonSet>[] = [
  { value: 'everyday', label: 'Everyday' },
  { value: 'food', label: 'Food' },
  { value: 'household', label: 'Household' },
];

function el(tag: keyof HTMLElementTagNameMap, className?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function select<V extends string>(
  options: SettingOption<V>[],
  current: V,
  onChange: (value: V) => void,
): HTMLSelectElement {
  const selectEl = document.createElement('select');
  for (const opt of options) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === current) option.selected = true;
    selectEl.appendChild(option);
  }
  selectEl.addEventListener('change', () => onChange(selectEl.value as V));
  return selectEl;
}

function fieldRow<V extends string>(label: string, control: HTMLElement): HTMLElement {
  const row = el('div', 'setting-row');
  const labelEl = el('label', 'setting-label');
  labelEl.textContent = label;
  row.append(labelEl, control);
  return row;
}

function toggle(tracking: boolean, onChange: (on: boolean) => void): HTMLElement {
  const row = el('div', 'toggle-row');
  const labelEl = el('label', 'toggle-label');
  labelEl.textContent = 'Tracking';
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = tracking;
  check.setAttribute('role', 'switch');
  check.addEventListener('change', () => onChange(check.checked));
  const hint = el('span', 'toggle-hint');
  hint.textContent = tracking ? 'On' : 'Paused';
  check.addEventListener('change', () => { hint.textContent = check.checked ? 'On' : 'Paused'; });
  row.append(labelEl, check, hint);
  return row;
}

function settingsSection(): HTMLElement {
  const section = el('div', 'settings-section');
  return section;
}

/**
 * Settings view (PRD §5.3): accounting mode, energy tier, WUE, units, comparison set, tracking.
 * Each control persists immediately to store.settings (R6.1: coefficients computed at render time,
 * so a change re-renders scopes instantly). Export/Reset (Task 27) land in the Data section.
 */
export function mountSettings(container: HTMLElement, onChanged: () => void): void {
  container.replaceChildren();
  const section = settingsSection();
  container.appendChild(section);

  const patch = async (update: (settings: Settings) => Settings): Promise<void> => {
    try {
      const settings = await repo.getSettings();
      const next = update(settings);
      await repo.saveSettings(next);
      onChanged();
    } catch (err) {
      log.warn('settings save failed', err);
    }
  };

  const load = async (): Promise<void> => {
    let settings: Settings;
    try {
      settings = await repo.getSettings();
    } catch (err) {
      log.warn('settings load failed', err);
      container.replaceChildren();
      const p = el('p', 'empty');
      p.textContent = "Couldn't load your settings.";
      container.appendChild(p);
      return;
    }

    section.replaceChildren(
      fieldRow('Accounting mode', select(ACCOUNTING_OPTIONS, settings.accountingMode, (v) => patch((s) => ({ ...s, accountingMode: v })))),
      fieldRow('Energy tier', select(ENERGY_OPTIONS, settings.energyTier, (v) => patch((s) => ({ ...s, energyTier: v })))),
      fieldRow('Data-center efficiency (WUE)', select(WUE_OPTIONS, settings.wue, (v) => patch((s) => ({ ...s, wue: v })))),
      fieldRow('Units', select(UNITS_OPTIONS, settings.units, (v) => patch((s) => ({ ...s, units: v })))),
      fieldRow('Comparison set', select(COMPARISON_OPTIONS, settings.comparisonSet, (v) => patch((s) => ({ ...s, comparisonSet: v })))),
      toggle(settings.tracking, (on) => patch((s) => ({ ...s, tracking: on }))),
    );
  };

  void load();
}
