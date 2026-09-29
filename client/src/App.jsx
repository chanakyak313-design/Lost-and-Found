import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, BriefcaseBusiness, Check, ChevronDown, Compass, FileText,
  HeartHandshake, KeyRound, LayoutDashboard, Menu, PackageSearch, Plus, Search, Sparkles, X,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';
const categories = ['All items', 'Electronics', 'Bags', 'Keys', 'Documents', 'Clothing', 'Accessories'];

async function request(path, options = {}) {
  const response = await fetch(`${API.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'The request could not be completed.');
  return result;
}

function App() {
  const [view, setView] = useState('dashboard');
  const [items, setItems] = useState([]);
  const [itemsError, setItemsError] = useState('');
  const [toast, setToast] = useState('');

  async function loadItems() {
    try {
      const result = await request('/items?limit=100');
      setItems(result.data?.items || []);
      setItemsError('');
    } catch (error) {
      setItemsError(error.message || 'Could not load campus items.');
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  function notify(message) {
    setToast(message);
  }

  async function createItem(form) {
    try {
      let images = [];
      if (form.files?.length) {
        const uploadData = new FormData();
        form.files.forEach((file) => uploadData.append('images', file));
        const uploadResponse = await fetch(`${API.replace(/\/$/, '')}/upload`, { method: 'POST', body: uploadData });
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
      notify('Your post is live.');
    } catch (error) {
      notify(error.message || 'Could not publish your post. Please try again.');
    }
  }

  async function refreshAndNotify(message) {
    await loadItems();
    notify(message);
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} />
      <main className="main-content">
        <Topbar view={view} onMenu={() => setView('menu')} setView={setView} />
        {view === 'dashboard' && <Dashboard items={items} itemsError={itemsError} setView={setView} />}
        {view === 'browse' && <Browse items={items} notify={notify} />}
        {view === 'create' && <CreatePost onCreated={createItem} />}
        {view === 'manage' && <ManageItems items={items} notify={notify} onRefresh={loadItems} onDone={refreshAndNotify} />}
        {view === 'menu' && <MobileMenu setView={setView} />}
      </main>
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  );
}

function Sidebar({ view, setView }) {
  const links = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
    { id: 'browse', icon: PackageSearch, label: 'Explore items' },
    { id: 'create', icon: Plus, label: 'Post an item' },
    { id: 'manage', icon: Sparkles, label: 'Manage items' },
  ];

  return <aside className="sidebar"><div className="brand"><Compass size={22} /> foundly</div><div className="side-label">Lost & found</div><nav>{links.map(({ id, icon: Icon, label }) => <button className={`nav-link ${view === id ? 'active' : ''}`} key={id} onClick={() => setView(id)}><Icon size={18} /><span>{label}</span></button>)}</nav></aside>;
}

function Topbar({ view, onMenu, setView }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const hour = now.getHours();
  const greeting = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : hour >= 17 && hour < 21 ? 'Good evening' : 'Good night';
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(now).toUpperCase();

  const titles = {
    dashboard: greeting,
    browse: 'Explore the campus',
    create: 'Make a post',
    manage: 'Manage reports',
    menu: 'Menu',
  };

  return (
    <header className="topbar">
      <button className="mobile-menu" onClick={onMenu} aria-label="Open menu" title="Open menu"><Menu size={21} /></button>
      <div><span className="top-kicker">{dateLabel}</span><h2>{titles[view] || 'Foundly'}</h2></div>
      <div className="top-actions"><button className="icon-btn" onClick={() => setView('browse')} aria-label="Search items" title="Search items"><Search size={19} /></button></div>
    </header>
  );
}

function Dashboard({ items, itemsError, setView }) {
  const found = items.filter((item) => item.type === 'found').length;
  return <div className="page fade-in"><section className="hero-banner"><div><span className="eyebrow warm">CAMPUS PULSE</span><h1>What’s looking<br /><em>for you?</em></h1><p>There are <strong>{found} new finds</strong> around campus right now.</p><button className="primary-btn" onClick={() => setView('browse')}>Explore new finds <ArrowRight size={17} /></button></div><div className="hero-illustration"><div className="sun" /><div className="hero-card card-one"><KeyRound size={20} /><strong>Keys</strong><small>Campus reports</small></div><div className="hero-card card-two"><HeartHandshake size={20} /><strong>Community</strong><small>helping each other</small></div><div className="hero-ring" /></div></section>{itemsError && <div className="error-banner">{itemsError}</div>}<div className="section-heading"><div><span className="eyebrow">JUST IN</span><h3>Recent activity</h3></div><button className="text-btn" onClick={() => setView('browse')}>View all <ArrowRight size={15} /></button></div><div className="item-grid">{items.slice(0, 3).map((item) => <ItemCard item={item} key={item._id} />)}</div>{!itemsError && items.length === 0 && <div className="empty-state"><PackageSearch size={35} /><h3>No campus reports yet</h3><p>Be the first person to post a lost or found item.</p></div>}</div>;
}

function Browse({ items, notify }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All items');

  const filtered = useMemo(() => items.filter((item) => (filter === 'All items' || String(item.category || '').toLowerCase() === filter.toLowerCase()) && `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase())), [items, filter, query]);

  function findNearby() {
    if (!navigator.geolocation) {
      notify('Location is not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(() => notify('Nearby reports are now prioritized.'), () => notify('Location access was not granted.'));
  }

  return <div className="page fade-in"><div className="browse-intro"><div><span className="eyebrow">OPEN EYES, OPEN HEART</span><h1>Find what’s<br /><em>been found.</em></h1></div><p>Browse the latest reports from your campus community. Something familiar?</p></div><div className="search-row"><div className="search-field"><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by item, place, or detail..." /></div><button className="filter-btn" onClick={findNearby}><Compass size={17} /> Nearby <ChevronDown size={15} /></button></div><div className="category-row">{categories.map((category) => <button key={category} className={filter === category ? 'selected' : ''} onClick={() => setFilter(category)}>{category}</button>)}</div><div className="results-meta"><span><strong>{filtered.length}</strong> stories on the board</span><span className="live-dot"><i /> Live updates</span></div><div className="item-grid browse-grid">{filtered.map((item) => <ItemCard item={item} key={item._id} />)}</div>{filtered.length === 0 && <div className="empty-state"><PackageSearch size={35} /><h3>No matching finds yet</h3><p>Try another search or be the first to post one.</p></div>}</div>;
}

function ItemCard({ item }) {
  const [saved, setSaved] = useState(() => JSON.parse(localStorage.getItem('foundly_watchlist') || '[]').includes(item._id));

  function toggleSaved() {
    const current = JSON.parse(localStorage.getItem('foundly_watchlist') || '[]');
    const next = saved ? current.filter((id) => id !== item._id) : [...new Set([...current, item._id])];
    localStorage.setItem('foundly_watchlist', JSON.stringify(next));
    setSaved(!saved);
  }

  return <article className={`item-card ${item.accent || 'mint'}`}><div className="item-top"><span className={`type-pill ${item.type}`}>{item.type === 'found' ? 'Found' : 'Lost'}</span><button className="heart-btn" onClick={toggleSaved} aria-label={saved ? 'Remove from watchlist' : 'Save to watchlist'} title={saved ? 'Remove from watchlist' : 'Save to watchlist'}><HeartHandshake size={17} fill={saved ? 'currentColor' : 'none'} /></button></div><div className="item-glyph">{item.category === 'Electronics' ? <BriefcaseBusiness /> : item.category === 'Keys' ? <KeyRound /> : item.category === 'Documents' ? <FileText /> : item.category === 'Bags' ? <BriefcaseBusiness /> : <PackageSearch />}</div><div className="item-copy"><span className="category-label">{item.category}</span><h3>{item.title}</h3><p>{item.description}</p></div><div className="item-footer"><span><Compass size={14} /> {item.location?.name || 'Campus'}</span><span>{formatDate(item.dateOccurred)}</span></div></article>;
}

function CreatePost({ onCreated }) {
  const [form, setForm] = useState({ type: 'lost', title: '', category: 'Electronics', location: '', description: '', dateOccurred: new Date().toISOString().slice(0, 10), files: [] });
  const [step, setStep] = useState(1);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onCreated(form);
  }

  return <div className="page narrow-page fade-in"><div className="create-heading"><span className="eyebrow">STEP {step} OF 2</span><h1>Put it out<br /><em>into the world.</em></h1><p>The more detail you share, the kinder the internet can be.</p></div><div className="stepper"><div className={step >= 1 ? 'on' : ''}><span>1</span> The essentials</div><div className={step >= 2 ? 'on' : ''}><span>2</span> A few details</div></div><form className="post-form" onSubmit={step === 1 ? (e) => { e.preventDefault(); setStep(2); } : submit}>{step === 1 ? <><label>What happened?<div className="segmented"><button type="button" className={form.type === 'lost' ? 'chosen' : ''} onClick={() => update('type', 'lost')}>I lost something</button><button type="button" className={form.type === 'found' ? 'chosen' : ''} onClick={() => update('type', 'found')}>I found something</button></div></label><label>What should we call it?<input required value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="e.g. Navy blue water bottle" /></label><label>Category<select value={form.category} onChange={(e) => update('category', e.target.value)}>{categories.slice(1).map((category) => <option key={category}>{category}</option>)}</select></label><button className="primary-btn wide">Next step <ArrowRight size={17} /></button></> : <><label>Where did it happen?<input required value={form.location} onChange={(e) => update('location', e.target.value)} placeholder="e.g. Library, second floor" /></label><label>When?<input required type="date" value={form.dateOccurred} onChange={(e) => update('dateOccurred', e.target.value)} /></label><label>Photos (optional)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => update('files', [...e.target.files].slice(0, 5))} /></label><label>Tell the story<textarea required rows="5" value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="Color, marks, what was inside, anything that could help..." /></label><div className="form-actions"><button type="button" className="back-btn" onClick={() => setStep(1)}>Back</button><button className="primary-btn">Publish post <Sparkles size={17} /></button></div></>}</form></div>;
}

