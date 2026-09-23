import { useCallback, useState } from 'react';
import { openDocument } from './files';

/** Abre documentos del expediente mostrando cuál se está descargando y el error si falla. */
export function useOpenDocument() {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = useCallback(async (id: string, name: string) => {
    setPendingId(id);
    setError(null);
    try {
      await openDocument(id, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos abrir el documento.');
    } finally {
      setPendingId(null);
    }
  }, []);
  return { open, pendingId, error };
}
