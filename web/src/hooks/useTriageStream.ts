import { useEffect, useState } from 'react';

export interface TriageEvent {
  type: 'connected' | 'start' | 'step' | 'fallback' | 'complete' | 'error';
  data?: any;
  timestamp?: string;
}

export function useTriageStream(runId: string | null) {
  const [events, setEvents] = useState<TriageEvent[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;

    const eventSource = new EventSource(
      `http://localhost:3000/api/triage/${runId}/stream`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data) as TriageEvent;
      
      setEvents(prev => [...prev, data]);

      if (data.type === 'complete') {
        setIsComplete(true);
        eventSource.close();
      } else if (data.type === 'error') {
        setError(data.data?.message || 'Unknown error');
        eventSource.close();
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err);
      setError('Connection lost');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [runId]);

  return { events, isComplete, error };
}