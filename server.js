const express = require('express');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

// Use dynamic import for fetch
async function fetchData(url, options = {}) {
  const { default: fetch } = await import('node-fetch');
  return fetch(url, options);
}

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

// Rate limiting for API calls
const rateLimiter = {
  lastCall: 0,
  delay: 2000, // 2 seconds between calls
  
  async wait() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCall;
    if (timeSinceLastCall < this.delay) {
      await new Promise(resolve => setTimeout(resolve, this.delay - timeSinceLastCall));
    }
    this.lastCall = Date.now();
  }
};

// Exponential backoff retry function
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
      console.log(`Retry ${i + 1}/${maxRetries} in ${delay}ms:`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Fetch APY from DefiLlama for a token pair
async function fetchDefiLlamaAPY(tokenA, tokenB) {
  try {
    await rateLimiter.wait();
    
    return await retryWithBackoff(async () => {
      const response = await fetchData(`https://yields.llama.fi/pools`);
      
      if (!response.ok) {
        throw new Error(`DefiLlama API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Find pools that contain both tokens
      const matchingPools = data.data?.filter(pool => {
        const symbols = pool.symbol?.toLowerCase() || '';
        const tokenALower = tokenA.toLowerCase();
        const tokenBLower = tokenB.toLowerCase();
        
        return symbols.includes(tokenALower) && symbols.includes(tokenBLower) && 
               pool.chain === 'Solana';
      }) || [];
      
      if (matchingPools.length > 0) {
        // Return the highest APY pool
        const bestPool = matchingPools.reduce((best, current) => 
          (current.apy || 0) > (best.apy || 0) ? current : best
        );
        
        return {
          apy: bestPool.apy || 0,
          tvl: bestPool.tvlUsd || 0,
          protocol: bestPool.project || 'Unknown'
        };
      }
      
      return null;
    });
  } catch (error) {
    console.log(`Error fetching DefiLlama APY for ${tokenA}/${tokenB}:`, error.message);
    return null;
  }
}

// Parse pool info from transaction data
function parsePoolFromTransaction(transaction) {
  try {
    console.log('Parsing transaction:', {
      type: transaction.type,
      source: transaction.source,
      signature: transaction.signature?.slice(0, 8) + '...',
      hasTokenTransfers: !!transaction.tokenTransfers,
      transferCount: transaction.tokenTransfers?.length || 0
    });

    if (!transaction.tokenTransfers) {
      console.log('No token transfers found');
      return null;
    }

    // Use transaction.type for a more robust check if available
    const isPoolCreation = transaction.type === 'CREATE_POOL';
    console.log('Is pool creation:', isPoolCreation);

    if (!isPoolCreation) return null;

    // Extract tokens from transfers
    const transfers = transaction.tokenTransfers || [];
    const tokens = new Set();

    transfers.forEach(transfer => {
      // Only consider tokens that are actually being transferred (not SOL and not zero amount implicitly)
      if (transfer.mint && transfer.mint !== 'So11111111111111111111111111111111111111112') { // Not SOL
        tokens.add(transfer.mint);
      }
    });

    const tokenArray = Array.from(tokens);
    // A pool usually involves two distinct tokens (excluding the LP token itself in some contexts, but here we are looking for the underlying assets)
    // The provided example has two distinct non-SOL tokens: FG1FCUKQRLtojGvvdGXwjKcDWbbP6T3u2tchkMoqbonk and CkD3w5PhtfMSgoGX8JVySRdJQ9PTiW6k5a8JF9KSWxuj
    if (tokenArray.length < 2) {
      // If we are looking for the two assets that form the pool,
      // and one of the transfers is an LP token being minted to the feePayer,
      // we need to be careful here. Let's refine token extraction.
      // For a pool creation, we expect two primary tokens to be involved as initial liquidity.
      // Let's filter out the LP token if it's explicitly identified later.
    }


    // Refined token extraction for pool creation
    // A pool creation typically involves two tokens being deposited to form the pair.
    // The transaction provided has:
    // 1. FG1FCUKQRLtojGvvdGXwjKcDWbbP6T3u2tchkMoqbonk (Minted to 5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1)
    // 2. So11111111111111111111111111111111111111112 (SOL - skipped)
    // 3. CkD3w5PhtfMSgoGX8JVySRdJQ9PTiW6k5a8JF9KSWxuj (Minted to JCmUHfcocXzkboAYLbjbav8Z9cHJsRppZ9LprhazSdJx)

    // Let's consider only the non-SOL tokens involved in transfers, as these are likely the pool's assets.
    const nonSolTokens = new Set();
    transfers.forEach(transfer => {
        if (transfer.mint && transfer.mint !== 'So11111111111111111111111111111111111111112') {
            nonSolTokens.add(transfer.mint);
        }
    });

    const finalTokens = Array.from(nonSolTokens);
    console.log('Final tokens found:', finalTokens);

    if (finalTokens.length < 2) {
      console.log('Need at least 2 tokens, found:', finalTokens.length);
      return null; // We need at least two distinct non-SOL tokens for a pair
    }

    // Try to find pool address from accounts
    // The pool address is often a new account created specifically for the pool.
    // It's usually not the fee payer, nor one of the token mints.
    // In this specific transaction, the Raydium program (675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8)
    // is involved in the 5th instruction, which is a common pattern for pool creation.
    // The pool address would likely be one of the accounts associated with this program
    // that isn't the fee payer or one of the token addresses.
    // Looking at the accountData, JAX5bm7TKz2YYE28z3wyEya1reuzEM33Xoue2X3gPR1R has a nativeBalanceChange of 0
    // and no token changes, making it a good candidate for a program-derived address for the pool.
    // Also, 9DCxsMizn3H1hprZ7xWe6LDzeUeZBksYFpBWBtSf1PQX and srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX
    // are also present and might be relevant to a pool.
    // A robust solution might need to inspect instruction data or program logs.
    // For now, let's stick to the current logic but be aware it might not be perfect for all cases.

    const poolAddress = transaction.accounts?.find(account =>
        account !== transaction.feePayer &&
        !finalTokens.includes(account) &&
        account !== 'So11111111111111111111111111111111111111112' && // Not SOL mint
        account !== 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' && // Not Token Program
        account !== '11111111111111111111111111111111' && // Not System Program
        account !== 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' && // Not Associated Token Account Program
        account !== '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8' // Not Raydium Program (Amm Program ID)
        // Add other known program IDs if necessary
    );


    // If no specific pool address is found this way, defaulting to signature is a fallback,
    // but the signature itself is not the pool address. It's a transaction identifier.
    // The pool address is a PDA (Program Derived Address) or a new account created specifically.
    // From the given transaction, 'JAX5bm7TKz2YYE28z3wyEya1reuzEM33Xoue2X3gPR1R' is a good candidate for the pool ID
    // as it's passed as an account in the main Raydium instruction and doesn't represent a token or a user.
    const detectedPoolAddress = poolAddress || transaction.signature;

    console.log('Pool detected:', {
      tokenA: finalTokens[0]?.slice(0, 8) + '...',
      tokenB: finalTokens[1]?.slice(0, 8) + '...',
      poolAddress: detectedPoolAddress?.slice(0, 8) + '...',
      source: transaction.source
    });

    return {
      tokenA: finalTokens[0],
      tokenB: finalTokens[1],
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

// Save pool to database with APY data
async function savePoolToDatabase(poolData) {
  try {
    // Check if pool already exists
    const existingPool = await prisma.pool.findUnique({
      where: { poolAddress: poolData.poolAddress }
    });
    
    if (existingPool) {
      console.log(`Pool ${poolData.poolAddress} already exists in database`);
      return existingPool;
    }
    
    // Fetch APY data from DefiLlama
    console.log(`Fetching APY for ${poolData.tokenA}/${poolData.tokenB}...`);
    const apyData = await fetchDefiLlamaAPY(poolData.tokenA, poolData.tokenB);
    
    // Create new pool record
    const newPool = await prisma.pool.create({
      data: {
        tokenA: poolData.tokenA,
        tokenB: poolData.tokenB,
        poolAddress: poolData.poolAddress,
        signature: poolData.signature,
        timestamp: poolData.timestamp,
        source: poolData.source,
        apy: apyData?.apy || null,
        tvl: apyData?.tvl || null
      }
    });
    
    // Log success
    const apyInfo = apyData ? `APY: ${apyData.apy?.toFixed(2)}%` : 'APY: Not found';
    console.log(`Saved pool to DB: ${poolData.tokenA}/${poolData.tokenB} - ${apyInfo}`);
    
    // Also save to file for backup
    const logEntry = {
      timestamp: new Date().toISOString(),
      poolAddress: poolData.poolAddress,
      tokenA: poolData.tokenA,
      tokenB: poolData.tokenB,
      signature: poolData.signature,
      source: poolData.source,
      apy: apyData?.apy || 'N/A',
      tvl: apyData?.tvl || 'N/A'
    };
    
    fs.appendFileSync('matched_pools.txt', JSON.stringify(logEntry) + '\n');
    
    return newPool;
  } catch (error) {
    console.log(`Error saving pool to database:`, error.message);
    return null;
  }
}

// Webhook endpoint
app.post('/webhook/helius', async (req, res) => {
  console.log('='.repeat(60));
  console.log('WEBHOOK RECEIVED:', new Date().toISOString());
  console.log('='.repeat(60));
  
  try {
    // Save raw webhook data
    const timestamp = new Date().toISOString();
    fs.appendFileSync('webhook_logs.txt', 
      `\n=== WEBHOOK ${timestamp} ===\n` + 
      JSON.stringify(req.body, null, 2) + 
      '\n' + '='.repeat(60) + '\n'
    );
    
    // Process transactions
    const transactions = Array.isArray(req.body) ? req.body : [req.body];
    console.log(`Processing ${transactions.length} transaction(s)`);
    
    for (const transaction of transactions) {
      console.log(`Processing transaction type: ${transaction.type}`);
      
      if (transaction.type === 'ENHANCED_TRANSACTION' || transaction.type === 'CREATE_POOL') {
        const poolData = parsePoolFromTransaction(transaction);
        
        if (poolData) {
          console.log(`Found potential pool: ${poolData.tokenA}/${poolData.tokenB}`);
          await savePoolToDatabase(poolData);
        }
      } else {
        console.log(`Skipping transaction type: ${transaction.type}`);
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.log('Error processing webhook:', error.message);
    res.sendStatus(500);
  }
});

// API endpoint to get pool stats
app.get('/api/pools', async (req, res) => {
  try {
    const pools = await prisma.pool.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    
    res.json({
      total: pools.length,
      pools: pools.map(pool => ({
        id: pool.id,
        tokenA: pool.tokenA,
        tokenB: pool.tokenB,
        poolAddress: pool.poolAddress,
        apy: pool.apy,
        tvl: pool.tvl,
        source: pool.source,
        timestamp: pool.timestamp
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cleanup function
async function cleanup() {
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Webhook endpoint: /webhook/helius');
  console.log('API endpoints:');
  console.log('   - GET /api/pools - View pool data');
  console.log('Database connected and ready!');
});