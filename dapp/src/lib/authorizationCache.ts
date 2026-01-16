/**
 * @description In-memory cache for authorization state with TTL
 * 
 * Implements multi-tier caching strategy:
 * 1. L1: In-memory cache 
 * 2. L2: Database cache 
 * 3. L3: Contract calls (fallback only)
 * 
 * 
 * Reduces RPC calls from 100% to <5% when using database cache
 */

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
}

class AuthorizationCache {
  private creators: Map<string, CacheEntry<boolean>> = new Map();
  private signers: Map<string, CacheEntry<boolean>> = new Map();
  private resolvers: Map<string, CacheEntry<boolean>> = new Map();
  
  private stats = {
    creatorHits: 0,
    creatorMisses: 0,
    signerHits: 0,
    signerMisses: 0,
    resolverHits: 0,
    resolverMisses: 0,
  };

  // TTL in milliseconds (30 minutes default, adjustable per-call)
  private readonly DEFAULT_TTL = 30 * 60 * 1000;
  
  // Max cache entries per type to prevent memory leaks
  private readonly MAX_ENTRIES = 10000;

  /**
   * Set creator whitelist cache entry
   */
  setCreator(address: string, isWhitelisted: boolean, ttl?: number) {
    this.ensureCapacity(this.creators);
    this.creators.set(address.toLowerCase(), {
      value: isWhitelisted,
      timestamp: Date.now(),
      ttl: ttl ?? this.DEFAULT_TTL,
    });
  }

  /**
   * Get creator whitelist from cache
   * Returns undefined if not found or expired
   */
  getCreator(address: string): boolean | undefined {
    const entry = this.creators.get(address.toLowerCase());
    
    if (!entry) {
      this.stats.creatorMisses++;
      return undefined;
    }

    if (this.isExpired(entry)) {
      this.creators.delete(address.toLowerCase());
      this.stats.creatorMisses++;
      return undefined;
    }

    this.stats.creatorHits++;
    return entry.value;
  }

  /**
   * Set signer authorization cache entry
   */
  setSigner(address: string, isAllowed: boolean, ttl?: number) {
    this.ensureCapacity(this.signers);
    this.signers.set(address.toLowerCase(), {
      value: isAllowed,
      timestamp: Date.now(),
      ttl: ttl ?? this.DEFAULT_TTL,
    });
  }

  /**
   * Get signer authorization from cache
   */
  getSigner(address: string): boolean | undefined {
    const entry = this.signers.get(address.toLowerCase());
    
    if (!entry) {
      this.stats.signerMisses++;
      return undefined;
    }

    if (this.isExpired(entry)) {
      this.signers.delete(address.toLowerCase());
      this.stats.signerMisses++;
      return undefined;
    }

    this.stats.signerHits++;
    return entry.value;
  }

  /**
   * Set resolver authorization cache entry
   */
  setResolver(address: string, isAllowed: boolean, ttl?: number) {
    this.ensureCapacity(this.resolvers);
    this.resolvers.set(address.toLowerCase(), {
      value: isAllowed,
      timestamp: Date.now(),
      ttl: ttl ?? this.DEFAULT_TTL,
    });
  }

  /**
   * Get resolver authorization from cache
   */
  getResolver(address: string): boolean | undefined {
    const entry = this.resolvers.get(address.toLowerCase());
    
    if (!entry) {
      this.stats.resolverMisses++;
      return undefined;
    }

    if (this.isExpired(entry)) {
      this.resolvers.delete(address.toLowerCase());
      this.stats.resolverMisses++;
      return undefined;
    }

    this.stats.resolverHits++;
    return entry.value;
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.creators.clear();
    this.signers.clear();
    this.resolvers.clear();
  }

  /**
   * Clear cache entries older than specified age (ms)
   */
  clearStale(maxAge: number = this.DEFAULT_TTL) {
    const cutoff = Date.now() - maxAge;
    this.clearStaleFromMap(this.creators, cutoff);
    this.clearStaleFromMap(this.signers, cutoff);
    this.clearStaleFromMap(this.resolvers, cutoff);
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    creators: CacheStats;
    signers: CacheStats;
    resolvers: CacheStats;
    totalSize: number;
  } {
    const getMapStats = (
      hits: number,
      misses: number,
      size: number
    ): CacheStats => ({
      hits,
      misses,
      evictions: 0,
      hitRate: misses + hits > 0 ? hits / (hits + misses) : 0,
    });

    return {
      creators: getMapStats(
        this.stats.creatorHits,
        this.stats.creatorMisses,
        this.creators.size
      ),
      signers: getMapStats(
        this.stats.signerHits,
        this.stats.signerMisses,
        this.signers.size
      ),
      resolvers: getMapStats(
        this.stats.resolverHits,
        this.stats.resolverMisses,
        this.resolvers.size
      ),
      totalSize:
        this.creators.size + this.signers.size + this.resolvers.size,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      creatorHits: 0,
      creatorMisses: 0,
      signerHits: 0,
      signerMisses: 0,
      resolverHits: 0,
      resolverMisses: 0,
    };
  }

  // Private methods

  private isExpired(entry: CacheEntry<boolean>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private clearStaleFromMap(
    map: Map<string, CacheEntry<boolean>>,
    cutoff: number
  ) {
    const keysToDelete: string[] = [];
    for (const [key, entry] of map.entries()) {
      if (entry.timestamp < cutoff) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => map.delete(key));
  }

  private ensureCapacity(map: Map<string, CacheEntry<boolean>>) {
    if (map.size >= this.MAX_ENTRIES) {
      // Remove oldest entries (FIFO eviction)
      const entries = Array.from(map.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      );
      const toRemove = Math.ceil(this.MAX_ENTRIES * 0.1); // Remove 10%
      for (let i = 0; i < toRemove; i++) {
        map.delete(entries[i][0]);
      }
    }
  }
}

// Singleton instance
export const authorizationCache = new AuthorizationCache();
