import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import Dashboard from './components/Dashboard';
import DeviceManager from './components/DeviceManager';
import AlertPanel from './components/AlertPanel';
import PerformanceMetrics from './components/PerformanceMetrics';

const SOCKET_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function App() {
  const [activeTab, setActiveTab]       = useState('dashboard');
  const [socket, setSocket]             = useState(null);
  const [connected, setConnected]       = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [liveReadings, setLiveReadings] = useState({});
  const [liveAlerts, setLiveAlerts]     = useState([]);

  // Setup WebSocket connection
  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

    s.on('connect',    () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('sensor_data', (data) => {
      setLiveReadings(prev => ({ ...prev, [data.device_id]: data }));
    });

    s.on('alert', (alert) => {
      setLiveAlerts(prev => [alert, ...prev].slice(0, 50));
    });

    setSocket(s);
    return () => s.disconnect();
  }, []);

  // Subscribe to the selected device's room
  useEffect(() => {
    if (socket && selectedDevice) {
      socket.emit('subscribe_device', { device_id: selectedDevice });
    }
  }, [socket, selectedDevice]);

  const handleDeviceSelect = useCallback((deviceId) => {
    setSelectedDevice(deviceId);
    setActiveTab('dashboard');
  }, []);

  const tabs = [
    { key: 'dashboard',    label: '📊 Dashboard'           },
    { key: 'devices',      label: '📡 Devices'             },
    { key: 'alerts',       label: `🔔 Alerts${liveAlerts.length ? ` (${liveAlerts.length})` : ''}` },
    { key: 'performance',  label: '⚡ Performance'          },
  ];

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-brand">
          <span>⚡</span>
          <span>IoT Sensor Analytics</span>
        </div>
        <div className="navbar-status">
          <div className={`status-dot ${connected ? '' : 'offline'}`} />
          <span>{connected ? 'Live' : 'Offline'}</span>
        </div>
      </nav>

      <div className="tab-nav">
        {tabs.map(t => (
          <button
            key={t.key}
            className={activeTab === t.key ? 'active' : ''}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main className="main-content">
        {activeTab === 'dashboard' && (
          <Dashboard
            selectedDevice={selectedDevice}
            liveReading={selectedDevice ? liveReadings[selectedDevice] : null}
            onDeviceChange={setSelectedDevice}
          />
        )}
        {activeTab === 'devices' && (
          <DeviceManager
            liveReadings={liveReadings}
            onDeviceSelect={handleDeviceSelect}
          />
        )}
        {activeTab === 'alerts' && (
          <AlertPanel liveAlerts={liveAlerts} />
        )}
        {activeTab === 'performance' && (
          <PerformanceMetrics />
        )}
      </main>
    </div>
  );
}

export default App;
