# Wildnet Solana Pool Monitor Bot

A real-time Solana pool monitoring bot that detects new liquidity pools, fetches APY data from DefiLlama, and stores everything in a PostgreSQL database with a clean, modular ES6 architecture.

## Features

- **Real-time Pool Detection**: Monitors Solana blockchain via webhooks for new pool creation
- **APY Integration**: Fetches yield data from DefiLlama API with intelligent retry logic
- **Token Data**: Gets comprehensive token information from Jupiter API
- **Database Storage**: Persistent storage with Prisma ORM and PostgreSQL
- **Rate Limiting**: Built-in API rate limiting to prevent throttling
- **Modular Architecture**: Clean separation of concerns with ES6 modules
- **Error Handling**: Robust error handling with exponential backoff
- **RESTful API**: Clean API endpoints for accessing pool data

## Architecture

### Modular Structure
```
src/
├── utils/
│   ├── rateLimiter.js        # Rate limiting utility
│   ├── retryHelper.js        # Exponential backoff retry logic
│   ├── defiLlamaClient.js    # DefiLlama API client
│   ├── jupiterClient.js      # Jupiter API client
│   ├── databaseClient.js     # Database operations
│   └── webhookHandler.js     # Webhook processing logic
├── server.js                 # Main application server
└── test.js                   # Standalone APY testing script
```

![alt text](image.png)


### Key Components

#### RateLimiter
- Prevents API throttling with configurable delays
- Used across all external API calls

#### DefiLlamaClient
- Fetches APY data from DefiLlama yields API
- Searches by token mint addresses
- Returns best available APY with metadata

#### JupiterClient
- Gets token information and pricing data
- Validates token authenticity
- Provides comprehensive token metadata

#### DatabaseClient
- Handles all database operations
- Pool existence checking
- Event logging and storage

#### WebhookHandler
- Processes Solana transaction webhooks
- Parses pool creation events
- Orchestrates data fetching and storage

## Installation

### Prerequisites
- Node.js 18+ with ES module support
- Docker & Docker Compose
- PostgreSQL database

### Setup

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd Wildnet-3-Realtime
npm install
```

2. **Start the database:**
```bash
docker-compose up -d
```

3. **Setup database schema:**
```bash
npm run db:push
```

4. **Start the bot:**
```bash
npm start
# or for development
npm run dev
```

## API Endpoints

### Pool Data
- `GET /api/pools` - Get all detected pools (last 50)
- `GET /api/pools/apy` - Get pools with APY data (top 25)
- `GET /health` - Health check and module status

### Response Format
```json
{
  "total": 10,
  "pools": [
    {
      "id": 1,
      "tokenA": "ABC...123",
      "tokenB": "DEF...456", 
      "poolAddress": "GHI...789",
      "source": "RAYDIUM",
      "apy": 15.5,
      "tvl": 1000000,
      "signature": "JKL...012",
      "timestamp": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

## Testing

### Standalone APY Testing
Test the DefiLlama integration independently:
```bash
npm run test
```

### Manual Testing
```bash
# Test health endpoint
curl http://localhost:3000/health

# Test pool data
curl http://localhost:3000/api/pools

# Test APY data
curl http://localhost:3000/api/pools/apy
```

## Configuration

### Environment Variables
```bash
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/wildnet"

# Server
PORT=3000

# Rate Limiting
RATE_LIMIT_DELAY=2000  # 2 seconds
```

### Webhook Configuration
Configure your Solana webhook provider to send to:
```
POST http://your-domain.com/webhook/helius
```

## Database Schema

### Pools Table
- `id` - Primary key
- `tokenA` - First token mint address
- `tokenB` - Second token mint address
- `poolAddress` - Pool address (unique)
- `source` - Pool source (Raydium, Orca, etc.)
- `signature` - Transaction signature (unique)
- `apy` - Annual percentage yield
- `tvl` - Total value locked
- `volume24h` - 24h trading volume
- `createdAt` - Pool creation timestamp
- `updatedAt` - Last update timestamp

### Events Table
- `id` - Primary key
- `poolId` - Foreign key to pools table
- `eventType` - Event type (created, swap, etc.)
- `amount` - Transaction amount
- `signature` - Transaction signature (unique)
- `timestamp` - Event timestamp
- `rawData` - Additional event data (JSON string)

## Monitoring

### Logs
The bot provides comprehensive logging:
- Successful operations
- Error conditions
- API call statistics
- Rate limiting status

### Health Checks
Monitor bot health via the `/health` endpoint:
```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "modules": ["DefiLlama", "Jupiter", "Database", "RateLimiter", "WebhookHandler"]
}
```

## Error Handling

- **Exponential Backoff**: Automatic retry with increasing delays
- **Rate Limiting**: Prevents API throttling
- **Database Resilience**: Connection pooling and error recovery
- **Graceful Shutdown**: Clean resource cleanup on exit

## Performance

- **Rate Limited**: 2-second delays between API calls
- **Duplicate Prevention**: Checks for existing pools before storage
- **Efficient Queries**: Optimized database operations
- **Memory Management**: Proper resource cleanup

## Development

### Adding New Features
1. Create utility modules in `src/utils/`
2. Export classes/functions using ES6 syntax
3. Import and integrate in `server.js`
4. Update tests and documentation

### Code Style
- ES6 modules with `import/export`
- Class-based utilities for stateful components
- Async/await for asynchronous operations
- Comprehensive error handling
- Clear separation of concerns

## Recent Updates

- Full ES6 module conversion
- Modular architecture implementation
- Improved rate limiting
- Enhanced API endpoints
- Better error handling
- Performance optimizations

## Contributing

1. Follow the modular architecture patterns
2. Use ES6 modules for all new code
3. Add comprehensive error handling
4. Include logging for debugging
5. Update tests and documentation

## License

This project is licensed under the MIT License.
