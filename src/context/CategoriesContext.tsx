import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ServiceCategory, ServiceCategoryId } from '../data/mock';
import { fetchServiceCategories } from '../lib/api';
import { useAuth } from './AuthContext';

interface CategoriesContextValue {
  categories: ServiceCategory[];
  getCategory: (id: ServiceCategoryId) => ServiceCategory | undefined;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const CategoriesContext = createContext<CategoriesContextValue | undefined>(undefined);

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCategories(await fetchServiceCategories());
    } catch (e: any) {
      setError(e?.message ?? 'Kateqoriyalar yüklənmədi');
    } finally {
      setLoading(false);
    }
  }, []);

  // Categories are readable only by authenticated users (RLS), so load them
  // once a session exists and clear them on sign-out.
  useEffect(() => {
    if (session) load();
    else setCategories([]);
  }, [session, load]);

  const value = useMemo<CategoriesContextValue>(
    () => ({
      categories,
      loading,
      error,
      reload: load,
      getCategory: (id) => categories.find((c) => c.id === id),
    }),
    [categories, loading, error, load]
  );

  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}

export function useCategories() {
  const ctx = useContext(CategoriesContext);
  if (!ctx) throw new Error('useCategories must be used within CategoriesProvider');
  return ctx;
}
