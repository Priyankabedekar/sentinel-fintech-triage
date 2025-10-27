import { X, CheckCircle, AlertCircle, Loader2, Clock, TrendingUp, Shield } from 'lucide-react';
import { useTriageStream } from '../hooks/useTriageStream';
import { useState } from 'react';

interface TriageDrawerProps {
  runId: string | null;
  alertId: string;
  onClose: () => void;
}

export default function TriageDrawer({ runId, alertId, onClose }: TriageDrawerProps) {
  const { events, isComplete, error } = useTriageStream(runId);
  const [actionTaken, setActionTaken] = useState(false);

  const steps = events.filter(e => e.type === 'step');
  const completeEvent = events.find(e => e.type === 'complete');
  const result = completeEvent?.data;

  const getRiskColor = (risk?: string) => {
    if (risk === 'high') return 'text-red-600 bg-red-50 border-red-200';
    if (risk === 'medium') return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-green-600 bg-green-50 border-green-200';
  };

  const getRecommendationText = (rec?: string) => {
    if (rec === 'freeze_card') return '🧊 Freeze Card';
    if (rec === 'contact_customer') return '📞 Contact Customer';
    if (rec === 'mark_false_positive') return '✅ Mark False Positive';
    return 'Analyzing...';
  };

  const handleAction = (action: string) => {
    alert(`Action: ${action}\n(API endpoints will be built in Day 5)`);
    setActionTaken(true);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center bg-gradient-to-r from-blue-500 to-purple-600 text-white">
          <div>
            <h2 className="text-2xl font-bold">AI Triage Analysis</h2>
            <p className="text-sm text-blue-100">Alert: {alertId.slice(0, 8)}...</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Progress Steps */}
          <div className="space-y-3">
            {steps.map((step, i) => {
              const stepData = step.data;
              return (
                <div
                  key={i}
                  className={`p-4 rounded-lg border-2 ${
                    stepData.success
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      {stepData.success ? (
                        <CheckCircle className="text-green-600" size={20} />
                      ) : (
                        <AlertCircle className="text-red-600" size={20} />
                      )}
                      <span className="font-semibold text-gray-900">
                        {stepData.name.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Clock size={14} />
                      <span>{stepData.duration_ms}ms</span>
                    </div>
                  </div>
                  
                  {stepData.result && (
                    <pre className="text-xs bg-white p-3 rounded border mt-2 overflow-auto max-h-32">
                      {JSON.stringify(stepData.result, null, 2)}
                    </pre>
                  )}
                  
                  {stepData.error && (
                    <div className="text-sm text-red-700 mt-2">
                      Error: {stepData.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Loading indicator */}
          {!isComplete && !error && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
              <Loader2 className="animate-spin text-blue-600" size={20} />
              <span className="text-blue-900 font-medium">
                Processing triage...
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 border-2 border-red-200 rounded-lg">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle size={20} />
                <span className="font-semibold">Error: {error}</span>
              </div>
            </div>
          )}

          {/* Result Summary */}
          {result && (
            <div className="space-y-4 pt-4 border-t-2">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Shield size={24} className="text-blue-600" />
                Decision Summary
              </h3>

              {/* Risk Level */}
              <div className={`p-4 rounded-lg border-2 ${getRiskColor(result.risk)}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-lg">Risk Level</span>
                  <span className="font-bold text-2xl uppercase">{result.risk}</span>
                </div>
              </div>

              {/* Recommendation */}
              <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
                <div className="font-semibold text-gray-700 mb-2">Recommended Action</div>
                <div className="text-xl font-bold text-blue-900">
                  {getRecommendationText(result.recommendation)}
                </div>
                <div className="text-sm text-gray-600 mt-2">
                  Confidence: {(result.confidence * 100).toFixed(0)}%
                </div>
              </div>

              {/* Reasons */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="font-semibold text-gray-700 mb-2">Risk Indicators</div>
                <div className="flex flex-wrap gap-2">
                  {result.reasons.map((reason: string, i: number) => (
                    <span
                      key={i}
                      className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-medium"
                    >
                      {reason.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>

              {/* Performance */}
              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <TrendingUp className="text-purple-600" size={20} />
                  <span className="text-sm font-medium text-gray-700">Total Duration</span>
                </div>
                <span className="font-bold text-purple-900">
                  {result.totalDuration}ms
                </span>
              </div>

              {result.fallbackUsed && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                  ⚠️ Fallback strategy was used due to service unavailability
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {isComplete && result && (
          <div className="p-6 border-t bg-gray-50 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleAction('freeze_card')}
                disabled={actionTaken}
                className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition"
              >
                🧊 Freeze Card
              </button>
              <button
                onClick={() => handleAction('open_dispute')}
                disabled={actionTaken}
                className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition"
              >
                📋 Open Dispute
              </button>
            </div>
            <button
              onClick={() => handleAction('mark_false_positive')}
              disabled={actionTaken}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition"
            >
              ✅ Mark False Positive
            </button>
            
            {actionTaken && (
              <div className="text-center text-sm text-gray-600">
                Action recorded! (Full implementation in Day 5)
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}