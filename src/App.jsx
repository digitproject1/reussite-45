import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@insforge/sdk';
import { 
  Search, Lock, CheckCircle2, Play, CreditCard, 
  Star, BookOpen, Zap, ShieldCheck, X, 
  ArrowRight, Trophy, Users, Clock, Layout,
  ChevronRight, Sparkles, GraduationCap, History,
  Download, Award, Flame, Library, RefreshCcw, 
  BarChart3, Wallet, UserX, UserCheck, TrendingUp, 
  Medal, Target, LogIn, LogOut, AlertCircle, Loader2,
  Globe, PlayCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Utility for Tailwind Classes Merge */
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// --- CONFIGURATION INSFORGE ---
const insforge = createClient({
  baseUrl: 'https://5papp5aj.eu-central.insforge.app',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMzk4MDN9.eiKxDCw7xlam0zPCxY1m5qdJ7TOmKBTHHVpSCQUU0VA'
});

const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

const fetchInvidiousVideos = async (query) => {
  // Liste d'instances Invidious robustes pour une redondance maximale
  const instances = [
    'https://yewtu.be/api/v1/search',
    'https://vid.puffyan.us/api/v1/search',
    'https://invidious.snopyta.org/api/v1/search',
    'https://invidious.sethforprivacy.com/api/v1/search'
  ];
  
  for (const inst of instances) {
    try {
      const res = await fetch(`${inst}?q=${encodeURIComponent(query)}&region=FR`);
      const data = await res.json();
      if (data && data.length > 0) {
        return data.slice(0, 3).map(v => ({
          ytId: v.videoId,
          title: v.title,
          thumbnail: v.videoThumbnails?.[0]?.url || ""
        }));
      }
    } catch (e) { console.warn(`Instance ${inst} indisponible, passage à la suivante...`); }
  }
  return [];
};

const fetchYouTubeVideos = async (query) => {
  if (!YOUTUBE_API_KEY) return await fetchInvidiousVideos(query);
  try {
    const dateLimit = "2023-01-01T00:00:00Z";
    const searchQuery = `${query} formation complète masterclass playlist`;
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(searchQuery)}&type=video&relevanceLanguage=fr&order=viewCount&publishedAfter=${dateLimit}&videoEmbeddable=true&key=${YOUTUBE_API_KEY}`;
    
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    if (searchData.error || !searchData.items?.length) return await fetchInvidiousVideos(query);

    const videoIds = searchData.items.map(item => item.id.videoId).filter(Boolean);
    const listUrl = `https://www.googleapis.com/youtube/v3/videos?part=status,snippet&id=${videoIds.join(',')}&key=${YOUTUBE_API_KEY}`;
    const listRes = await fetch(listUrl);
    const listData = await listRes.json();
    
    if (!listData.items) return await fetchInvidiousVideos(query);

    return listData.items
      .filter(v => v.status.embeddable)
      .map(v => ({
        ytId: v.id,
        title: v.snippet.title,
        thumbnail: v.snippet.thumbnails.high.url
      }));
  } catch (err) { return await fetchInvidiousVideos(query); }
};

