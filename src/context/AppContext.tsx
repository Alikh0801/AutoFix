import React, { createContext, useContext, useMemo, useState } from 'react';
import { ServiceCategoryId, Usta, mockUstas } from '../data/mock';

export type Role = 'customer' | 'provider';

interface ActiveRequest {
  category: ServiceCategoryId;
  note: string;
  usta: Usta;
}

interface AppContextValue {
  // Which mode the user is currently acting in. Every account can be both a
  // customer and a provider and flip between them inside the app.
  role: Role;
  setRole: (role: Role) => void;
  toggleRole: () => void;
  isOnline: boolean;
  setIsOnline: (v: boolean) => void;
  activeRequest: ActiveRequest | null;
  startRequest: (category: ServiceCategoryId, note: string) => void;
  clearRequest: () => void;
  resetApp: () => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>('customer');
  const [isOnline, setIsOnline] = useState(true);
  const [activeRequest, setActiveRequest] = useState<ActiveRequest | null>(null);

  const value = useMemo<AppContextValue>(
    () => ({
      role,
      setRole,
      toggleRole: () => setRole((r) => (r === 'customer' ? 'provider' : 'customer')),
      isOnline,
      setIsOnline,
      activeRequest,
      startRequest: (category, note) => {
        const usta = mockUstas[Math.floor(Math.random() * mockUstas.length)];
        setActiveRequest({ category, note, usta });
      },
      clearRequest: () => setActiveRequest(null),
      resetApp: () => {
        setRole('customer');
        setActiveRequest(null);
      },
    }),
    [role, isOnline, activeRequest]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
