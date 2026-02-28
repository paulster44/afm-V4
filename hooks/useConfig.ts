
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
        const response = await fetch(`/public/configs/local_${localId}.json`);
        if (!response.ok) {
          throw new Error(`Could not load configuration for local ${localId}.`);
        }
        const data: Config = await response.json();
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