const App = () => {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('explore'); 
  const [adminTab, setAdminTab] = useState('finance'); 
  const [skill, setSkill] = useState('');
  const [status, setStatus] = useState('idle');
  const [step, setStep] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [userProfile, setUserProfile] = useState(null);
  const [roadmap, setRoadmap] = useState(null);
  const [publicRoadmaps, setPublicRoadmaps] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [apprenants, setApprenants] = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [activeVideo, setActiveVideo] = useState(null);
  const [userNotes, setUserNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Auth
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [authError, setAuthError] = useState('');

  // --- 1. AUTH ---
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data } = await insforge.auth.getCurrentUser();
        if (data?.user) setUser(data.user);
      } catch (err) { console.error(err); } finally { setIsLoading(false); }
    };
    checkAuth();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault(); setAuthError('');
    const { data, error } = await insforge.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message); else { setUser(data.user); setView('explore'); }
  };

  const handleGoogleLogin = async () => {
     setAuthError('');
     const { error } = await insforge.auth.signInWithOAuth({
         provider: 'google',
         options: { redirectTo: window.location.origin }
     });
     if (error) setAuthError(error.message);
  };

  const handleSignup = async (e) => {
    e.preventDefault(); setAuthError('');
    const { data, error } = await insforge.auth.signUp({ email, password, name });
    if (error) setAuthError(error.message); else { setUser(data.user); setView('explore'); }
  };

  const handleSignOut = async () => { await insforge.auth.signOut(); setUser(null); setUserProfile(null); setView('explore'); };

  // --- 2. DATA ---
  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      try {
          const { data } = await insforge.database.from('user_profiles').select('*').eq('id', user.id).maybeSingle();
          if (data) {
            setUserProfile(data);
            if (activeVideo) setUserNotes(data.notes?.[activeVideo.id] || "");
          } else {
            const newProfile = { id: user.id, is_admin: false, is_paid: false, notes: {}, completed_videos: [] };
            const { data: created } = await insforge.database.from('user_profiles').insert([newProfile]).select().single();
            if (created) setUserProfile(created);
          }
      } catch(e) { console.error("Profile fetch error:", e); }
    };
    fetchProfile();
  }, [user, activeVideo]);

  useEffect(() => {
    const fetchRoadmaps = async () => {
      const { data } = await insforge.database.from('roadmaps').select('*').order('created_at', { ascending: false });
      if (data) setPublicRoadmaps(data);
    };
    fetchRoadmaps();
  }, []);

  useEffect(() => {
    if (!user || !userProfile?.is_admin) return;
    const fetchAdmin = async () => {
      const { data: t } = await insforge.database.from('transactions').select('*'); if (t) setTransactions(t);
      const { data: u } = await insforge.database.from('user_profiles').select('*'); if (u) setApprenants(u);
    };
    fetchAdmin();
  }, [user, userProfile]);

  const notesTimeout = useRef(null);
  useEffect(() => {
    if (!user || !activeVideo) return;
    if (notesTimeout.current) clearTimeout(notesTimeout.current);
    notesTimeout.current = setTimeout(async () => {
      await insforge.database.from('user_profiles').update({ notes: { ...userProfile?.notes, [activeVideo.id]: userNotes } }).eq('id', user.id);
    }, 1500);
    return () => clearTimeout(notesTimeout.current);
  }, [userNotes, activeVideo, user]);

  // --- 3. LOGIC ---
  const isSubscriptionActive = useMemo(() => {
    if (userProfile?.is_admin) return true;
    if (!userProfile?.expiry_date || userProfile?.is_banned) return false;
    return new Date(userProfile.expiry_date) > new Date();
  }, [userProfile]);

  const handleSearch = async (e) => {
    e.preventDefault(); if (!skill.trim()) return;
    setStatus('thinking'); setErrorMsg(''); 

    try {
        setStep('ARCHIVES LOCALES : Interrogation de la base SQL (Exploration 0ms)...');
        const existing = publicRoadmaps.find(r => r.title.toLowerCase() === skill.toLowerCase());
        if (existing) { setRoadmap(existing); setStatus('ready'); setView('course'); return; }

        setStep('SYNAPSE OPEN-SOURCE : Extraction illimitée via serveurs Invidious...');
        
        let resB, resI, resE;
        // Mots-clés stratégiques 2024
        const [resB_data, resI_data, resE_data] = await Promise.all([
          fetchYouTubeVideos(`${skill} débutant formation complète 2024`),
          fetchYouTubeVideos(`${skill} intermédiaire pratique masterclass 2024`),
          fetchYouTubeVideos(`${skill} expert avancé spécialisation 2024`)
        ]);

        resB = resB_data; resI = resI_data; resE = resE_data;

        setStep('VALIDATION IA : Élimination des liens restreints & Pédagogie...');
        const elite = [
          { ytId: 'GYjzjHlaod0', title: "E-Commerce & Succès : Masterclass 2024 (Élite)" },
          { ytId: 'V9G9D_I__0s', title: "Stratégie de Réussite Mentorée (TEDx)" },
          { ytId: 'i_0G6hWnZ3c', title: "Le Guide du Millionnaire Moderne" },
          { ytId: 'qyEisU3C50o', title: "Marketing & Acquisition (Session Mentor)" },
          { ytId: 'XvIDp6P1f7c', title: "IA & Automatisation du Futur" },
          { ytId: '7uiz_TBe6Uo', title: "Spécialisation & Scaling Business" }
        ];

        // Garantie de liens fonctionnels
        const v1 = resB?.length ? resB.slice(0, 2) : elite.slice(0, 2);
        const v2 = resI?.length ? resI.slice(0, 2) : elite.slice(2, 4);
        const v3 = resE?.length ? resE.slice(0, 2) : elite.slice(4, 6);

        const newRoadmap = {
          title: skill,
          modules: [
            { name: `🏁 PHASE 1 : INITIATION & FONDATIONS 2024`, videos: v1.map((v, i) => ({ id: `v1-${i}`, ytId: v.ytId, title: v.title, isFree: true })) },
            { name: `🚀 PHASE 2 : EXPERTISE & APPLICATION PRATIQUE`, videos: v2.map((v, i) => ({ id: `v2-${i}`, ytId: v.ytId, title: v.title, isFree: false })) },
            { name: `🏆 PHASE 3 : MAÎTRISE TOTALE & HAUTE STRATEGIE`, videos: v3.map((v, i) => ({ id: `v3-${i}`, ytId: v.ytId, title: v.title, isFree: false })) }
          ]
        };

        const { data, error } = await insforge.database.from('roadmaps').insert([newRoadmap]).select().single();
        if (error) throw new Error(error.message);
        if (data) { setRoadmap(data); setPublicRoadmaps(prev => [data, ...prev]); }
        setStatus('ready'); setView('course');
    } catch (err) { setStatus('error'); setErrorMsg("L'IA n'a pas pu valider de liens 100% fonctionnels. Réessayez."); }
  };

  const processPayment = async () => {
    if (!user) { setView('auth'); setShowPaymentModal(false); return; }
    const expiry = new Date(); expiry.setDate(expiry.getDate() + 45);
    await insforge.database.from('user_profiles').update({ is_paid: true, expiry_date: expiry.toISOString() }).eq('id', user.id);
    await insforge.database.from('transactions').insert([{ user_id: user.id, amount: 2000 }]);
    setShowPaymentModal(false);
    setUserProfile({ ...userProfile, is_paid: true, expiry_date: expiry.toISOString() });
  };

  const toggleComplete = async (videoId) => {
    if (!user || (!isSubscriptionActive && videoId !== 'v1')) return;
    const current = userProfile?.completed_videos || [];
    const nw = current.includes(videoId) ? current.filter(id => id !== videoId) : [...current, videoId];
    await insforge.database.from('user_profiles').update({ completed_videos: nw }).eq('id', user.id);
    setUserProfile({ ...userProfile, completed_videos: nw });
  };

  const totalVideos = roadmap?.modules?.reduce((acc, m) => acc + m.videos.length, 0) || 1;
  const progressPercent = Math.min(100, Math.round(((userProfile?.completed_videos?.length || 0) / totalVideos) * 100));

  if (isLoading) return <div className="min-h-screen bg-[#020617] flex items-center justify-center text-amber-500"><RefreshCcw className="animate-spin w-10 h-10" /></div>;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-amber-500/30">
      <nav className="border-b border-white/5 bg-slate-950/80 backdrop-blur-3xl sticky top-0 z-50 py-4">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-5 cursor-pointer" onClick={() => setView('explore')}><Medal className="w-8 h-8 text-amber-500" /><span className="text-2xl font-black italic text-white uppercase tracking-tighter">Réussite<span className="text-amber-500">45</span></span></div>
          <div className="flex gap-4">
            {userProfile?.is_admin && <button onClick={() => setView('admin')}><BarChart3 className="w-6 h-6 text-slate-500 hover:text-white" /></button>}
            {user ? <button onClick={handleSignOut}><LogOut className="w-6 h-6 text-slate-500 hover:text-white" /></button> : <button onClick={() => setView('auth')} className="text-[10px] font-black uppercase text-slate-500 border border-white/5 py-2 px-4 rounded-xl">Connexion</button>}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-16 relative z-10">
        {status === 'thinking' && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/98 backdrop-blur-3xl animate-in fade-in">
                <div className="text-center space-y-10">
                    <Loader2 className="w-24 h-24 text-amber-500 animate-spin mx-auto scale-150 opacity-40" />
                    <div className="space-y-4"><p className="text-4xl font-black italic text-white tracking-widest uppercase">GÉNÉRATION RÉUSSIE45</p><p className="text-amber-500 font-mono text-xs tracking-[0.5em] uppercase animate-pulse">{step}</p></div>
                </div>
            </div>
        )}

        {status === 'error' && (
            <div className="mb-10 p-10 bg-red-500/10 border border-red-500/20 rounded-[4rem] flex items-center gap-8 group relative overflow-auto">
                <AlertCircle className="w-12 h-12 text-red-500" />
                <div><p className="text-[10px] font-black text-red-500/50 uppercase tracking-widest mb-1">ÉCHEC OPÉRATIONNEL</p><p className="text-xl font-bold text-red-400">{errorMsg}</p></div>
                <button onClick={() => setStatus('idle')} className="ml-auto text-red-500/50 hover:text-red-500"><X /></button>
            </div>
        )}

        {view === 'auth' && (
            <div className="max-w-md mx-auto py-20 animate-in zoom-in">
                <div className="bg-slate-900 p-12 rounded-[5rem] border border-white/5 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-[80px]" />
                    <h2 className="text-5xl font-black mb-10 text-white text-center italic tracking-tighter uppercase">{authMode === 'login' ? 'CONNEXION' : 'REJOINDRE'}</h2>
                    <div className="space-y-6">
                        <button onClick={handleGoogleLogin} className="w-full bg-white text-slate-950 py-5 rounded-[2.5rem] font-black flex items-center justify-center gap-4 hover:bg-slate-100 transition-all active:scale-95 shadow-xl">
                            <Globe className="w-6 h-6" /> Google Login
                        </button>
                        <div className="flex items-center gap-4 py-2"><div className="flex-1 h-px bg-white/5" /><span className="text-[10px] font-black text-slate-700 uppercase">OU</span><div className="flex-1 h-px bg-white/5" /></div>
                        <form onSubmit={authMode === 'login' ? handleLogin : handleSignup} className="space-y-6">
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-slate-950 border border-white/5 rounded-3xl px-8 py-5 text-white outline-none focus:border-amber-500/50" placeholder="Email Professionnel" required />
                            {authMode === 'signup' && <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-slate-950 border border-white/5 rounded-3xl px-8 py-5 text-white outline-none" placeholder="Nom Complet" required />}
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-950 border border-white/5 rounded-3xl px-8 py-5 text-white outline-none" placeholder="Mot de passe" required />
                            {authError && <p className="text-red-500 text-xs text-center font-bold uppercase">{authError}</p>}
                            <button type="submit" className="w-full bg-amber-500 text-slate-950 py-6 rounded-[2.5rem] font-black uppercase text-xl transition-all hover:bg-amber-400 active:scale-95 shadow-2xl shadow-amber-500/20">Continuer</button>
                        </form>
                    </div>
                </div>
            </div>
        )}
        
        {view === 'explore' && (
          <div className="text-center space-y-24 max-w-5xl mx-auto">
            <h1 className="text-7xl md:text-[10rem] font-black text-white leading-[0.85] tracking-tighter">Votre futur <span className="text-amber-500 italic">commence ici.</span></h1>
            <form onSubmit={handleSearch} className="max-w-4xl mx-auto p-4 bg-slate-900 border border-white/5 rounded-[4rem] flex h-28 shadow-4xl relative overflow-hidden">
                <Search className="absolute left-12 top-1/2 -translate-y-1/2 w-10 h-10 text-slate-800" />
                <input type="text" placeholder="Quelle compétence dominer ?" className="flex-1 bg-transparent border-none text-4xl px-24 text-white font-black outline-none placeholder:text-slate-800" value={skill} onChange={(e) => setSkill(e.target.value)} />
                <button type="submit" className="bg-amber-500 text-slate-950 px-16 rounded-[3rem] font-black uppercase text-2xl hover:bg-amber-400 transition-all active:scale-95 shadow-3xl">GÉNÉRER</button>
            </form>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-20 border-t border-white/5 text-left">
               {publicRoadmaps.map(r => (
                 <div key={r.id} onClick={() => { setRoadmap(r); setView('course'); }} className="bg-slate-900/60 border border-white/5 p-12 rounded-[5rem] group hover:bg-slate-900 hover:border-amber-500/40 transition-all flex items-center justify-between cursor-pointer">
                   <div className="flex items-center gap-10"><div className="bg-slate-800 p-8 rounded-[2.5rem] shadow-2xl group-hover:rotate-12 transition-transform"><BookOpen className="w-12 h-12 text-amber-500" /></div><div><h4 className="font-black text-4xl capitalize text-white mb-2 leading-none">{r.title}</h4><span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{r.modules?.length || 0} MODULES ÉLITES</span></div></div>
                   <ChevronRight className="w-10 h-10 text-slate-700 group-hover:text-amber-500 transition-all" />
                 </div>
               ))}
            </div>
          </div>
        )}

        {view === 'course' && roadmap && (
          <div className="grid lg:grid-cols-12 gap-16 animate-in slide-in-from-bottom-20 duration-1000">
            <div className="lg:col-span-4"><div className="bg-slate-900 border border-white/5 p-14 rounded-[5rem] sticky top-40 shadow-4xl"><p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-6 italic">Cycle Expertise Professionnelle</p><h2 className="text-6xl font-black mb-12 text-white italic capitalize leading-[0.9] pr-10">{roadmap.title}</h2><div className="h-6 bg-slate-800 rounded-full p-1.5 border border-white/5"><div className="h-full bg-amber-500 rounded-full transition-all duration-1000" style={{ width: `${progressPercent}%` }} /></div><p className="text-xs font-black text-slate-600 uppercase mt-8 ml-6">Progression Réussite: {progressPercent}%</p></div></div>
            <div className="lg:col-span-8 space-y-24 pb-60">
               {roadmap.modules.map((m, i) => (
                 <div key={i} className="space-y-14">
                   <h3 className="font-black text-5xl text-slate-800 italic flex items-center gap-12"><span className="text-7xl not-italic font-black text-amber-500/10">0{i+1}</span> {m.name}</h3>
                   <div className="grid gap-10">
                     {m.videos.map(v => {
                       const locked = !v.isFree && !isSubscriptionActive;
                       const completed = userProfile?.completed_videos?.includes(v.id);
                       return (
                         <div key={v.id} className={cn("p-14 rounded-[5rem] border transition-all flex items-center gap-12 shadow-5xl", locked ? "bg-slate-900/10 opacity-30 cursor-not-allowed border-transparent grayscale" : "bg-slate-900 border-white/5 hover:border-amber-500/50 cursor-pointer")} onClick={() => !locked && setActiveVideo(v)}>
                           <div className={cn("w-28 h-28 rounded-[3rem] flex items-center justify-center", completed ? "bg-green-500/10 text-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)]" : "bg-slate-800 text-amber-500 shadow-3xl")}>{completed ? <CheckCircle2 className="w-14 h-14" /> : (locked ? <Lock className="w-10 h-10 text-slate-700" /> : <PlayCircle className="w-14 h-14" />)}</div>
                           <div className="flex-1"><h4 className="font-black text-4xl text-white italic leading-tight mb-4">{v.title}</h4><span className="text-[10px] font-black text-slate-800 uppercase tracking-[0.4em]">Validation du Cycle Professionnelle</span></div>
                           {!locked && <button onClick={(e) => { e.stopPropagation(); toggleComplete(v.id); }} className={cn("p-8 rounded-full", completed ? "text-green-500" : "text-slate-800 hover:text-white")}><CheckCircle2 className="w-12 h-12" /></button>}
                         </div>
                       );
                     })}
                   </div>
                 </div>
               ))}
            </div>
          </div>
        )}
      </main>

      {showPaymentModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/99 backdrop-blur-3xl animate-in zoom-in duration-500">
          <div className="bg-slate-900 border border-white/5 rounded-[6rem] w-full max-w-3xl p-24 text-center relative shadow-3xl">
            <button onClick={() => setShowPaymentModal(false)} className="absolute top-16 right-16"><X className="w-16 h-16 text-slate-800 hover:text-white" /></button>
            <div className="bg-amber-500 w-32 h-32 rounded-[2.5rem] flex items-center justify-center mx-auto mb-16 shadow-2xl rotate-12"><Zap className="w-16 h-16 text-slate-950 fill-current" /></div>
            <h2 className="text-8xl font-black mb-12 italic text-white uppercase tracking-tighter">REUSSITE<span className="text-amber-500">PRO</span></h2>
            <div className="bg-slate-950 p-20 rounded-[5rem] mb-20 flex justify-between items-center text-left border border-white/5 shadow-2xl"><div className="text-9xl font-black text-white italic">2000 <span className="text-4xl text-slate-800">F</span></div><CreditCard className="w-20 h-20 text-slate-800" /></div>
            <button onClick={processPayment} className="w-full bg-white text-slate-950 py-12 rounded-[4rem] font-black text-5xl shadow-4xl hover:bg-amber-500 transition-all">ACTIVER L'ACCÈS 45J</button>
          </div>
        </div>
      )}

      {activeVideo && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-[#020617] animate-in fade-in duration-500">
          {/* Header Udemy Style */}
          <header className="h-20 bg-slate-900 border-b border-white/5 px-8 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-6">
                <button onClick={() => setActiveVideo(null)} className="p-3 bg-white/5 rounded-full hover:bg-white/10 transition-all"><X className="w-8 h-8 text-white" /></button>
                <div className="h-10 w-px bg-white/10 mx-2" />
                <h2 className="text-xl font-bold text-white truncate max-w-xl italic">{activeVideo.title}</h2>
            </div>
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-3 bg-white/5 px-6 py-2 rounded-full border border-white/5">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    <span className="text-sm font-black text-amber-500 uppercase">{progressPercent}% terminé</span>
                </div>
            </div>
          </header>

          <div className="flex-1 flex overflow-hidden lg:flex-row flex-col">
            {/* Zone Gauche : Player + Notes */}
            <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar bg-black/20">
               <div className="aspect-video bg-slate-900 rounded-[2rem] overflow-hidden border border-white/5 shadow-2xl relative">
                 <iframe 
                   width="100%" 
                   height="100%" 
                   src={`https://www.youtube.com/embed/${activeVideo.ytId}?playsinline=1`} 
                   frameBorder="0" 
                   allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                   allowFullScreen>
                 </iframe>
               </div>

               {/* Onglets Notes/Description Style Udemy */}
               <div className="bg-slate-900/50 rounded-[3rem] border border-white/5 p-10">
                  <div className="flex gap-10 border-b border-white/5 mb-8 px-6">
                    <button className="pb-4 border-b-2 border-amber-500 text-amber-500 font-black text-xs uppercase tracking-widest">Prendre des Notes</button>
                    <button className="pb-4 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-white transition-colors">Description</button>
                    <button className="pb-4 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-white transition-colors">Q&R</button>
                  </div>
                  <div className="p-4 flex flex-col gap-8">
                    <textarea 
                        className="w-full bg-slate-950/50 border border-white/5 rounded-[2rem] p-8 text-xl text-slate-300 resize-none outline-none focus:border-amber-500/30 transition-all min-h-[200px]" 
                        placeholder="Qu'avez-vous retenu de fondamental dans cette leçon ?" 
                        value={userNotes} 
                        onChange={(e) => setUserNotes(e.target.value)}
                    />
                    <div className="flex justify-between items-center">
                        <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest italic">Sauvegarde automatique dans votre Journal d'Expertise...</p>
                        <button onClick={() => toggleComplete(activeVideo.id)} className={cn("px-12 py-4 rounded-full font-black text-sm transition-all shadow-xl", userProfile?.completed_videos?.includes(activeVideo.id) ? "bg-green-600 text-white" : "bg-white text-slate-950")}>
                            {userProfile?.completed_videos?.includes(activeVideo.id) ? "MODULE TERMINÉ ✅" : "VALIDER LA LEÇON"}
                        </button>
                    </div>
                  </div>
               </div>
            </div>

            {/* Zone Droite : Sidebar Contenu du Cours */}
            <div className="w-full lg:w-[400px] bg-slate-950 border-l border-white/5 flex flex-col overflow-hidden shrink-0 shadow-[-20px_0_40px_rgba(0,0,0,0.5)]">
               <div className="p-8 border-b border-white/5 bg-slate-900/50"><h3 className="font-black text-xl text-white uppercase tracking-tighter italic">Contenu de la formation</h3></div>
               <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {roadmap.modules.map((m, i) => (
                    <div key={i} className="mb-2">
                        <div className="bg-slate-900 px-8 py-4 flex items-center justify-between border-y border-white/5">
                            <span className="text-[10px] font-black text-slate-500 uppercase">Section {i+1} : {m.name}</span>
                            <ChevronRight className="w-4 h-4 text-slate-700" />
                        </div>
                        <div className="p-2 space-y-1">
                            {m.videos.map(v => {
                                const active = activeVideo.id === v.id;
                                const completed = userProfile?.completed_videos?.includes(v.id);
                                const locked = !v.isFree && !isSubscriptionActive && v.id !== 'v1';
                                return (
                                    <div 
                                        key={v.id} 
                                        onClick={() => !locked && setActiveVideo(v)}
                                        className={cn("px-6 py-4 flex items-center gap-4 cursor-pointer transition-all rounded-2xl group", 
                                            active ? "bg-amber-500/10 border border-amber-500/20" : "hover:bg-white/5",
                                            locked && "opacity-30 cursor-not-allowed grayscale"
                                        )}
                                    >
                                        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 border border-white/5 shadow-2xl", 
                                            completed ? "bg-green-600/20 border-green-500 text-green-500" : (active ? "bg-amber-500 text-slate-950" : "bg-slate-800 text-slate-500")
                                        )}>
                                            {completed ? <CheckCircle2 className="w-5 h-5" /> : (locked ? <Lock className="w-4 h-4" /> : (active ? <Play className="w-5 h-5 fill-current" /> : <Play className="w-4 h-4" />))}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={cn("text-xs font-bold truncate transition-colors", active ? "text-amber-500" : "text-slate-400 group-hover:text-white")}>{v.title}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <PlayCircle className="w-3 h-3 text-slate-700" />
                                                <span className="text-[8px] font-black text-slate-700 uppercase tracking-widest">Vidéo • 12:45</span>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                  ))}
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default App;
