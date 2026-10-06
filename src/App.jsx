import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { ArrowUpRight, AudioLines, Banknote, Building2, Check, ChevronRight, CircleHelp, Clock3, Copy, Crown, Dice5, Heart, House, Info, Landmark, MapPin, MessageCircle, Moon, Music2, RefreshCw, Send, Shield, ShoppingBag, Sparkles, Swords, Trees, Trophy, Volume2, VolumeX, Wifi, WifiOff, X, Zap } from 'lucide-react';

const REACTIONS = ['😂', '🔥', '💀', '🤡', '😱', '👑'];
let audioContext;
function playUiSound() {
  try {
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType) return;
    audioContext ??= new AudioContextType();
    const oscillator = audioContext.createOscillator(); const volume = audioContext.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = 640; volume.gain.setValueAtTime(0.025, audioContext.currentTime); volume.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.055);
    oscillator.connect(volume); volume.connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + 0.06);
  } catch { /* Audio is optional and may be unavailable in the browser. */ }
}
function readSavedSession() {
  try { return JSON.parse(window.localStorage.getItem('chaos-session') || 'null'); }
  catch { return null; }
}
function saveSession(session) {
  try { window.localStorage.setItem('chaos-session', JSON.stringify(session)); }
  catch { /* The current tab can still play if browser storage is unavailable. */ }
}
function clearSavedSession() {
  try { window.localStorage.removeItem('chaos-session'); } catch { /* Ignore unavailable browser storage. */ }
}
const STEPS = [
  ['💸', 'Make money', 'Take gigs, collect rent, and invest a little.'],
  ['🏠', 'Build your empire', 'Buy city businesses before your friends do.'],
  ['⚡', 'Watch your energy', 'Big moves cost energy. The park gives it back.'],
  ['🎲', 'Expect the unexpected', 'City events can turn a good plan upside down.'],
  ['👑', 'Claim the crown', 'Money, properties, reputation, and event wins add up.']
];

