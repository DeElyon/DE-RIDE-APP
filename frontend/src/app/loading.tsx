import Image from 'next/image';
export default function Loading(){return <main className="brand-loading" role="status" aria-live="polite"><span className="brand-loader-ring"><Image src="/icons/loader.svg" alt="" width={68} height={68} unoptimized/></span><b>DE RIDE</b><small>Preparing your workspace…</small></main>}
