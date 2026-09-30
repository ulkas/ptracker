import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { db, makeId, notifyDbChanged, readAllData } from './db';
import { aggregate, APP_DATA_LIMIT_BYTES, durationLabel, filterSessions, money, parseMoney, potOdds, quotaLevel, sessionMetrics, utf8Size } from './domain';
import { createBackup, downloadFile, restoreBackup, sessionsCsv, validateBackup, type BackupEnvelope } from './backup';
import { calculateEquity, parseCards, type EquityResult } from './poker';
import { useData } from './useData';
import type { CashEventType, Currency, FilterModel, Hand, PokerRoom, Session, Theme } from './types';

type View = 'dashboard' | 'sessions' | 'live' | 'hands' | 'tools' | 'settings';
const currencies: Currency[] = ['EUR', 'USD', 'GBP', 'CZK', 'PLN'];
const positions = ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO'];
const nav: { id: View; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' }, { id: 'sessions', label: 'Sessions', icon: '≡' },
  { id: 'live', label: 'Live', icon: '●' }, { id: 'hands', label: 'Hands', icon: '♠' }, { id: 'tools', label: 'Tools', icon: '◇' },
];

function getInitialView(): View { const query = new URLSearchParams(location.search).get('view'); return nav.some((item) => item.id === query) ? query as View : 'dashboard'; }
function putSetting(key: string, value: unknown) { return db.settings.put({ key, value }).then(notifyDbChanged); }

export default function App() {
  const { data, loading } = useData();
  const [view, setView] = useState<View>(getInitialView);
  const [filter, setFilter] = useState<FilterModel>({ period: 'all', roomId: '', query: '', result: 'all' });
  const theme = (data.settings.find((item) => item.key === 'theme')?.value ?? 'dark') as Theme;
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const active = data.sessions.find((session) => session.active);

  if (loading) return <main className="splash"><span className="brand-mark">P</span><strong>PTracker</strong><small>Opening your local database…</small></main>;
  const navigate = (next: View) => { setView(next); history.replaceState(null, '', next === 'dashboard' ? location.pathname : `?view=${next}`); scrollTo({ top: 0, behavior: 'smooth' }); };

  return <div className="app-shell">
    <aside className="rail">
      <button className="brand" onClick={() => navigate('dashboard')}><span className="brand-mark">P</span><span>PTracker</span></button>
      <Nav active={view} onChange={navigate} hasLive={Boolean(active)} />
      <button className="rail-settings" onClick={() => navigate('settings')}>⚙ <span>Settings</span></button>
    </aside>
    <main className="main">
      <header className="topbar"><button className="brand mobile-brand" onClick={() => navigate('dashboard')}><span className="brand-mark">P</span><span>PTracker</span></button><button className="icon-button" aria-label="Settings" onClick={() => navigate('settings')}>⚙</button></header>
      {view === 'dashboard' && <Dashboard data={data} filter={filter} setFilter={setFilter} go={navigate} />}
      {view === 'sessions' && <Sessions data={data} filter={filter} setFilter={setFilter} />}
      {view === 'live' && <Live data={data} active={active} go={navigate} />}
      {view === 'hands' && <Hands data={data} active={active} />}
      {view === 'tools' && <Tools data={data} active={active} />}
      {view === 'settings' && <Settings data={data} theme={theme} />}
    </main>
    <div className="mobile-nav"><Nav active={view} onChange={navigate} hasLive={Boolean(active)} /></div>
  </div>;
}

function Nav({ active, onChange, hasLive }: { active: View; onChange: (view: View) => void; hasLive: boolean }) {
  return <nav aria-label="Primary">{nav.map((item) => <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => onChange(item.id)}><span className="nav-icon">{item.icon}{item.id === 'live' && hasLive && <i />}</span><span>{item.id === 'live' && hasLive ? 'Playing' : item.label}</span></button>)}</nav>;
}

