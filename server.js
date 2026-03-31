'use strict';

require('dotenv').config();

const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const { Pool }     = require('pg');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');

// ---------------------------------------------------------------------------
// Database connection pool
// ---------------------------------------------------------------------------
const pool = new Pool({
  user:               process.env.DB_USER     || 'iotuser',
  password:           process.env.DB_PASSWORD || 'iotpassword',
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '5432', 10),
  database:           process.env.DB_NAME     || 'iotdb',
  max:                parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis:  parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '2000', 10),
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

// ---------------------------------------------------------------------------
// Alert thresholds (configurable via environment variables)
// ---------------------------------------------------------------------------
const THRESHOLDS = {
  TEMP_MAX:     parseFloat(process.env.ALERT_TEMP_MAX     || '50'),
  TEMP_MIN:     parseFloat(process.env.ALERT_TEMP_MIN     || '-10'),
  HUMIDITY_MAX: parseFloat(process.env.ALERT_HUMIDITY_MAX || '95'),
  HUMIDITY_MIN: parseFloat(process.env.ALERT_HUMIDITY_MIN || '5'),
  PRESSURE_MAX: parseFloat(process.env.ALERT_PRESSURE_MAX || '1100'),
  PRESSURE_MIN: parseFloat(process.env.ALERT_PRESSURE_MIN || '900'),
};

// ---------------------------------------------------------------------------
// Express + Socket.io setup
// ---------------------------------------------------------------------------
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
}));
app.use(express.json());

// Rate limiting: 200 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// ---------------------------------------------------------------------------
// Helper: generate alerts for out-of-range sensor readings
// ---------------------------------------------------------------------------
async function checkAndCreateAlerts(deviceId, reading) {
  const alerts = [];

  if (reading.temperature !== undefined && reading.temperature !== null) {
    if (reading.temperature > THRESHOLDS.TEMP_MAX) {
      alerts.push({
        type: 'high_temperature', severity: 'critical',
        message: `Temperature ${reading.temperature}°C exceeds max threshold ${THRESHOLDS.TEMP_MAX}°C`,
        value: reading.temperature, threshold: THRESHOLDS.TEMP_MAX,
      });
    } else if (reading.temperature < THRESHOLDS.TEMP_MIN) {
      alerts.push({
        type: 'low_temperature', severity: 'warning',
        message: `Temperature ${reading.temperature}°C is below min threshold ${THRESHOLDS.TEMP_MIN}°C`,
        value: reading.temperature, threshold: THRESHOLDS.TEMP_MIN,
      });
    }
  }

  if (reading.humidity !== undefined && reading.humidity !== null) {
    if (reading.humidity > THRESHOLDS.HUMIDITY_MAX) {
      alerts.push({
        type: 'high_humidity', severity: 'warning',
        message: `Humidity ${reading.humidity}% exceeds max threshold ${THRESHOLDS.HUMIDITY_MAX}%`,
        value: reading.humidity, threshold: THRESHOLDS.HUMIDITY_MAX,
      });
    }
  }

  for (const alert of alerts) {
    const result = await pool.query(
      `INSERT INTO alerts (device_id, alert_type, severity, message, metric_value, threshold_value)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [deviceId, alert.type, alert.severity, alert.message, alert.value, alert.threshold]
    );
    io.to(`device:${deviceId}`).emit('alert', result.rows[0]);
    io.emit('alert', result.rows[0]);
  }
}

// ---------------------------------------------------------------------------
// WebSocket: device room subscriptions
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  console.log(`WebSocket client connected: ${socket.id}`);

  socket.on('subscribe_device', ({ device_id }) => {
    if (device_id) {
      socket.join(`device:${device_id}`);
      console.log(`Client ${socket.id} subscribed to device:${device_id}`);
    }
  });

  socket.on('unsubscribe_device', ({ device_id }) => {
    if (device_id) {
      socket.leave(`device:${device_id}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`WebSocket client disconnected: ${socket.id}`);
  });
});

// ===========================================================================
// API ROUTES
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT NOW() AS time, version() AS pg_version');
    res.json({
      status: 'ok',
      timestamp: rows[0].time,
      pg_version: rows[0].pg_version,
      uptime_seconds: process.uptime(),
    });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/devices  – list all registered devices
