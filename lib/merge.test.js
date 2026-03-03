import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deepMergeSnbt } from './merge.js';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Normalize whitespace for comparison: trim + collapse internal runs */
function norm(s) { return s.trim().replace(/\s+/g, ' '); }

// ── Round-trip: parse → serialize ────────────────────────────────────────

describe('SNBT round-trip', () => {
  it('preserves a simple compound', () => {
    const input = '{ name: "test", value: 42 }';
    const result = deepMergeSnbt(input, '{ }');
    assert.equal(norm(result), norm('{ name: "test", value: 42 }'));
  });

  it('preserves an empty compound', () => {
    const result = deepMergeSnbt('{ }', '{ }');
    assert.equal(norm(result), '{ }');
  });

  it('preserves typed byte array', () => {
    const input = '{ data: [B; 1b, 2b, 3b] }';
    const result = deepMergeSnbt(input, '{ }');
    assert.match(result, /\[B;/);
    assert.match(result, /1b/);
    assert.match(result, /2b/);
    assert.match(result, /3b/);
  });

  it('preserves typed int array', () => {
    const input = '{ ids: [I; 10, 20] }';
    const result = deepMergeSnbt(input, '{ }');
    assert.match(result, /\[I;/);
    assert.match(result, /10/);
    assert.match(result, /20/);
  });

  it('preserves typed long array', () => {
    const input = '{ uuids: [L; 100L, 200L] }';
    const result = deepMergeSnbt(input, '{ }');
    assert.match(result, /\[L;/);
    assert.match(result, /100L/);
    assert.match(result, /200L/);
  });

  it('preserves empty array', () => {
    const input = '{ items: [] }';
    const result = deepMergeSnbt(input, '{ }');
    assert.match(result, /\[\]/);
  });

  it('preserves empty typed array', () => {
    const input = '{ data: [B;] }';
    const result = deepMergeSnbt(input, '{ }');
    assert.match(result, /\[B;\]/);
  });

  it('preserves nested compounds inside arrays', () => {
    const input = '{ list: [{ id: "a", x: 1 }, { id: "b", x: 2 }] }';
    const result = deepMergeSnbt(input, '{ }');
    assert.match(result, /id: "a"/);
    assert.match(result, /id: "b"/);
    assert.match(result, /x: 1/);
    assert.match(result, /x: 2/);
  });

  it('preserves nested arrays', () => {
    const input = '{ matrix: [[1, 2], [3, 4]] }';
    const result = deepMergeSnbt(input, '{ }');
    assert.match(result, /1/);
    assert.match(result, /4/);
  });
});

// ── Compound merging ─────────────────────────────────────────────────────

describe('SNBT compound merging', () => {
  it('adds new keys from source', () => {
    const result = deepMergeSnbt('{ a: 1 }', '{ b: 2 }');
    assert.match(result, /a: 1/);
    assert.match(result, /b: 2/);
  });

  it('overwrites raw values with source', () => {
    const result = deepMergeSnbt('{ a: 1 }', '{ a: 99 }');
    assert.match(result, /a: 99/);
    assert.doesNotMatch(result, /a: 1/);
  });

  it('deep merges nested compounds', () => {
    const target = '{ outer: { a: 1, b: 2 } }';
    const source = '{ outer: { b: 3, c: 4 } }';
    const result = deepMergeSnbt(target, source);
    assert.match(result, /a: 1/);
    assert.match(result, /b: 3/);
    assert.match(result, /c: 4/);
  });

  it('source compound replaces target raw value', () => {
    const target = '{ x: 1 }';
    const source = '{ x: { nested: true } }';
    const result = deepMergeSnbt(target, source);
    assert.match(result, /nested: true/);
  });

  it('source raw value replaces target compound', () => {
    const target = '{ x: { nested: true } }';
    const source = '{ x: 42 }';
    const result = deepMergeSnbt(target, source);
    assert.match(result, /x: 42/);
    assert.doesNotMatch(result, /nested/);
  });
});

// ── Array merging ────────────────────────────────────────────────────────

describe('SNBT array merging', () => {
  it('deduplicates raw values', () => {
    const target = '{ tags: [1b, 2b, 3b] }';
    const source = '{ tags: [2b, 3b, 4b] }';
    const result = deepMergeSnbt(target, source);
    // Should contain each value exactly once
    const matches = result.match(/\db/g);
    assert.deepEqual(matches.sort(), ['1b', '2b', '3b', '4b']);
  });

  it('merges compound elements by id', () => {
    const target = '{ items: [{ id: "sword", damage: 10 }] }';
    const source = '{ items: [{ id: "sword", damage: 20, enchant: 1 }] }';
    const result = deepMergeSnbt(target, source);
    // damage should be overwritten, enchant added, only one entry
    assert.match(result, /damage: 20/);
    assert.match(result, /enchant: 1/);
    assert.doesNotMatch(result, /damage: 10/);
  });

  it('appends new compound elements with different id', () => {
    const target = '{ items: [{ id: "sword", x: 1 }] }';
    const source = '{ items: [{ id: "bow", x: 2 }] }';
    const result = deepMergeSnbt(target, source);
    assert.match(result, /id: "sword"/);
    assert.match(result, /id: "bow"/);
  });

  it('deduplicates structurally identical compounds without id', () => {
    const target = '{ list: [{ name: "a", val: 1 }] }';
    const source = '{ list: [{ name: "a", val: 1 }] }';
    const result = deepMergeSnbt(target, source);
    // Should appear only once
    const count = (result.match(/name: "a"/g) || []).length;
    assert.equal(count, 1);
  });

  it('appends structurally different compounds without id', () => {
    const target = '{ list: [{ name: "a", val: 1 }] }';
    const source = '{ list: [{ name: "b", val: 2 }] }';
    const result = deepMergeSnbt(target, source);
    assert.match(result, /name: "a"/);
    assert.match(result, /name: "b"/);
  });

  it('handles repeated merges without data growth', () => {
    const base = '{ tags: [1b, 2b], items: [{ id: "x", v: 1 }], misc: [{ a: 1 }] }';
    const overlay = '{ tags: [2b, 3b], items: [{ id: "x", v: 2 }], misc: [{ a: 1 }] }';
    const first = deepMergeSnbt(base, overlay);
    const second = deepMergeSnbt(first, overlay);
    // Second merge should be idempotent
    assert.equal(norm(first), norm(second));
  });
});

// ── Serialization formatting ─────────────────────────────────────────────

describe('SNBT serialization', () => {
  it('inlines small raw-only arrays', () => {
    const result = deepMergeSnbt('{ a: [1, 2, 3] }', '{ }');
    // Small raw arrays should be on one line
    assert.match(result, /\[1, 2, 3\]/);
  });

  it('inlines small typed arrays', () => {
    const result = deepMergeSnbt('{ a: [B; 1b, 2b] }', '{ }');
    assert.match(result, /\[B; 1b, 2b\]/);
  });

  it('outputs multiline for large arrays', () => {
    const input = '{ a: [1, 2, 3, 4, 5] }';
    const result = deepMergeSnbt(input, '{ }');
    // 5 elements exceeds inline threshold (4), should be multiline
    assert.match(result, /\[\n/);
  });

  it('produces trailing commas in multiline compounds', () => {
    const input = '{ a: { x: 1, y: 2, z: 3, w: 4 } }';
    const result = deepMergeSnbt(input, '{ }');
    // 4 keys → multiline, each line should end with comma
    assert.match(result, /x: 1,/);
    assert.match(result, /w: 4,/);
  });

  it('produces trailing commas in multiline arrays', () => {
    const input = '{ a: [1, 2, 3, 4, 5] }';
    const result = deepMergeSnbt(input, '{ }');
    assert.match(result, /1,\n/);
    assert.match(result, /5,\n/);
  });

  it('quotes keys with special characters', () => {
    const input = '{ "key with spaces": 42 }';
    const result = deepMergeSnbt(input, '{ }');
    assert.match(result, /"key with spaces"/);
  });

  it('does not quote safe keys', () => {
    const result = deepMergeSnbt('{ safe_key: 1 }', '{ }');
    assert.match(result, /safe_key: 1/);
    assert.doesNotMatch(result, /"safe_key"/);
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────

describe('SNBT edge cases', () => {
  it('handles comments in input', () => {
    const input = '{\n  // this is a comment\n  key: "value"\n}';
    const result = deepMergeSnbt(input, '{ }');
    assert.match(result, /key: "value"/);
  });

  it('handles single-quoted strings', () => {
    const input = "{ key: 'value' }";
    const result = deepMergeSnbt(input, '{ }');
    assert.match(result, /key:/);
  });

  it('handles escaped quotes in strings', () => {
    const input = '{ key: "val\\"ue" }';
    const result = deepMergeSnbt(input, '{ }');
    assert.match(result, /key:/);
  });

  it('throws on deeply nested input beyond MAX_DEPTH', () => {
    // Build a 65-level deep compound
    let deep = 'x';
    for (let i = 0; i < 65; i++) deep = `{ a: ${deep} }`;
    // Wrap in top-level compound for valid SNBT
    assert.throws(() => deepMergeSnbt(deep, '{ }'), /maximum depth/);
  });

  it('handles mixed array types: raw, compounds with id, compounds without id', () => {
    const target = '{ list: [1b, { id: "a", x: 1 }, { name: "z" }] }';
    const source = '{ list: [1b, { id: "a", x: 2 }, { name: "z" }, 2b] }';
    const result = deepMergeSnbt(target, source);
    // 1b deduped, id "a" merged, { name: "z" } deduped, 2b appended
    assert.equal((result.match(/1b/g) || []).length, 1);
    assert.match(result, /x: 2/);
    assert.equal((result.match(/name: "z"/g) || []).length, 1);
    assert.match(result, /2b/);
  });

  it('merges arrays nested inside arrays', () => {
    const target = '{ grid: [{ id: "row1", cells: [1, 2] }] }';
    const source = '{ grid: [{ id: "row1", cells: [2, 3] }] }';
    const result = deepMergeSnbt(target, source);
    // cells array should be merged: [1, 2, 3] (2 deduped)
    assert.match(result, /1/);
    assert.match(result, /2/);
    assert.match(result, /3/);
  });
});
