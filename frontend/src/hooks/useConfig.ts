
import { useState, useEffect } from 'react';
import type { Config } from '../types';

export const useConfig = (localId: number) => {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      setError(null);
      try {
        // Try local-specific config first, fall back to shared config
        // NOTE: Firebase Hosting SPA rewrites return index.html with 200 for
        // missing paths, so we must check Content-Type, not just response.ok.
        const isJsonResponse = (r: Response) =>
          r.ok && (r.headers.get('content-type') ?? '').includes('json');

        const response = await fetch(`/api/locals/${localId}`);
        if (!isJsonResponse(response)) {
          throw new Error(`Could not load configuration for local ${localId}. The API might be down or the local configuration does not exist in the database.`);
        }
        const data = await response.json();

        // Ensure localId is attached
        if (!data.localId) {
          data.localId = localId;
        }

        setConfig(data);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('An unknown error occurred.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [localId]);

  return { config, loading, error };
};
