/**
 * Lightweight in-memory TTL cache
 * Usage:
 *   const cache = new MemCache<MyType>(30_000); // 30s TTL
 *   const val = await cache.getOrSet('key', () => expensiveFetch());
 */

interface Entry<T> {
    value: T;
    expiresAt: number;
}

export class MemCache<T = unknown> {
    private store = new Map<string, Entry<T>>();

    constructor(private defaultTtlMs: number) { }

    get(key: string): T | undefined {
        const entry = this.store.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        return entry.value;
    }

    set(key: string, value: T, ttlMs?: number): void {
        this.store.set(key, { value, expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs) });
    }

    del(key: string): void {
        this.store.delete(key);
    }

    /** Return cached value if fresh, otherwise call loader and cache the result. */
    async getOrSet(key: string, loader: () => Promise<T>, ttlMs?: number): Promise<T> {
        const cached = this.get(key);
        if (cached !== undefined) return cached;
        const value = await loader();
        this.set(key, value, ttlMs);
        return value;
    }

    clear(): void {
        this.store.clear();
    }
}
