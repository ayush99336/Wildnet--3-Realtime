/**
 * Rate limiter utility for API calls
 */
export class RateLimiter {
  constructor(delayMs = 2000) {
    this.lastCall = 0;
    this.delay = delayMs;
  }

  async wait() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCall;
    
    if (timeSinceLastCall < this.delay) {
      const waitTime = this.delay - timeSinceLastCall;
      console.log(`Rate limiting: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastCall = Date.now();
  }
}
