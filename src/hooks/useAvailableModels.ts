import { useState, useEffect } from 'react';
import { AVAILABLE_MODELS } from '../types';

export function useAvailableModels() {
  const [models, setModels] = useState(AVAILABLE_MODELS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        setModels(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch models:', err);
        setModels(AVAILABLE_MODELS); // fallback
        setLoading(false);
      });
  }, []);

  return { models, loading };
}
