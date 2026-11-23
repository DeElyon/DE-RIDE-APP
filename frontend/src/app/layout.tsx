import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
import type { Metadata } from 'next';
import { ServiceWorker } from './service-worker';
export const metadata: Metadata = { title:'DE RIDE', description:'Move with confidence across Nigeria', manifest:'/manifest.json', themeColor:'#1B2428' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body><ServiceWorker />{children}</body></html>; }
