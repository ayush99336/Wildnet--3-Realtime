/**
 * Quick test script to verify all modules work independently
 */
import { RateLimiter } from './src/utils/rateLimiter.js';
import { DefiLlamaClient } from './src/utils/defiLlamaClient.js';
import { JupiterClient } from './src/utils/jupiterClient.js';
import { DatabaseClient } from './src/utils/databaseClient.js';

async function testModules() {
  console.log('🧪 Testing Modular Components\n');

  // Test 1: Rate Limiter
  console.log('1. Testing RateLimiter...');
  const rateLimiter = new RateLimiter(1000); // 1 second delay
  const start = Date.now();
  await rateLimiter.wait();
  await rateLimiter.wait();
  const elapsed = Date.now() - start;
  console.log(`   ✅ Rate limiter works - elapsed: ${elapsed}ms (should be ~1000ms)\n`);

  // Test 2: DefiLlama Client
  console.log('2. Testing DefiLlamaClient...');
  try {
    const defiLlamaClient = new DefiLlamaClient();
    const pools = await defiLlamaClient.getAllPools();
    console.log(`   ✅ DefiLlama client works - fetched ${pools.length} pools\n`);
  } catch (error) {
    console.log(`   ❌ DefiLlama client error: ${error.message}\n`);
  }

  // Test 3: Jupiter Client
  console.log('3. Testing JupiterClient...');
  try {
    const jupiterClient = new JupiterClient();
    // Test with a well-known token (USDC)
    const tokenData = await jupiterClient.getFullTokenData('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    console.log(`   ✅ Jupiter client works - token: ${tokenData?.symbol || 'Unknown'}\n`);
  } catch (error) {
    console.log(`   ❌ Jupiter client error: ${error.message}\n`);
  }

  // Test 4: Database Client
  console.log('4. Testing DatabaseClient...');
  try {
    const databaseClient = new DatabaseClient();
    await databaseClient.connect();
    const pools = await databaseClient.getAllPools(5);
    console.log(`   ✅ Database client works - found ${pools.length} pools`);
    await databaseClient.disconnect();
    console.log(`   ✅ Database disconnected successfully\n`);
  } catch (error) {
    console.log(`   ❌ Database client error: ${error.message}\n`);
  }

  console.log('🎉 Module testing complete!');
}

// Run the test
testModules().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