function PageHead({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) { return <div className="page-head"><div>{eyebrow && <small>{eyebrow}</small>}<h1>{title}</h1></div>{action}</div>; }
function Metric({ label, value, tone = '' }: { label: string; value: string; tone?: string }) { return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>; }
function Empty({ title, body }: { title: string; body: string }) { return <div className="empty"><span>◇</span><strong>{title}</strong><p>{body}</p></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }

function Filters({ filter, setFilter, rooms, search = false }: { filter: FilterModel; setFilter: (filter: FilterModel) => void; rooms: PokerRoom[]; search?: boolean }) {
  return <div className="filters">
    <div className="segments">{(['week', 'month', 'year', 'all'] as const).map((period) => <button key={period} className={filter.period === period ? 'active' : ''} onClick={() => setFilter({ ...filter, period })}>{period === 'all' ? 'All time' : period[0]!.toUpperCase() + period.slice(1)}</button>)}</div>
    <select aria-label="Filter by room" value={filter.roomId} onChange={(event) => setFilter({ ...filter, roomId: event.target.value })}><option value="">All rooms</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select>
    {search && <input type="search" placeholder="Search room or notes" value={filter.query} onChange={(event) => setFilter({ ...filter, query: event.target.value })} />}
  </div>;
}

function Dashboard({ data, filter, setFilter, go }: { data: ReturnType<typeof useData>['data']; filter: FilterModel; setFilter: (value: FilterModel) => void; go: (view: View) => void }) {
  const sessions = filterSessions(data.sessions.filter((item) => !item.active && item.endedAt), data.pokerRooms, data.sessionCashEvents, data.sessionBreaks, filter);
  const totals = aggregate(sessions, data.sessionCashEvents, data.sessionBreaks, data.allIns);
  const currency = sessions[0]?.currency ?? data.pokerRooms[0]?.defaultCurrency ?? 'EUR';
  const points = [...sessions].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)).reduce<number[]>((list, session) => [...list, (list.at(-1) ?? 0) + sessionMetrics(session, data.sessionCashEvents, data.sessionBreaks).netResult], []);
  const byRoom = data.pokerRooms.map((room) => ({ room, stats: aggregate(sessions.filter((session) => session.roomId === room.id), data.sessionCashEvents, data.sessionBreaks) })).filter((item) => item.stats.sessions).sort((a, b) => b.stats.net - a.stats.net);
  return <section>
    <PageHead eyebrow="LOCAL • PRIVATE • OFFLINE" title="Your poker, at a glance" action={<button className="primary" onClick={() => go('live')}>{data.sessions.some((item) => item.active) ? 'Return to session' : '+ Start session'}</button>} />
    <Filters filter={filter} setFilter={setFilter} rooms={data.pokerRooms} />
    <div className="hero-card">
      <div><span>NET PROFIT</span><strong className={totals.net >= 0 ? 'positive' : 'negative'}>{money(totals.net, currency, true)}</strong><p>{money(totals.hourly, currency, true)} / hour · {totals.wins}/{totals.sessions} winning</p></div>
      <LineChart points={points} positive={totals.net >= 0} />
    </div>
    <div className="metric-grid"><Metric label="HOURS" value={totals.hours.toFixed(1)} /><Metric label="HOURLY" value={money(totals.hourly, currency, true)} /><Metric label="SESSIONS" value={String(totals.sessions)} /><Metric label="BB / HOUR" value={`${totals.bbPerHour >= 0 ? '+' : ''}${totals.bbPerHour.toFixed(1)}`} /><Metric label="TIPS" value={money(totals.tips, currency)} /><Metric label="ALL-IN VS EV" value={money(totals.difference, currency, true)} /></div>
    <div className="two-column"><div className="card"><h2>Recent sessions</h2>{sessions.length ? <div className="list">{[...sessions].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, 5).map((session) => <SessionRow key={session.id} session={session} room={data.pokerRooms.find((room) => room.id === session.roomId)} metric={sessionMetrics(session, data.sessionCashEvents, data.sessionBreaks)} />)}</div> : <Empty title="No sessions yet" body="Start at the table and your results will appear here." />}</div>
    <div className="card"><h2>Room performance</h2>{byRoom.length ? <div className="list">{byRoom.slice(0, 6).map(({ room, stats }) => <div className="rank-row" key={room.id}><div><strong>{room.name}</strong><span>{stats.hours.toFixed(1)}h · {stats.sessions} sessions</span></div><strong className={stats.net >= 0 ? 'positive' : 'negative'}>{money(stats.net, room.defaultCurrency, true)}</strong></div>)}</div> : <Empty title="Build your sample" body="Room comparisons use the same active filters." />}</div></div>
  </section>;
}

