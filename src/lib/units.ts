import type { Units } from '../storage/schema.ts';

export type { Units } from '../storage/schema.ts';
export type UnitsOption = Units;

const ML_PER_FL_OZ = 29.5735;
const ML_PER_GAL = 3785.41;
const FL_OZ_GAL_THRESHOLD = 64;
const IMPERIAL_REGIONS = new Set(['us', 'mm', 'lr']);

export function resolveUnits(lang?: string): 'metric' | 'imperial' {
  const tag = (lang ?? '').toLowerCase();
  const region = tag.split('-')[1] ?? '';
  return IMPERIAL_REGIONS.has(region) ? 'imperial' : 'metric';
}

export function autoUnits(): 'metric' | 'imperial' {
  return resolveUnits(typeof navigator !== 'undefined' ? navigator.language : undefined);
}

function fmt(n: number): string {
  return n >= 100 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, '');
}

function formatMetric(mL: number): string {
  if (mL < 1000) return `${fmt(mL)} mL`;
  return `${fmt(mL / 1000)} L`;
}

function formatImperial(mL: number): string {
  const flOz = mL / ML_PER_FL_OZ;
  if (flOz < FL_OZ_GAL_THRESHOLD) return `${fmt(flOz)} fl oz`;
  return `${fmt(mL / ML_PER_GAL)} gal`;
}

export function formatVolume(mL: number, units: UnitsOption, lang?: string): string {
  const system = units === 'auto' ? resolveUnits(lang ?? (typeof navigator !== 'undefined' ? navigator.language : undefined)) : units;
  return system === 'imperial' ? formatImperial(mL) : formatMetric(mL);
}