function App() {
  const socketRef = useRef(null);
  const sessionRef = useRef(null);
  const didRestore = useRef(false);
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState(readSavedSession);
  const [state, setState] = useState(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [roomCopied, setRoomCopied] = useState(false);
  const [reaction, setReaction] = useState(null);
  const [tradePrompt, setTradePrompt] = useState(null);
  const [tradeTarget, setTradeTarget] = useState('');
  const [tradeAmount, setTradeAmount] = useState('100');
  const [tradeProperty, setTradeProperty] = useState('');
  const [tab, setTab] = useState('city');
  const [soundOn, setSoundOn] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => {
    const socket = io({
      path: import.meta.env.PROD ? '/api/socket-io' : '/socket.io',
      transports: import.meta.env.PROD ? ['websocket'] : ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true); setError('');
      if (sessionRef.current && !didRestore.current) {
        didRestore.current = true;
        socket.emit('reconnectRoom', sessionRef.current);
      }
    });
    socket.on('disconnect', () => { setConnected(false); didRestore.current = false; });
    socket.on('session', (data) => {
      saveSession(data);
      setSession(data); sessionRef.current = data; didRestore.current = true;
    });
    socket.on('state', (data) => setState({ ...data, receivedAt: Date.now() }));
    socket.on('errorMessage', (data) => { setError(data.message); setTimeout(() => setError(''), 4500); });
    socket.on('notice', (data) => { setToast(data); setTimeout(() => setToast(null), 3200); });
    socket.on('reaction', (data) => { setReaction(data); setTimeout(() => setReaction(null), 2100); });
    socket.on('tradeOffer', (offer) => setTradePrompt(offer));
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => { clearInterval(tick); socket.disconnect(); };
  }, []);

  const emit = useCallback((event, payload = {}) => {
    setError('');
    if (!socketRef.current?.connected) { setError('Reconnecting to the city…'); return; }
    if (soundOn) playUiSound();
    socketRef.current.emit(event, payload);
  }, [soundOn]);
  const self = state?.players.find(p => p.id === session?.playerId);
  const isHost = state?.hostId === session?.playerId;
  const timeLeft = state?.remainingMs == null ? null : Math.max(0, Math.ceil((state.remainingMs - (Date.now() - state.receivedAt)) / 1000));
  const activeTradeForMe = state?.trade?.toId === session?.playerId;
  const owned = useMemo(() => state?.properties.filter(p => p.ownerId === session?.playerId) ?? [], [state, session]);
  const action = (name, data) => emit('action', { action: name, data });
  const copyRoom = async () => {
    try { await navigator.clipboard.writeText(state.code); setRoomCopied(true); setTimeout(() => setRoomCopied(false), 1800); }
    catch { setToast({ message: `Room code: ${state.code}`, kind: 'info' }); }
  };
  const leaveRoom = () => { clearSavedSession(); setSession(null); sessionRef.current = null; setState(null); window.location.reload(); };
  const submitTrade = () => { emit('tradeOffer', { toId: tradeTarget, amount: Number(tradeAmount), propertyId: tradeProperty || null }); setTradeTarget(''); };

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); if (!state) window.scrollTo({ top: 0, behavior: 'smooth' }); }}><span className="brand-mark">C</span><span>CHAOS <b>CITY</b></span></a>
      <div className="top-actions">
        {state && <span className={`connection ${connected ? 'online' : 'offline'}`}><i />{connected ? 'LIVE' : 'RECONNECTING'}</span>}
        <button className="icon-button sound" title={soundOn ? 'Mute' : 'Sound on'} onClick={() => setSoundOn(!soundOn)}>{soundOn ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
        <button className="rules-link" onClick={() => setShowRules(true)}><CircleHelp size={16} /> How to play</button>
      </div>
    </header>

    {!state ? <Landing connected={connected} name={name} setName={setName} code={code} setCode={setCode} error={error} emit={emit} setShowRules={setShowRules} /> : state.phase === 'lobby' ? <Lobby state={state} self={self} isHost={isHost} error={error} copyRoom={copyRoom} roomCopied={roomCopied} emit={emit} leaveRoom={leaveRoom} setShowRules={setShowRules} /> : state.phase === 'results' ? <Results state={state} self={self} isHost={isHost} emit={emit} leaveRoom={leaveRoom} /> : <Game state={state} self={self} isHost={isHost} timeLeft={timeLeft} action={action} emit={emit} tab={tab} setTab={setTab} owned={owned} tradeTarget={tradeTarget} setTradeTarget={setTradeTarget} tradeAmount={tradeAmount} setTradeAmount={setTradeAmount} tradeProperty={tradeProperty} setTradeProperty={setTradeProperty} submitTrade={submitTrade} activeTradeForMe={activeTradeForMe} />}

    {error && state && <div className="error-toast"><Info size={16} />{error}<button onClick={() => setError('')}><X size={14} /></button></div>}
    {toast && <div className={`notice-toast ${toast.kind || ''}`}>{toast.kind === 'success' ? <Sparkles size={16} /> : <Info size={16} />}{toast.message}</div>}
    {reaction && <div className="reaction-float"><span>{reaction.emoji}</span><b>{reaction.name}</b></div>}
    {tradePrompt && <div className="modal-backdrop"><div className="modal-card trade-modal"><button className="modal-close" onClick={() => setTradePrompt(null)}><X size={18} /></button><span className="eyebrow">TRADE OFFER</span><div className="trade-emoji">🤝</div><h2>{tradePrompt.fromName} wants to deal.</h2><p>{tradePrompt.amount ? `They’re offering you $${tradePrompt.amount}.` : 'A friendly handshake. Probably.'}{tradePrompt.propertyId ? ' Plus a property!' : ''}</p><div className="modal-actions"><button className="button secondary" onClick={() => { emit('tradeResponse', { accept: false }); setTradePrompt(null); }}>Decline</button><button className="button primary" onClick={() => { emit('tradeResponse', { accept: true }); setTradePrompt(null); }}><Check size={16} /> Accept deal</button></div></div></div>}
    {showRules && <div className="modal-backdrop" onClick={() => setShowRules(false)}><div className="modal-card rules-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setShowRules(false)}><X size={18} /></button><span className="eyebrow">THE QUICK START</span><h2>How to play</h2><p className="modal-intro">Ten minutes. One city. A frankly unreasonable amount of competition.</p><div className="rule-list">{STEPS.map((step, i) => <div className="rule-row" key={step[1]}><span className="rule-emoji">{step[0]}</span><div><b>{i + 1}. {step[1]}</b><small>{step[2]}</small></div></div>)}</div><div className="score-tip"><Crown size={18} /><span>Final score = cash + property value + reputation bonus + event wins.</span></div><button className="button primary full" onClick={() => setShowRules(false)}>Got it, let’s play <ArrowUpRight size={17} /></button></div></div>}
    <footer className="footer"><span>CHAOS CITY <b>© 2026</b></span><span>Made for friendly rivalries <span className="footer-heart">♥</span></span></footer>
  </div>;
}

function Landing({ connected, name, setName, code, setCode, error, emit, setShowRules }) {
  return <main className="landing">
    <section className="hero">
      <div className="hero-copy"><span className="eyebrow"><span className="live-dot" /> A LITTLE CITY. A LOT OF DRAMA.</span><h1>Build your fortune.<br /><span>Ruin your friends.</span></h1><p className="hero-tag">Become Mayor of Chaos.</p><p className="hero-description">Buy the good blocks, dodge the weird events, and leave your friends explaining how they lost to a potato.</p>
        <div className="join-card"><label htmlFor="playerName">YOUR CITY NAME</label><input id="playerName" value={name} maxLength={18} onChange={e => setName(e.target.value)} placeholder="e.g. Snack Baron" autoComplete="nickname" /><div className="join-divider"><span>START A NEW CITY</span></div><button className="button primary create-button" disabled={!connected || name.trim().length < 2} onClick={() => emit('createRoom', { name })}><Sparkles size={17} /> Create a room <ChevronRight size={18} /></button><div className="join-or"><span>or join your friends</span></div><div className="join-row"><input value={code} maxLength={6} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} onKeyDown={e => e.key === 'Enter' && emit('joinRoom', { name, code })} placeholder="ROOM CODE" aria-label="Room code" /><button className="button dark" disabled={!connected || name.trim().length < 2 || code.trim().length < 4} onClick={() => emit('joinRoom', { name, code })}>Join <ArrowUpRight size={16} /></button></div>{error && <p className="form-error">{error}</p>}<small className="no-account"><Shield size={13} /> No account. No downloads. Just chaos.</small></div>
      </div>
      <div className="hero-art"><div className="sun-disc" /><div className="art-label art-label-one"><span>🏦</span> MAKE MOVES</div><div className="art-label art-label-two"><span>🎲</span> EXPECT CHAOS</div><CityIllustration large /><div className="hero-character hero-character-one">🦊<small>YOU</small></div><div className="hero-character hero-character-two">🐸</div><div className="hero-stat-card"><div className="stat-icon">👑</div><div><b>MAYOR MATERIAL</b><span>It could be you.</span></div><ArrowUpRight size={17} /></div><div className="confetti c1">✦</div><div className="confetti c2">✳</div><div className="confetti c3">✦</div></div>
    </section>
    <section className="how-strip"><div className="how-heading"><span className="eyebrow">THE CITY IS YOURS</span><h2>Three steps to <span>total chaos.</span></h2></div><div className="how-steps"><div><i>01</i><b>Get your crew</b><span>Share one tiny code. Invite up to seven friends.</span></div><div><i>02</i><b>Make your moves</b><span>Earn, invest, buy up the neighborhood.</span></div><div><i>03</i><b>Take the crown</b><span>Survive ten minutes of very normal city life.</span></div></div><button className="text-button" onClick={() => setShowRules(true)}>Full rules <ArrowUpRight size={15} /></button></section>
    <div className="landing-bottom"><div className="floating-faces"><span>🦊</span><span>🐼</span><span>🐯</span><span>🐸</span></div><span>Up to 8 players · about 10 min · delightfully unpredictable</span></div>
  </main>;
}

