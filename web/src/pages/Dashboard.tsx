/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { getInsights } from '../lib/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, DollarSign, ShoppingBag, AlertTriangle, BarChart3 } from 'lucide-react';
import '../styles/Dashboard.css';

export default function Dashboard() {
  const [customerId, setCustomerId] = useState('');
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rateLimited, setRateLimited] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const loadInsights = async () => {
    if (!customerId) return;
    
    setLoading(true);
    setError('');
    setRateLimited(false);
    setAnnouncement('Loading customer insights...');
    
    try {
      const { data } = await getInsights(customerId);
      setInsights(data);
      setAnnouncement(`Loaded insights for ${data.transactionCount} transactions`);
    } catch (err: any) {
      if (err.response?.status === 429) {
        setRateLimited(true);
        setError('⏱️ Rate limited! Please wait a moment...');
        setAnnouncement('Rate limit exceeded. Please wait before trying again.');
        setTimeout(() => setRateLimited(false), 2000);
      } else {
        const errorMsg = err.response?.data?.error || 'Failed to load insights';
        setError(errorMsg);
        setAnnouncement(`Error: ${errorMsg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ['#2d6a5c', '#059669', '#f59e0b', '#dc2626', '#8b5cf6', '#ec4899'];

  return (
    <div className="dashboard">
      {/* Live region for screen reader announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      <header className="dashboard-header">
        <h1 className="dashboard-title">Customer Insights Dashboard</h1>
        <p className="dashboard-subtitle">Analyze spending patterns and detect anomalies</p>
      </header>
      
      {/* Input Section */}
      <section className="card" aria-labelledby="customer-input-heading">
        <div className="card-body">
          <h2 id="customer-input-heading" className="sr-only">Enter Customer ID</h2>
          <div className="input-group">
            <label htmlFor="customer-id" className="sr-only">Customer ID</label>
            <input
              id="customer-id"
              type="text"
              placeholder="Enter Customer ID (from Prisma Studio)"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadInsights()}
              className="input"
              aria-describedby={error ? 'error-message' : undefined}
              aria-invalid={!!error}
            />
            <button
              onClick={loadInsights}
              disabled={loading || !customerId || rateLimited}
              className={`btn ${rateLimited ? 'btn-danger' : 'btn-primary'}`}
              aria-busy={loading}
            >
              {loading ? 'Loading...' : rateLimited ? 'Rate Limited' : 'Load Insights'}
            </button>
          </div>
          {error && (
            <div
              id="error-message"
              className={`alert ${rateLimited ? 'alert-warning' : 'alert-danger'}`}
              role="alert"
            >
              {error}
            </div>
          )}
        </div>
      </section>

      {/* KPIs */}
      {insights && (
        <>
          <section aria-labelledby="kpi-heading">
            <h2 id="kpi-heading" className="sr-only">Key Performance Indicators</h2>
            <div className="kpi-grid">
              <article className="kpi-card">
                <div className="kpi-content">
                  <div>
                    <p className="kpi-label">Total Spend</p>
                    <p className="kpi-value">
                      ₹{(insights.totalSpend / 100).toLocaleString()}
                    </p>
                  </div>
                  <DollarSign className="kpi-icon kpi-icon-primary" aria-hidden="true" />
                </div>
              </article>

              <article className="kpi-card">
                <div className="kpi-content">
                  <div>
                    <p className="kpi-label">Transactions</p>
                    <p className="kpi-value">{insights.transactionCount}</p>
                  </div>
                  <ShoppingBag className="kpi-icon kpi-icon-success" aria-hidden="true" />
                </div>
              </article>

              <article className="kpi-card">
                <div className="kpi-content">
                  <div>
                    <p className="kpi-label">Avg Transaction</p>
                    <p className="kpi-value">
                      ₹{(insights.avgTransaction / 100).toFixed(0)}
                    </p>
                  </div>
                  <TrendingUp className="kpi-icon kpi-icon-info" aria-hidden="true" />
                </div>
              </article>

              <article className="kpi-card">
                <div className="kpi-content">
                  <div>
                    <p className="kpi-label">Anomalies</p>
                    <p className="kpi-value">{insights.anomalies.length}</p>
                  </div>
                  <AlertTriangle className="kpi-icon kpi-icon-warning" aria-hidden="true" />
                </div>
              </article>
            </div>
          </section>

          {/* Charts */}
          <section aria-labelledby="charts-heading" className="charts-section">
            <h2 id="charts-heading" className="sr-only">Spending Charts</h2>
            <div className="charts-grid">
              {/* Monthly Trend */}
              <article className="card">
                <div className="card-header">
                  <h3 className="chart-title">Monthly Spend Trend</h3>
                </div>
                <div className="card-body">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={insights.monthlyTrend}>
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip
                        formatter={(value: number) => [`₹${(value / 100).toFixed(0)}`, 'Amount']}
                        contentStyle={{
                          backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-md)'
                        }}
                      />
                      <Bar dataKey="total" fill="var(--color-primary)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>

              {/* Category Breakdown */}
              <article className="card">
                <div className="card-header">
                  <h3 className="chart-title">Spending by Category</h3>
                </div>
                <div className="card-body">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={insights.categories}
                        dataKey="total"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={(entry) => `${entry.name} (${entry.percentage}%)`}
                      >
                        {insights.categories.map((_: any, index: number) => (
                          <Cell key={index} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [`₹${(value / 100).toFixed(0)}`, 'Amount']}
                        contentStyle={{
                          backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-md)'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </article>
            </div>
          </section>

          {/* Top Merchants */}
          <section aria-labelledby="merchants-heading" className="card">
            <div className="card-header">
              <h2 id="merchants-heading" className="chart-title">Top Merchants</h2>
            </div>
            <div className="card-body">
              <ul className="merchants-list">
                {insights.topMerchants.map((m: any, i: number) => (
                  <li key={i} className="merchant-item">
                    <div>
                      <p className="merchant-name">{m.merchant}</p>
                      <p className="merchant-count">{m.count} transactions</p>
                    </div>
                    <p className="merchant-total">
                      ₹{(m.total / 100).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Anomalies */}
          {insights.anomalies.length > 0 && (
            <section aria-labelledby="anomalies-heading" className="card">
              <div className="card-header">
                <h2 id="anomalies-heading" className="chart-title">
                  <AlertTriangle size={20} aria-hidden="true" />
                  Unusual Transactions
                </h2>
              </div>
              <div className="card-body">
                <ul className="anomalies-list">
                  {insights.anomalies.map((a: any) => (
                    <li key={a.id} className="anomaly-item">
                      <div>
                        <p className="anomaly-merchant">{a.merchant}</p>
                        <p className="anomaly-details">
                          {new Date(a.ts).toLocaleDateString()} • {a.zScore}x above average
                        </p>
                      </div>
                      <p className="anomaly-amount">
                        ₹{(a.amount / 100).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </>
      )}

      {!insights && !loading && (
        <section className="card">
          <div className="empty-state">
            <BarChart3 size={64} className="empty-icon" aria-hidden="true" />
            <p className="empty-title">Enter a customer ID to view insights</p>
            <p className="empty-subtitle">
              Tip: Open Prisma Studio (<code>npm run db:studio</code>) to find customer IDs
            </p>
          </div>
        </section>
      )}
    </div>
  );
}