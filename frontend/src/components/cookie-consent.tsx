'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cookie, Settings2, X } from 'lucide-react';

const STORAGE_KEY = 'de-ride-cookie-choice';
type Choice = 'all' | 'essential';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    setVisible(!window.localStorage.getItem(STORAGE_KEY));
    const reopen = () => { setSettings(true); setVisible(true); };
    window.addEventListener('de-ride-cookie-settings', reopen);
    return () => window.removeEventListener('de-ride-cookie-settings', reopen);
  }, []);

  function save(choice: Choice) {
    window.localStorage.setItem(STORAGE_KEY, choice);
    setVisible(false);
    setSettings(false);
  }

  if (!visible) return null;
  return <aside className="cookie-consent" aria-label="Cookie and storage preferences" aria-live="polite">
    <div className="cookie-consent-icon"><Cookie size={19}/></div>
    <div className="cookie-consent-copy">
      <strong>{settings ? 'Your privacy choices' : 'A little choice about your data'}</strong>
      <p>{settings ? 'Essential storage keeps sign-in, security, and your saved preferences working. Optional analytics are not enabled in this app.' : 'DE RIDE uses essential browser storage for sign-in, security, and your preferences. Optional analytics are not enabled.'} <Link href="/cookies">Cookie details</Link></p>
    </div>
    <div className="cookie-consent-actions">
      <button type="button" className="cookie-secondary" onClick={() => save('essential')}>Essential only</button>
      <button type="button" className="cookie-primary" onClick={() => save('all')}>Allow all</button>
      <button type="button" className="cookie-close" aria-label="Close cookie choices" onClick={() => save('essential')}><X size={16}/></button>
    </div>
    <button type="button" className="cookie-settings-reopen" onClick={() => setSettings(v => !v)}><Settings2 size={13}/>{settings ? 'Preferences' : 'Manage choices'}</button>
  </aside>;
}
