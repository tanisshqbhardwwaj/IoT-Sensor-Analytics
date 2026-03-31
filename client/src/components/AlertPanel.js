import React, { useState, useEffect, useCallback } from 'react';
import { getAlerts, resolveAlert } from '../utils/api';

const SEVERITY_CLASS = { critical: 'badge-critical', warning: 'badge-warning', info: 'badge-info' };

function AlertPanel({ liveAlerts }) {
  const [serverAlerts, setServerAlerts] = useState([]);
  const [filter, setFilter]             = useState('unresolved');
  const [loading, setLoading]           = useState(true);

  const loadAlerts = useCallback(() => {
    setLoading(true);
    const params = filter === 'unresolved' ? { resolved: 'false' }
                 : filter === 'resolved'   ? { resolved: 'true' }
                 : {};
    getAlerts({ ...params, limit: 100 })
      .then(({ alerts }) => setServerAlerts(alerts))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  // Merge new live alerts at the top
  const allAlerts = React.useMemo(() => {
    const ids = new Set(serverAlerts.map(a => a.alert_id));
    const merged = [...liveAlerts.filter(a => !ids.has(a.alert_id)), ...serverAlerts];
    if (filter === 'unresolved') return merged.filter(a => !a.is_resolved);
    if (filter === 'resolved')   return merged.filter(a => a.is_resolved);
    return merged;
  }, [serverAlerts, liveAlerts, filter]);

  const handleResolve = async (alertId) => {
    try {
      await resolveAlert(alertId, 'dashboard-user');
      setServerAlerts(prev =>
        prev.map(a => a.alert_id === alertId ? { ...a, is_resolved: true, resolved_at: new Date().toISOString() } : a)
      );
    } catch (err) {
      console.error('Failed to resolve alert:', err);
    }
  };

  const unresolved = allAlerts.filter(a => !a.is_resolved).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>
          Alerts {unresolved > 0 && (
            <span className="alert-badge badge-critical" style={{ fontSize: 13, marginLeft: 8 }}>
              {unresolved} active
            </span>
          )}
        </h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select className="form-select" value={filter} onChange={e => setFilter(e.target.value)}
            style={{ width: 'auto' }}>
            <option value="unresolved">Unresolved</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
          <button className="btn btn-secondary btn-sm" onClick={loadAlerts}>↻ Refresh</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-text">Loading alerts…</div>
        ) : allAlerts.length === 0 ? (
          <div className="loading-text">
            {filter === 'unresolved' ? '✅ No active alerts' : 'No alerts found'}
          </div>
        ) : (
          allAlerts.map(alert => (
            <div className="alert-item" key={alert.alert_id}>
              <span className={`alert-badge ${SEVERITY_CLASS[alert.severity] || 'badge-info'}`}>
                {alert.severity?.toUpperCase()}
              </span>
              <div className="alert-details">
                <div className="alert-message">{alert.message}</div>
                <div className="alert-meta">
                  {alert.device_id} · {new Date(alert.created_at).toLocaleString()}
                  {alert.is_resolved && (
                    <span style={{ color: 'var(--success)', marginLeft: 8 }}>
                      ✓ Resolved {alert.resolved_at ? new Date(alert.resolved_at).toLocaleString() : ''}
                    </span>
                  )}
                </div>
              </div>
              {!alert.is_resolved && (
                <button
                  className="btn btn-success btn-sm"
                  onClick={() => handleResolve(alert.alert_id)}
                >
                  Resolve
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default AlertPanel;
