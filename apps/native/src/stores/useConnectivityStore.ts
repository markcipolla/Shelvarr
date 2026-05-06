import { create } from 'zustand';

interface ConnectivityState {
  online: boolean;
  setOnline: (online: boolean) => void;
}

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  online: true,
  setOnline: (online) => set({ online }),
}));