function LineChart({ points, positive }: { points: number[]; positive: boolean }) {
  if (points.length < 2) return <div className="chart-placeholder"><span>Results chart</span><small>Complete two sessions to draw a trend.</small></div>;
  const min = Math.min(0, ...points), max = Math.max(0, ...points), spread = max - min || 1;
  const coords = points.map((point, index) => `${(index / (points.length - 1)) * 100},${92 - ((point - min) / spread) * 78}`).join(' ');
  return <svg className={`line-chart ${positive ? 'positive-line' : 'negative-line'}`} viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Cumulative profit and loss"><line x1="0" y1={92 - ((0 - min) / spread) * 78} x2="100" y2={92 - ((0 - min) / spread) * 78} /><polyline points={coords} /></svg>;
}

function SessionRow({ session, room, metric }: { session: Session; room?: PokerRoom; metric: ReturnType<typeof sessionMetrics> }) {
  return <div className="session-row"><div className="date-tile"><strong>{new Date(session.startedAt).getDate()}</strong><span>{new Date(session.startedAt).toLocaleString(undefined, { month: 'short' })}</span></div><div><strong>{room?.name ?? 'Unknown room'}</strong><span>{money(session.smallBlind, session.currency)} / {money(session.bigBlind, session.currency)} · {durationLabel(metric.durationMs)}</span></div><strong className={metric.netResult >= 0 ? 'positive' : 'negative'}>{money(metric.netResult, session.currency, true)}</strong></div>;
}

function Sessions({ data, filter, setFilter }: { data: ReturnType<typeof useData>['data']; filter: FilterModel; setFilter: (value: FilterModel) => void }) {
  const [roomOpen, setRoomOpen] = useState(false);
  const sessions = filterSessions(data.sessions.filter((item) => !item.active), data.pokerRooms, data.sessionCashEvents, data.sessionBreaks, filter).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  return <section><PageHead eyebrow={`${sessions.length} RESULTS`} title="Sessions" action={<button className="secondary" onClick={() => setRoomOpen(true)}>Manage rooms</button>} /><Filters filter={filter} setFilter={setFilter} rooms={data.pokerRooms} search />
    <div className="card"><div className="list">{sessions.map((session) => <SessionRow key={session.id} session={session} room={data.pokerRooms.find((room) => room.id === session.roomId)} metric={sessionMetrics(session, data.sessionCashEvents, data.sessionBreaks)} />)}{!sessions.length && <Empty title="Nothing matches" body="Try a wider period or start your first cash session." />}</div></div>
    {roomOpen && <RoomDialog rooms={data.pokerRooms} close={() => setRoomOpen(false)} />}
  </section>;
}

function RoomDialog({ rooms, close }: { rooms: PokerRoom[]; close: () => void }) {
  const [name, setName] = useState(''); const [currency, setCurrency] = useState<Currency>('EUR');
  const save = async (event: FormEvent) => { event.preventDefault(); if (!name.trim()) return; const now = new Date().toISOString(); await db.pokerRooms.add({ id: makeId(), name: name.trim(), city: '', country: '', defaultCurrency: currency, notes: '', favorite: false, archived: false, createdAt: now, updatedAt: now }); notifyDbChanged(); setName(''); };
  return <Modal title="Poker rooms" close={close}><form onSubmit={save}><div className="inline-fields"><Field label="Room name"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Example Card Room" autoFocus /></Field><Field label="Currency"><select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>{currencies.map((item) => <option key={item}>{item}</option>)}</select></Field></div><button className="primary" type="submit">Add room</button></form><div className="list room-list">{rooms.map((room) => <div className="rank-row" key={room.id}><div><strong>{room.name}</strong><span>{room.defaultCurrency}</span></div><button className="text-button danger" onClick={async () => { if (await db.sessions.where('roomId').equals(room.id).count()) return alert('This room has sessions and cannot be deleted.'); await db.pokerRooms.delete(room.id); notifyDbChanged(); }}>Delete</button></div>)}</div></Modal>;
}

