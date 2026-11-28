'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

const STORAGE_KEY = 'de-ride-auto-theme';
function themeForTime(date: Date) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= 6 * 60 + 30 && minutes < 18 * 60 + 30 ? 'light' : 'dark';
}

export function ThemeMode({ inline = false }: { inline?: boolean }) {
  const [automatic, setAutomatic] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const enabled = saved !== 'light' && saved !== 'dark' && saved !== 'off';
    const selected: 'light' | 'dark' = saved === 'light' || saved === 'dark' ? saved : themeForTime(new Date());
    setAutomatic(enabled);
    setTheme(selected);
    document.documentElement.dataset.theme = selected;
    const timer = window.setInterval(() => {
      if (!['light', 'dark', 'off'].includes(window.localStorage.getItem(STORAGE_KEY) ?? '')) {
        const next = themeForTime(new Date());
        setTheme(next);
        document.documentElement.dataset.theme = next;
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setAutomatic(false); setTheme(next); document.documentElement.dataset.theme = next;
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  function enableAutomatic() {
    const next = themeForTime(new Date());
    setAutomatic(true); setTheme(next); document.documentElement.dataset.theme = next;
    window.localStorage.setItem(STORAGE_KEY, 'on');
  }

  return <div className={`theme-controls${inline ? ' theme-controls-inline' : ''}`}><button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
    {theme === 'light' ? <Sun size={16}/> : <Moon size={16}/>}<span>{theme === 'light' ? 'Light' : 'Dark'}</span>
  </button><button className={`theme-auto ${automatic ? 'is-active' : ''}`} type="button" onClick={enableAutomatic} aria-pressed={automatic} title="Use automatic sunrise and sunset theme">Auto {automatic ? 'on' : 'off'}</button></div>;
}
