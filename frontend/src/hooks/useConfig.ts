
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

        let response = await fetch(`/configs/local_${localId}.json`);
        if (!isJsonResponse(response)) {
          response = await fetch(`/configs/local_default.json`);
          if (!isJsonResponse(response)) {
            throw new Error(`Could not load configuration for local ${localId}.`);
          }
        }
        const rawData = await response.json();
        // Inject the correct localId and localName from locals.json if using default
        const localsRes = await fetch('/configs/locals.json');
        const localsData = localsRes.ok ? await localsRes.json() : { locals: [] };
        const localInfo = localsData.locals.find((l: { id: number; name: string }) => l.id === localId);
        const data: Config = {
          ...rawData,
          localId,
          localName: localInfo?.name ?? rawData.localName,
        };
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
