/**
 * Webhook handler for processing Solana transaction data
 */
export class WebhookHandler {
  constructor(databaseClient, defiLlamaClient, jupiterClient, rateLimiter) {
    this.databaseClient = databaseClient;
    this.defiLlamaClient = defiLlamaClient;
    this.jupiterClient = jupiterClient;
    this.rateLimiter = rateLimiter;
  }

  /**
   * Parse pool info from transaction data
   * @param {Object} transaction - Transaction data from webhook
   * @returns {Object|null} Parsed pool data or null
   */
  parsePoolFromTransaction(transaction) {
    try {
      console.log('Parsing transaction:', {
        type: transaction.type,
        source: transaction.source,
        signature: transaction.signature?.slice(0, 8) + '...',
        hasTokenTransfers: !!transaction.tokenTransfers,
        transferCount: transaction.tokenTransfers?.length || 0
      });

      if (!transaction.tokenTransfers || transaction.tokenTransfers.length < 2) {
        console.log('Insufficient token transfers for pool detection');
        return null;
      }

      // Extract unique token mints from transfers
      const tokenMints = [...new Set(
        transaction.tokenTransfers.map(transfer => transfer.mint)
          .filter(mint => mint && mint !== 'So11111111111111111111111111111111111111112') // Filter out SOL
      )];

      if (tokenMints.length < 2) {
        console.log('Less than 2 unique token mints found');
        return null;
      }

      // Find potential pool address from accounts
      const poolAddress = transaction.accountData?.find(account => 
        account.account && 
        account.account !== transaction.feePayer &&
        !tokenMints.includes(account.account) &&
        account.account !== 'So11111111111111111111111111111111111111112' && // Not SOL mint
        account.account !== 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' && // Not Token Program
        account.account !== '11111111111111111111111111111111' && // Not System Program
        account.account !== 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' && // Not Associated Token Account Program
        account.account !== '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8' // Not Raydium Program
      )?.account;

      const detectedPoolAddress = poolAddress || transaction.signature;

      console.log('Pool detected:', {
        tokenA: tokenMints[0]?.slice(0, 8) + '...',
        tokenB: tokenMints[1]?.slice(0, 8) + '...',
        poolAddress: detectedPoolAddress?.slice(0, 8) + '...',
        source: transaction.source
      });

      return {
        tokenA: tokenMints[0],
        tokenB: tokenMints[1],
        poolAddress: detectedPoolAddress,
        signature: transaction.signature,
        timestamp: new Date(transaction.timestamp * 1000),
        source: transaction.source || 'unknown'
      };
    } catch (error) {
      console.log('Error parsing pool from transaction:', error.message);
      return null;
    }
  }

  /**
   * Save pool to database with APY data
   * @param {Object} poolData - Pool data to save
   * @returns {Promise<Object|null>} Saved pool or null
   */
  async savePoolToDatabase(poolData) {
    try {
      // Check if pool already exists
      const exists = await this.databaseClient.poolExists(poolData.poolAddress);
      
      if (exists) {
        console.log(`Pool ${poolData.poolAddress} already exists in database`);
        return null;
      }
      
      // Fetch APY data from DefiLlama
      console.log(`Fetching APY for ${poolData.tokenA}/${poolData.tokenB}...`);
      await this.rateLimiter.wait();
      
      // Try to get APY data for both tokens
      let apyData = await this.defiLlamaClient.getBestApyForMint(poolData.tokenA);
      if (!apyData) {
        apyData = await this.defiLlamaClient.getBestApyForMint(poolData.tokenB);
      }
      
      // Get additional token info from Jupiter
      const tokenAInfo = await this.jupiterClient.getFullTokenData(poolData.tokenA);
      const tokenBInfo = await this.jupiterClient.getFullTokenData(poolData.tokenB);
      
      // Prepare pool data for storage
      const poolToStore = {
        tokenA: poolData.tokenA,
        tokenB: poolData.tokenB,
        poolAddress: poolData.poolAddress,
        signature: poolData.signature,
        source: poolData.source,
        apy: apyData?.apy || null,
        tvl: apyData?.tvl || null
      };
      
      // Store in database
      const newPool = await this.databaseClient.storePool(poolToStore);
      
      // Store event data
      await this.databaseClient.storeEvent({
        poolId: newPool.id,
        signature: poolData.signature,
        eventType: 'created',
        rawData: JSON.stringify({
          tokenA: poolData.tokenA,
          tokenB: poolData.tokenB,
          source: poolData.source,
          tokenAInfo,
          tokenBInfo
        })
      });
      
      // Log success
      const apyInfo = apyData ? `APY: ${apyData.apy?.toFixed(2)}%` : 'APY: Not found';
      const tokenASymbol = tokenAInfo?.symbol || 'Unknown';
      const tokenBSymbol = tokenBInfo?.symbol || 'Unknown';
      console.log(`✅ Saved pool to DB: ${tokenASymbol}/${tokenBSymbol} - ${apyInfo}`);
      
      return newPool;
    } catch (error) {
      console.log(`❌ Error saving pool to database:`, error.message);
      return null;
    }
  }

  /**
   * Process webhook payload
   * @param {Array} transactions - Array of transactions from webhook
   * @returns {Promise<void>}
   */
  async processWebhookPayload(transactions) {
    console.log(`Processing ${transactions.length} transaction(s)`);
    
    for (const transaction of transactions) {
      console.log(`Processing transaction type: ${transaction.type}`);
      
      if (transaction.type === 'ENHANCED_TRANSACTION' || transaction.type === 'CREATE_POOL') {
        const poolData = this.parsePoolFromTransaction(transaction);
        
        if (poolData) {
          console.log(`Found potential pool: ${poolData.tokenA}/${poolData.tokenB}`);
          await this.savePoolToDatabase(poolData);
        }
      } else {
        console.log(`Skipping transaction type: ${transaction.type}`);
      }
    }
  }
}
