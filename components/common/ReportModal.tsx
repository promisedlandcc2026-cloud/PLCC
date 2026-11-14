import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { useNav } from '../../App';
import { REPORT_EVENT, type ReportRequest } from '../../lib/report';
import ReportForm from './ReportForm';

/** Mounted once (AppShell). Listens for openReport() calls. */
export const ReportHost: React.FC = () => {
  const { userId } = useNav();
  const [request, setRequest] = useState<ReportRequest | null>(null);
  const [openKey, setOpenKey] = useState(0);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<ReportRequest>).detail;
      if (!detail) return;
      setRequest(detail);
      setOpenKey((k) => k + 1);
    };
    window.addEventListener(REPORT_EVENT, onOpen);
    return () => window.removeEventListener(REPORT_EVENT, onOpen);
  }, []);

  const send = useCallback(
    async (payload: Record<string, unknown>) => {
      try {
        await apiFetch('/api/vault?resource=report', {
          method: 'POST',
          userId,
          body: JSON.stringify(payload),
        });
      } catch (err) {
        throw new Error(err instanceof ApiError ? err.message : 'Could not send the report. Please try again.');
      }
    },
    [userId]
  );

  const close = useCallback(() => setRequest(null), []);

  if (!request) return null;
  return <ReportForm key={openKey} request={request} sourceApp="canaan" send={send} onClose={close} />;
};

export default ReportHost;
