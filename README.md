# IoT Sensor Analytics with TimescaleDB

Real-time IoT sensor analytics platform with **60% query performance improvement** and **80% storage reduction** using TimescaleDB hypertables, compression, and continuous aggregates.

## Features

- 🚀 **Real-time sensor data ingestion** via REST API + WebSocket (Socket.io)
- 🗄️ **TimescaleDB hypertables** with automatic partitioning by time
- 📦 **80% storage reduction** via column-store compression (enabled after 7 days)
- ⚡ **60% query performance improvement** via EXPLAIN ANALYZE tuning + strategic indexes
- 📉 **300ms → 80ms latency reduction** through execution plan analysis
- 📊 **React real-time dashboard** with Chart.js visualization
- 🔄 **Continuous aggregates** (hourly, daily, weekly stats)
- 🔔 **Alert notifications** for threshold breaches
- 📤 **CSV data export**
- 🐳 **Docker Compose** deployment with Grafana + pgAdmin
- 🗑️ **Automatic retention policy** (90 days)

## Architecture

```
IoT Devices → REST API / WebSocket → Express.js → TimescaleDB (PostgreSQL)
                                                          ↓
                                          Continuous Aggregates (hourly/daily/weekly)
                                                          ↓
                                         React Dashboard ← Socket.io ← Node.js
                                         Grafana (advanced visualization)
```

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Backend     | Node.js 18+, Express.js, Socket.io  |
| Database    | PostgreSQL 14 + TimescaleDB 2.x     |
| Frontend    | React 18, Chart.js, Socket.io-client|
| Containers  | Docker, Docker Compose              |
| Monitoring  | Grafana, pgAdmin                    |

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- Node.js 18+ (for local development)
- Git

### 1. Clone and configure

```bash
git clone https://github.com/tanisshqbhardwwaj/IoT-Sensor-Analytics-with-TimescaleDB.git
cd IoT-Sensor-Analytics-with-TimescaleDB
cp .env.example .env
# Edit .env with your credentials
```

### 2. Start with Docker Compose

```bash
docker-compose up -d
```

Services started:

| Service   | URL                          | Credentials               |
|-----------|------------------------------|---------------------------|
| API       | http://localhost:5000        | —                         |
| React UI  | http://localhost:3000        | —                         |
| pgAdmin   | http://localhost:5050        | admin@iot.local / admin123|
| Grafana   | http://localhost:3001        | admin / admin123          |

### 3. Initialize the database

The schema is automatically applied on first startup via Docker init scripts.

### 4. Local development (without Docker)

```bash
# Install dependencies
npm install

# Apply schema
psql -U iotuser -d iotdb -f db-schema.sql

# Run server
npm run dev
```

## API Reference

### Health Check

```http
GET /api/health
```

### Sensor Data

| Method | Endpoint                             | Description            |
|--------|--------------------------------------|------------------------|
| POST   | `/api/sensors/:device_id/data`       | Ingest sensor reading  |
| GET    | `/api/sensors/:device_id/data`       | Get raw sensor data    |
| GET    | `/api/sensors/:device_id/aggregate`  | Get aggregated data    |
| GET    | `/api/sensors/:device_id/stats`      | Get statistics summary |

#### POST /api/sensors/:device_id/data

```json
{
  "temperature": 23.5,
  "humidity": 65.2,
  "pressure": 1013.25,
  "signal_strength": -72
}
```

#### GET /api/sensors/:device_id/data

Query parameters: `start`, `end`, `limit`

### Devices

| Method | Endpoint        | Description         |
|--------|-----------------|---------------------|
| GET    | `/api/devices`  | List all devices    |
| POST   | `/api/devices`  | Register new device |

#### POST /api/devices

```json
{
  "device_id": "sensor-001",
  "device_name": "Warehouse Sensor A",
  "location": "Warehouse Floor 1",
  "device_type": "temperature_humidity"
}
```

### Alerts

| Method | Endpoint                        | Description      |
|--------|---------------------------------|------------------|
| GET    | `/api/alerts`                   | List all alerts  |
| POST   | `/api/alerts`                   | Create new alert |
| PUT    | `/api/alerts/:alert_id/resolve` | Resolve an alert |

## WebSocket Events

Connect to `ws://localhost:5000` using Socket.io client.

| Event              | Direction        | Payload                            |
|--------------------|------------------|------------------------------------|
| `subscribe_device` | client → server  | `{ device_id: "sensor-001" }`     |
| `sensor_data`      | server → client  | `{ device_id, temperature, ... }` |
| `alert`            | server → client  | `{ device_id, type, value, ... }` |

## Database Schema

See [`db-schema.sql`](./db-schema.sql) for full schema including:

- `sensor_data` hypertable (partitioned by `time`, 1-week chunks)
- `devices` metadata table
- `alerts` tracking table
- Continuous aggregates: `hourly_stats`, `daily_stats`, `weekly_stats`
- Compression policy (enabled after 7 days → 80% storage savings)
- Retention policy (drop data older than 90 days)
- Strategic indexes: `(device_id, time DESC)`, temperature, humidity

## Performance Optimization

See [`OPTIMIZATION.md`](./OPTIMIZATION.md) for detailed analysis including:

- EXPLAIN ANALYZE output before and after optimization
- 300ms → 80ms latency reduction breakdown
- 60% query performance improvement details
- Index strategy and materialized view analysis

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
DB_USER=iotuser
DB_PASSWORD=iotpassword
DB_HOST=localhost
DB_PORT=5432
DB_NAME=iotdb
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_CONNECTION_TIMEOUT=2000
PORT=5000
NODE_ENV=development
JWT_SECRET=your-secret-key-here
CORS_ORIGIN=http://localhost:3000
ALERT_TEMP_MAX=50
ALERT_TEMP_MIN=-10
ALERT_HUMIDITY_MAX=95
```

## Project Structure

```
IoT-Sensor-Analytics-with-TimescaleDB/
├── server.js                    # Express.js + Socket.io backend
├── db-schema.sql                # TimescaleDB schema & policies
├── docker-compose.yml           # Docker services
├── package.json                 # Node.js dependencies
├── .env.example                 # Environment template
├── OPTIMIZATION.md              # Performance guide
├── postman_collection.json      # API docs (Postman)
├── grafana/
│   └── dashboard.json           # Grafana dashboard config
└── client/                      # React frontend
    ├── package.json
    ├── public/
    │   └── index.html
    └── src/
        ├── index.js
        ├── App.js
        ├── App.css
        ├── components/
        │   ├── Dashboard.js
        │   ├── SensorChart.js
        │   ├── DeviceManager.js
        │   ├── AlertPanel.js
        │   └── PerformanceMetrics.js
        └── utils/
            └── api.js
```

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

MIT © Tanissh Bhardwaj
