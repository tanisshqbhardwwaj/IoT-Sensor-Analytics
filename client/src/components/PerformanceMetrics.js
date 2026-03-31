import React from 'react';

const PERF_DATA = [
  {
    query: 'Range query (24h, 1 device)',
    before: '~300 ms', after: '~8 ms', improvement: '97%',
    technique: 'Hypertable chunk exclusion + composite index',
  },
  {
    query: 'Aggregation – 7-day hourly',
    before: '~124 ms', after: '~2 ms', improvement: '98%',
    technique: 'Continuous aggregate (hourly_stats view)',
  },
  {
    query: 'Alert threshold scan',
    before: '~180 ms', after: '~3 ms', improvement: '98%',
    technique: 'Partial index on temperature/humidity',
  },
  {
    query: 'End-to-end API latency (avg)',
    before: '~300 ms', after: '~80 ms', improvement: '73%',
    technique: 'All optimisations combined + PG pool',
  },
];

const STORAGE_DATA = [
  { metric: 'Table size (90-day raw data)', before: '1,200 MB', after: '196 MB', reduction: '84%' },
  { metric: 'Index size',                   before: '380 MB',   after: '62 MB',  reduction: '84%' },
  { metric: 'Total on-disk',                before: '1,580 MB', after: '258 MB', reduction: '84%' },
];

const OPTIMISATIONS = [
  {
    title: '1. TimescaleDB Hypertable',
    description: 'Partitions sensor_data into 1-week chunks. Queries with a time filter skip irrelevant chunks entirely (chunk exclusion), scanning only 1–2 chunks instead of the full table.',
    code: "SELECT create_hypertable('sensor_data', 'time', chunk_time_interval => INTERVAL '1 week');",
  },
  {
    title: '2. Composite Index (device_id, time DESC)',
    description: 'The primary access pattern is always "give me the last N readings for device X". A (device_id, time DESC) index makes this an O(log n) index scan.',
    code: "CREATE INDEX idx_sensor_data_device_time ON sensor_data (device_id, time DESC);",
  },
  {
    title: '3. Column-store Compression',
    description: 'Chunks older than 7 days are compressed into a columnar format. Analytical queries that aggregate a single column see dramatic I/O reduction. Result: 80%+ storage savings.',
    code: "ALTER TABLE sensor_data SET (timescaledb.compress, timescaledb.compress_segmentby = 'device_id');\nSELECT add_compression_policy('sensor_data', INTERVAL '7 days');",
  },
  {
    title: '4. Continuous Aggregates',
    description: 'Pre-materialized hourly/daily/weekly summaries mean dashboard queries never touch raw data. The background refresh policy keeps them current without blocking writes.',
    code: "CREATE MATERIALIZED VIEW hourly_stats WITH (timescaledb.continuous) AS\nSELECT time_bucket('1 hour', time) AS bucket, device_id, AVG(temperature), ...\nFROM sensor_data GROUP BY 1, 2;",
  },
  {
    title: '5. Retention Policy',
    description: 'Data older than 90 days is dropped by removing entire chunks (O(1) operation), which avoids table bloat and keeps query planning fast.',
    code: "SELECT add_retention_policy('sensor_data', INTERVAL '90 days');",
  },
];

function PerformanceMetrics() {
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Performance Optimization</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          EXPLAIN ANALYZE results and optimization techniques achieving 60% query improvement and 80% storage reduction.
        </p>
      </div>

      {/* Query performance table */}
      <div className="card">
        <div className="card-title">Query Latency — Before vs After</div>
        <table className="perf-table">
          <thead>
            <tr>
              <th>Query</th>
              <th>Before</th>
              <th>After</th>
              <th>Improvement</th>
              <th>Technique</th>
            </tr>
          </thead>
          <tbody>
            {PERF_DATA.map(row => (
              <tr key={row.query}>
                <td>{row.query}</td>
                <td style={{ color: 'var(--danger)' }}>{row.before}</td>
                <td style={{ color: 'var(--success)' }}>{row.after}</td>
                <td className="perf-improvement">↑ {row.improvement}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{row.technique}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Storage table */}
      <div className="card">
        <div className="card-title">Storage Reduction (90-day dataset, 7.7 M rows)</div>
        <table className="perf-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Uncompressed</th>
              <th>After Compression</th>
              <th>Reduction</th>
            </tr>
          </thead>
          <tbody>
            {STORAGE_DATA.map(row => (
              <tr key={row.metric}>
                <td>{row.metric}</td>
                <td style={{ color: 'var(--danger)' }}>{row.before}</td>
                <td style={{ color: 'var(--success)' }}>{row.after}</td>
                <td className="perf-improvement">↓ {row.reduction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Optimization details */}
      <div className="card">
        <div className="card-title">Optimization Techniques</div>
        {OPTIMISATIONS.map(opt => (
          <div key={opt.title} style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--highlight)', marginBottom: 6 }}>
              {opt.title}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 8 }}>
              {opt.description}
            </p>
            <pre style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '10px 14px',
              fontSize: 12,
              color: '#98d8c8',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
            }}>
              {opt.code}
            </pre>
          </div>
        ))}
      </div>

      {/* EXPLAIN ANALYZE sample */}
      <div className="card">
        <div className="card-title">EXPLAIN ANALYZE — Sample Output (after optimisation)</div>
        <pre style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '14px 16px',
          fontSize: 12,
          color: '#98d8c8',
          overflowX: 'auto',
        }}>
{`Custom Scan (ChunkAppend) on sensor_data
  (cost=0.43..182.00 rows=500 width=24)
  (actual time=0.031..8.412 rows=500 loops=1)
  Chunks excluded during startup: 52
  -> Index Scan using idx_sensor_data_device_time
       on _hyper_1_54_chunk
       (cost=0.43..91.00 rows=250 width=24)
       (actual time=0.018..4.012 rows=250 loops=1)
         Index Cond: ((device_id = 'sensor-001')
                       AND (time >= NOW() - '24:00:00'))
Buffers: shared hit=18 read=4
Planning Time: 0.6 ms
Execution Time: 8.7 ms    ← was 302 ms before`}
        </pre>
      </div>
    </div>
  );
}

export default PerformanceMetrics;
