import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import {
  ArrowDownUp, ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronRight,
  CircleHelp, Crown, Flag, Flame, GraduationCap, Menu, MessageCircle, Minus, Plus,
  RotateCcw, Send, Settings2, ShieldCheck, Sparkles, Swords, Trophy, Users, X,
} from 'lucide-react';
import { chatConfigured, ensureChatSession, supabase } from './lib/chat';
import { createRoom, joinRoom, playRoomMove, watchRoom, type Room } from './lib/games';
import { firebaseConfigured } from './lib/firebase';

type Tab = 'play' | 'learn' | 'puzzles';
type ChatMessage = { id: string; display_name: string; message: string; created_at: string };

const initialFen = new Chess().fen();
const lessons = [
  { icon: '♘', title: 'Knight adventures', detail: 'Learn how the knight moves', level: 'STARTER', color: 'peach' },
  { icon: '♙', title: 'Pawn power', detail: 'The little piece with big ideas', level: 'STARTER', color: 'mint' },
  { icon: '♗', title: 'The fianchetto', detail: 'A clever way to develop your bishop', level: 'GROWING', color: 'lavender' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('play');
  const [chess, setChess] = useState(() => new Chess());
  const [fen, setFen] = useState(initialFen);
  const [boardWidth, setBoardWidth] = useState(520);
  const [room, setRoom] = useState<Room | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerColor, setPlayerColor] = useState<'w' | 'b' | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [modal, setModal] = useState<'online' | 'invite' | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('fianchetto-name') || 'Guest');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatReady, setChatReady] = useState(false);
  const [chatError, setChatError] = useState('');
  const [mobileChat, setMobileChat] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const resize = () => setBoardWidth(Math.max(280, Math.min(520, window.innerWidth - (window.innerWidth < 760 ? 42 : 560))));
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    if (!roomId) return;
    try {
      return watchRoom(roomId, (updated) => {
        if (!updated) { setNotice('This game was not found.'); return; }
        setRoom(updated);
        setFen(updated.fen);
        setChess(new Chess(updated.fen));
      }, (error) => setNotice(error.message));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not connect to this game.');
    }
  }, [roomId]);

  useEffect(() => {
    if (!room?.code || !chatConfigured || !supabase) {
      setMessages([]);
      setChatReady(false);
      return;
    }
    let active = true;
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | undefined;
    setChatReady(false);
    setChatError('');
    (async () => {
      try {
        await ensureChatSession();
        if (!active || !supabase) return;
        const { data, error } = await supabase.from('room_messages').select('id,display_name,message,created_at').eq('room_code', room.code).order('created_at', { ascending: true }).limit(50);
        if (error) throw error;
        if (!active) return;
        setMessages((data ?? []) as ChatMessage[]);
        setChatReady(true);
        channel = supabase.channel(`room-chat-${room.code}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_code=eq.${room.code}` }, (payload) => {
            const incoming = payload.new as ChatMessage;
            setMessages((current) => current.some((message) => message.id === incoming.id) ? current : [...current, incoming].slice(-50));
          }).subscribe();
      } catch (error) {
        if (active) setChatError(error instanceof Error ? error.message : 'Chat is not available.');
      }
    })();
    return () => { active = false; if (channel && supabase) void supabase.removeChannel(channel); };
  }, [room?.code]);

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { localStorage.setItem('fianchetto-name', displayName.slice(0, 20)); }, [displayName]);

  const onDrop = useCallback((source: string, target: string) => {
    const next = new Chess(fen);
    try {
      const move = next.move({ from: source as Square, to: target as Square, promotion: 'q' });
      if (!move) return false;
      if (roomId && playerColor && (next.turn() === playerColor)) return false;
      setChess(next);
      setFen(next.fen());
      if (roomId) {
        void playRoomMove(roomId, source, target).catch((error) => setNotice(error instanceof Error ? error.message : 'Move could not be saved.'));
      }
      return true;
    } catch { return false; }
  }, [fen, playerColor, roomId]);

  const startNewGame = () => { setChess(new Chess()); setFen(initialFen); setRoom(null); setRoomId(null); setPlayerColor(null); setInviteCode(''); setNotice(''); };
  const openOnline = () => { setNotice(''); setModal('online'); };

  const handleCreateRoom = async () => {
    setBusy(true); setNotice('');
    try {
      const created = await createRoom();
      setRoomId(created.id); setPlayerColor(created.color); setInviteCode(created.code); setModal('invite');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not create a game.'); }
    finally { setBusy(false); }
  };

  const handleJoinRoom = async () => {
    setBusy(true); setNotice('');
    try {
      const joined = await joinRoom(codeInput);
      setRoomId(joined.id); setPlayerColor(joined.color); setModal(null); setCodeInput('');
      setNotice('You joined the game — have fun and be kind!');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not join that game.'); }
    finally { setBusy(false); }
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = chatText.trim();
    if (!message || !room?.code || !supabase || message.length > 300) return;
    setChatText('');
    const { error } = await supabase.from('room_messages').insert({ room_code: room.code, display_name: displayName.trim().slice(0, 20) || 'Guest', message });
    if (error) { setChatText(message); setChatError('Message could not be sent. Check the Supabase table and access policies.'); }
  };

  const currentTurn = chess.turn() === 'w' ? 'White' : 'Black';
  const gameStatus = chess.isCheckmate() ? `${currentTurn === 'White' ? 'Black' : 'White'} wins by checkmate` : chess.isDraw() ? 'It’s a draw!' : `${currentTurn} to move`;
  const opponentName = room?.status === 'waiting' ? 'Waiting for a friend…' : playerColor === 'w' ? 'Black player' : 'White player';

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab('play')} aria-label="Fianchetto home"><span className="brand-mark">f</span><span>fianchetto<span className="brand-dot">.</span></span></button>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={tab === 'play' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('play')}><Swords size={17} /> Play</button>
          <button className={tab === 'learn' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('learn')}><BookOpen size={17} /> Learn</button>
          <button className={tab === 'puzzles' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('puzzles')}><Sparkles size={17} /> Puzzles</button>
        </nav>
        <div className="top-actions"><span className="streak"><Flame size={16} fill="currentColor" /> 0 day streak</span><button className="avatar" title="Your profile">{displayName.slice(0, 1).toUpperCase()}</button><button className="mobile-menu" onClick={() => setMobileChat(!mobileChat)} aria-label="Toggle chat"><Menu /></button></div>
      </header>

      <main className="page-content">
        {tab === 'play' ? <>
          <section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR LITTLE CHESS CORNER</div><h1>Ready when <span>you are.</span></h1><p className="welcome-copy">A friendly place to play, practice, and get a little better every day.</p></div><div className="welcome-badge"><span>♞</span><div><strong>One move at a time</strong><small>There’s no rush to be a grandmaster.</small></div></div></section>
          {notice && <div className="notice" role="status"><CircleHelp size={17} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}
          <section className="game-layout">
            <div className="board-column">
              <div className="player-card opponent"><div className="player-avatar opponent-avatar">{room?.status === 'waiting' ? <Users size={20} /> : '♟'}</div><div className="player-info"><strong>{roomId ? opponentName : 'Friendly practice'}</strong><span>{roomId ? room.status === 'waiting' ? 'Invite a friend to join' : 'Playing together online' : 'Just you and the board'}</span></div><span className="rating-pill"><ShieldCheck size={14} /> FRIENDLY</span></div>
              <div className="board-frame"><div className="board-ribbon"><span className="live-dot" />{roomId ? room.status === 'waiting' ? 'ROOM OPEN' : 'LIVE GAME' : 'PRACTICE BOARD'}<button className="board-options" title="Board options"><Settings2 size={16} /></button></div><div className="board-wrap"><Chessboard position={fen} onPieceDrop={onDrop} boardWidth={boardWidth} boardOrientation={playerColor === 'b' ? 'black' : 'white'} arePiecesDraggable={!chess.isGameOver() && (!roomId || room?.status === 'playing')} customDarkSquareStyle={{ backgroundColor: '#93aa82' }} customLightSquareStyle={{ backgroundColor: '#edf0df' }} customBoardStyle={{ borderRadius: '8px', overflow: 'hidden' }} /></div><div className="board-controls"><button onClick={startNewGame} title="Start a new game"><RotateCcw size={16} /> New game</button><button onClick={() => { const flipped = playerColor === 'b' ? 'w' : 'b'; setPlayerColor(flipped); }} title="Flip the board"><ArrowDownUp size={16} /> Flip board</button><span className="turn-label"><span className="turn-dot" />{gameStatus}</span></div></div>
              <div className="player-card self"><div className="player-avatar self-avatar">{displayName.slice(0, 1).toUpperCase()}</div><div className="player-info"><strong>{displayName || 'Guest'} {roomId && playerColor ? `· ${playerColor === 'w' ? 'White' : 'Black'}` : '· You'}</strong><span>{chess.isCheck() ? 'Check! Find a safe move.' : 'You’re doing great!'}</span></div><span className="rating-pill"><Crown size={14} /> LEARNER</span></div>
              <div className="below-board"><span><ShieldCheck size={15} /> A kind, no-pressure space to learn</span><button onClick={openOnline}><Users size={16} /> Play with a friend <ChevronRight size={15} /></button></div>
            </div>
            <aside className={`side-column ${mobileChat ? 'show-mobile' : ''}`}>
              <div className="side-card game-card"><div className="card-title-row"><div><span className="card-kicker">LET’S PLAY</span><h2>Make it a match</h2></div><div className="heading-icon"><Swords size={19} /></div></div><p>Bring a friend to the board or keep practicing together.</p><button className="primary-button" onClick={openOnline}><Users size={17} /> Play with a friend <ArrowRight size={16} /></button><div className="soft-divider" /><div className="quick-row"><span className="quick-icon peach-icon"><RotateCcw size={16} /></span><div><strong>Start fresh</strong><small>A new local game, whenever you like.</small></div><button className="icon-button" onClick={startNewGame} aria-label="Start a fresh local game"><ChevronRight size={18} /></button></div><div className="quick-row"><span className="quick-icon mint-icon"><Flag size={16} /></span><div><strong>Game status</strong><small>{gameStatus}</small></div></div></div>
              <div className="side-card chat-card"><div className="chat-heading"><div className="heading-icon chat-heading-icon"><MessageCircle size={18} /></div><div><h2>Friend chat</h2><span>{roomId ? room?.status === 'waiting' ? 'Waiting for your friend' : 'Just your game room' : 'Connect with a friend to chat'}</span></div><span className="chat-lock"><ShieldCheck size={15} /></span></div>
                {!roomId ? <div className="empty-chat"><div className="chat-illustration"><MessageCircle size={24} /><span>♡</span></div><strong>A little encouragement goes a long way.</strong><p>Start a private game to chat with your friend while you play.</p><button onClick={openOnline}>Set up a game <ChevronRight size={15} /></button></div> : <><div className="chat-notice"><ShieldCheck size={14} /> Be kind. Keep personal details private.</div><div className="messages-list">{messages.length === 0 && <div className="chat-placeholder">Say hello or send a friendly “good move!” 👋</div>}{messages.map((message) => <div className="chat-message" key={message.id}><span className="message-avatar">{message.display_name.slice(0, 1).toUpperCase()}</span><div><strong>{message.display_name}</strong><p>{message.message}</p></div></div>)}<div ref={messagesEnd} /></div>{chatError && <p className="chat-error">{chatError}</p>}<form className="chat-compose" onSubmit={sendMessage}><input aria-label="Type a chat message" value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder={chatReady ? 'Write a kind message…' : 'Setting up chat…'} maxLength={300} disabled={!chatReady} /><button type="submit" disabled={!chatReady || !chatText.trim()} aria-label="Send message"><Send size={16} /></button></form><p className="chat-footnote">Messages are limited to 300 characters.</p></>}
              </div>
            </aside>
          </section>
          <section className="bottom-note"><div className="note-icon"><GraduationCap size={18} /></div><div><strong>Every chess player started with their first move.</strong><span>Take your time, try things out, and remember: learning is the real win.</span></div><span className="note-sparkle">✳</span></section>
        </> : <section className="learning-page"><div className="eyebrow"><span className="eyebrow-dot" /> SMALL STEPS, BIG IDEAS</div><h1>{tab === 'learn' ? <>Let’s learn <span>together.</span></> : <>A little puzzle, <span>a lot of fun.</span></>}</h1><p className="welcome-copy">{tab === 'learn' ? 'Explore chess one friendly lesson at a time.' : 'Practice spotting clever moves. No score, no pressure.'}</p><div className="lesson-grid">{lessons.map((lesson, index) => <article className="lesson-card" key={lesson.title}><div className={`lesson-art ${lesson.color}`}><span>{lesson.icon}</span><span className="lesson-number">0{index + 1}</span></div><span className="lesson-level">{lesson.level}</span><h2>{tab === 'puzzles' ? ['Spot the fork', 'Find the free piece', 'Mate in one'][index] : lesson.title}</h2><p>{tab === 'puzzles' ? 'Look carefully — there’s a great move here.' : lesson.detail}</p><button onClick={() => { setTab('play'); setNotice('Your practice board is ready. Try out what you learned!'); }}>{tab === 'puzzles' ? 'Try this puzzle' : 'Start learning'} <ArrowRight size={15} /></button></article>)}</div><button className="back-to-board" onClick={() => setTab('play')}><ArrowLeft size={16} /> Back to the chessboard</button></section>}
      </main>

      <footer className="footer"><span>♞ &nbsp; Made for curious minds.</span><span><ShieldCheck size={14} /> Play kindly. Learn happily.</span></footer>

      {modal && <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setModal(null); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button>{modal === 'online' ? <><div className="modal-icon"><Users size={23} /></div><span className="card-kicker">BETTER WITH A FRIEND</span><h2 id="modal-title">Let’s play together.</h2><p className="modal-copy">Create a private room and share the invite code, or join a friend’s game.</p><label className="field-label" htmlFor="player-name">Your name</label><input id="player-name" className="modal-input" value={displayName} maxLength={20} onChange={(event) => setDisplayName(event.target.value)} placeholder="Choose a nickname" /><button className="primary-button modal-primary" onClick={handleCreateRoom} disabled={busy || !firebaseConfigured}>{busy ? 'Creating your room…' : <><Plus size={17} /> Create a private game</>}</button><div className="modal-divider"><span /> OR JOIN A FRIEND <span /></div><label className="field-label" htmlFor="invite-code">Friend’s invite code</label><div className="join-row"><input id="invite-code" className="modal-input code-input" value={codeInput} maxLength={6} onChange={(event) => setCodeInput(event.target.value.toUpperCase())} placeholder="e.g. H7K2LM" /><button className="join-button" onClick={handleJoinRoom} disabled={busy || codeInput.trim().length < 6 || !firebaseConfigured}>Join <ArrowRight size={15} /></button></div>{!firebaseConfigured && <div className="setup-hint"><CircleHelp size={15} /> Online games need Firebase settings. Follow the setup steps in README.md.</div>}{!chatConfigured && <div className="setup-hint"><MessageCircle size={15} /> For private chat, also connect a Supabase project.</div>}</> : <><div className="modal-icon success-icon"><Check size={23} /></div><span className="card-kicker">YOUR PRIVATE ROOM IS READY</span><h2 id="modal-title">Invite a friend.</h2><p className="modal-copy">Share this code with someone you know. Your game will begin when they join.</p><div className="invite-code">{inviteCode}</div><button className="primary-button modal-primary" onClick={async () => { try { await navigator.clipboard.writeText(inviteCode); setNotice('Invite code copied — send it to your friend!'); } catch { setNotice(`Your invite code is ${inviteCode}. Share it with your friend.`); } setModal(null); }}><Check size={17} /> Copy invite code</button><button className="text-button" onClick={() => { setModal(null); setNotice(`Waiting for a friend to join with code ${inviteCode}.`); }}>I’ve shared it — go to my board <ArrowRight size={15} /></button></>}</section></div>}
    </div>
  );
}
