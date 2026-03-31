import React, { useState, useEffect, useCallback } from 'react';
import { getDevices, getSensorData, getAggregatedData, getStats, getExportUrl } from '../utils/api';
import SensorChart from './SensorChart';

function Dashboard({ selectedDevice, liveReading, onDeviceChange }) {
  const [devices, setDevices]     = useState([]);
  const [stats, setStats]         = useState(null);
  const [rawData, setRawData]     = useState([]);
  const [aggData, setAggData]     = useState([]);
  const [interval, setInterval_]  = useState('hourly');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  // Fetch device list
  useEffect(() => {
    getDevices()
      .then(({ devices }) => {
        setDevices(devices);
        if (!selectedDevice && devices.length) {
          onDeviceChange(devices[0].device_id);
        }
      })
      .catch(() => setError('Failed to load devices'));
  // onDeviceChange is wrapped with useCallback in App.js — safe to include
  }, [onDeviceChange, selectedDevice]);

  // Fetch data when device or interval changes
  const fetchData = useCallback(async () => {
    if (!selectedDevice) return;
    setLoading(true);
    setError(null);
    try {
      const end   = new Date().toISOString();
      const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [statsRes, rawRes, aggRes] = await Promise.all([
        getStats(selectedDevice, { start, end }),
        getSensorData(selectedDevice, { start, end, limit: 200 }),
        getAggregatedData(selectedDevice, {
          interval: interval_,
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          end,
        }),
      ]);

      setStats(statsRes.stats);
      setRawData(rawRes.data);
      setAggData(aggRes.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedDevice, interval_]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Merge live reading into raw data display
  useEffect(() => {
    if (liveReading) {
      setRawData(prev => [liveReading, ...prev].slice(0, 200));
    }
  }, [liveReading]);

  const fmt = (v, d = 1) => (v !== null && v !== undefined ? parseFloat(v).toFixed(d) : '—');

  return (
    <div>
      {/* Device selector + controls */}
      <div className="card" style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
            <select
              className="form-select"
              value={selectedDevice || ''}
              onChange={e => onDeviceChange(e.target.value)}
            >
              <option value="" disabled>Select device…</option>
              {devices.map(d => (
                <option key={d.device_id} value={d.device_id}>
                  {d.device_name} ({d.device_id})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <select
              className="form-select"
              value={interval_}
              onChange={e => setInterval_(e.target.value)}
              style={{ width: 'auto' }}
            >
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>

          <button className="btn btn-secondary btn-sm" onClick={fetchData} disabled={loading}>
            {loading ? '…' : '↻ Refresh'}
          </button>

          {selectedDevice && (
            <a
              className="btn btn-success btn-sm"
              href={getExportUrl(selectedDevice)}
              download
            >
              ⬇ Export CSV
            </a>
          )}
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {/* KPI tiles */}
      <div className="metrics-grid">
        <div className="metric-tile">
          <div className="metric-value">
            {liveReading ? fmt(liveReading.temperature) : fmt(stats?.avg_temperature)}°C
          </div>
          <div className="metric-label">Temperature</div>
        </div>
        <div className="metric-tile">
          <div className="metric-value">
            {liveReading ? fmt(liveReading.humidity) : fmt(stats?.avg_humidity)}%
          </div>
          <div className="metric-label">Humidity</div>
        </div>
        <div className="metric-tile">
          <div className="metric-value">
            {liveReading ? fmt(liveReading.pressure, 1) : fmt(stats?.avg_pressure, 1)} hPa
          </div>
          <div className="metric-label">Pressure</div>
        </div>
        <div className="metric-tile">
          <div className="metric-value">
            {liveReading ? liveReading.signal_strength : fmt(stats?.avg_signal_strength, 0)} dBm
          </div>
          <div className="metric-label">Signal</div>
        </div>
        <div className="metric-tile">
          <div className="metric-value">{stats?.total_readings ?? '—'}</div>
          <div className="metric-label">Readings (24h)</div>
        </div>
        <div className="metric-tile">
          <div className="metric-value">{fmt(stats?.min_temperature)}°</div>
          <div className="metric-label">Min Temp</div>
        </div>
        <div className="metric-tile">
          <div className="metric-value">{fmt(stats?.max_temperature)}°</div>
          <div className="metric-label">Max Temp</div>
        </div>
        <div className="metric-tile">
          <div className="metric-value">{fmt(stats?.stddev_temperature, 2)}</div>
          <div className="metric-label">Temp StdDev</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid-2">
        <div className="card">
          <div className="card-title">Temperature – {interval_} (7 days)</div>
          <div className="chart-container">
            <SensorChart
              data={aggData}
              metric="avg_temperature"
              label="Avg Temperature (°C)"
              color="#e94560"
              minKey="min_temperature"
              maxKey="max_temperature"
            />
          </div>
        </div>
        <div className="card">
          <div className="card-title">Humidity – {interval_} (7 days)</div>
          <div className="chart-container">
            <SensorChart
              data={aggData}
              metric="avg_humidity"
              label="Avg Humidity (%)"
              color="#4ecdc4"
            />
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Temperature – Raw (24h)</div>
          <div className="chart-container">
            <SensorChart
              data={rawData}
              metric="temperature"
              label="Temperature (°C)"
              color="#f39c12"
              timeKey="time"
            />
          </div>
        </div>
        <div className="card">
          <div className="card-title">Humidity – Raw (24h)</div>
          <div className="chart-container">
            <SensorChart
              data={rawData}
              metric="humidity"
              label="Humidity (%)"
              color="#3498db"
              timeKey="time"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
