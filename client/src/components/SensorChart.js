import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale
);

function SensorChart({ data = [], metric, label, color, minKey, maxKey, timeKey = 'bucket' }) {
  const chartData = useMemo(() => {
    const sorted = [...data].sort((a, b) =>
      new Date(a[timeKey] || a.bucket) - new Date(b[timeKey] || b.bucket)
    );

    const labels = sorted.map(d => {
      const t = new Date(d[timeKey] || d.bucket);
      return t.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    });

    const mainDataset = {
      label,
      data: sorted.map(d => d[metric] !== null ? parseFloat(d[metric]).toFixed(2) : null),
      borderColor: color,
      backgroundColor: `${color}22`,
      fill: true,
      tension: 0.3,
      pointRadius: data.length > 100 ? 0 : 3,
      pointHoverRadius: 5,
    };

    const datasets = [mainDataset];

    if (minKey && maxKey) {
      datasets.push({
        label: 'Min',
        data: sorted.map(d => d[minKey] !== null ? parseFloat(d[minKey]).toFixed(2) : null),
        borderColor: `${color}88`,
        borderDash: [4, 4],
        fill: false,
        tension: 0.3,
        pointRadius: 0,
      });
      datasets.push({
        label: 'Max',
        data: sorted.map(d => d[maxKey] !== null ? parseFloat(d[maxKey]).toFixed(2) : null),
        borderColor: `${color}88`,
        borderDash: [4, 4],
        fill: false,
        tension: 0.3,
        pointRadius: 0,
      });
    }

    return { labels, datasets };
  }, [data, metric, label, color, minKey, maxKey, timeKey]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: {
        labels: { color: '#a0a0b0', font: { size: 11 } },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#a0a0b0',
          maxTicksLimit: 8,
          font: { size: 10 },
          maxRotation: 30,
        },
        grid: { color: '#2a2a4a' },
      },
      y: {
        ticks: { color: '#a0a0b0', font: { size: 11 } },
        grid: { color: '#2a2a4a' },
      },
    },
  };

  if (!data.length) {
    return (
      <div className="loading-text" style={{ paddingTop: 80 }}>
        No data available
      </div>
    );
  }

  return <Line data={chartData} options={options} />;
}

export default SensorChart;
