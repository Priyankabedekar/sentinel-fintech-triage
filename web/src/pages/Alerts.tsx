import { useState, useEffect } from 'react';
import { AlertCircle, Play } from 'lucide-react';
import TriageDrawer from '../components/TriageDrawer';
import axios from 'axios';
import '../styles/Alerts.css';

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
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    setAnnouncement('Loading alerts...');
    try {
      const { data } = await axios.get('http://localhost:3000/api/alerts');
      setAlerts(data.alerts || []);
      setAnnouncement(`Loaded ${data.alerts?.length || 0} alerts`);
    } catch (error) {
      console.error('Failed to load alerts:', error);
      setAnnouncement('Failed to load alerts');
    } finally {
      setLoading(false);
    }
  };

  const startTriage = async (alertId: string) => {
    setAnnouncement('Starting triage analysis...');
    try {
      const { data } = await axios.post('http://localhost:3000/api/triage', {
        alertId
      });
      
      setSelectedAlert(alertId);
      setTriageRunId(data.runId);
      setAnnouncement('Triage started successfully');
    } catch (error) {
      console.error('Failed to start triage:', error);
      setAnnouncement('Failed to start triage analysis');
      alert('Failed to start triage');
    }
  };

  const getRiskClass = (risk: string) => {
    const classes = {
      high: 'badge-high',
      medium: 'badge-medium',
      low: 'badge-low'
    };
    return classes[risk as keyof typeof classes] || 'badge-low';
  };

  if (loading) {
    return (
      <div className="alerts-loading" role="status" aria-live="polite">
        <div className="skeleton" style={{ height: '4rem', width: '100%' }}></div>
        <div className="skeleton" style={{ height: '20rem', width: '100%', marginTop: 'var(--spacing-lg)' }}></div>
      </div>
    );
  }

  return (
    <div className="alerts-page">
      {/* Live region for announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      <header className="alerts-header">
        <div>
          <h1 className="alerts-title">Alerts Queue</h1>
          <p className="alerts-subtitle">
            <span className="sr-only">{alerts.length} alerts require attention</span>
            <span aria-hidden="true">
              {alerts.length} open alert{alerts.length !== 1 ? 's' : ''} require attention
            </span>
          </p>
        </div>
      </header>

      {/* Alerts Table */}
      <section aria-labelledby="alerts-table-heading">
        <h2 id="alerts-table-heading" className="sr-only">List of Alerts</h2>
        <div className="table-container">
          <table className="table" role="table">
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col">Risk Level</th>
                <th scope="col">Reason</th>
                <th scope="col">Created Date</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id}>
                  <td>
                    <div className="customer-cell">
                      <div className="customer-name">{alert.customer.name}</div>
                      <div className="customer-email">{alert.customer.email}</div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${getRiskClass(alert.risk)}`}>
                      <span className="sr-only">Risk level: </span>
                      {alert.risk.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span className="alert-reason">{alert.reason || 'Unknown'}</span>
                  </td>
                  <td>
                    <time dateTime={alert.created_at}>
                      {new Date(alert.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </time>
                  </td>
                  <td>
                    <button
                      onClick={() => startTriage(alert.id)}
                      className="btn btn-primary"
                      aria-label={`Open triage for ${alert.customer.name}`}
                    >
                      <Play size={16} aria-hidden="true" />
                      <span>Open Triage</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {alerts.length === 0 && (
            <div className="empty-state">
              <AlertCircle size={48} className="empty-icon" aria-hidden="true" />
              <p className="empty-title">No alerts in queue</p>
              <p className="empty-subtitle">All clear! No alerts require attention at this time.</p>
            </div>
          )}
        </div>
      </section>

      {/* Triage Drawer */}
      {selectedAlert && triageRunId && (
        <TriageDrawer
          runId={triageRunId}
          alertId={selectedAlert}
          onClose={() => {
            setSelectedAlert(null);
            setTriageRunId(null);
            setAnnouncement('Triage drawer closed');
          }}
        />
      )}
    </div>
  );
}