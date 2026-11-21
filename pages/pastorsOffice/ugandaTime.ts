/** Uganda currently uses East Africa Time (UTC+03:00) without daylight saving. */
export const officeZone = 'Africa/Kampala';

export function ugandaInstant(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d, h, min] = match;
  const year=Number(y), month=Number(m), day=Number(d), hour=Number(h), minute=Number(min);
  if (year < 1970 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;
  const wall = new Date(Date.UTC(year,month-1,day,hour,minute));
  if (wall.getUTCFullYear()!==year || wall.getUTCMonth()!==month-1 || wall.getUTCDate()!==day) return null;
  return new Date(wall.getTime()-3*60*60*1000).toISOString();
}

export function ugandaDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:officeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part = (type: string) => parts.find(p=>p.type===type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function ugandaPeriod(day: string, view: 'day'|'week'|'month'): [number,number] | null {
  const start=ugandaInstant(`${day}T00:00`);
  if (!start) return null;
  const base=new Date(start);
  // UTC getters on a shifted instant give the calendar day in Uganda.
  const local=new Date(base.getTime()+3*60*60*1000);
  let from=base.getTime(),to: number;
  if (view==='month') {
    from=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),1)-3*60*60*1000;
    to=Date.UTC(local.getUTCFullYear(),local.getUTCMonth()+1,1)-3*60*60*1000;
  } else if (view==='week') {
    from-=local.getUTCDay()*86400000;
    to=from+7*86400000;
  } else to=from+86400000;
  return [from,to];
}
