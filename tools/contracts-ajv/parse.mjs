// Conservative transport subset. The original Buffer remains the evidence.
export const LIMITS = Object.freeze({bytes: 65536, depth: 48, tokens: 20000,
  schemas: 32, fixtures: 512, totalBytes: 4 * 1024 * 1024, diagnostics: 8});

export class Refusal extends Error {
  constructor(code) { super(code); this.code = code; }
}
const refuse = code => { throw new Refusal(code); };

export function parseBytes(raw, limits = LIMITS) {
  if (!Buffer.isBuffer(raw) || raw.length > limits.bytes) refuse('input_bytes_limit');
  let source;
  try { source = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(raw); }
  catch { refuse('invalid_utf8'); }
  let at = 0, tokens = 0;
  const ws = () => { while (/[\x20\t\r\n]/.test(source[at] ?? '') && at < source.length) at++; };
  function string() {
    const start = at++;
    while (at < source.length) {
      const char = source[at++];
      if (char === '\\') { at++; continue; }
      if (char === '"') {
        let value;
        try { value = JSON.parse(source.slice(start, at)); } catch { refuse('invalid_json'); }
        if (!value.isWellFormed()) refuse('unsafe_unicode');
        return value;
      }
    }
    refuse('invalid_json');
  }
  function value(depth) {
    if (depth > limits.depth) refuse('input_depth_limit');
    if (++tokens > limits.tokens) refuse('input_token_limit');
    ws();
    const char = source[at];
    if (char === '{') {
      at++; ws(); const keys = new Set();
      if (source[at] === '}') { at++; return; }
      for (;;) {
        ws(); if (source[at] !== '"') refuse('invalid_json');
        if (++tokens > limits.tokens) refuse('input_token_limit');
        const key = string();
        if (keys.has(key)) refuse('unsafe_duplicate_key');
        keys.add(key); ws();
        if (source[at++] !== ':') refuse('invalid_json');
        value(depth + 1); ws();
        const next = source[at++];
        if (next === '}') return;
        if (next !== ',') refuse('invalid_json');
      }
    }
    if (char === '[') {
      at++; ws(); if (source[at] === ']') { at++; return; }
      for (;;) {
        value(depth + 1); ws(); const next = source[at++];
        if (next === ']') return;
        if (next !== ',') refuse('invalid_json');
      }
    }
    if (char === '"') { string(); return; }
    for (const literal of ['true', 'false', 'null']) {
      if (source.startsWith(literal, at)) { at += literal.length; return; }
    }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(at));
    if (!match) refuse('invalid_json');
    const lexeme = match[0]; at += lexeme.length;
    // Deliberately refuse decimal/exponent spelling, even 1.0 or 1e0. No rounded
    // Number or reviver is consulted to determine original numeric evidence.
    if (/[.eE]/.test(lexeme)) refuse('unsupported_number_lexeme');
    if (lexeme === '-0') refuse('unsafe_negative_zero');
    const exact = BigInt(lexeme);
    if (exact > 9007199254740991n || exact < -9007199254740991n) refuse('unsafe_integer');
  }
  value(0); ws();
  if (at !== source.length) refuse('invalid_json');
  try { return JSON.parse(source); } catch { refuse('invalid_json'); }
}
