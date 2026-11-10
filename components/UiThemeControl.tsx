'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

const eventName = 'nooklie:ui-theme';
const storageKey = 'nooklie:ui-theme';
function apply(value: string) {
  document.documentElement.dataset.uiTheme = value === 'light' ? 'light' : 'dark';
  document.documentElement.style.colorScheme = value === 'light' ? 'light' : 'dark';
  window.dispatchEvent(new Event(eventName));
}
function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) apply(event.newValue || 'dark');
  };
  window.addEventListener(eventName, callback);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(eventName, callback); window.removeEventListener('storage', onStorage); };
}

export default function UiThemeControl() {
  const theme = useSyncExternalStore(subscribe, () => document.documentElement.dataset.uiTheme || 'dark', () => 'dark');
  return <fieldset className="ui-theme-control"><legend>Tema do aplicativo</legend>
    <div>{(['dark', 'light'] as const).map(value => <button type="button" key={value} aria-pressed={theme === value} onClick={() => {
      try { localStorage.setItem(storageKey, value); } catch { /* Selection still works in this tab. */ }
      apply(value);
    }}>{value === 'dark' ? <Moon size={17} aria-hidden="true"/> : <Sun size={17} aria-hidden="true"/>}{value === 'dark' ? 'Preto e rosa' : 'Branco e rosa'}</button>)}</div>
  </fieldset>;
}