function CityIllustration({ large = false }) {
  return <div className={`city-illustration ${large ? 'big-city' : ''}`}>
    <div className="city-skyline skyline-back"><div className="building b-tall"><span /><span /><span /></div><div className="building b-wide"><span /><span /><span /><span /></div><div className="building b-tower"><i /></div><div className="building b-small"><span /><span /></div></div>
    <div className="city-road"><div className="road-dash" /><div className="road-dash" /><div className="road-dash" /></div>
    <div className="city-block block-left"><span className="tree">🌳</span><div className="shop shop-peach"><i>☕</i><b>CAFE</b></div><span className="tree tree-small">🌳</span></div>
    <div className="city-block block-mid"><div className="shop shop-yellow"><i>🏛️</i><b>CITY HALL</b></div><span className="tree">🌳</span></div>
    <div className="city-block block-right"><div className="shop shop-blue"><i>🏦</i><b>BANK</b></div><span className="tree tree-small">🌳</span></div>
    <div className="city-front"><span>✦</span><span>✿</span><span>✦</span><span>✿</span><span>✦</span><span>✿</span><span>✦</span></div>
  </div>;
}

function Lobby({ state, self, isHost, error, copyRoom, roomCopied, emit, leaveRoom, setShowRules }) {
  return <main className="lobby-page"><div className="lobby-top"><button className="back-button" onClick={leaveRoom}>← Leave room</button><span className="eyebrow">THE CALM BEFORE THE CHAOS</span></div><div className="lobby-card"><div className="lobby-heading"><span className="lobby-icon">🏙️</span><div><h1>Your city is <span>assembling.</span></h1><p>Gather the crew. The mayor's chair is up for grabs.</p></div></div><div className="room-code-card"><div><small>ROOM CODE</small><strong>{state.code}</strong></div><button className="button light-copy" onClick={copyRoom}>{roomCopied ? <Check size={16} /> : <Copy size={16} />}{roomCopied ? 'Copied!' : 'Copy code'}</button><span className="room-code-help">Send this code to your friends</span></div><div className="players-heading"><b>THE CREW <span>{state.players.length}/8</span></b><span>{state.players.filter(p => p.online).length} in the city</span></div><div className="player-grid">{state.players.map(p => <PlayerTile key={p.id} player={p} self={p.id === self?.id} />)}{Array.from({ length: Math.min(8 - state.players.length, 4) }, (_, i) => <div className="player-empty" key={i}><span>＋</span><small>Waiting for a friend</small></div>)}</div><div className="lobby-bottom"><div className="lobby-tip"><Sparkles size={18} /><span><b>{state.players.length < 2 ? 'Need one more player.' : 'The city is ready.'}</b><small>{state.players.length < 2 ? 'At least 2 players required to start.' : 'Ten minutes to become a legend.'}</small></span></div>{isHost ? <button className="button primary start-button" disabled={state.players.filter(p => p.online).length < 2} onClick={() => emit('startGame')}><Zap size={17} /> Start the game <ArrowUpRight size={17} /></button> : <div className="waiting-host"><span className="spinner" />Waiting for {state.players.find(p => p.host)?.name || 'host'} to start</div>}</div>{error && <p className="form-error lobby-error">{error}</p>}<button className="rules-lobby" onClick={() => setShowRules(true)}><Info size={15} /> How to play</button></div></main>;
}