function Live({ data, active, go }: { data: ReturnType<typeof useData>['data']; active?: Session; go: (view: View) => void }) {
  const [tick, setTick] = useState(Date.now()); const [cashType, setCashType] = useState<CashEventType | null>(null);
  useEffect(() => { if (!active) return; const id = setInterval(() => setTick(Date.now()), 30_000); return () => clearInterval(id); }, [active]);
  if (!active) return <StartSession rooms={data.pokerRooms} />;
  const room = data.pokerRooms.find((item) => item.id === active.roomId); const metric = sessionMetrics(active, data.sessionCashEvents, data.sessionBreaks, tick);
  const isBreaking = data.sessionBreaks.some((item) => item.sessionId === active.id && !item.endedAt);
  const end = async () => { setCashType('CASHOUT'); };
  return <section><PageHead eyebrow="LIVE SESSION" title={room?.name ?? 'At the table'} action={<span className="live-badge"><i /> In progress</span>} />
    <div className="live-hero"><div><span>{money(active.smallBlind, active.currency)} / {money(active.bigBlind, active.currency)} · {active.tableSize}-max</span><strong>{durationLabel(metric.durationMs)}</strong></div><div className="live-money"><Metric label="TOTAL IN" value={money(metric.totalIn, active.currency)} /><Metric label="CURRENT P/L" value={money(metric.netResult, active.currency, true)} tone={metric.netResult >= 0 ? 'positive' : 'negative'} /></div></div>
    <div className="metric-grid compact"><Metric label="HOURLY" value={money(metric.netHourly, active.currency, true)} /><Metric label="BB / HOUR" value={metric.bbPerHour.toFixed(1)} /><Metric label="TIPS" value={money(metric.tableTips + metric.endTips, active.currency)} /></div>
    <h2 className="section-title">Quick actions</h2><div className="quick-grid">
      <button onClick={() => setCashType('ADDON')}><b>+</b><span>Add-on</span></button><button onClick={() => setCashType('TIP_TABLE')}><b>€</b><span>Tip</span></button><button onClick={() => setCashType('EXPENSE')}><b>−</b><span>Expense</span></button><button onClick={() => go('hands')}><b>♠</b><span>Hand</span></button><button onClick={() => go('tools')}><b>EV</b><span>All-in</span></button><button className={isBreaking ? 'pause-active' : ''} onClick={async () => { const open = data.sessionBreaks.find((item) => item.sessionId === active.id && !item.endedAt); if (open) await db.sessionBreaks.update(open.id, { endedAt: new Date().toISOString() }); else await db.sessionBreaks.add({ id: makeId(), sessionId: active.id, startedAt: new Date().toISOString() }); notifyDbChanged(); }}><b>{isBreaking ? '▶' : 'Ⅱ'}</b><span>{isBreaking ? 'Resume' : 'Break'}</span></button>
    </div><button className="end-button" onClick={end}>End session & cash out</button>
    <div className="card"><h2>Session timeline</h2><div className="timeline">{data.sessionCashEvents.filter((item) => item.sessionId === active.id).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).map((event) => <div key={event.id}><time>{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><span>{event.type.replaceAll('_', ' ').toLowerCase()}</span><strong>{money(event.amount, active.currency)}</strong></div>)}</div></div>
    {cashType && <CashDialog type={cashType} session={active} close={() => setCashType(null)} onSaved={() => { if (cashType === 'CASHOUT') go('dashboard'); }} />}
  </section>;
}

