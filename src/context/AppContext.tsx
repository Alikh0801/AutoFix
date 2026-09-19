import React, { createContext, useContext, useMemo, useState } from 'react';

export type Role = 'customer' | 'provider';

interface AppContextValue {
  // Which mode the user is currently acting in. Every account can be both a
  // customer and a provider and flip between them inside the app.
  role: Role;
  setRole: (role: Role) => void;
  toggleRole: () => void;
  isOnline: boolean;
  setIsOnline: (v: boolean) => void;
  resetApp: () => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>('customer');
  // Providers opt in explicitly. Defaulting to true put every user who so much
  // as opened provider mode online — broadcasting their GPS position — without
  // them ever touching the switch.
  const [isOnline, setIsOnline] = useState(false);

  const value = useMemo<AppContextValue>(
    () => ({
      role,
      setRole,
      toggleRole: () => setRole((r) => (r === 'customer' ? 'provider' : 'customer')),
      isOnline,
      setIsOnline,
      resetApp: () => {
        setRole('customer');
        setIsOnline(false);
      },
    }),
    [role, isOnline]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
