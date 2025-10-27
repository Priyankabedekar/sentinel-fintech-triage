/* eslint-disable @typescript-eslint/no-explicit-any */
import { X, CheckCircle, AlertCircle, Loader2, Clock, Shield } from 'lucide-react';
import { useTriageStream } from '../hooks/useTriageStream';
import { useState, useEffect, useRef } from 'react';
import '../styles/TriageDrawer.css';
import axios from 'axios';

interface TriageDrawerProps {
  runId: string | null;
  alert: any;
  onClose: () => void;
}

export default function TriageDrawer({ runId, alert: alertData, onClose }: TriageDrawerProps) {
  const { events, isComplete, error } = useTriageStream(runId);
  const [actionTaken, setActionTaken] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Save focus on mount, restore on unmount
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  // Announce latest event
  useEffect(() => {
    const lastEvent = events.at(-1);
    if (!lastEvent) return;

    if (lastEvent.type === 'step') {
      const step = lastEvent.data;
      setAnnouncement(
        `Step ${step.name} ${step.success ? 'completed' : 'failed'} in ${step.duration_ms} milliseconds`
      );
    } else if (lastEvent.type === 'complete') {
      setAnnouncement('Triage analysis complete. Review the recommendations.');
    } else if (lastEvent.type === 'error') {
      setAnnouncement(`Error: ${lastEvent.data?.message || 'Unknown error'}`);
    }
  }, [events]);

  const steps = events.filter(e => e.type === 'step');
  const completeEvent = events.find(e => e.type === 'complete');
  const result = completeEvent?.data;

  const getRiskColor = (risk?: string) => {
    switch (risk) {
      case 'high': return 'risk-high';
      case 'medium': return 'risk-medium';
      default: return 'risk-low';
    }
  };

  const getRecommendationText = (rec?: string) => {
    switch (rec) {
      case 'freeze_card': return '🧊 Freeze Card';
      case 'contact_customer': return '📞 Contact Customer';
      case 'mark_false_positive': return '✅ Mark False Positive';
      default: return 'Analyzing...';
    }
  };

  const handleAction = async (action: string) => {
    setAnnouncement(`Executing action: ${action}...`);
    try {
      let response;

      if (action === 'freeze_card') {
        const profile = await axios.get(`http://localhost:3000/api/customer/${alertData.customer_id}/profile`);
        const cardId = profile.data.cards[0]?.id;

        if (!cardId) {
          window.alert('No card found for this customer');
          return;
        }

        response = await axios.post('http://localhost:3000/api/action/freeze-card', {
          cardId,
          reason: 'suspected_fraud',
        });

        if (response.data.status === 'PENDING_OTP') {
          const otp = window.prompt('⚠️ OTP Required\n\nThis is a high-value account.\nEnter OTP (demo: 123456)');
          if (!otp) {
            setAnnouncement('OTP verification cancelled');
            return;
          }

          response = await axios.post('http://localhost:3000/api/action/freeze-card', {
            cardId,
            otp,
            reason: 'suspected_fraud',
          });
        }
      } 
      else if (action === 'open_dispute') {
        if (!alertData.suspect_txn_id) {
          window.alert('No transaction associated with this alert');
          return;
        }

        response = await axios.post('http://localhost:3000/api/action/open-dispute', {
          txnId: alertData.suspect_txn_id,
          reasonCode: '10.4',
          description: 'Customer did not authorize transaction',
          confirm: true,
        });
      } 
      else if (action === 'mark_false_positive') {
        response = await axios.post('http://localhost:3000/api/action/mark-false-positive', {
          alertId: alertData.id,
          notes: 'Verified with customer - legitimate transaction',
        });
      }

      if (response?.data) {
        setActionTaken(true);
        setAnnouncement(`Action completed: ${response.data.message}`);
        const message = `✅ Success!\n\n${response.data.message}\n\n` +
          `Case ID: ${response.data.caseId || 'N/A'}\n` +
          `Status: ${response.data.status}`;
        window.alert(message);
      }
    } catch (err: any) {
      console.error('Action error:', err);
      const msg = err.response?.data?.error || 'Action failed';
      setAnnouncement(`Action failed: ${msg}`);
      window.alert(`❌ Error: ${msg}`);
    }
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="triage-title"
      aria-describedby="triage-description"
    >
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <div className="modal triage-drawer">
        <header className="modal-header">
          <div>
            <h2 id="triage-title" className="triage-title">AI Triage Analysis</h2>
            <p id="triage-description" className="triage-subtitle">
              {alertData.customer.name} • Alert: {alertData.id.slice(0, 8)}...
            </p>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="close-button"
            aria-label="Close triage drawer"
          >
            <X size={24} aria-hidden="true" />
          </button>
        </header>

        <div className="modal-content">
          <section aria-labelledby="steps-heading">
            <h3 id="steps-heading" className="sr-only">Analysis Steps</h3>
            <ol className="steps-list">
              {steps.map((step, i) => {
                const { name, success, duration_ms, result, error: stepError } = step.data;
                return (
                  <li key={i} className={`step-item ${success ? 'step-success' : 'step-error'}`}>
                    <div className="step-header">
                      <div className="step-title-group">
                        {success ? <CheckCircle className="step-icon" /> : <AlertCircle className="step-icon" />}
                        <span className="step-name">{name.replace(/([A-Z])/g, ' $1').trim()}</span>
                      </div>
                      <div className="step-duration">
                        <Clock size={14} />
                        <span>{duration_ms}ms</span>
                      </div>
                    </div>
                    {result && (
                      <details className="step-details">
                        <summary className="step-summary">View details</summary>
                        <pre className="step-result">{JSON.stringify(result, null, 2)}</pre>
                      </details>
                    )}
                    {stepError && <div className="step-error-message">Error: {stepError}</div>}
                  </li>
                );
              })}
            </ol>
          </section>

          {!isComplete && !error && (
            <div className="loading-indicator" role="status" aria-live="polite">
              <Loader2 className="loading-spinner" />
              <span>Processing triage...</span>
            </div>
          )}

          {error && (
            <div className="alert alert-danger">
              <AlertCircle size={20} />
              <span>Error: {error}</span>
            </div>
          )}

          {result && (
            <section aria-labelledby="results-heading" className="results-section">
              <h3 id="results-heading" className="results-title">
                <Shield size={24} />
                Decision Summary
              </h3>

              <div className={`risk-card ${getRiskColor(result.risk)}`}>
                <div className="risk-content">
                  <span className="risk-label">Risk Level</span>
                  <span className="risk-value">{result.risk}</span>
                </div>
              </div>

              <div className="recommendation-card">
                <div className="recommendation-label">Recommended Action</div>
                <div className="recommendation-value">{getRecommendationText(result.recommendation)}</div>
                <div className="recommendation-confidence">
                  Confidence: {(result.confidence * 100).toFixed(0)}%
                </div>
              </div>

              <div className="reasons-card">
                <div className="reasons-label">Risk Indicators</div>
                <ul className="reasons-list">
                  {result.reasons.map((reason: string, i: number) => (
                    <li key={i} className="reason-badge">{reason.replace(/_/g, ' ')}</li>
                  ))}
                </ul>
              </div>

              <div className="performance-card">
                <div className="performance-label"><span>Total Duration</span></div>
                <span className="performance-value">{result.totalDuration}ms</span>
              </div>

              {result.fallbackUsed && (
                <div className="alert alert-warning">⚠️ Fallback strategy used due to service unavailability</div>
              )}
            </section>
          )}
        </div>

        {isComplete && result && (
          <footer className="modal-footer">
            <div className="action-buttons">
              <button onClick={() => handleAction('freeze_card')} disabled={actionTaken} className="btn btn-danger action-btn">
                🧊 Freeze Card
              </button>
              <button onClick={() => handleAction('open_dispute')} disabled={actionTaken} className="btn btn-primary action-btn">
                📋 Open Dispute
              </button>
              <button onClick={() => handleAction('mark_false_positive')} disabled={actionTaken} className="btn btn-success action-btn">
                ✅ Mark False Positive
              </button>
            </div>

            <div className={`action-message-container ${actionTaken ? 'visible' : ''}`}>
              <div className="action-message">✅ Action recorded!</div>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}