function StartSession({ rooms }: { rooms: PokerRoom[] }) {
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? ''); const [sb, setSb] = useState('1'); const [bb, setBb] = useState('2'); const [buyin, setBuyin] = useState('200'); const [tableSize, setTableSize] = useState('9');
  useEffect(() => { if (!roomId && rooms[0]) setRoomId(rooms[0].id); }, [rooms, roomId]);
  const start = async (event: FormEvent) => { event.preventDefault(); const room = rooms.find((item) => item.id === roomId); if (!room) return; const now = new Date().toISOString(), id = makeId(); await db.transaction('rw', db.sessions, db.sessionCashEvents, async () => { await db.sessions.add({ id, roomId, gameType: 'NLH', smallBlind: parseMoney(sb), bigBlind: parseMoney(bb), currency: room.defaultCurrency, tableSize: Number(tableSize), startedAt: now, notes: '', active: true, createdAt: now, updatedAt: now }); await db.sessionCashEvents.add({ id: makeId(), sessionId: id, timestamp: now, type: 'INITIAL_BUYIN', amount: parseMoney(buyin), note: '' }); }); notifyDbChanged(); };
  return <section className="narrow"><PageHead eyebrow="NEW CASH GAME" title="Start a session" /><form className="card form-stack" onSubmit={start}>{rooms.length ? <><Field label="Poker room"><select value={roomId} onChange={(event) => setRoomId(event.target.value)}>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></Field><div className="inline-fields"><Field label="Small blind"><input inputMode="decimal" value={sb} onChange={(event) => setSb(event.target.value)} /></Field><Field label="Big blind"><input inputMode="decimal" value={bb} onChange={(event) => setBb(event.target.value)} /></Field></div><div className="inline-fields"><Field label="Initial buy-in"><input inputMode="decimal" value={buyin} onChange={(event) => setBuyin(event.target.value)} /></Field><Field label="Table size"><select value={tableSize} onChange={(event) => setTableSize(event.target.value)}>{[2, 3, 4, 5, 6, 7, 8, 9, 10].map((size) => <option key={size}>{size}</option>)}</select></Field></div><button className="primary large" type="submit">Start live session</button><p className="privacy-note">Stored only on this device. Works without internet.</p></> : <Empty title="Add a poker room first" body="Go to Sessions → Manage rooms, then come back to start playing." />}</form></section>;
}

function CashDialog({ type, session, close, onSaved }: { type: CashEventType; session: Session; close: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(type === 'TIP_TABLE' ? '1' : ''); const [endTip, setEndTip] = useState('0');
  const label = type.replaceAll('_', ' ').toLowerCase();
  const save = async (event: FormEvent) => { event.preventDefault(); const now = new Date().toISOString(); await db.transaction('rw', db.sessionCashEvents, db.sessions, async () => { await db.sessionCashEvents.add({ id: makeId(), sessionId: session.id, timestamp: now, type, amount: parseMoney(amount), note: '' }); if (type === 'CASHOUT') { if (parseMoney(endTip)) await db.sessionCashEvents.add({ id: makeId(), sessionId: session.id, timestamp: now, type: 'TIP_END', amount: parseMoney(endTip), note: '' }); await db.sessions.update(session.id, { active: false, endedAt: now, updatedAt: now }); } }); notifyDbChanged(); close(); onSaved(); };
  return <Modal title={type === 'CASHOUT' ? 'Cash out & finish' : `Add ${label}`} close={close}><form className="form-stack" onSubmit={save}><Field label={`Amount (${session.currency})`}><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus required /></Field>{type === 'TIP_TABLE' && <div className="amount-chips">{['1', '2', '5'].map((item) => <button type="button" key={item} onClick={() => setAmount(item)}>+{item}</button>)}</div>}{type === 'CASHOUT' && <Field label="End-of-session tip"><input inputMode="decimal" value={endTip} onChange={(event) => setEndTip(event.target.value)} /></Field>}<button className="primary large" type="submit">{type === 'CASHOUT' ? 'Save completed session' : 'Add to timeline'}</button></form></Modal>;
}

function Hands({ data, active }: { data: ReturnType<typeof useData>['data']; active?: Session }) {
  const [open, setOpen] = useState(false);
  return <section><PageHead eyebrow={`${data.hands.length} RECORDED`} title="Hands" action={<button className="primary" onClick={() => setOpen(true)}>+ Record hand</button>} />
    <div className="card">{data.hands.length ? <div className="list">{[...data.hands].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).map((hand) => <div className="hand-row" key={hand.id}><div className="cards"><i>{hand.heroCards[0] || '??'}</i><i>{hand.heroCards[1] || '??'}</i></div><div><strong>{hand.heroPosition} · {hand.tags.join(', ') || 'untagged'}</strong><span>{new Date(hand.timestamp).toLocaleString()} · {hand.notes || 'No notes'}</span></div><strong className={hand.result >= 0 ? 'positive' : 'negative'}>{money(hand.result, hand.currency, true)}</strong></div>)}</div> : <Empty title="No marked hands" body="Capture the spots you want to review without leaving the table for long." />}</div>
    {open && <HandDialog active={active} close={() => setOpen(false)} />}</section>;
}

