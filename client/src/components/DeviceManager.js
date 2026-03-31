import React, { useState, useEffect, useCallback } from 'react';
import { getDevices, registerDevice } from '../utils/api';

const BLANK = {
  device_id: '', device_name: '', location: '', device_type: 'temperature_humidity', firmware_version: '',
};

function DeviceManager({ liveReadings, onDeviceSelect }) {
  const [devices, setDevices]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(BLANK);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  const loadDevices = useCallback(() => {
    setLoading(true);
    getDevices()
      .then(({ devices }) => setDevices(devices))
      .catch(() => setError('Failed to load devices'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.device_id.trim() || !form.device_name.trim()) {
      setError('Device ID and name are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await registerDevice(form);
      setForm(BLANK);
      setShowForm(false);
      loadDevices();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const fmt = (v, d = 1) => (v !== null && v !== undefined ? parseFloat(v).toFixed(d) : '—');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Device Management</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={loadDevices}>↻ Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(f => !f)}>
            {showForm ? '✕ Cancel' : '+ Register Device'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', padding: '10px 16px', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">Register New Device</div>
          <form onSubmit={handleSubmit}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Device ID *</label>
                <input className="form-input" name="device_id" value={form.device_id}
                  onChange={handleChange} placeholder="e.g. sensor-006" required />
              </div>
              <div className="form-group">
                <label className="form-label">Device Name *</label>
                <input className="form-input" name="device_name" value={form.device_name}
                  onChange={handleChange} placeholder="e.g. Warehouse Sensor F" required />
              </div>
              <div className="form-group">
                <label className="form-label">Location</label>
                <input className="form-input" name="location" value={form.location}
                  onChange={handleChange} placeholder="e.g. Building A, Floor 2" />
              </div>
              <div className="form-group">
                <label className="form-label">Device Type</label>
                <select className="form-select" name="device_type" value={form.device_type}
                  onChange={handleChange}>
                  <option value="temperature_humidity">Temperature + Humidity</option>
                  <option value="environmental">Environmental</option>
                  <option value="weather">Weather Station</option>
                  <option value="generic">Generic</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Firmware Version</label>
                <input className="form-input" name="firmware_version" value={form.firmware_version}
                  onChange={handleChange} placeholder="e.g. 1.2.0" />
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Registering…' : '✓ Register Device'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <span>Registered Devices</span>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
            {devices.length} total
          </span>
        </div>
        {loading ? (
          <div className="loading-text">Loading devices…</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="devices-table">
              <thead>
                <tr>
                  <th>Device ID</th>
                  <th>Name</th>
                  <th>Location</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Last Temp</th>
                  <th>Last Humidity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.map(d => {
                  const live = liveReadings[d.device_id];
                  return (
                    <tr key={d.device_id}>
                      <td style={{ fontFamily: 'monospace' }}>{d.device_id}</td>
                      <td>{d.device_name}</td>
                      <td>{d.location || '—'}</td>
                      <td>{d.device_type}</td>
                      <td>
                        <span className={d.is_active ? 'badge-active' : 'badge-inactive'}>
                          {d.is_active ? '● Active' : '○ Inactive'}
                        </span>
                      </td>
                      <td>
                        {live ? `${fmt(live.temperature)}°C` : (d.last_temperature ? `${fmt(d.last_temperature)}°C` : '—')}
                      </td>
                      <td>
                        {live ? `${fmt(live.humidity)}%` : (d.last_humidity ? `${fmt(d.last_humidity)}%` : '—')}
                      </td>
                      <td>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => onDeviceSelect(d.device_id)}
                        >
                          📊 View
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!devices.length && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 32 }}>
                      No devices registered yet. Click "Register Device" to add one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default DeviceManager;
