import express from 'express';
import { RateLimiter } from './src/utils/rateLimiter.js';
import { DefiLlamaClient } from './src/utils/defiLlamaClient.js';
import { DatabaseClient } from './src/utils/databaseClient.js';
import { JupiterClient } from './src/utils/jupiterClient.js';
import { WebhookHandler } from './src/utils/webhookHandler.js';

const app = express();
app.use(express.json());

// Initialize modular clients
const rateLimiter = new RateLimiter(2000); // 2 second delay
const defiLlamaClient = new DefiLlamaClient();
const databaseClient = new DatabaseClient();
const jupiterClient = new JupiterClient();
const webhookHandler = new WebhookHandler(databaseClient, defiLlamaClient, jupiterClient, rateLimiter);

// Webhook endpoint
app.post('/webhook/helius', async (req, res) => {
  console.log('='.repeat(60));
  console.log('WEBHOOK RECEIVED:', new Date().toISOString());
  console.log('='.repeat(60));
  
  try {
    // Process transactions using modular handler
    const transactions = req.body || [];
    await webhookHandler.processWebhookPayload(transactions);
    
    res.sendStatus(200);
  } catch (error) {
    console.log('Error processing webhook:', error.message);
    res.sendStatus(500);
  }
});

// API endpoint to get pool stats
app.get('/api/pools', async (req, res) => {
  try {
    const pools = await databaseClient.getAllPools(50);
    
    res.json({
      total: pools.length,
      pools: pools.map(pool => ({
        id: pool.id,
        mintAddress: pool.mintAddress,
        symbol: pool.symbol,
        name: pool.name,
        apy: pool.apy,
        tvl: pool.tvl,
        price: pool.price,
        apySource: pool.apySource,
        apyProject: pool.apyProject,
        timestamp: pool.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to get pools with APY data
app.get('/api/pools/apy', async (req, res) => {
  try {
    const pools = await databaseClient.getPoolsWithApy(25);
    
    res.json({
      total: pools.length,
      pools: pools.map(pool => ({
        id: pool.id,
        symbol: pool.symbol,
        name: pool.name,
        apy: pool.apy,
        tvl: pool.tvl,
        apyProject: pool.apyProject,
        apyUrl: pool.apyUrl,
        timestamp: pool.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    modules: ['DefiLlama', 'Jupiter', 'Database', 'RateLimiter', 'WebhookHandler']
  });
});

// Cleanup function
async function cleanup() {
  console.log('Shutting down gracefully...');
  await databaseClient.disconnect();
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Startup function
async function startServer() {
  try {
    // Connect to database
    await databaseClient.connect();
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log('🚀 Solana Pool Monitor Bot Started');
      console.log('=' .repeat(50));
      console.log(`📡 Server listening on http://localhost:${PORT}`);
      console.log(`📥 Webhook endpoint: POST /webhook/helius`);
      console.log('📊 API endpoints:');
      console.log('   - GET /api/pools - View all pool data');
      console.log('   - GET /api/pools/apy - View pools with APY data');
      console.log('   - GET /health - Health check');
      console.log('💾 Database connected and ready!');
      console.log('⚡ Rate limiting enabled (2s between API calls)');
      console.log('🔄 APY fetching via DefiLlama integrated');
      console.log('🧩 Modular ES architecture implemented');
      console.log('=' .repeat(50));
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
