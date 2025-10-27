import { X, CheckCircle, AlertCircle, Loader2, Clock, Shield } from 'lucide-react';
import { useTriageStream } from '../hooks/useTriageStream';
import { useState, useEffect, useRef } from 'react';
import '../styles/TriageDrawer.css';

interface TriageDrawerProps {
  runId: string | null;
  alertId: string;
  onClose: () => void;
}

export default function TriageDrawer({ runId, alertId, onClose }: TriageDrawerProps) {
  const { events, isComplete, error } = useTriageStream(runId);
  const [actionTaken, setActionTaken] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Save focus on mount, restore on unmount
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    closeButtonRef.current?.focus();

    // Trap focus within drawer
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  // Announce events to screen readers
  useEffect(() => {
    const lastEvent = events[events.length - 1];
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
    if (risk === 'high') return 'risk-high';
    if (risk === 'medium') return 'risk-medium';
    return 'risk-low';
  };

  const getRecommendationText = (rec?: string) => {
    if (rec === 'freeze_card') return '🧊 Freeze Card';
    if (rec === 'contact_customer') return '📞 Contact Customer';
    if (rec === 'mark_false_positive') return '✅ Mark False Positive';
    return 'Analyzing...';
  };

  const handleAction = (action: string) => {
    setAnnouncement(`Action ${action} recorded. Full implementation coming in Day 5.`);
    alert(`Action: ${action}\n(API endpoints will be built in Day 5)`);
    setActionTaken(true);
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="triage-title"
      aria-describedby="triage-description"
    >
      {/* Live region for announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      <div className="modal triage-drawer">
        {/* Header */}
        <header className="modal-header">
          <div>
            <h2 id="triage-title" className="triage-title">
              AI Triage Analysis
            </h2>
            <p id="triage-description" className="triage-subtitle">
              Alert: {alertId.slice(0, 13)}...
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

        {/* Content */}
        <div className="modal-content">
          {/* Progress Steps */}
          <section aria-labelledby="steps-heading">
            <h3 id="steps-heading" className="sr-only">Analysis Steps</h3>
            <ol className="steps-list">
              {steps.map((step, i) => {
                const stepData = step.data;
                return (
                  <li
                    key={i}
                    className={`step-item ${stepData.success ? 'step-success' : 'step-error'}`}
                  >
                    <div className="step-header">
                      <div className="step-title-group">
                        {stepData.success ? (
                          <CheckCircle className="step-icon" aria-label="Success" />
                        ) : (
                          <AlertCircle className="step-icon" aria-label="Error" />
                        )}
                        <span className="step-name">
                          {stepData.name.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                      </div>
                      <div className="step-duration">
                        <Clock size={14} aria-hidden="true" />
                        <span>{stepData.duration_ms}ms</span>
                      </div>
                    </div>
                    
                    {stepData.result && (
                      <details className="step-details">
                        <summary className="step-summary">View details</summary>
                        <pre className="step-result">
                          {JSON.stringify(stepData.result, null, 2)}
                        </pre>
                      </details>
                    )}
                    
                    {stepData.error && (
                      <div className="step-error-message" role="alert">
                        Error: {stepData.error}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Loading indicator */}
          {!isComplete && !error && (
            <div className="loading-indicator" role="status" aria-live="polite">
              <Loader2 className="loading-spinner" aria-hidden="true" />
              <span>Processing triage...</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="alert alert-danger" role="alert">
              <AlertCircle size={20} aria-hidden="true" />
              <span>Error: {error}</span>
            </div>
          )}

          {/* Result Summary */}
          {result && (
            <section aria-labelledby="results-heading" className="results-section">
              <h3 id="results-heading" className="results-title">
                <Shield size={24} aria-hidden="true" />
                Decision Summary
              </h3>

              {/* Risk Level */}
              <div className={`risk-card ${getRiskColor(result.risk)}`}>
                <div className="risk-content">
                  <span className="risk-label">Risk Level</span>
                  <span className="risk-value">{result.risk}</span>
                </div>
              </div>

              {/* Recommendation */}
              <div className="recommendation-card">
                <div className="recommendation-label">Recommended Action</div>
                <div className="recommendation-value">
                  {getRecommendationText(result.recommendation)}
                </div>
                <div className="recommendation-confidence">
                  Confidence: {(result.confidence * 100).toFixed(0)}%
                </div>
              </div>

              {/* Reasons */}
              <div className="reasons-card">
                <div className="reasons-label">Risk Indicators</div>
                <ul className="reasons-list">
                  {result.reasons.map((reason: string, i: number) => (
                    <li key={i} className="reason-badge">
                      {reason.replace(/_/g, ' ')}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Performance */}
              <div className="performance-card">
                <div className="performance-label">
                  <span>Total Duration</span>
                </div>
                <span className="performance-value">
                  {result.totalDuration}ms
                </span>
              </div>

              {result.fallbackUsed && (
                <div className="alert alert-warning" role="alert">
                  ⚠️ Fallback strategy was used due to service unavailability
                </div>
              )}
            </section>
          )}
        </div>

        {/* Actions */}
        {isComplete && result && (
          <footer className="modal-footer">
            <div className="action-buttons">
              <button
                onClick={() => handleAction('freeze_card')}
                disabled={actionTaken}
                className="btn btn-danger action-btn"
                aria-label="Freeze card"
              >
                🧊 Freeze Card
              </button>
              <button
                onClick={() => handleAction('open_dispute')}
                disabled={actionTaken}
                className="btn btn-primary action-btn"
                aria-label="Open dispute"
              >
                📋 Open Dispute
              </button>
            </div>
            <button
              onClick={() => handleAction('mark_false_positive')}
              disabled={actionTaken}
              className="btn btn-success action-btn-full"
              aria-label="Mark as false positive"
            >
              ✅ Mark False Positive
            </button>
            
            {actionTaken && (
              <div className="action-message" role="status" aria-live="polite">
                Action recorded! (Full implementation later!)
              </div>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}