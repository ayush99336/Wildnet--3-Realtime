/**
 * DefiLlama API client for fetching APY data
 */
import { RetryHelper } from './retryHelper.js';

export class DefiLlamaClient {
  constructor() {
    this.baseUrl = 'https://yields.llama.fi';
  }

  /**
   * Fetches all pools from DefiLlama API
   * @returns {Promise<Array>} Array of pool data
   */
  async getAllPools() {
    return RetryHelper.withBackoff(async () => {
      const url = `${this.baseUrl}/pools`;
      console.log(`Fetching pools from DefiLlama: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`DefiLlama API error: ${response.status}`);
      }
      
      const data = await response.json();
      return data.data || [];
    });
  }

  /**
   * Searches for pools matching the given criteria
   * @param {string} mintAddress - The token mint address to search for
   * @param {string} chain - The blockchain (default: 'Solana')
   * @returns {Promise<Array>} Array of matching pools
   */
  async searchPools(mintAddress, chain = 'Solana') {
    const pools = await this.getAllPools();
    
    return pools.filter(pool => {
      // Check if the pool is on the specified chain
      if (pool.chain !== chain) return false;
      
      // Check if the mint address appears in the pool data
      const poolKey = pool.pool?.toLowerCase() || '';
      const symbol = pool.symbol?.toLowerCase() || '';
      const project = pool.project?.toLowerCase() || '';
      const mintLower = mintAddress.toLowerCase();
      
      return poolKey.includes(mintLower) || 
             symbol.includes(mintLower) || 
             project.includes(mintLower);
    });
  }

  /**
   * Fetches APY data for a specific pool
   * @param {string} poolId - The pool ID from DefiLlama
   * @returns {Promise<Object>} Pool data with APY information
   */
  async getPoolData(poolId) {
    return RetryHelper.withBackoff(async () => {
      const url = `${this.baseUrl}/chart/${poolId}`;
      console.log(`Fetching pool data from DefiLlama: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`DefiLlama API error for pool ${poolId}: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    });
  }

  /**
   * Gets the best APY data for a mint address
   * @param {string} mintAddress - The token mint address
   * @param {string} chain - The blockchain (default: 'Solana')
   * @returns {Promise<Object|null>} Best APY data or null if not found
   */
  async getBestApyForMint(mintAddress, chain = 'Solana') {
    try {
      console.log(`Searching for APY data for mint: ${mintAddress}`);
      
      const matchingPools = await this.searchPools(mintAddress, chain);
      
      if (matchingPools.length === 0) {
        console.log(`No pools found for mint address: ${mintAddress}`);
        return null;
      }
      
      console.log(`Found ${matchingPools.length} matching pools for ${mintAddress}`);
      
      // Sort by APY and get the highest
      const bestPool = matchingPools.reduce((best, current) => {
        const currentApy = current.apy || 0;
        const bestApy = best?.apy || 0;
        return currentApy > bestApy ? current : best;
      }, null);
      
      if (bestPool) {
        console.log(`Best APY found: ${bestPool.apy}% for ${bestPool.symbol} on ${bestPool.project}`);
        return {
          apy: bestPool.apy,
          symbol: bestPool.symbol,
          project: bestPool.project,
          chain: bestPool.chain,
          poolId: bestPool.pool,
          tvl: bestPool.tvlUsd,
          url: `https://defillama.com/yields/pool/${bestPool.pool}`
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Error fetching APY for mint ${mintAddress}:`, error);
      throw error;
    }
  }
}
