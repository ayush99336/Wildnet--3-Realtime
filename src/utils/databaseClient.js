/**
 * Database utility for pool and event operations
 */
import { PrismaClient } from '@prisma/client';

export class DatabaseClient {
  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Connect to the database
   */
  async connect() {
    try {
      await this.prisma.$connect();
      console.log('Connected to database');
    } catch (error) {
      console.error('Failed to connect to database:', error);
      throw error;
    }
  }

  /**
   * Disconnect from the database
   */
  async disconnect() {
    await this.prisma.$disconnect();
  }

  /**
   * Check if a pool already exists
   * @param {string} poolAddress - The pool address to check
   * @returns {Promise<boolean>} True if pool exists
   */
  async poolExists(poolAddress) {
    const existingPool = await this.prisma.pool.findUnique({
      where: { poolAddress }
    });
    return !!existingPool;
  }

  /**
   * Store pool data in the database
   * @param {Object} poolData - Pool information to store
   * @returns {Promise<Object>} Created pool record
   */
  async storePool(poolData) {
    try {
      const pool = await this.prisma.pool.create({
        data: {
          tokenA: poolData.tokenA,
          tokenB: poolData.tokenB,
          poolAddress: poolData.poolAddress,
          source: poolData.source || 'Unknown',
          signature: poolData.signature,
          apy: poolData.apy || null,
          tvl: poolData.tvl || null,
          volume24h: poolData.volume24h || null
        }
      });

      console.log(`Pool stored in database: ${pool.poolAddress} (${pool.tokenA}/${pool.tokenB})`);
      return pool;
    } catch (error) {
      console.error('Error storing pool:', error);
      throw error;
    }
  }

  /**
   * Store event data in the database
   * @param {Object} eventData - Event information to store
   * @returns {Promise<Object>} Created event record
   */
  async storeEvent(eventData) {
    try {
      const event = await this.prisma.poolEvent.create({
        data: {
          poolId: eventData.poolId,
          eventType: eventData.eventType || 'created',
          amount: eventData.amount || null,
          signature: eventData.signature,
          rawData: eventData.rawData || null
        }
      });

      console.log(`Event stored in database: ${event.eventType} for pool ${event.poolId}`);
      return event;
    } catch (error) {
      console.error('Error storing event:', error);
      throw error;
    }
  }

  /**
   * Get all pools from the database
   * @param {number} limit - Maximum number of pools to return
   * @returns {Promise<Array>} Array of pool records
   */
  async getAllPools(limit = 100) {
    return this.prisma.pool.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Get pools with APY data
   * @param {number} limit - Maximum number of pools to return
   * @returns {Promise<Array>} Array of pools with APY data
   */
  async getPoolsWithApy(limit = 50) {
    return this.prisma.pool.findMany({
      where: {
        apy: { not: null }
      },
      take: limit,
      orderBy: { apy: 'desc' }
    });
  }

  /**
   * Update pool APY data
   * @param {string} poolAddress - The pool address to update
   * @param {Object} apyData - APY information to update
   * @returns {Promise<Object>} Updated pool record
   */
  async updatePoolApy(poolAddress, apyData) {
    try {
      const pool = await this.prisma.pool.update({
        where: { poolAddress },
        data: {
          apy: apyData.apy,
          tvl: apyData.tvl
        }
      });

      console.log(`Pool APY updated: ${pool.poolAddress} - ${pool.apy}%`);
      return pool;
    } catch (error) {
      console.error('Error updating pool APY:', error);
      throw error;
    }
  }
}
