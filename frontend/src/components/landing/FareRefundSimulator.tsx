'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowRightLeft, Check, Wallet } from 'lucide-react';

type RefundKind = 'cancel' | 'late' | 'no-show';
export function FareRefundSimulator() {
  const [fare, setFare] = useState(3500);
  const [refund, setRefund] = useState<RefundKind>('cancel');
  const [destination, setDestination] = useState<'wallet'|'bank'>('wallet');
  const fee = useMemo(() => Math.min(2000, Math.round((fare + 20) * 0.015 + (fare + 20 < 2500 ? 0 : 100))), [fare]);
  const amount = refund === 'cancel' ? fare : refund === 'late' ? Math.floor(fare * .8) : Math.floor(fare * .4);
  const labels: Record<RefundKind,string> = { cancel: 'Cancel before departure · 100%', late: 'Late arrival · 80%', 'no-show': 'No-show · 40%' };
  return <div className="simulator"><div className="simulator-input"><div className="sim-label">TICKET BASE FARE</div><div className="fare-input"><span>₦</span><input aria-label="Ticket fare" type="number" min={0} max={500000} step={100} value={fare} onChange={e=>setFare(Math.max(0,Math.min(500000,Number(e.target.value)||0)))}/></div><input aria-label="Adjust ticket fare" className="fare-slider" type="range" min={500} max={20000} step={100} value={Math.max(500,Math.min(20000,fare))} onChange={e=>setFare(Number(e.target.value))}/><div className="range-labels"><span>₦500</span><span>₦20,000</span></div><p>Move the slider or enter any fare amount.</p></div><div className="simulator-breakdown"><h3>Your checkout</h3><div className="break-row"><span>Base fare</span><b>₦{fare.toLocaleString()}</b></div><div className="break-row"><span>DE RIDE platform fee</span><b>₦20</b></div><div className="break-row"><span>Paystack processing <small>(1.5% + ₦100*)</small></span><b>₦{fee.toLocaleString()}</b></div><div className="break-total"><span>Total at checkout</span><b>₦{(fare+20+fee).toLocaleString()}</b></div><small className="fee-note">*₦100 waived when subtotal is under ₦2,500. Fee capped at ₦2,000.</small></div><div className="simulator-refund"><div className="sim-label">REFUND PREVIEW</div><div className="refund-options">{(Object.keys(labels) as RefundKind[]).map(key=><button className={refund===key?'active':''} onClick={()=>setRefund(key)} key={key}>{labels[key]}</button>)}</div><div className="refund-result"><span>Refund to {destination==='wallet'?'DE RIDE Wallet':'original bank account'}</span><b>₦{amount.toLocaleString()}</b></div><div className="destination-toggle"><button className={destination==='wallet'?'active':''} onClick={()=>setDestination('wallet')}><Wallet size={15}/> DE RIDE Wallet</button><button className={destination==='bank'?'active':''} onClick={()=>setDestination('bank')}><ArrowRightLeft size={15}/> Original bank</button></div><p><Check size={14}/> Refund applies to base fare only. ₦20 platform and Paystack fees are non-refundable.</p></div></div>;
}
