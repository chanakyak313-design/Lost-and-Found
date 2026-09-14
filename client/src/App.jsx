import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Bell, BookOpen, BriefcaseBusiness, Check, ChevronDown, CircleHelp,
  Compass, FileText, Gift, HeartHandshake, KeyRound, LayoutDashboard, LogOut,
  Menu, PackageSearch, Plus, Search, ShieldCheck, Sparkles, Trophy, UserRound,
  X, Zap,
} from 'lucide-react';
import { io } from 'socket.io-client';
import { AdminDashboard, Claims, Matches, RealRewards } from './FeatureViews.jsx';

const API = import.meta.env.VITE_API_URL || '/api';
const categories = ['All items', 'Electronics', 'Bags', 'Keys', 'Documents', 'Clothing', 'Accessories'];
async function request(path, options = {}) {
  const token = localStorage.getItem('foundly_token');
  const response = await fetch(`${API.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'The request could not be completed.');
  return result;
}

function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('foundly_user') || 'null'));
  const [view, setView] = useState(user ? 'dashboard' : 'welcome');
  const [items, setItems] = useState([]);
  const [itemsError, setItemsError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('foundly_token');
    if (!token) {
      localStorage.removeItem('foundly_user');
      setUser(null);
      return undefined;
    }
    request('/auth/me').then((result) => {
      const currentUser = result.data?.user;
      if (!currentUser) throw new Error('Session is invalid.');
      setUser(currentUser);
      localStorage.setItem('foundly_user', JSON.stringify(currentUser));
    }).catch(() => {
      localStorage.removeItem('foundly_token');
      localStorage.removeItem('foundly_user');
      setUser(null);
    });
    return undefined;
  }, []);

  useEffect(() => {
    request('/items?limit=30').then((result) => {
      setItems(result.data?.items || []);
      setItemsError('');
    }).catch((error) => setItemsError(error.message || 'Could not load campus items.'));
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('foundly_token');
    if (!token || !user) return undefined;
    const socketOrigin = API.replace(/\/api\/?$/, '').replace(/\/$/, '') || window.location.origin;
    const socket = io(socketOrigin, { auth: { token } });
    socket.on('connect', () => socket.emit('join', user.id || user._id));
    const refresh = (message) => {
      setToast(message);
      request('/items?limit=30').then((result) => setItems(result.data?.items || [])).catch(() => {});
    };
    socket.on('itemCreated', () => refresh('A new campus item was posted.'));
    socket.on('matchFound', () => refresh('Foundly found a possible match for you.'));
    socket.on('newClaim', () => refresh('Someone sent a claim on an item.'));
    socket.on('claimUpdate', () => refresh('A claim status was updated.'));
    socket.on('chatMessage', () => setToast('New message in your handover chat.'));
    return () => socket.disconnect();
  }, [user]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  function login(nextUser) {
    setUser(nextUser);
    localStorage.setItem('foundly_user', JSON.stringify(nextUser));
    setView('dashboard');
  }

  function logout() {
    localStorage.removeItem('foundly_token');
    localStorage.removeItem('foundly_user');
    setUser(null);
    setView('welcome');
  }

  const notify = useCallback((message) => setToast(message), []);

  async function createItem(form) {
    try {
      let images = [];
      if (form.files?.length) {
        const uploadData = new FormData();
        form.files.forEach((file) => uploadData.append('images', file));
        const token = localStorage.getItem('foundly_token');
        const uploadResponse = await fetch(`${API.replace(/\/$/, '')}/upload`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: uploadData,
        });
        const uploadResult = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok) throw new Error(uploadResult.message || 'Image upload failed.');
        images = uploadResult.data?.files || [];
      }
      const result = await request('/items', {
        method: 'POST',
        body: JSON.stringify({
          type: form.type,
          title: form.title,
          category: form.category,
          description: form.description,
          dateOccurred: form.dateOccurred,
          location: { name: form.location },
          images,
        }),
      });
      const item = result.data?.item;
      if (!item) throw new Error('The server did not return the new item.');
      setItems((current) => [item, ...current]);
      setView('browse');
      notify('Your post is live. We will watch for a match.');
    } catch (error) {
      notify(error.message || 'Could not publish your post. Please try again.');
    }
  }

  if (!user) return <AuthScreen onLogin={login} />;

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} user={user} onLogout={logout} />
      <main className="main-content">
        <Topbar user={user} view={view} onMenu={() => setView('menu')} setView={setView} />
        {view === 'dashboard' && <Dashboard items={items} itemsError={itemsError} setView={setView} notify={notify} user={user} />}
        {view === 'browse' && <Browse items={items} notify={notify} />}
        {view === 'create' && <CreatePost user={user} onCreated={createItem} />}
        {view === 'rewards' && <RealRewards request={request} notify={notify} user={user} />}
        {view === 'matches' && <Matches request={request} notify={notify} setView={setView} />}
        {view === 'claims' && <Claims request={request} notify={notify} />}
        {view === 'admin' && user.role === 'admin' && <AdminDashboard request={request} notify={notify} />}
        {view === 'profile' && <Profile user={user} onLogout={logout} notify={notify} />}
        {view === 'notifications' && <Notifications notify={notify} />}
        {view === 'menu' && <MobileMenu setView={setView} />}
      </main>
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  );
}

function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const result = await request(`/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: JSON.stringify(form) });
      if (result.data?.token) localStorage.setItem('foundly_token', result.data.token);
      if (!result.data?.user) throw new Error('The server did not return a user session.');
      onLogin(result.data.user);
    } catch (error) {
      setError(error.message || 'Could not reach Foundly. Please try again.');
    } finally { setLoading(false); }
  }

  return <div className="auth-page">
    <div className="auth-art"><div className="brand-mark"><Compass size={22} /> foundly</div><div className="art-copy"><span className="eyebrow">THE CAMPUS MEMORY</span><h1>Small things<br /><em>find their way</em><br />back.</h1><p>A thoughtful lost & found for the places you know best.</p></div><div className="art-stamp"><Sparkles size={15} /> AI-assisted matching</div></div>
    <div className="auth-panel"><div className="mobile-brand"><Compass size={21} /> foundly</div><div className="auth-intro"><span className="eyebrow">WELCOME BACK</span><h2>{mode === 'login' ? 'Good to see you.' : 'Join the circle.'}</h2><p>{mode === 'login' ? 'Pick up where you left off.' : 'Make campus a little more connected.'}</p></div><form onSubmit={submit} className="auth-form">
      {mode === 'signup' && <label>Full name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" /></label>}
      <label>Campus email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@campus.edu" /></label>
      <label>Password<input required minLength="8" maxLength="128" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" /></label>
      {error && <p className="form-error">{error}</p>}<button className="primary-btn wide" disabled={loading}>{loading ? 'Opening Foundly...' : mode === 'login' ? 'Enter Foundly' : 'Create account'} <ArrowRight size={18} /></button>
    </form><button className="switch-auth" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'New here? Create an account' : 'Already a member? Sign in'}</button><p className="auth-note"><ShieldCheck size={15} /> Your campus details stay private.</p></div>
  </div>;
}

