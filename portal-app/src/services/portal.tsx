import {createContext, useContext, useEffect, useState} from 'react';
import {loadPortal, type PortalSnapshot} from './siga';

interface PortalState {
  data: PortalSnapshot | null;
  ready: boolean;
  reload: () => Promise<void>;
}

const PortalContext = createContext<PortalState>({data: null, ready: false, reload: async () => {}});

export function PortalProvider({children}: {children: React.ReactNode}) {
  const [data, setData] = useState<PortalSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  async function reload() {
    const next = await loadPortal();
    setData(next);
    setReady(true);
  }
  useEffect(() => { reload(); }, []);
  return <PortalContext.Provider value={{data, ready, reload}}>{children}</PortalContext.Provider>;
}

export function usePortal() {
  return useContext(PortalContext);
}

export type {PortalSnapshot};
