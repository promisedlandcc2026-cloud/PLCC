import React from 'react';
import { ugandaDate, ugandaInstant } from './ugandaTime';

/** A month picker, not an availability grid: the agenda remains the source of appointments. */
export default function CalendarGrid({day,onSelect}:{day:string;onSelect:(date:string)=>void}) {
  if (!ugandaInstant(`${day}T00:00`)) return null;
  const [year,month]=day.split('-').map(Number);
  const first=new Date(Date.UTC(year,month-1,1)).getUTCDay();
  const count=new Date(Date.UTC(year,month,0)).getUTCDate();
  const today=ugandaDate();
  const cells=Array.from({length:Math.ceil((first+count)/7)*7},(_,i)=>i-first+1);
  return <div className="mt-5 overflow-hidden rounded-xl border border-[#dce3ec]" aria-label="Choose a calendar date">
    <div className="grid grid-cols-7 bg-[#f4f6f9] text-center text-[11px] font-bold uppercase tracking-wider text-[#66758b]">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(label=><span key={label} className="py-3">{label}</span>)}</div>
    <div className="grid grid-cols-7 bg-white">{cells.map((n,i)=>{
      if(n<1||n>count)return <span key={`empty-${i}`} className="min-h-[48px] border-t border-[#edf0f4] bg-[#fafbfc] sm:min-h-[58px]" aria-hidden="true"/>;
      const value=`${year}-${String(month).padStart(2,'0')}-${String(n).padStart(2,'0')}`;
      const selected=value===day,isToday=value===today;
      return <button key={value} type="button" aria-label={`${value}${isToday?', today':''}`} aria-pressed={selected} onClick={()=>onSelect(value)} className="flex min-h-[48px] items-center justify-center border-t border-[#edf0f4] text-sm transition hover:bg-[#f2f5f9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b68a2a] sm:min-h-[58px]"><span className={`flex h-9 w-9 items-center justify-center rounded-full ${selected?'bg-[#102d50] font-bold text-white':isToday?'border border-[#c49a3e] font-semibold text-[#102d50]':'text-[#293e5c]'}`}>{n}</span></button>;
    })}</div>
  </div>;
}
