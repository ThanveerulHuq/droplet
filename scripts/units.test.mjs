import test from 'node:test';
import assert from 'node:assert/strict';
import { formatVolume, resolveUnits, autoUnits } from '../src/lib/units.ts';

test('metric: 6.8 mL stays 6.8 mL', () => {
  assert.equal(formatVolume(6.8, 'metric'), '6.8 mL');
});

test('metric: 1400 mL becomes 1.4 L', () => {
  assert.equal(formatVolume(1400, 'metric'), '1.4 L');
});

test('imperial: 6.8 mL ≈ 0.2 fl oz', () => {
  assert.equal(formatVolume(6.8, 'imperial'), '0.2 fl oz');
});

test('imperial: 250 mL ≈ 8.5 fl oz', () => {
  assert.equal(formatVolume(250, 'imperial'), '8.5 fl oz');
});

test('imperial: 1400 mL ≈ 47.3 fl oz', () => {
  assert.equal(formatVolume(1400, 'imperial'), '47.3 fl oz');
});

test('imperial: 3800 mL ≈ 1 gal', () => {
  assert.equal(formatVolume(3800, 'imperial'), '1 gal');
});

test('imperial: 4921 mL ≈ 1.3 gal', () => {
  assert.equal(formatVolume(1.3 * 3785.41, 'imperial'), '1.3 gal');
});

test('imperial: exactly 64 fl oz switches to half a gallon', () => {
  assert.equal(formatVolume(64 * 29.5735, 'imperial'), '0.5 gal');
});

test('imperial: 63.9 fl oz stays in fluid ounces', () => {
  assert.equal(formatVolume(63.9 * 29.5735, 'imperial'), '63.9 fl oz');
});

test('boundary: 1000 mL metric becomes 1 L', () => {
  assert.equal(formatVolume(1000, 'metric'), '1 L');
});

test('boundary: 999 mL metric stays 999 mL', () => {
  assert.equal(formatVolume(999, 'metric'), '999 mL');
});

test('boundary: 120 mL metric reads whole, not decimal', () => {
  assert.equal(formatVolume(120, 'metric'), '120 mL');
});

test('resolveUnits: unknown locale defaults to metric', () => {
  assert.equal(resolveUnits('xx-XX'), 'metric');
});

test('resolveUnits: en-US is imperial', () => {
  assert.equal(resolveUnits('en-US'), 'imperial');
});

test('resolveUnits: en-GB is metric', () => {
  assert.equal(resolveUnits('en-GB'), 'metric');
});

test('resolveUnits: bare en is metric (no region subtag)', () => {
  assert.equal(resolveUnits('en'), 'metric');
});

test('resolveUnits: fr-FR is metric', () => {
  assert.equal(resolveUnits('fr-FR'), 'metric');
});

test('resolveUnits: Myanmar my-MM and Liberia en-LR are imperial', () => {
  assert.equal(resolveUnits('my-MM'), 'imperial');
  assert.equal(resolveUnits('en-LR'), 'imperial');
});

test('resolveUnits: undefined resolves to metric', () => {
  assert.equal(resolveUnits(undefined), 'metric');
});

test('resolveUnits: extended en-US-... tags still resolve imperial', () => {
  assert.equal(resolveUnits('en-US-u-ca-gregory'), 'imperial');
});

test('auto with no navigator resolves to metric (pure path)', () => {
  assert.equal(formatVolume(6.8, 'auto'), '6.8 mL');
});

test('autoUnits with no navigator resolves to metric', () => {
  assert.equal(autoUnits(), 'metric');
});

test('auto honors an explicit language: en-US → fl oz, fr-FR → mL', () => {
  assert.equal(formatVolume(250, 'auto', 'en-US'), '8.5 fl oz');
  assert.equal(formatVolume(250, 'auto', 'fr-FR'), '250 mL');
});