function PlayerTile({ player, self }) {
  return <div className={`player-tile ${self ? 'is-self' : ''} ${!player.online ? 'is-away' : ''}`}><div className="player-avatar">{player.avatar}<span className={player.online ? 'online-badge' : 'away-badge'} /></div><div><b>{player.name}{self && <small> YOU</small>}</b><span>{player.host ? <><Crown size={12} /> HOST</> : player.online ? 'READY TO RUMBLE' : 'RECONNECTING'}</span></div><span className={`ready-check ${player.online ? 'ready' : ''}`}>{player.online ? <Check size={13} /> : '…'}</span></div>;
}

function Game({ state, self, isHost, timeLeft, action, emit, tab, setTab, owned, tradeTarget, setTradeTarget, tradeAmount, setTradeAmount, tradeProperty, setTradeProperty, submitTrade, activeTradeForMe }) {
  const isChoice = state.event?.kind === 'choice';
  const didChoose = state.event?.responded;
  return <main className="game-page">
    <section className="game-head"><div className="city-title"><span className="city-title-icon">🏙️</span><div><span className="eyebrow">WELCOME TO</span><h1>Chaos City</h1></div></div><div className="game-head-center"><span className="round-pill"><i /> LIVE CITY</span><span className="match-count"><span className="match-clock"><Clock3 size={16} /></span>{fmt(timeLeft)} <small>LEFT</small></span></div><div className="room-mini"><small>ROOM</small><b>{state.code}</b><span>{state.players.length} players</span></div></section>
    <div className="mobile-tabs"><button className={tab === 'city' ? 'active' : ''} onClick={() => setTab('city')}><MapPin size={15} /> City</button><button className={tab === 'actions' ? 'active' : ''} onClick={() => setTab('actions')}><Zap size={15} /> Moves</button><button className={tab === 'players' ? 'active' : ''} onClick={() => setTab('players')}><Trophy size={15} /> Players</button></div>
    <div className="game-layout"><div className={`game-main ${tab === 'players' ? 'mobile-hidden' : ''} ${tab === 'actions' ? 'mobile-actions-view' : ''}`}>
      <div className="event-strip">{state.event ? <><div className="event-symbol">{eventIcon(state.event.title)}</div><div className="event-copy"><span className="eyebrow">CITY ALERT <i /></span><b>{state.event.title}</b><p>{state.event.text}</p></div>{isChoice ? <div className="event-choices">{state.event.choices.map(choice => <button key={choice} disabled={!!didChoose} onClick={() => emit('eventChoice', { choice })}>{didChoose ? `✓ ${didChoose}` : choice}</button>)}</div> : <span className="event-time">CITYWIDE</span>}</> : <><div className="event-symbol event-calm">✨</div><div className="event-copy"><span className="eyebrow">ALL IS QUIET (FOR NOW)</span><b>The city is holding its breath.</b><p>Make a move while the pigeons aren't looking.</p></div><span className="event-time">NEXT SURPRISE SOON</span></>}</div>
      <div className="map-card"><div className="map-topline"><div><span className="eyebrow">YOUR PLAYGROUND</span><h2>Downtown <span>district</span></h2></div><div className="map-live"><i /> YOUR CITY IS LIVE</div></div><div className="city-map"><div className="map-grid"><div className="map-place place-hall"><div className="place-roof">🏛️</div><b>City Hall</b><small>Make your voice heard</small></div><div className="map-place place-bank"><div className="place-roof">🏦</div><b>Bank</b><small>Invest &amp; grow</small></div><div className="map-place place-market"><div className="place-roof">🛍️</div><b>Market</b><small>Buy the good stuff</small></div><div className="map-place place-home"><div className="place-roof">🏘️</div><b>Neighborhood</b><small>Prime real estate</small></div><div className="map-place place-arena"><div className="place-roof">🏟️</div><b>The Arena</b><small>Settle your scores</small></div><div className="map-place place-casino"><div className="place-roof">🎰</div><b>Lucky Duck</b><small>House always wins?</small></div><div className="map-place place-park"><div className="place-roof">🌳</div><b>Little Park</b><small>Take a breather</small></div><div className="map-place place-police"><div className="place-roof">🚔</div><b>Police Station</b><small>Keep it curious</small></div><div className="map-avenue"><span>CHAOS AVENUE</span></div><div className="player-pins">{state.players.map((p, i) => <div className={`pin pin-${i} ${!p.online ? 'pin-away' : ''}`} key={p.id} title={p.name}><span>{p.avatar}</span><small>{p.name}</small></div>)}</div></div><div className="map-legend"><span><i className="legend-self" /> You</span><span><i /> Friends</span><span className="map-weather">☀️ Sunny, suspiciously.</span></div></div></div>
      <div className="action-card"><div className="action-heading"><div><span className="eyebrow">MAKE YOUR MOVE</span><h2>What’s the play?</h2></div><div className="energy-chip"><Zap size={14} fill="currentColor" /> {self?.energy ?? 0}<small> ENERGY</small></div></div><div className="action-buttons"><ActionButton title="Pick up a gig" caption="Earn $110–200" icon="💼" color="mint" onClick={() => action('earn')} disabled={self?.energy < 10} /><ActionButton title="Collect rent" caption={owned.length ? `Earn $${owned.reduce((a, p) => a + p.income, 0)}` : 'Buy property first'} icon="💸" color="peach" onClick={() => action('collect')} disabled={!owned.length || self?.energy < 10 || self?.cooldowns?.collect > Date.now()} /><ActionButton title="Make an investment" caption="Risk $100–300" icon="📈" color="blue" onClick={() => action('invest', { amount: 100 })} disabled={self?.energy < 15 || self?.cooldowns?.invest > Date.now()} /><ActionButton title="Catch your breath" caption="+35 energy" icon="🌳" color="green" onClick={() => action('recover')} disabled={self?.energy >= 100} /><ActionButton title="Try your luck" caption="Win $100 or lose $100" icon="🎰" color="lilac" onClick={() => action('casino')} disabled={self?.energy < 18 || self?.money < 100 || self?.cooldowns?.casino > Date.now()} /><ActionButton title="Challenge a friend" caption="Winner gets $80" icon="⚔️" color="yellow" onClick={() => { const target = state.players.find(p => p.id !== self?.id && p.online); if (target) action('challenge', { targetId: target.id }); }} disabled={state.players.filter(p => p.online).length < 2 || self?.energy < 16} />{self?.role === 'Detective' && <ActionButton title="Investigate" caption={self.investigated ? 'Used this game' : 'One secret clue'} icon="🕵️" color="blue" onClick={() => { const target = state.players.find(p => p.id !== self?.id); if (target) action('investigate', { targetId: target.id }); }} disabled={self.investigated || self?.energy < 10} />}{self?.role === 'Saboteur' && <ActionButton title="Cause a hiccup" caption="Sabotage rival property" icon="🧨" color="peach" onClick={() => { const target = state.properties.find(p => p.ownerId && p.ownerId !== self?.id); if (target) action('sabotage', { propertyId: target.id }); }} disabled={self?.energy < 20 || !state.properties.some(p => p.ownerId && p.ownerId !== self?.id)} />}</div></div>
      <div className="property-card"><div className="action-heading"><div><span className="eyebrow">A PIECE OF THE CITY</span><h2>For sale <span>right now</span></h2></div><span className="property-count">{state.properties.filter(p => !p.ownerId).length} available</span></div><div className="property-list">{state.properties.map(p => {const owner = state.players.find(pl => pl.id === p.ownerId);return <div className={`property-item ${p.ownerId ? 'sold' : ''}`} key={p.id}><span className="property-icon">{p.icon}</span><span className="property-name"><b>{p.name}</b><small>{owner ? `Owned by ${owner.name}` : `+$${p.income} rent / collection`}</small></span><span className="property-price">${p.price}</span>{owner ? <span className="owned-pill">SOLD</span> : <button className="buy-button" disabled={self?.money < p.price || self?.energy < 12} onClick={() => action('buy', { propertyId: p.id })}>Buy <ChevronRight size={14} /></button>}</div>})}</div></div>
    </div>
    <aside className={`game-sidebar ${tab !== 'players' ? 'mobile-hidden' : ''}`}><div className="profile-card"><div className="profile-top"><span className="profile-avatar">{self?.avatar ?? '🙂'}</span><div><small>YOU ARE</small><b>{self?.name}</b><span>{self?.role} <span className="role-dot">·</span> <span className="profile-online"><i /> ONLINE</span></span></div><span className="profile-crown">{self?.host ? <Crown size={19} fill="currentColor" /> : '✦'}</span></div><div className="profile-stats"><div><small>YOUR CASH</small><b><Banknote size={16} />${self?.money?.toLocaleString() ?? 0}</b></div><div><small>REPUTATION</small><b><Heart size={15} />{self?.reputation ?? 0}<em>/100</em></b></div></div><div className="energy-bar"><span style={{ width: `${self?.energy ?? 0}%` }} /></div><div className="energy-label"><small>ENERGY</small><b>{self?.energy ?? 0}/100</b></div><div className="my-property-count"><House size={14} /> {owned.length} {owned.length === 1 ? 'property' : 'properties'} owned</div></div>
      <div className="leaderboard-card"><div className="sidebar-title"><div><Trophy size={16} /><b>THE SCOREBOARD</b></div><span>LIVE</span></div><div className="leaderboard-list">{state.leaderboard.map(p => <div className={`leader-row ${p.id === self?.id ? 'leader-self' : ''}`} key={p.id}><b className="leader-rank">{p.rank === 1 ? '👑' : String(p.rank).padStart(2, '0')}</b><span className="leader-face">{p.avatar}</span><span className="leader-name">{p.name}{!p.online && <i className="offline-mark" />}</span><b className="leader-score">{p.score.toLocaleString()}</b></div>)}</div><div className="score-note"><Info size={13} /> Cash + property + reputation + event wins</div></div>
      <div className="players-online-card"><div className="sidebar-title"><div><Wifi size={15} /><b>ON THE STREETS</b></div><span>{state.players.filter(p => p.online).length} ONLINE</span></div><div className="online-players">{state.players.map(p => <span title={p.name} className={!p.online ? 'offline-player' : ''} key={p.id}>{p.avatar}</span>)}</div><div className="reaction-row">{REACTIONS.map(emoji => <button key={emoji} title={`Send ${emoji}`} onClick={() => emit('react', { emoji })}>{emoji}</button>)}</div></div>
      <div className="feed-card"><div className="sidebar-title"><div><AudioLines size={15} /><b>CITY BUZZ</b></div><span>JUST NOW</span></div>{state.history.slice().reverse().slice(0, 4).map((h, i) => <p key={`${h.at}-${i}`}><i />{h.text}</p>)}</div>
      <div className="trade-card"><div className="sidebar-title"><div><MessageCircle size={15} /><b>MAKE A DEAL</b></div><span>30 SEC</span></div><div className="trade-form"><select value={tradeTarget} onChange={e => setTradeTarget(e.target.value)}><option value="">Choose a friend</option>{state.players.filter(p => p.id !== self?.id && p.online).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><div className="trade-input-row"><label>$<input type="number" min="0" max={self?.money ?? 0} value={tradeAmount} onChange={e => setTradeAmount(e.target.value)} /></label><select value={tradeProperty} onChange={e => setTradeProperty(e.target.value)}><option value="">No property</option>{owned.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div><button className="trade-send" disabled={!tradeTarget} onClick={submitTrade}><Send size={14} /> Send offer</button></div>{state.trade && <div className="pending-trade">{activeTradeForMe ? 'You have a trade waiting.' : 'Offer sent — waiting for a reply.'}</div>}</div>
    </aside></div>
    {state.event?.kind === 'potato' && !state.event.winnerId && <button className="potato-button" onClick={() => action('earn')}><span>🥔</span> GRAB THE POTATO <small>tap fast!</small></button>}
  </main>;
}

function ActionButton({ title, caption, icon, color, onClick, disabled }) { return <button className={`action-button action-${color}`} onClick={onClick} disabled={disabled}><span>{icon}</span><b>{title}</b><small>{caption}</small></button>; }
function Results({ state, self, isHost, emit, leaveRoom }) {
  const winner = state.players.find(p => p.id === state.winnerId);
  return <main className="results-page"><div className="results-glow" /><span className="eyebrow">THE CITY HAS SPOKEN</span><div className="winner-crown">👑</div><h1>{winner?.name || 'Nobody'} <span>rules Chaos City.</span></h1><p className="results-sub">A ten-minute masterclass in audacity, timing, and suspiciously good luck.</p><div className="winner-score"><small>FINAL CITY SCORE</small><b>{winner?.score?.toLocaleString() ?? '0'}</b><span>Mayor of Chaos</span></div><div className="final-board"><div className="final-board-header">FINAL STANDINGS <span>{state.players.length} PLAYERS</span></div>{state.leaderboard.map(p => <div key={p.id} className={`final-row ${p.id === winner?.id ? 'final-winner' : ''}`}><span>{p.rank === 1 ? '👑' : p.rank}</span><span className="final-avatar">{p.avatar}</span><b>{p.name}{p.id === self?.id ? ' (you)' : ''}</b><strong>{p.score.toLocaleString()}</strong></div>)}</div><div className="awards-grid">{state.awards?.map((award, i) => <div className="award-card" key={`${award.title}-${i}`}><span>{award.icon}</span><small>{award.title}</small><b>{state.players.find(p => p.id === award.playerId)?.name ?? '—'}</b></div>)}</div><div className="results-actions">{isHost ? <button className="button primary" onClick={() => emit('rematch')}><RefreshCw size={17} /> Play again</button> : <span className="waiting-host"><span className="spinner" />Waiting for the host to rematch</span>}<button className="button secondary" onClick={leaveRoom}>Leave city</button></div></main>;
}
function fmt(seconds) { const safe = Math.max(0, seconds || 0); return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`; }
function eventIcon(title) { if (title?.includes('CHICKEN')) return '🐔'; if (title?.includes('TAX')) return '🧾'; if (title?.includes('ALIEN')) return '👽'; if (title?.includes('POTATO')) return '🥔'; if (title?.includes('BANK')) return '🏦'; if (title?.includes('MYSTERY')) return '🎁'; if (title?.includes('FREE')) return '💸'; if (title?.includes('POWER')) return '🔦'; if (title?.includes('INFLUENCER')) return '📸'; return '🎉'; }

export default App;