function Sidebar({ view, setView, user, onLogout }) {
  const links = [{ id: 'dashboard', icon: LayoutDashboard, label: 'Overview' }, { id: 'browse', icon: PackageSearch, label: 'Explore items' }, { id: 'create', icon: Plus, label: 'Post an item' }, { id: 'matches', icon: Sparkles, label: 'Matches' }, { id: 'claims', icon: ShieldCheck, label: 'My claims' }, { id: 'notifications', icon: Bell, label: 'Notifications' }];
  return <aside className="sidebar"><div className="brand"><Compass size={22} /> foundly</div><div className="side-label">Your space</div><nav>{links.map(({ id, icon: Icon, label }) => <button className={`nav-link ${view === id ? 'active' : ''}`} key={id} onClick={() => setView(id)}><Icon size={18} /><span>{label}</span></button>)}</nav><div className="side-label second">Community</div><nav><button className={`nav-link ${view === 'rewards' ? 'active' : ''}`} onClick={() => setView('rewards')}><Trophy size={18} /><span>Good deeds</span></button><button className={`nav-link ${view === 'profile' ? 'active' : ''}`} onClick={() => setView('profile')}><UserRound size={18} /><span>My profile</span></button>{user.role === 'admin' && <button className={`nav-link ${view === 'admin' ? 'active' : ''}`} onClick={() => setView('admin')}><ShieldCheck size={18} /><span>Admin</span></button>}</nav><div className="side-bottom"><div className="mini-profile"><div className="avatar">{(user.name || 'C').slice(0, 1).toUpperCase()}</div><div><strong>{user.name || 'Campus member'}</strong><small>{user.rewardPoints || 35} points</small></div><ChevronDown size={15} /></div><button className="logout-btn" onClick={onLogout}><LogOut size={15} /> Sign out</button></div></aside>;
}

