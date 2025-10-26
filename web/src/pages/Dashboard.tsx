/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { getInsights } from '../lib/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, DollarSign, ShoppingBag, AlertTriangle } from 'lucide-react';

export default function Dashboard() {
  const [customerId, setCustomerId] = useState('');
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rateLimited, setRateLimited] = useState(false);

  const loadInsights = async () => {
    if (!customerId) return;
    
    setLoading(true);
    setError('');
    setRateLimited(false);
    
    try {
      const { data } = await getInsights(customerId);
      setInsights(data);
    } catch (err: any) {
      if (err.response?.status === 429) {
        setRateLimited(true);
        setError('⏱️ Rate limited! Please wait a moment...');
        setTimeout(() => setRateLimited(false), 2000);
      } else {
        setError(err.response?.data?.error || 'Failed to load insights');
      }
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">Customer Insights Dashboard</h1>
        
        {/* Input */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Enter Customer ID (from Prisma Studio)"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={loadInsights}
              disabled={loading || !customerId || rateLimited}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
            >
              {loading ? 'Loading...' : rateLimited ? 'Rate Limited' : 'Load Insights'}
            </button>
          </div>
          {error && (
            <div className={`mt-4 p-4 rounded-lg ${rateLimited ? 'bg-yellow-50 text-yellow-800' : 'bg-red-50 text-red-800'}`}>
              {error}
            </div>
          )}
        </div>

        {/* KPIs */}
        {insights && (
          <>
            <div className="grid grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Spend</p>
                    <p className="text-2xl font-bold text-gray-900">
                      ₹{(insights.totalSpend / 100).toLocaleString()}
                    </p>
                  </div>
                  <DollarSign className="text-blue-500" size={32} />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Transactions</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {insights.transactionCount}
                    </p>
                  </div>
                  <ShoppingBag className="text-green-500" size={32} />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Avg Transaction</p>
                    <p className="text-2xl font-bold text-gray-900">
                      ₹{(insights.avgTransaction / 100).toFixed(0)}
                    </p>
                  </div>
                  <TrendingUp className="text-purple-500" size={32} />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Anomalies</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {insights.anomalies.length}
                    </p>
                  </div>
                  <AlertTriangle className="text-orange-500" size={32} />
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              {/* Monthly Trend */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Monthly Spend Trend</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={insights.monthlyTrend}>
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => `₹${(value / 100).toFixed(0)}`} />
                    <Bar dataKey="total" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Category Breakdown */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Spending by Category</h2>
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
                    <Tooltip formatter={(value: number) => `₹${(value / 100).toFixed(0)}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Merchants */}
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Top Merchants</h2>
              <div className="space-y-3">
                {insights.topMerchants.map((m: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div>
                      <p className="font-semibold text-gray-900">{m.merchant}</p>
                      <p className="text-sm text-gray-600">{m.count} transactions</p>
                    </div>
                    <p className="text-lg font-bold text-blue-600">
                      ₹{(m.total / 100).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Anomalies */}
            {insights.anomalies.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">⚠️ Unusual Transactions</h2>
                <div className="space-y-3">
                  {insights.anomalies.map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded">
                      <div>
                        <p className="font-semibold text-gray-900">{a.merchant}</p>
                        <p className="text-sm text-gray-600">
                          {new Date(a.ts).toLocaleDateString()} • {a.zScore}x above average
                        </p>
                      </div>
                      <p className="text-lg font-bold text-orange-600">
                        ₹{(a.amount / 100).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!insights && !loading && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600 text-lg">
              Enter a customer ID above to view insights
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Tip: Open Prisma Studio (<code>npm run db:studio</code>) to find customer IDs
            </p>
          </div>
        )}
      </div>
    </div>
  );
}