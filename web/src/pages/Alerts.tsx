import { useState, useEffect } from 'react';
import { AlertCircle, Play } from 'lucide-react';
import TriageDrawer from '../components/TriageDrawer';
import axios from 'axios';

interface Alert {
  id: string;
  customer_id: string;
  risk: string;
  status: string;
  reason: string;
  created_at: string;
  customer: {
    name: string;
    email: string;
  };
}

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<string | null>(null);
  const [triageRunId, setTriageRunId] = useState<string | null>(null);

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
      const { data } = await axios.get('http://localhost:3000/api/alerts');
      setAlerts(data.alerts || []);
    } catch (error) {
      console.error('Failed to load alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const startTriage = async (alertId: string) => {
    try {
      const { data } = await axios.post('http://localhost:3000/api/triage', {
        alertId
      });
      
      setSelectedAlert(alertId);
      setTriageRunId(data.runId);
    } catch (error) {
      console.error('Failed to start triage:', error);
      alert('Failed to start triage');
    }
  };

  const getRiskBadge = (risk: string) => {
    const colors = {
      high: 'bg-red-100 text-red-800 border-red-300',
      medium: 'bg-orange-100 text-orange-800 border-orange-300',
      low: 'bg-green-100 text-green-800 border-green-300'
    };
    return colors[risk as keyof typeof colors] || colors.low;
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="text-gray-600">Loading alerts...</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">Alerts Queue</h1>
          <p className="text-gray-600 mt-2">
            {alerts.length} open alerts require attention
          </p>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Customer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Risk
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Reason
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {alerts.map((alert) => (
              <tr key={alert.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div>
                    <div className="font-medium text-gray-900">
                      {alert.customer.name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {alert.customer.email}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold border ${getRiskBadge(
                      alert.risk
                    )}`}
                  >
                    {alert.risk.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {alert.reason || 'Unknown'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {new Date(alert.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => startTriage(alert.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                  >
                    <Play size={16} />
                    Open Triage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {alerts.length === 0 && (
          <div className="p-12 text-center text-gray-500">
            <AlertCircle size={48} className="mx-auto mb-4 text-gray-400" />
            <p>No alerts in queue</p>
          </div>
        )}
      </div>

      {/* Triage Drawer */}
      {selectedAlert && triageRunId && (
        <TriageDrawer
          runId={triageRunId}
          alertId={selectedAlert}
          onClose={() => {
            setSelectedAlert(null);
            setTriageRunId(null);
          }}
        />
      )}
    </div>
  );
}