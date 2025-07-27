/**
 * Jupiter API client for token data
 */
import { RetryHelper } from './retryHelper.js';

export class JupiterClient {
  constructor() {
    this.baseUrl = 'https://lite-api.jup.ag';
  }

  /**
   * Fetches token information from Jupiter API using search
   * @param {string} mintAddress - The token mint address
   * @returns {Promise<Object|null>} Token data or null if not found
   */
  async getTokenInfo(mintAddress) {
    return RetryHelper.withBackoff(async () => {
      const url = `${this.baseUrl}/tokens/v2/search?query=${mintAddress}`;
      console.log(`Fetching token info from Jupiter: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`Token not found on Jupiter: ${mintAddress}`);
          return null;
        }
        throw new Error(`Jupiter API error: ${response.status}`);
      }
      
      const data = await response.json();
      // The search returns an array, find the exact match
      const exactMatch = data.find(token => token.id === mintAddress);
      return exactMatch || (data.length > 0 ? data[0] : null);
    });
  }

  /**
   * Gets price data for a token (using the token info from search as it includes price)
   * @param {string} mintAddress - The token mint address
   * @returns {Promise<Object|null>} Price data or null if not found
   */
  async getTokenPrice(mintAddress) {
    // For lite API, price is included in the token search response
    const tokenInfo = await this.getTokenInfo(mintAddress);
    if (tokenInfo && tokenInfo.usdPrice) {
      return {
        price: tokenInfo.usdPrice,
        fdv: tokenInfo.fdv,
        mcap: tokenInfo.mcap,
        liquidity: tokenInfo.liquidity
      };
    }
    return null;
  }

  /**
   * Gets comprehensive token data combining info and price
   * @param {string} mintAddress - The token mint address
   * @returns {Promise<Object|null>} Combined token data
   */
  async getFullTokenData(mintAddress) {
    try {
      const tokenInfo = await this.getTokenInfo(mintAddress);
      
      if (!tokenInfo) {
        return null;
      }

      return {
        mintAddress: tokenInfo.id,
        symbol: tokenInfo.symbol || 'Unknown',
        name: tokenInfo.name || 'Unknown Token',
        decimals: tokenInfo.decimals || 9,
        price: tokenInfo.usdPrice || 0,
        logoURI: tokenInfo.icon || null,
        tags: tokenInfo.tags || [],
        verified: tokenInfo.isVerified || false,
        marketCap: tokenInfo.mcap || 0,
        fdv: tokenInfo.fdv || 0,
        liquidity: tokenInfo.liquidity || 0,
        holderCount: tokenInfo.holderCount || 0,
        totalSupply: tokenInfo.totalSupply || 0,
        circSupply: tokenInfo.circSupply || 0,
        website: tokenInfo.website || null,
        twitter: tokenInfo.twitter || null,
        telegram: tokenInfo.telegram || null
      };
    } catch (error) {
      console.error(`Error fetching token data for ${mintAddress}:`, error);
      return null;
    }
  }
}