function Topbar({ user, view, onMenu, setView }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60 * 1000);

    return () => clearInterval(timer);
  }, []);

  const hour = now.getHours();

  const greeting =
    hour >= 5 && hour < 12
      ? 'Good morning'
      : hour >= 12 && hour < 17
        ? 'Good afternoon'
        : hour >= 17 && hour < 21
          ? 'Good evening'
          : 'Good night';

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(now).toUpperCase();

  const titles = {
    dashboard: greeting,
    browse: 'Explore the campus',
    create: 'Make a post',
    rewards: 'Your good deeds',
    profile: 'Personal details',
    notifications: 'Notifications',
    matches: 'Your possible matches',
    claims: 'Your claims',
    admin: 'Admin dashboard',
    menu: 'Menu',
  };

  return (
    <header className="topbar">
      <button
        className="mobile-menu"
        onClick={onMenu}
        aria-label="Open menu"
        title="Open menu"
      >
        <Menu size={21} />
      </button>

      <div>
        <span className="top-kicker">{dateLabel}</span>

        <h2>
          {titles[view] || 'Foundly'}
          {view === 'dashboard' && (
            <span className="hello">
              , {user.name?.split(' ')[0] || 'friend'}
            </span>
          )}
        </h2>
      </div>

      <div className="top-actions">
        <button
          className="icon-btn"
          onClick={() => setView('browse')}
          aria-label="Search items"
          title="Search items"
        >
          <Search size={19} />
        </button>

        <button
          className="icon-btn notification"
          onClick={() => setView('notifications')}
          aria-label="Open notifications"
          title="Open notifications"
        >
          <Bell size={19} />
          <i />
        </button>

        <button
          className="top-avatar"
          onClick={() => setView('profile')}
          aria-label="Open profile"
          title="Open profile"
        >
          {(user.name || 'C').slice(0, 1).toUpperCase()}
        </button>
      </div>
    </header>
  );
}
function Dashboard({ items, itemsError, setView, notify, user }) { const found = items.filter((item) => item.type === 'found').length; return <div className="page fade-in"><section className="hero-banner"><div><span className="eyebrow warm">CAMPUS PULSE</span><h1>What’s looking<br /><em>for you?</em></h1><p>There are <strong>{found} new finds</strong> around campus right now.</p><button className="primary-btn" onClick={() => setView('browse')}>Explore new finds <ArrowRight size={17} /></button></div><div className="hero-illustration"><div className="sun" /><div className="hero-card card-one"><KeyRound size={20} /><strong>Keys</strong><small>Campus reports</small></div><div className="hero-card card-two"><HeartHandshake size={20} /><strong>Community</strong><small>helping each other</small></div><div className="hero-ring" /></div></section>{itemsError && <div className="error-banner">{itemsError}</div>}<div className="section-heading"><div><span className="eyebrow">JUST IN</span><h3>Recent activity</h3></div><button className="text-btn" onClick={() => setView('browse')}>View all <ArrowRight size={15} /></button></div><div className="item-grid">{items.slice(0, 3).map((item) => <ItemCard item={item} key={item._id} notify={notify} />)}</div>{!itemsError && items.length === 0 && <div className="empty-state"><PackageSearch size={35} /><h3>No campus reports yet</h3><p>Be the first person to post a lost or found item.</p></div>}<div className="dashboard-lower"><div className="good-deed"><div className="deed-icon"><Sparkles size={20} /></div><div><span className="eyebrow">A LITTLE EXTRA</span><h3>Good deeds add up.</h3><p>Share a found item and earn points toward your campus impact score.</p></div><button className="round-arrow" onClick={() => setView('create')}><ArrowRight size={18} /></button></div><div className="impact-card"><span className="eyebrow">YOUR IMPACT</span><strong>{user.rewardPoints || 0}</strong><p>points earned</p><div className="progress"><i style={{ width: `${Math.min((user.rewardPoints || 0) / 2, 100)}%` }} /></div></div></div></div>; }

