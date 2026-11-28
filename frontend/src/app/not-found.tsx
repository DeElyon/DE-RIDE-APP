import Link from 'next/link';
import { ArrowLeft, Map } from 'lucide-react';

export default function NotFound() {
  return <main className="app-error-page"><section className="app-error-card"><span className="app-error-icon"><Map size={24}/></span><small>DE RIDE · PAGE NOT FOUND</small><h1>This route isn’t on the map.</h1><p>The link may have moved. Return to the home page or open your travel workspace.</p><div><Link href="/"><ArrowLeft size={16}/> Back to DE RIDE</Link><Link href="/passenger/explore">Explore trips</Link></div></section></main>;
}
