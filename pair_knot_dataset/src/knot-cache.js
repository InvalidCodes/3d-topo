/**
 * KnotCache
 *
 * In-memory + IndexedDB cache for expensive knot generation (e.g., physics simulation).
 *
 * - Key includes type + quantized tightness + seed
 * - Stores points as Float32Array [x0,y0,z0, x1,y1,z1, ...]
 */

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function quantize(value, step) {
  const s = Math.max(1e-9, Number(step) || 0.05);
  const x = Number(value);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x / s) * s;
}

function idbAvailable() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb({ dbName, storeName } = {}) {
  return new Promise((resolve, reject) => {
    if (!idbAvailable()) return resolve(null);

    const req = indexedDB.open(dbName, 1);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function idbGet(db, storeName, key) {
  return new Promise((resolve, reject) => {
    if (!db) return resolve(null);
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onerror = () => reject(req.error || new Error('IndexedDB get failed'));
    req.onsuccess = () => resolve(req.result || null);
  });
}

function idbPut(db, storeName, record) {
  return new Promise((resolve, reject) => {
    if (!db) return resolve(false);
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(record);
    req.onerror = () => reject(req.error || new Error('IndexedDB put failed'));
    req.onsuccess = () => resolve(true);
  });
}

export class KnotCache {
  constructor(options = {}) {
    this.dbName = options.dbName || 'knot_cache_db';
    this.storeName = options.storeName || 'knots';
    this.tightnessStep = Number(options.tightnessStep ?? 0.05);
    this.maxEntries = Math.max(50, Math.floor(options.maxEntries ?? 500));

    this.cache = new Map(); // key -> Float32Array
    this._dbPromise = null;
  }

  getQuantizedTightness(tightness) {
    return clamp(quantize(clamp(Number(tightness ?? 0.6), 0, 1), this.tightnessStep), 0, 1);
  }

  getCacheKey(type, tightness, seed) {
    const t = this.getQuantizedTightness(tightness);
    return `${String(type || 'unknown')}_${t.toFixed(2)}_${String(seed ?? 'seed')}`;
  }

  async _db() {
    if (this._dbPromise) return this._dbPromise;
    this._dbPromise = openDb({ dbName: this.dbName, storeName: this.storeName }).catch(() => null);
    return this._dbPromise;
  }

  static packPoints(points) {
    const pts = Array.isArray(points) ? points : [];
    const out = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      out[i * 3 + 0] = Number(p?.x ?? 0);
      out[i * 3 + 1] = Number(p?.y ?? 0);
      out[i * 3 + 2] = Number(p?.z ?? 0);
    }
    return out;
  }

  static unpackPoints(packed) {
    const arr = packed instanceof Float32Array ? packed : new Float32Array(packed || []);
    const out = [];
    for (let i = 0; i + 2 < arr.length; i += 3) {
      out.push({ x: arr[i], y: arr[i + 1], z: arr[i + 2] });
    }
    return out;
  }

  _evictIfNeeded() {
    if (this.cache.size <= this.maxEntries) return;
    // Evict oldest insertion order.
    const over = this.cache.size - this.maxEntries;
    for (let i = 0; i < over; i++) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey === undefined) break;
      this.cache.delete(firstKey);
    }
  }

  async saveToIndexedDB(key, packedPoints) {
    const db = await this._db();
    if (!db) return false;
    const record = {
      key,
      points: packedPoints, // Float32Array is structured-cloneable
      createdAt: Date.now(),
    };
    return await idbPut(db, this.storeName, record);
  }

  async loadFromIndexedDB(key) {
    const db = await this._db();
    if (!db) return null;
    const rec = await idbGet(db, this.storeName, key);
    if (!rec || !rec.points) return null;
    const pts = rec.points instanceof Float32Array ? rec.points : new Float32Array(rec.points);
    return pts;
  }

  /**
   * Get cached points for (type, tightness, seed).
   *
   * @param {string} type
   * @param {number} tightness
   * @param {string|number} seed
   * @param {(type:string, tightness:number, seed:string|number)=>Promise<Array<{x:number,y:number,z:number}>|ArrayLike<{x:number,y:number,z:number}>|Float32Array>} generator
   * @returns {Promise<Float32Array>} packed points
   */
  async get(type, tightness, seed, generator) {
    const qt = this.getQuantizedTightness(tightness);
    const key = this.getCacheKey(type, qt, seed);

    if (this.cache.has(key)) return this.cache.get(key);

    const fromDb = await this.loadFromIndexedDB(key);
    if (fromDb) {
      this.cache.set(key, fromDb);
      this._evictIfNeeded();
      return fromDb;
    }

    if (typeof generator !== 'function') {
      throw new Error('KnotCache.get: generator(type,tightness,seed) function required for cache miss.');
    }

    const generated = await generator(type, qt, seed);
    const packed = (generated instanceof Float32Array) ? generated : KnotCache.packPoints(generated);

    this.cache.set(key, packed);
    this._evictIfNeeded();
    await this.saveToIndexedDB(key, packed);
    return packed;
  }
}

export default { KnotCache };

