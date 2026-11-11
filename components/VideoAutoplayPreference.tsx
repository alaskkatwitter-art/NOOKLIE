'use client';

import { createContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

export const VideoAutoplay = createContext<boolean | null>(null);
export const SetVideoAutoplay = createContext<Dispatch<SetStateAction<boolean | null>>>(() => {});

export default function VideoAutoplayPreference({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  return (
    <VideoAutoplay.Provider value={enabled}>
      <SetVideoAutoplay.Provider value={setEnabled}>{children}</SetVideoAutoplay.Provider>
    </VideoAutoplay.Provider>
  );
}
