import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@insforge/sdk';
import { 
  Search, Lock, CheckCircle2, Play, CreditCard, 
  Star, BookOpen, Zap, ShieldCheck, X, 
  ArrowRight, Trophy, Users, Clock, Layout,
  ChevronRight, Sparkles, GraduationCap, History,
  Download, Award, Flame, Library, RefreshCcw, 
  BarChart3, Wallet, UserX, UserCheck, TrendingUp, 
  Plus, Edit3, Trash2, StickyNote, PlayCircle, Eye,
  Medal, Target, LogIn, LogOut, AlertCircle, Loader2
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Utility for Tailwind Classes Merge */
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// --- CONFIGURATION INSFORGE ---
const insforge = createClient({
  baseUrl: import.meta.env.VITE_INSFORGE_BASE_URL || 'https://5papp5aj.eu-central.insforge.app',
  anonKey: import.meta.env.VITE_INSFORGE_ANON_KEY || ''
});

const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

const fetchYouTubeVideos = async (query) => {
  if (!YOUTUBE_API_KEY) throw new Error("Clé YouTube manquante.");
  
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=5&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.error) {
    console.error("YouTube Error Payload:", data.error);
    // Silent fail to trigger fallback in handleSearch
    return null; 
  }
  
  if (!data.items || data.items.length === 0) return null;
  
  return data.items.map(item => ({
    ytId: item.id.videoId,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails.high.url
  }));
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

  // Auth States
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [authError, setAuthError] = useState('');

  // --- 1. AUTHENTICATION ---
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data } = await insforge.auth.getCurrentUser();
        if (data?.user) setUser(data.user);
      } catch (err) {
        console.error("Auth check error:", err);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    const { data, error } = await insforge.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
    else { setUser(data.user); setView('explore'); }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setAuthError('');
    const { data, error } = await insforge.auth.signUp({ email, password, name });
    if (error) setAuthError(error.message);
    else {
      if (data?.requireEmailVerification) setAuthError("Vérifiez vos emails.");
      else { setUser(data.user); setView('explore'); }
    }
  };

  const handleSignOut = async () => {
    await insforge.auth.signOut();
    setUser(null);
    setUserProfile(null);
    setView('explore');
  };

  // --- 2. DATA FETCHING ---
  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data } = await insforge.database
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        setUserProfile(data);
        if (activeVideo) setUserNotes(data.notes?.[activeVideo.id] || "");
      } else {
        const newProfile = { id: user.id, is_admin: false, is_paid: false, notes: {}, completed_videos: [] };
        const { data: created } = await insforge.database.from('user_profiles').insert([newProfile]).select().single();
        if (created) setUserProfile(created);
      }
    };
    fetchProfile();
  }, [user, activeVideo]);

  useEffect(() => {
    const fetchRoadmaps = async () => {
      const { data } = await insforge.database
        .from('roadmaps')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setPublicRoadmaps(data);
    };
    fetchRoadmaps();
  }, []);

  useEffect(() => {
    if (!user || !userProfile?.is_admin) return;
    const fetchAdmin = async () => {
      const { data: t } = await insforge.database.from('transactions').select('*');
      if (t) setTransactions(t);
      const { data: u } = await insforge.database.from('user_profiles').select('*');
      if (u) setApprenants(u);
    };
    fetchAdmin();
  }, [user, userProfile]);

  const notesTimeout = useRef(null);
  useEffect(() => {
    if (!user || !activeVideo) return;
    if (notesTimeout.current) clearTimeout(notesTimeout.current);
    notesTimeout.current = setTimeout(async () => {
      await insforge.database.from('user_profiles').update({
        notes: { ...userProfile?.notes, [activeVideo.id]: userNotes }
      }).eq('id', user.id);
    }, 1500);
    return () => clearTimeout(notesTimeout.current);
  }, [userNotes, activeVideo, user]);

  // --- 3. BUSINESS LOGIC ---
  const isSubscriptionActive = useMemo(() => {
    if (userProfile?.is_admin) return true;
    if (!userProfile?.expiry_date || userProfile?.is_banned) return false;
    return new Date(userProfile.expiry_date) > new Date();
  }, [userProfile]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!skill.trim()) return;
    setStatus('thinking');
    setErrorMsg('');
    setStep('Recherche dans la bibliothèque...');

    try {
        const existing = publicRoadmaps.find(r => r.title.toLowerCase() === skill.toLowerCase());
        if (existing) {
          setRoadmap(existing);
          setStatus('ready');
          setView('course');
          return;
        }

        setStep('Génération structurelle (YouTube API)...');
        let realVideos = null;
        try {
            realVideos = await fetchYouTubeVideos(skill);
        } catch (ytErr) {
            console.warn("YouTube API issue, using fallback content:", ytErr.message);
        }

        const newRoadmap = {
          title: skill,
          modules: [
            { 
              name: "Phase 1: Initiation & Fondamentaux", 
              videos: realVideos ? realVideos.slice(0, 2).map((v, idx) => ({
                id: `v1-${idx}-${Date.now()}`, ytId: v.ytId, title: v.title, isFree: idx === 0, duration: '12:30'
              })) : [
                { id: `v1-mock-${Date.now()}`, ytId: 'jS4aFq5dxas', title: `Introduction complète: ${skill}`, isFree: true, duration: '15:20' },
                { id: `v2-mock-${Date.now()}`, ytId: 'P_m-9E5xYyE', title: "Maîtriser les briques essentielles", isFree: false, duration: '20:10' }
              ] 
            },
            { 
              name: "Phase 2: Mise en Pratique Intensive", 
              videos: realVideos && realVideos.length > 2 ? realVideos.slice(2, 4).map((v, idx) => ({
                id: `v2-${idx}-${Date.now()}`, ytId: v.ytId, title: v.title, isFree: false, duration: '45:00'
              })) : [
                { id: `v3-mock-${Date.now()}`, ytId: 'W6NZfCO5SIk', title: "Projet concret: étape par étape", isFree: false, duration: '55:00' }
              ] 
            }
          ]
        };

        setStep('Finalisation et Sauvegarde...');
        const { data, error } = await insforge.database
          .from('roadmaps')
          .insert([newRoadmap])
          .select()
          .single();
        
        if (error) throw new Error(`Erreur Base de données: ${error.message}`);
        
        if (data) {
          setRoadmap(data);
          setPublicRoadmaps(prev => [data, ...prev].slice(0, 50));
        }
        setStatus('ready');
        setView('course');
    } catch (err) {
        console.error("Search Logic Error:", err);
        setStatus('error');
        setErrorMsg(err.message || "Impossible de générer le cycle.");
    }
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
    if (!isSubscriptionActive && !roadmap?.modules?.[0]?.videos?.find(v => v.id === videoId)?.isFree) return;
    const current = userProfile?.completed_videos || [];
    const nw = current.includes(videoId) ? current.filter(id => id !== videoId) : [...current, videoId];
    await insforge.database.from('user_profiles').update({ completed_videos: nw }).eq('id', user.id);
    setUserProfile({ ...userProfile, completed_videos: nw });
  };

  const totalVideos = roadmap?.modules?.reduce((acc, m) => acc + m.videos.length, 0) || 1;
  const progressPercent = Math.min(100, Math.round(((userProfile?.completed_videos?.filter(id => roadmap?.modules?.some(m => m.videos.some(v => v.id === id)))?.length || 0) / totalVideos) * 100));

  if (isLoading) return <div className="min-h-screen bg-[#020617] flex items-center justify-center text-amber-500"><RefreshCcw className="animate-spin w-10 h-10" /></div>;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-amber-500/30">
      <nav className="border-b border-white/5 bg-slate-950/80 backdrop-blur-3xl sticky top-0 z-50 py-4">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-5 cursor-pointer" onClick={() => setView('explore')}><Medal className="w-8 h-8 text-amber-500" /><span className="text-2xl font-black italic text-white uppercase tracking-tighter">Réussite<span className="text-amber-500">45</span></span></div>
          <div className="flex gap-4">
            {userProfile?.is_admin && <button onClick={() => setView('admin')}><BarChart3 className="w-6 h-6 text-slate-500" /></button>}
            <button onClick={() => setView('explore')} className="text-xs font-black uppercase text-slate-500 hover:text-white transition-all">Explorer</button>
            {user ? <button onClick={handleSignOut}><LogOut className="w-6 h-6 text-slate-500" /></button> : <button onClick={() => setAuthMode('login')} className="text-xs font-black uppercase text-slate-500 px-4 py-2 border border-white/5 rounded-xl">Compte</button>}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-16 relative z-10">
        {status === 'thinking' && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-2xl animate-in fade-in">
                <div className="text-center space-y-10">
                    <Loader2 className="w-24 h-24 text-amber-500 animate-spin mx-auto" />
                    <div className="space-y-4">
                        <p className="text-4xl font-black italic text-white uppercase tracking-tighter">ENGINE START...</p>
                        <p className="text-amber-500 font-mono text-sm tracking-[0.4em] uppercase animate-pulse">{step}</p>
                    </div>
                </div>
            </div>
        )}

        {status === 'error' && (
            <div className="mb-10 p-10 bg-red-500/10 border border-red-500/20 rounded-[4rem] text-center md:text-left flex flex-col md:flex-row items-center gap-10 shadow-2xl animate-in slide-in-from-top duration-500">
                <div className="bg-red-500/20 p-6 rounded-[2rem]"><AlertCircle className="w-12 h-12 text-red-500" /></div>
                <div className="flex-1">
                    <h3 className="text-red-500 font-black text-xs uppercase tracking-widest mb-2 italic">DÉFAILLANCE SYSTÈME</h3>
                    <p className="text-xl font-bold text-slate-200">{errorMsg}</p>
                </div>
                <button onClick={() => setStatus('idle')} className="px-10 py-4 bg-red-500 text-white rounded-3xl font-black text-sm uppercase hover:bg-red-600 transition-all">Relancer</button>
            </div>
        )}

        {view === 'explore' && (
          <div className="max-w-5xl mx-auto text-center space-y-24 pt-20">
            <div className="space-y-12">
                <div className="inline-flex gap-4 px-6 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-500 text-[10px] font-black uppercase tracking-[0.3em]"><Zap className="w-4 h-4" /> 45 Jours pour Maitriser le Monde</div>
                <h1 className="text-8xl md:text-[10rem] font-black text-white leading-[0.8] tracking-[ -0.05em]"><span className="italic block mb-4">TRANSFORMEZ</span> VOTRE DESTIN.</h1>
                <form onSubmit={handleSearch} className="max-w-3xl mx-auto p-4 bg-slate-900 border border-white/5 rounded-[3.5rem] flex h-28 shadow-[0_40px_100px_rgba(0,0,0,0.5)]">
                    <input type="text" placeholder="Quelle compétence voulez-vous ?" className="flex-1 bg-transparent border-none text-2xl px-12 text-white font-black outline-none placeholder:text-slate-800" value={skill} onChange={(e) => setSkill(e.target.value)} />
                    <button type="submit" className="bg-amber-500 text-slate-950 px-14 rounded-[2.8rem] font-black uppercase text-xl transition-all hover:bg-amber-400 active:scale-95">FORGER</button>
                </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-left pt-20">
               {publicRoadmaps.map(r => (
                 <div key={r.id} onClick={() => { setRoadmap(r); setView('course'); }} className="bg-slate-900 p-12 rounded-[4.5rem] hover:bg-slate-950 border border-white/5 hover:border-amber-500/40 cursor-pointer group transition-all flex items-center justify-between shadow-xl">
                   <div className="flex items-center gap-10">
                       <div className="bg-slate-800 p-8 rounded-[2rem] group-hover:scale-110 group-hover:rotate-6 transition-all duration-500"><BookOpen className="w-10 h-10 text-amber-500" /></div>
                       <div><h4 className="font-black text-4xl capitalize text-white mb-3 italic tracking-tighter leading-none">{r.title}</h4><div className="flex items-center gap-3"><Users className="w-4 h-4 text-slate-600" /><span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{Math.floor(Math.random() * 500) + 120} Apprenants</span></div></div>
                   </div>
                   <ChevronRight className="w-10 h-10 text-slate-800 group-hover:text-amber-500 transition-all translate-x-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0" />
                 </div>
               ))}
            </div>
          </div>
        )}

        {view === 'course' && roadmap && (
          <div className="grid lg:grid-cols-12 gap-16 pb-40">
            <div className="lg:col-span-4 space-y-10">
               <div className="bg-slate-900 border border-white/10 p-12 rounded-[4rem] sticky top-32 shadow-3xl">
                 <h2 className="text-6xl font-black mb-12 text-white capitalize italic tracking-tighter leading-none">{roadmap.title}</h2>
                 <div className="space-y-4">
                    <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-slate-500"><span>Progression</span><span className="text-amber-500">{progressPercent}%</span></div>
                    <div className="h-6 bg-slate-950 rounded-full p-1.5 border border-white/5 shadow-inner"><div className="h-full bg-amber-500 rounded-full transition-all duration-1000 shadow-[0_0_20px_rgba(245,158,11,0.5)]" style={{ width: `${progressPercent}%` }} /></div>
                 </div>
                 {!isSubscriptionActive && (
                    <button onClick={() => setShowPaymentModal(true)} className="w-full mt-12 bg-amber-500 text-slate-950 py-6 rounded-[2rem] font-black text-sm uppercase shadow-2xl shadow-amber-500/20">ACTIVER LE CYCLE COMPLET</button>
                 )}
               </div>
            </div>
            <div className="lg:col-span-8 space-y-20">
               {roadmap.modules.map((m, i) => (
                 <div key={i} className="space-y-12">
                   <div className="flex items-center gap-10">
                       <span className="text-8xl font-black text-white/5 leading-none">0{i+1}</span>
                       <h3 className="font-black text-4xl text-slate-700 italic flex-1 border-b border-white/5 pb-4 uppercase tracking-tighter">{m.name}</h3>
                   </div>
                   <div className="grid gap-8">
                     {m.videos.map(v => {
                       const locked = !v.isFree && !isSubscriptionActive;
                       const completed = userProfile?.completed_videos?.includes(v.id);
                       return (
                         <div key={v.id} className={cn("flex items-center gap-10 p-10 rounded-[4rem] border transition-all relative overflow-hidden group", locked ? "bg-slate-900/10 border-white/5 opacity-40 grayscale cursor-not-allowed" : "bg-slate-900 border-white/10 hover:border-amber-500/50 cursor-pointer shadow-3xl")} onClick={() => !locked && setActiveVideo(v)}>
                           <div className={cn("w-24 h-24 rounded-[2.5rem] flex items-center justify-center transition-all duration-500", completed ? "bg-green-500/10 text-green-500" : "bg-slate-950 text-amber-500 shadow-xl group-hover:scale-110")}>{completed ? <CheckCircle2 className="w-12 h-12" /> : (locked ? <Lock className="w-10 h-10 text-slate-800" /> : <PlayCircle className="w-12 h-12" />)}</div>
                           <div className="flex-1"><h4 className="font-black text-3xl text-white italic tracking-tighter leading-tight mb-2">{v.title}</h4><div className="flex gap-4 text-[10px] font-black text-slate-600 uppercase tracking-widest"><span>15:00 MIN</span><span>•</span><span className={v.isFree ? "text-amber-500" : ""}>{v.isFree ? "ACCÈS LIBRE" : "CONTENU PREMIUM"}</span></div></div>
                           {!locked && <button onClick={(e) => { e.stopPropagation(); toggleComplete(v.id); }} className={cn("p-6 rounded-[2rem] transition-all", completed ? "bg-green-500 text-slate-950" : "bg-slate-800 text-slate-600 hover:text-white")}><CheckCircle2 className="w-10 h-10" /></button>}
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-[#01030e]/99 backdrop-blur-[100px] animate-in zoom-in duration-500">
          <div className="bg-slate-900 border border-white/10 rounded-[5rem] w-full max-w-2xl p-20 text-center relative shadow-[0_0_150px_rgba(245,158,11,0.15)]">
            <button onClick={() => setShowPaymentModal(false)} className="absolute top-10 right-10 text-slate-800 hover:text-white transition-all"><X className="w-12 h-12" /></button>
            <div className="bg-amber-500 w-28 h-28 rounded-[2rem] flex items-center justify-center mx-auto mb-10 rotate-6 shadow-2xl shadow-amber-500/30"><Zap className="w-14 h-14 text-slate-950 fill-current" /></div>
            <h2 className="text-7xl font-black mb-6 italic text-white uppercase tracking-[ -0.05em]">REUSSITE<span className="text-amber-500">PRO</span></h2>
            <p className="text-slate-400 font-bold mb-14 text-lg italic max-w-sm mx-auto">Activez votre propulsion professionnelle aujourd'hui pour 45 jours d'accès illimité.</p>
            <div className="bg-slate-950 p-14 rounded-[4rem] mb-14 flex justify-between items-center text-left border border-white/5 shadow-inner"><div className="text-8xl font-black text-white leading-none">2000 <span className="text-2xl text-slate-800 italic uppercase">F</span></div><CreditCard className="w-12 h-12 text-slate-800" /></div>
            <button onClick={processPayment} className="w-full bg-white text-slate-950 py-10 rounded-[3rem] font-black text-4xl hover:bg-amber-500 transition-all shadow-2xl active:scale-95">ACTIVER MA LICENCE</button>
          </div>
        </div>
      )}

      {activeVideo && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/99 backdrop-blur-3xl animate-in zoom-in-95 duration-500">
          <div className="w-full h-full flex flex-col gap-10">
            <div className="flex justify-between items-end px-10 pt-10">
                <div className="space-y-4 max-w-4xl">
                   <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em] italic">Session de Maitrise en Cours</p>
                   <h2 className="font-black text-6xl text-white italic truncate leading-none tracking-tighter uppercase">{activeVideo.title}</h2>
                </div>
                <button onClick={() => setActiveVideo(null)} className="p-8 bg-slate-900 border border-white/5 rounded-[3rem] hover:border-amber-500/50 transition-all"><X className="w-12 h-12 text-white" /></button>
            </div>
            <div className="flex-1 grid lg:grid-cols-12 gap-10 px-10 pb-10">
               <div className="lg:col-span-8 bg-black rounded-[5rem] overflow-hidden border border-white/5 shadow-[0_0_100px_rgba(0,0,0,1)] relative"><iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${activeVideo.ytId}?autoplay=1&modestbranding=1&rel=0&showinfo=0`} frameBorder="0" allowFullScreen></iframe></div>
               <div className="lg:col-span-4 bg-slate-900 border border-white/10 rounded-[5rem] flex flex-col p-14 space-y-10 shadow-2xl">
                   <div className="flex items-center gap-6 text-xs font-black uppercase text-amber-500 tracking-widest italic"><StickyNote className="w-6 h-6" /> Journal de Formation</div>
                   <textarea className="flex-1 bg-transparent text-xl text-slate-400 resize-none outline-none italic leading-relaxed placeholder:text-slate-800" placeholder="Consignez ici vos apprentissages..." value={userNotes} onChange={(e) => setUserNotes(e.target.value)}></textarea>
                   <button onClick={() => toggleComplete(activeVideo.id)} className={cn("py-10 rounded-[3.5rem] font-black text-2xl transition-all shadow-2xl active:scale-95", userProfile?.completed_videos?.includes(activeVideo.id) ? "bg-green-500 text-white" : "bg-white text-slate-950 hover:bg-amber-500")}>{userProfile?.completed_videos?.includes(activeVideo.id) ? "ÉTAPE VALIDÉE ✅" : "VALIDER L'ÉTAPE"}</button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