function HandDialog({ active, close }: { active?: Session; close: () => void }) {
  const [position, setPosition] = useState('BTN'), [cards, setCards] = useState(''), [board, setBoard] = useState(''), [result, setResult] = useState('0'), [notes, setNotes] = useState(''), [tags, setTags] = useState('review'); const [error, setError] = useState('');
  const save = async (event: FormEvent) => { event.preventDefault(); try { const heroCards = parseCards(cards), boardCards = board.trim() ? parseCards(board) : []; if (heroCards.length !== 2) throw new Error('Enter two hero cards.'); if (new Set([...heroCards, ...boardCards]).size !== heroCards.length + boardCards.length) throw new Error('Duplicate card detected.'); const hand: Hand = { id: makeId(), sessionId: active?.id, timestamp: new Date().toISOString(), tableSize: active?.tableSize ?? 9, smallBlind: active?.smallBlind ?? 100, bigBlind: active?.bigBlind ?? 200, currency: active?.currency ?? 'EUR', effectiveStack: 0, heroPosition: position, heroCards, board: boardCards, result: parseMoney(result), notes, tags: tags.split(',').map((item) => item.trim()).filter(Boolean), actions: [] }; if (utf8Size(await readAllData()) + utf8Size(hand) >= APP_DATA_LIMIT_BYTES) throw new Error('The 5 MiB app-data limit is reached. Export a backup, then remove optional hand histories before adding more.'); await db.hands.add(hand); notifyDbChanged(); close(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save hand.'); } };
  return <Modal title="Record a hand" close={close}><form className="form-stack" onSubmit={save}><div className="position-grid">{positions.map((item) => <button type="button" className={position === item ? 'active' : ''} key={item} onClick={() => setPosition(item)}>{item}</button>)}</div><div className="inline-fields"><Field label="Hero cards"><input value={cards} onChange={(event) => setCards(event.target.value)} placeholder="As Kh" autoCapitalize="characters" /></Field><Field label="Board"><input value={board} onChange={(event) => setBoard(event.target.value)} placeholder="Qh Jc 2s" autoCapitalize="characters" /></Field></div><Field label="Result"><input inputMode="decimal" value={result} onChange={(event) => setResult(event.target.value)} /></Field><Field label="Tags"><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="review, 3bet pot" /></Field><Field label="Notes"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Villain line, sizing, decision…" /></Field>{error && <p className="form-error">{error}</p>}<button className="primary large">Save hand</button></form></Modal>;
}

function Tools({ data, active }: { data: ReturnType<typeof useData>['data']; active?: Session }) {
  const [pot, setPot] = useState('100'), [bet, setBet] = useState('50'), [call, setCall] = useState('50'), [equity, setEquity] = useState('35');
  const odds = potOdds(parseMoney(pot), parseMoney(bet), parseMoney(call), Number(equity) / 100);
  const [hero, setHero] = useState('As Kh'), [villains, setVillains] = useState('Qc Qd'), [board, setBoard] = useState(''), [dead, setDead] = useState(''), [calc, setCalc] = useState<EquityResult | null>(null), [error, setError] = useState('');
  const allin = aggregate(data.sessions, data.sessionCashEvents, data.sessionBreaks, data.allIns);
  const run = () => { try { const hands = villains.split(';').map(parseCards); setCalc(calculateEquity(parseCards(hero), hands, board.trim() ? parseCards(board) : [], dead.trim() ? parseCards(dead) : [])); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Calculation failed.'); } };
  return <section><PageHead eyebrow="100% ON-DEVICE" title="Poker tools" /><div className="tools-grid"><div className="card form-stack"><h2>Equity calculator</h2><p className="muted">Exact on turn/river; Monte Carlo before that. Separate villains with semicolons.</p><Field label="Hero cards"><input value={hero} onChange={(event) => setHero(event.target.value)} /></Field><Field label="Villain cards"><input value={villains} onChange={(event) => setVillains(event.target.value)} /></Field><div className="inline-fields"><Field label="Board"><input value={board} onChange={(event) => setBoard(event.target.value)} placeholder="2c 7d Th" /></Field><Field label="Dead cards"><input value={dead} onChange={(event) => setDead(event.target.value)} /></Field></div>{error && <p className="form-error">{error}</p>}<button className="primary" onClick={run}>Calculate equity</button>{calc && <div className="result-panel"><Metric label="EQUITY" value={`${(calc.equity * 100).toFixed(1)}%`} /><Metric label="WIN" value={`${(calc.win * 100).toFixed(1)}%`} /><Metric label="TIE SHARE" value={`${(calc.tie * 100).toFixed(1)}%`} /></div>}</div>
    <div className="card form-stack"><h2>Pot odds & call EV</h2><div className="inline-fields"><Field label="Current pot"><input inputMode="decimal" value={pot} onChange={(event) => setPot(event.target.value)} /></Field><Field label="Opponent bet"><input inputMode="decimal" value={bet} onChange={(event) => setBet(event.target.value)} /></Field></div><div className="inline-fields"><Field label="Amount to call"><input inputMode="decimal" value={call} onChange={(event) => setCall(event.target.value)} /></Field><Field label="Your equity %"><input inputMode="decimal" value={equity} onChange={(event) => setEquity(event.target.value)} /></Field></div><div className="result-panel"><Metric label="REQUIRED" value={`${(odds.requiredEquity * 100).toFixed(1)}%`} /><Metric label="CALL EV" value={money(odds.callEV, active?.currency ?? 'EUR', true)} tone={odds.callEV >= 0 ? 'positive' : 'negative'} /></div></div>
    <div className="card form-stack"><h2>All-in EV</h2><div className="result-panel"><Metric label="ACTUAL" value={money(allin.actual, active?.currency ?? 'EUR', true)} /><Metric label="EXPECTED" value={money(allin.ev, active?.currency ?? 'EUR', true)} /><Metric label="DIFFERENCE" value={money(allin.difference, active?.currency ?? 'EUR', true)} tone={allin.difference >= 0 ? 'positive' : 'negative'} /></div><p className="muted">All-in EV describes outcomes at the point money went in; it is not a complete measure of poker skill.</p><button className="secondary" disabled={!active} onClick={() => active && void addAllIn(active)}>+ Record all-in {active ? '' : '(start a session)'}</button></div></div></section>;
}

async function addAllIn(session: Session) {
  const pot = prompt(`Final eligible pot (${session.currency})`); if (pot === null) return;
  const contribution = prompt('Hero contribution', '0'); if (contribution === null) return;
  const equity = prompt('Hero equity %', '50'); if (equity === null) return;
  const payout = prompt('Actual payout', '0'); if (payout === null) return;
  const eligible = parseMoney(pot), share = Number(equity) / 100;
  await db.allIns.add({ id: makeId(), sessionId: session.id, timestamp: new Date().toISOString(), street: 'UNKNOWN', heroCards: [], villainCardsOrRange: '', boardAtAllIn: [], potBeforeAllIn: eligible - parseMoney(contribution), heroContribution: parseMoney(contribution), villainContribution: 0, heroEquity: share, expectedPayout: Math.round(eligible * share), actualPayout: parseMoney(payout) }); notifyDbChanged();
}

function Settings({ data, theme }: { data: ReturnType<typeof useData>['data']; theme: Theme }) {
  const [browserStorage, setBrowserStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({}); const [preview, setPreview] = useState<BackupEnvelope | null>(null); const bytes = utf8Size(data), level = quotaLevel(bytes);
  useEffect(() => { void (async () => { const persisted = await navigator.storage?.persisted?.(); if (!persisted) await navigator.storage?.persist?.(); const estimate = await navigator.storage?.estimate?.(); setBrowserStorage({ usage: estimate?.usage, quota: estimate?.quota, persisted: await navigator.storage?.persisted?.() }); })(); }, []);
  const exportBackup = async () => { const backup = await createBackup(); downloadFile(JSON.stringify(backup, null, 2), `poker-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json'); await putSetting('lastBackupAt', new Date().toISOString()); };
  const importFile = async (file?: File) => { if (!file) return; try { setPreview(validateBackup(JSON.parse(await file.text()))); } catch (reason) { alert(reason instanceof Error ? reason.message : 'Invalid backup.'); } };
  const lastBackup = data.settings.find((item) => item.key === 'lastBackupAt')?.value;
  return <section className="narrow"><PageHead eyebrow="DEVICE & DATA" title="Settings" /><div className="card form-stack"><h2>Appearance</h2><div className="segments">{(['system', 'dark', 'light'] as Theme[]).map((item) => <button className={theme === item ? 'active' : ''} key={item} onClick={() => void putSetting('theme', item)}>{item[0]!.toUpperCase() + item.slice(1)}</button>)}</div></div>
    <div className="card form-stack"><h2>Storage</h2><div className="storage-row"><div><strong>Application data</strong><span>{(bytes / 1024 / 1024).toFixed(2)} MB / {(APP_DATA_LIMIT_BYTES / 1024 / 1024).toFixed(2)} MB</span></div><strong>{((bytes / APP_DATA_LIMIT_BYTES) * 100).toFixed(1)}%</strong></div><progress value={bytes} max={APP_DATA_LIMIT_BYTES} className={level} /><div className="storage-row"><div><strong>Browser origin usage</strong><span>{browserStorage.usage === undefined ? 'Unavailable' : `${(browserStorage.usage / 1024 / 1024).toFixed(2)} MB`}</span></div><span>{browserStorage.persisted ? 'Persistent granted' : 'Best effort'}</span></div>{level !== 'normal' && <p className="storage-warning">Storage is {level === 'blocked' ? 'at the app limit' : 'getting full'}. Export a backup before removing hands or sessions. Existing history is never deleted automatically.</p>}</div>
    <div className="card form-stack"><h2>Data & backup</h2><p className="muted">IndexedDB remains authoritative. Keep regular downloads somewhere outside this device.</p><button className="primary" onClick={() => void exportBackup()}>Export full backup</button><label className="secondary file-button">Import backup<input type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} /></label><button className="secondary" onClick={() => downloadFile(sessionsCsv(data.sessions, data.pokerRooms, data.sessionCashEvents, data.sessionBreaks), 'sessions.csv', 'text/csv;charset=utf-8')}>Export sessions CSV</button><span className="muted">Last successful backup: {typeof lastBackup === 'string' ? new Date(lastBackup).toLocaleDateString() : 'Never'}</span></div>
    <div className="card privacy-card"><h2>Private by design</h2><p>No account, analytics, advertising, cookies, or poker-data transmission. Clearing this site's browser storage will erase local data, so backups matter.</p></div>
    {preview && <Modal title="Restore backup?" close={() => setPreview(null)}><div className="preview-list">{Object.entries(preview.data).map(([name, rows]) => <div key={name}><span>{name}</span><strong>{rows.length}</strong></div>)}</div><p className="muted">Exported {new Date(preview.exportedAt).toLocaleString()}. This replaces current local records transactionally.</p><button className="danger-button" onClick={async () => { await restoreBackup(preview); setPreview(null); }}>Replace local data</button></Modal>}
  </section>;
}

function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}><div className="modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-button" aria-label="Close" onClick={close}>×</button></header>{children}</div></div>; }
