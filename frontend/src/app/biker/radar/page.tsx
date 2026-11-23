import { RiderModeSwitcher } from '@/components/rider-mode-switcher';
import Link from 'next/link';
export default function Biker(){return <main style={{padding:24}}><Link href="/">← DE RIDE</Link><h1>Biker radar</h1><p>Passenger ride requests appear here after the live matching service is configured.</p><Link href="/login">Sign in →</Link><h2>Dual mode</h2><p>Switching requires approved Dispatch Rider registration and no active ride or delivery.</p><RiderModeSwitcher target="DISPATCH_RIDER" /></main>}