// ---------------------------------------------------------------------------
app.get('/api/devices', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, dl.last_reading_time, dl.temperature AS last_temperature,
              dl.humidity AS last_humidity
       FROM devices d
       LEFT JOIN device_latest dl USING (device_id)
       ORDER BY d.registered_at DESC`
    );
    res.json({ devices: rows, count: rows.length });
  } catch (err) {
    console.error('GET /api/devices error:', err);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/devices  – register a new device
// ---------------------------------------------------------------------------
app.post('/api/devices', async (req, res) => {
  const { device_id, device_name, location, device_type, firmware_version, metadata } = req.body;

  if (!device_id || !device_name) {
    return res.status(400).json({ error: 'device_id and device_name are required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO devices (device_id, device_name, location, device_type, firmware_version, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (device_id) DO UPDATE
         SET device_name     = EXCLUDED.device_name,
             location        = EXCLUDED.location,
             device_type     = EXCLUDED.device_type,
             firmware_version = EXCLUDED.firmware_version,
             metadata        = EXCLUDED.metadata
       RETURNING *`,
      [device_id, device_name, location || null, device_type || 'generic',
       firmware_version || null, JSON.stringify(metadata || {})]
    );
    res.status(201).json({ device: rows[0] });
  } catch (err) {
    console.error('POST /api/devices error:', err);
    res.status(500).json({ error: 'Failed to register device' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/sensors/:device_id/data  – ingest a sensor reading
// ---------------------------------------------------------------------------
app.post('/api/sensors/:device_id/data', async (req, res) => {
  const { device_id } = req.params;
  const { temperature, humidity, pressure, signal_strength, time } = req.body;

  if (temperature === undefined && humidity === undefined &&
      pressure === undefined && signal_strength === undefined) {
    return res.status(400).json({ error: 'At least one sensor value is required' });
  }

  const readingTime = time ? new Date(time) : new Date();

  try {
    // Ensure device exists (auto-register if needed)
    await pool.query(
      `INSERT INTO devices (device_id, device_name, device_type)
       VALUES ($1, $1, 'auto-registered')
       ON CONFLICT (device_id) DO UPDATE SET last_seen = NOW()`,
      [device_id]
    );

    const { rows } = await pool.query(
      `INSERT INTO sensor_data (time, device_id, temperature, humidity, pressure, signal_strength)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [readingTime, device_id, temperature ?? null, humidity ?? null,
       pressure ?? null, signal_strength ?? null]
    );

    const reading = rows[0];

    // Broadcast to subscribed WebSocket clients
    io.to(`device:${device_id}`).emit('sensor_data', reading);

    // Check thresholds and emit alerts
    await checkAndCreateAlerts(device_id, reading);

    res.status(201).json({ data: reading });
  } catch (err) {
    console.error('POST /api/sensors/:device_id/data error, device:', device_id, err);
    res.status(500).json({ error: 'Failed to ingest sensor data' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/sensors/:device_id/data  – raw time-series data
// ---------------------------------------------------------------------------
app.get('/api/sensors/:device_id/data', async (req, res) => {
  const { device_id } = req.params;
  const {
    start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    end   = new Date().toISOString(),
    limit = '500',
  } = req.query;

  const limitInt = Math.min(parseInt(limit, 10) || 500, 5000);

  try {
    const { rows } = await pool.query(
      `SELECT time, device_id, temperature, humidity, pressure, signal_strength
       FROM sensor_data
       WHERE device_id = $1
         AND time >= $2::timestamptz
         AND time <= $3::timestamptz
       ORDER BY time DESC
       LIMIT $4`,
      [device_id, start, end, limitInt]
    );
    res.json({ device_id, data: rows, count: rows.length, start, end });
  } catch (err) {
    console.error('GET /api/sensors/:device_id/data error, device:', device_id, err);
    res.status(500).json({ error: 'Failed to fetch sensor data' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/sensors/:device_id/aggregate  – aggregated data (uses continuous aggregates)
// ---------------------------------------------------------------------------
app.get('/api/sensors/:device_id/aggregate', async (req, res) => {
  const { device_id } = req.params;
  const {
    interval = 'hourly',
    start    = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    end      = new Date().toISOString(),
    limit    = '200',
  } = req.query;

  const limitInt = Math.min(parseInt(limit, 10) || 200, 1000);

  // Pick the right continuous aggregate view – whitelist only
  const ALLOWED_VIEWS = { hourly: 'hourly_stats', daily: 'daily_stats', weekly: 'weekly_stats' };
  const view = ALLOWED_VIEWS[interval];
  if (!view) {
    return res.status(400).json({ error: 'interval must be one of: hourly, daily, weekly' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT bucket, device_id,
              avg_temperature, min_temperature, max_temperature,
              avg_humidity,    min_humidity,    max_humidity,
              avg_pressure,
              avg_signal_strength,
              reading_count
       FROM ${view}
       WHERE device_id = $1
         AND bucket >= $2::timestamptz
         AND bucket <= $3::timestamptz
       ORDER BY bucket DESC
       LIMIT $4`,
      [device_id, start, end, limitInt]
    );
    res.json({ device_id, interval, data: rows, count: rows.length, start, end });
  } catch (err) {
    console.error('GET /api/sensors/:device_id/aggregate error, device:', device_id, err);
    res.status(500).json({ error: 'Failed to fetch aggregated data' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/sensors/:device_id/stats  – summary statistics
// ---------------------------------------------------------------------------
app.get('/api/sensors/:device_id/stats', async (req, res) => {
  const { device_id } = req.params;
  const {
    start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    end   = new Date().toISOString(),
  } = req.query;

  try {
    const { rows } = await pool.query(
      `SELECT
          COUNT(*)                        AS total_readings,
          AVG(temperature)                AS avg_temperature,
          MIN(temperature)                AS min_temperature,
          MAX(temperature)                AS max_temperature,
          STDDEV(temperature)             AS stddev_temperature,
          AVG(humidity)                   AS avg_humidity,
          MIN(humidity)                   AS min_humidity,
          MAX(humidity)                   AS max_humidity,
          AVG(pressure)                   AS avg_pressure,
          AVG(signal_strength)            AS avg_signal_strength,
          MIN(time)                       AS first_reading,
          MAX(time)                       AS last_reading
       FROM sensor_data
       WHERE device_id = $1
         AND time >= $2::timestamptz
         AND time <= $3::timestamptz`,
      [device_id, start, end]
    );
    res.json({ device_id, stats: rows[0], start, end });
  } catch (err) {
    console.error('GET /api/sensors/:device_id/stats error, device:', device_id, err);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/sensors/:device_id/export  – CSV data export
// ---------------------------------------------------------------------------
app.get('/api/sensors/:device_id/export', async (req, res) => {
  const { device_id } = req.params;
  const {
    start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    end   = new Date().toISOString(),
  } = req.query;

  try {
    const { rows } = await pool.query(
      `SELECT time, device_id, temperature, humidity, pressure, signal_strength
       FROM sensor_data
       WHERE device_id = $1
         AND time >= $2::timestamptz
         AND time <= $3::timestamptz
       ORDER BY time ASC
       LIMIT 50000`,
      [device_id, start, end]
    );

    const header = 'time,device_id,temperature,humidity,pressure,signal_strength\n';
    const csv = rows.map(r =>
      `${r.time},${r.device_id},${r.temperature ?? ''},${r.humidity ?? ''},${r.pressure ?? ''},${r.signal_strength ?? ''}`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sensor_${device_id}_export.csv"`);
    res.send(header + csv);
  } catch (err) {
    console.error('GET /api/sensors/:device_id/export error, device:', device_id, err);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/alerts  – list alerts
// ---------------------------------------------------------------------------
app.get('/api/alerts', async (req, res) => {
  const { device_id, resolved, limit = '50' } = req.query;
  const limitInt = Math.min(parseInt(limit, 10) || 50, 500);

  const conditions = [];
  const params     = [];
  let   idx        = 1;

  if (device_id) { conditions.push(`device_id = $${idx++}`); params.push(device_id); }
  if (resolved !== undefined) {
    conditions.push(`is_resolved = $${idx++}`);
    params.push(resolved === 'true');
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limitInt);

  try {
    const { rows } = await pool.query(
      `SELECT * FROM alerts ${where} ORDER BY created_at DESC LIMIT $${idx}`,
      params
    );
    res.json({ alerts: rows, count: rows.length });
  } catch (err) {
    console.error('GET /api/alerts error:', err);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/alerts  – create a manual alert
// ---------------------------------------------------------------------------
app.post('/api/alerts', async (req, res) => {
  const { device_id, alert_type, severity, message, metric_value, threshold_value } = req.body;

  if (!device_id || !alert_type || !message) {
    return res.status(400).json({ error: 'device_id, alert_type, and message are required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO alerts (device_id, alert_type, severity, message, metric_value, threshold_value)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [device_id, alert_type, severity || 'warning', message,
       metric_value ?? null, threshold_value ?? null]
    );
    io.emit('alert', rows[0]);
    res.status(201).json({ alert: rows[0] });
  } catch (err) {
    console.error('POST /api/alerts error:', err);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/alerts/:alert_id/resolve  – resolve an alert
// ---------------------------------------------------------------------------
app.put('/api/alerts/:alert_id/resolve', async (req, res) => {
  const { alert_id } = req.params;
  const { resolved_by } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE alerts
       SET is_resolved = TRUE, resolved_at = NOW(), resolved_by = $2
       WHERE alert_id = $1 RETURNING *`,
      [alert_id, resolved_by || null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Alert not found' });
    res.json({ alert: rows[0] });
  } catch (err) {
    console.error('PUT /api/alerts/:alert_id/resolve error, alertId:', alert_id, err);
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

// ---------------------------------------------------------------------------
// 404 catch-all
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '5000', 10);
server.listen(PORT, () => {
  console.log(`IoT Analytics API running on http://localhost:${PORT}`);
  console.log(`WebSocket server ready on ws://localhost:${PORT}`);
});

module.exports = { app, server, pool };