function Browse({ items, notify }) { const [query, setQuery] = useState(''); const [filter, setFilter] = useState('All items'); const filtered = useMemo(() => items.filter((item) => (filter === 'All items' || String(item.category || '').toLowerCase() === filter.toLowerCase()) && `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase())), [items, filter, query]); function findNearby() { if (!navigator.geolocation) { notify('Location is not available in this browser.'); return; } navigator.geolocation.getCurrentPosition(() => notify('Nearby reports are now prioritized.'), () => notify('Location access was not granted.')); } return <div className="page fade-in"><div className="browse-intro"><div><span className="eyebrow">OPEN EYES, OPEN HEART</span><h1>Find what’s<br /><em>been found.</em></h1></div><p>Browse the latest reports from your campus community. Something familiar?</p></div><div className="search-row"><div className="search-field"><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by item, place, or detail..." /></div><button className="filter-btn" onClick={findNearby}><Compass size={17} /> Nearby <ChevronDown size={15} /></button></div><div className="category-row">{categories.map((category) => <button key={category} className={filter === category ? 'selected' : ''} onClick={() => setFilter(category)}>{category}</button>)}</div><div className="results-meta"><span><strong>{filtered.length}</strong> stories on the board</span><span className="live-dot"><i /> Live updates</span></div><div className="item-grid browse-grid">{filtered.map((item) => <ItemCard item={item} key={item._id} notify={notify} />)}</div>{filtered.length === 0 && <div className="empty-state"><PackageSearch size={35} /><h3>No matching finds yet</h3><p>Try another search or be the first to post one.</p></div>}</div>; }

function ItemCard({ item, notify }) {
  const [saved, setSaved] = useState(() => JSON.parse(localStorage.getItem('foundly_watchlist') || '[]').includes(item._id));
  function toggleSaved() {
    const current = JSON.parse(localStorage.getItem('foundly_watchlist') || '[]');
    const next = saved ? current.filter((id) => id !== item._id) : [...new Set([...current, item._id])];
    localStorage.setItem('foundly_watchlist', JSON.stringify(next));
    setSaved(!saved);
    notify(saved ? 'Removed from your watchlist' : 'Saved to your watchlist');
  }
  async function claim() {
    if (item.type !== 'found') { notify('We will keep watching for a match.'); return; }
    const description = window.prompt('Tell the owner why this item is yours:');
    if (!description) return;
    const verificationAnswer = window.prompt('Add a detail only the owner would know:');
    if (!verificationAnswer) return;
    try {
      await request('/claims', { method: 'POST', body: JSON.stringify({ itemId: item._id, description, verificationAnswer }) });
      notify('Claim sent. The owner will review it soon.');
    } catch (error) { notify(error.message || 'Could not send your claim. Please try again.'); }
  }
  return <article className={`item-card ${item.accent || 'mint'}`}><div className="item-top"><span className={`type-pill ${item.type}`}>{item.type === 'found' ? 'Found' : 'Lost'}</span><button className="heart-btn" onClick={toggleSaved} aria-label={saved ? 'Remove from watchlist' : 'Save to watchlist'} title={saved ? 'Remove from watchlist' : 'Save to watchlist'}><HeartHandshake size={17} fill={saved ? 'currentColor' : 'none'} /></button></div><div className="item-glyph">{item.category === 'Electronics' ? <BriefcaseBusiness /> : item.category === 'Keys' ? <KeyRound /> : item.category === 'Documents' ? <FileText /> : item.category === 'Bags' ? <BriefcaseBusiness /> : <PackageSearch />}</div><div className="item-copy"><span className="category-label">{item.category}</span><h3>{item.title}</h3><p>{item.description}</p></div><div className="item-footer"><span><Compass size={14} /> {item.location?.name || 'Campus'}</span><span>{formatDate(item.dateOccurred)}</span></div><button className="claim-btn" onClick={claim}>{item.type === 'found' ? 'This is mine' : 'Watch for match'} <ArrowRight size={15} /></button></article>;
}

function CreatePost({ onCreated }) { const [form, setForm] = useState({ type: 'lost', title: '', category: 'Electronics', location: '', description: '', dateOccurred: new Date().toISOString().slice(0, 10), files: [] }); const [step, setStep] = useState(1); function update(key, value) { setForm((current) => ({ ...current, [key]: value })); } function submit(event) { event.preventDefault(); onCreated(form); } return <div className="page narrow-page fade-in"><div className="create-heading"><span className="eyebrow">STEP {step} OF 2</span><h1>Put it out<br /><em>into the world.</em></h1><p>The more detail you share, the kinder the internet can be.</p></div><div className="stepper"><div className={step >= 1 ? 'on' : ''}><span>1</span> The essentials</div><div className={step >= 2 ? 'on' : ''}><span>2</span> A few details</div></div><form className="post-form" onSubmit={step === 1 ? (e) => { e.preventDefault(); setStep(2); } : submit}>{step === 1 ? <><label>What happened?<div className="segmented"><button type="button" className={form.type === 'lost' ? 'chosen' : ''} onClick={() => update('type', 'lost')}>I lost something</button><button type="button" className={form.type === 'found' ? 'chosen' : ''} onClick={() => update('type', 'found')}>I found something</button></div></label><label>What should we call it?<input required value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="e.g. Navy blue water bottle" /></label><label>Category<select value={form.category} onChange={(e) => update('category', e.target.value)}>{categories.slice(1).map((category) => <option key={category}>{category}</option>)}</select></label><button className="primary-btn wide">Next step <ArrowRight size={17} /></button></> : <><label>Where did it happen?<input required value={form.location} onChange={(e) => update('location', e.target.value)} placeholder="e.g. Library, second floor" /></label><label>When?<input required type="date" value={form.dateOccurred} onChange={(e) => update('dateOccurred', e.target.value)} /></label><label>Photos (optional)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => update('files', [...e.target.files].slice(0, 5))} /></label><label>Tell the story<textarea required rows="5" value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="Color, marks, what was inside, anything that could help..." /></label><div className="form-actions"><button type="button" className="back-btn" onClick={() => setStep(1)}>Back</button><button className="primary-btn">Publish post <Sparkles size={17} /></button></div></>}</form><p className="privacy-note"><ShieldCheck size={15} /> We never show your email publicly.</p></div>; }

function Rewards({ user }) { const points = user.rewardPoints || 35; return <div className="page fade-in"><div className="rewards-head"><div><span className="eyebrow">THE ROLL OF HONOR</span><h1>Good looks<br /><em>good on you.</em></h1><p>Every small act makes campus feel more like a community.</p></div><div className="points-orbit"><div><span>YOUR SCORE</span><strong>{points}</strong><small>points</small></div></div></div><div className="reward-stats"><div><Zap size={18} /><strong>+10</strong><span>for reporting a find</span></div><div><HeartHandshake size={18} /><strong>+50</strong><span>for a successful return</span></div><div><Trophy size={18} /><strong>2,480</strong><span>campus points this month</span></div></div><div className="section-heading"><div><span className="eyebrow">YOUR MILESTONES</span><h3>Badges in progress</h3></div></div><div className="badges"><Badge icon={<Sparkles />} title="First Finder" text="Create your first post" done /><Badge icon={<HeartHandshake />} title="Campus Helper" text="Reach 50 points" progress={Math.min(points * 2, 100)} /><Badge icon={<Trophy />} title="Recovery Expert" text="Reach 200 points" progress={Math.min(points / 2, 100)} /><Badge icon={<Gift />} title="Top Contributor" text="Reach 500 points" /></div></div>; }
function Badge({ icon, title, text, done, progress = 0 }) { return <div className={`badge-card ${done ? 'done' : ''}`}><div className="badge-icon">{icon}</div><div><h3>{title}{done && <Check size={15} />}</h3><p>{text}</p>{!done && <div className="progress"><i style={{ width: `${progress}%` }} /></div>}</div></div>; }
function Profile({ user, onLogout, notify }) {
  const [name, setName] = useState(user.name || 'Campus member');
  const [department, setDepartment] = useState(user.department || '');
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const result = await request('/auth/profile', { method: 'PUT', body: JSON.stringify({ name, department }) });
      localStorage.setItem('foundly_user', JSON.stringify(result.data?.user || { ...user, name, department }));
      notify('Profile updated');
    } catch (error) { notify(error.message || 'Could not update your profile.'); }
    finally { setSaving(false); }
  }
  return <div className="page narrow-page fade-in"><div className="profile-head"><div className="profile-avatar">{name.slice(0, 1).toUpperCase()}</div><div><span className="eyebrow">YOUR CORNER OF CAMPUS</span><h1>Make it yours.</h1><p>Keep your details current so good things find you.</p></div></div><div className="profile-form"><label>Display name<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>Campus email<input value={user.email || ''} disabled /></label><label>Department<input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Design & Technology" /></label><button className="primary-btn" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save changes'} <Check size={16} /></button></div><button className="danger-link" onClick={onLogout}><LogOut size={15} /> Sign out of Foundly</button></div>;
}
function Notifications({ notify }) {
  const [notices, setNotices] = useState([]);
  useEffect(() => {
    request('/notifications?limit=30').then((result) => setNotices(result.data?.notifications || [])).catch((error) => notify(error.message || 'Could not load notifications.'));
  }, [notify]);
  async function markAllRead() {
    try {
      await request('/notifications/read-all', { method: 'PUT' });
      setNotices((current) => current.map((notice) => ({ ...notice, read: true })));
      notify('All notifications marked as read');
    } catch (error) { notify(error.message || 'Could not update notifications.'); }
  }
  return <div className="page narrow-page fade-in"><div className="notice-head"><div><span className="eyebrow">KEEPING YOU IN THE LOOP</span><h1>Worth a look.</h1></div><button className="text-btn" onClick={markAllRead}>Mark all read</button></div><div className="notice-list">{notices.length === 0 && <div className="empty-state"><Bell size={30} /><h3>No notifications yet</h3><p>New matches and claim updates will appear here.</p></div>}{notices.map((notice) => <div className="notice" key={notice._id}><div className="notice-icon"><Sparkles size={17} /></div><div><h3>{notice.title}</h3><p>{notice.message}</p><small>{formatDate(notice.createdAt)}</small></div><button onClick={() => notify('Notification details opened')}><X size={16} /></button></div>)}</div></div>;
}
function MobileMenu({ setView }) { return <div className="mobile-menu-page"><div className="mobile-menu-card"><span className="eyebrow">NAVIGATE</span>{['dashboard', 'browse', 'create', 'matches', 'claims', 'rewards', 'profile', 'notifications'].map((item) => <button key={item} onClick={() => setView(item)}>{item === 'create' ? <Plus size={18} /> : item === 'browse' ? <PackageSearch size={18} /> : item === 'rewards' ? <Trophy size={18} /> : item === 'profile' ? <UserRound size={18} /> : item === 'notifications' ? <Bell size={18} /> : item === 'matches' ? <Sparkles size={18} /> : item === 'claims' ? <ShieldCheck size={18} /> : <LayoutDashboard size={18} />}{item}</button>)}</div></div>; }
function formatDate(date) { if (!date) return 'Recently'; const parsed = new Date(date); return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

export default App;
