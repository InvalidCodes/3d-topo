export function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function randInt(rng, a, bInclusive) {
  return a + Math.floor(rng() * (bInclusive - a + 1));
}

// Mulberry32: fast deterministic RNG for reproducible sampling
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}


