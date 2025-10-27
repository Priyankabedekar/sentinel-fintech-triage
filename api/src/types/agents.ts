export interface AgentStep {
  name: string;
  duration_ms: number;
  success: boolean;
  result?: any;
  error?: string;
}

export interface TriageResult {
  runId: string;
  alertId: string;
  risk: 'low' | 'medium' | 'high';
  reasons: string[];
  recommendation: string;
  confidence: number;
  steps: AgentStep[];
  fallbackUsed: boolean;
  totalDuration: number;
}

export interface StreamEvent {
  type: 'start' | 'step' | 'fallback' | 'complete' | 'error';
  data: any;
  timestamp: string;
}