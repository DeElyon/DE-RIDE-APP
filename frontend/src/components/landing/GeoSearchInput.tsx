'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle, MapPin, Search } from 'lucide-react';
import { GeocodedPlace, searchPhoton } from './geocoding';

export function GeoSearchInput({ label, value, placeholder, onChange, onSelect }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; onSelect: (place: GeocodedPlace) => void }) {
  const [suggestions, setSuggestions] = useState<GeocodedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (value.trim().length < 3) { setSuggestions([]); setLoading(false); setError(''); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError('');
      try { setSuggestions(await searchPhoton(value.trim(), controller.signal)); setOpen(true); }
      catch (err) { if (!controller.signal.aborted) { setSuggestions([]); setError('Place suggestions are temporarily unavailable.'); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value]);

  const listId = `geo-${label.toLowerCase().replace(/[^a-z]+/g, '-')}-options`;
  return <div className="geo-field"><span className="geo-field-label">{label}</span><div className="geo-input-wrap"><Search size={14}/><input autoComplete="off" role="combobox" aria-controls={listId} aria-expanded={open && suggestions.length > 0} aria-autocomplete="list" placeholder={placeholder} value={value} onFocus={() => suggestions.length && setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 140)} onChange={e => { onChange(e.target.value); setOpen(true); }}/>{loading && <LoaderCircle className="geo-spinner" size={14}/>}</div>{error && <small className="geo-error">{error}</small>}{open && suggestions.length > 0 && <div id={listId} className="geo-suggestions" role="listbox">{suggestions.map((place,index)=><button type="button" role="option" aria-selected={false} key={`${place.longitude}:${place.latitude}:${index}`} onMouseDown={e=>e.preventDefault()} onClick={()=>{onSelect(place);setOpen(false);}}><MapPin size={14}/><span><b>{place.label.split(',')[0]}</b><small>{place.label.split(',').slice(1).join(',').trim()}</small></span></button>)}</div>}</div>;
}