function ManageItems({ items, notify, onDone }) {
  const [selectedId, setSelectedId] = useState('');
  const selected = items.find((item) => item._id === selectedId) || null;
  const [form, setForm] = useState({ title: '', category: '', description: '', location: '', status: 'open' });

  useEffect(() => {
    if (!selected) return;
    setForm({
      title: selected.title || '',
      category: selected.category || 'Accessories',
      description: selected.description || '',
      location: selected.location?.name || '',
      status: selected.status || 'open',
    });
  }, [selected]);

  async function save() {
    if (!selected) return;
    try {
      await request(`/items/${selected._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: form.title,
          category: form.category,
          description: form.description,
          location: { name: form.location },
          status: form.status,
        }),
      });
      await onDone('Item updated');
    } catch (error) {
      notify(error.message || 'Could not update item.');
    }
  }

  async function resolve() {
    if (!selected) return;
    try {
      await request(`/items/${selected._id}/mark-resolved`, { method: 'PUT', body: '{}' });
      await onDone('Item marked as resolved');
    } catch (error) {
      notify(error.message || 'Could not resolve item.');
    }
  }

  async function remove() {
    if (!selected) return;
    try {
      await request(`/items/${selected._id}`, { method: 'DELETE' });
      setSelectedId('');
      await onDone('Item deleted');
    } catch (error) {
      notify(error.message || 'Could not delete item.');
    }
  }

  return <div className="page narrow-page fade-in"><span className="eyebrow">MANAGE LISTINGS</span><h1 className="feature-title">Keep reports<br /><em>accurate and current.</em></h1><label>Choose an item<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Select...</option>{items.map((item) => <option value={item._id} key={item._id}>{item.title} ({item.type})</option>)}</select></label>{selected && <div className="profile-form"><label>Title<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label><label>Category<select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>{categories.slice(1).map((category) => <option key={category}>{category}</option>)}</select></label><label>Description<textarea rows="4" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label><label>Location<input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} /></label><label>Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option value="open">open</option><option value="resolved">resolved</option><option value="closed">closed</option></select></label><div className="form-actions"><button className="primary-btn" type="button" onClick={save}>Save changes</button><button className="text-btn" type="button" onClick={resolve}>Mark resolved</button><button className="danger-link" type="button" onClick={remove}><X size={15} /> Delete item</button></div></div>}</div>;
}

function MobileMenu({ setView }) {
  return <div className="mobile-menu-page"><div className="mobile-menu-card"><span className="eyebrow">NAVIGATE</span>{['dashboard', 'browse', 'create', 'manage'].map((item) => <button key={item} onClick={() => setView(item)}>{item === 'create' ? <Plus size={18} /> : item === 'browse' ? <PackageSearch size={18} /> : item === 'manage' ? <Sparkles size={18} /> : <LayoutDashboard size={18} />}{item}</button>)}</div></div>;
}

function formatDate(date) {
  if (!date) return 'Recently';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default App;
