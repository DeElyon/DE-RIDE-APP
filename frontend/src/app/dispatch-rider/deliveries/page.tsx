import { RiderModeSwitcher } from '@/components/rider-mode-switcher';
import Link from 'next/link';
export default function Dispatch(){return <main style={{padding:24}}><Link href="/">← DE RIDE</Link><h1>Dispatch deliveries</h1><p>Parcel jobs and proof-of-delivery require the parcel service and approved Dispatch Rider registration.</p><Link href="/login">Sign in →</Link><h2>Dual mode</h2><p>Switching requires approved Biker registration and no active ride or delivery.</p><RiderModeSwitcher target="BIKER" /></main>}
