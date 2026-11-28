'use client';

import { Settings2 } from 'lucide-react';

export function CookieSettingsButton() {
  return <button className="legal-action cookie-open-settings" type="button" onClick={() => window.dispatchEvent(new Event('de-ride-cookie-settings'))}>Manage browser storage choices <span><Settings2 size={15}/></span></button>;
}
