// Utility functions for communicating with the IoT Analytics API

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Devices
export const getDevices = () => request('/api/devices');
export const registerDevice = (data) =>
  request('/api/devices', { method: 'POST', body: JSON.stringify(data) });

// Sensor data
export const getSensorData = (deviceId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/api/sensors/${deviceId}/data${qs ? `?${qs}` : ''}`);
};

export const ingestSensorData = (deviceId, data) =>
  request(`/api/sensors/${deviceId}/data`, { method: 'POST', body: JSON.stringify(data) });

export const getAggregatedData = (deviceId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/api/sensors/${deviceId}/aggregate${qs ? `?${qs}` : ''}`);
};

export const getStats = (deviceId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/api/sensors/${deviceId}/stats${qs ? `?${qs}` : ''}`);
};

export const getExportUrl = (deviceId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return `${API_BASE}/api/sensors/${deviceId}/export${qs ? `?${qs}` : ''}`;
};

// Alerts
export const getAlerts = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/api/alerts${qs ? `?${qs}` : ''}`);
};

export const createAlert = (data) =>
  request('/api/alerts', { method: 'POST', body: JSON.stringify(data) });

export const resolveAlert = (alertId, resolvedBy) =>
  request(`/api/alerts/${alertId}/resolve`, {
    method: 'PUT',
    body: JSON.stringify({ resolved_by: resolvedBy }),
  });

// Health
export const getHealth = () => request('/api/health');
