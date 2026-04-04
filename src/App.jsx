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
  
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=5&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
       console.warn("YouTube API Error:", data.error.message);
       return null; // Return null to trigger fallback
    }
    
    if (!data.items || data.items.length === 0) return null;
    
    return data.items.map(item => ({
      ytId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.high.url
    }));
  } catch (err) {
    console.error("YouTube Fetch Exception:", err);
    return null;
  }
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
      const { data } = await insforge.database.from('user_profiles').select('*').eq('id', user.id).maybeSingle();
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
    e.preventDefault();
    if (!skill.trim()) return;
    setStatus('thinking');
    setErrorMsg('');
    setStep('Chargement de la bibliothèque...');

    try {
        const existing = publicRoadmaps.find(r => r.title.toLowerCase() === skill.toLowerCase());
        if (existing) {
          setRoadmap(existing); setStatus('ready'); setView('course'); return;
        }

        setStep('Recherche de vidéos stratégiques...');
        let realVideos = await fetchYouTubeVideos(skill);
        
        let isMock = false;
        if (!realVideos) {
            console.warn("YouTube API failed. Using high-quality mock backup.");
            isMock = true;
            realVideos = [
                { ytId: 'jS4aFq5dxas', title: `Introduction à la Maîtrise de : ${skill}` },
                { ytId: 'P_m-9E5xYyE', title: "Les fondamentaux incontournables" },
                { ytId: 'W6NZfCO5SIk', title: "Mise en pratique et Projets" },
                { ytId: 'qyEisU3C50o', title: "Expertise et Optimisation finale" }
            ];
        }

        setStep('Auto-génération du curriculum...');
        const newRoadmap = {
          title: skill,
          modules: [
            { 
              name: "Phase 1: Initiation", 
              videos: realVideos.slice(0, 2).map((v, idx) => ({
                id: `v1-${idx}`, ytId: v.ytId, title: v.title, isFree: idx === 0, duration: '12:30'
              }))
            },
            { 
              name: "Phase 2: Expertise Métier", 
              videos: realVideos.slice(2, 4).map((v, idx) => ({
                id: `v2-${idx}`, ytId: v.ytId, title: v.title, isFree: false, duration: '45:00'
              }))
            }
          ]
        };

        setStep('Architecture de données Appliquée...');
        const { data, error } = await insforge.database.from('roadmaps').insert([newRoadmap]).select().single();
        if (error) throw new Error(error.message);
        
        if (data) { setRoadmap(data); setPublicRoadmaps(prev => [data, ...prev]); }
        setStatus('ready'); setView('course');
    } catch (err) {
        console.error("Search Error:", err);
        setStatus('error'); setErrorMsg("Échec critique de synchronisation base de données.");
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
    if (!isSubscriptionActive && videoId !== 'v1') return;
    const current = userProfile?.completed_videos || [];
    const nw = current.includes(videoId) ? current.filter(id => id !== videoId) : [...current, videoId];
    await insforge.database.from('user_profiles').update({ completed_videos: nw }).eq('id', user.id);
    setUserProfile({ ...userProfile, completed_videos: nw });
  };

  const totalVideos = roadmap?.modules?.reduce((acc, m) => acc + m.videos.length, 0) || 1;
  const progressPercent = Math.min(100, Math.round(((userProfile?.completed_videos?.length || 0) / totalVideos) * 100));

  if (isLoading) return <div className="min-h-screen bg-[#020617] flex items-center justify-center text-amber-500"><RefreshCcw className="animate-spin w-10 h-10" /></div>;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans">
      <nav className="border-b border-white/5 bg-slate-950/80 backdrop-blur-3xl sticky top-0 z-50 py-4">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-5 cursor-pointer" onClick={() => setView('explore')}><Medal className="w-8 h-8 text-amber-500" /><span className="text-2xl font-black italic text-white tracking-tighter uppercase">Réussite<span className="text-amber-500">45</span></span></div>
          <div className="flex gap-4">
            {userProfile?.is_admin && <button onClick={() => setView('admin')}><BarChart3 className="w-6 h-6 text-slate-500 hover:text-white" /></button>}
            {user ? <button onClick={handleSignOut}><LogOut className="w-6 h-6 text-slate-500 hover:text-white" /></button> : <button onClick={() => setView('auth')} className="text-[10px] font-black uppercase text-slate-500 border border-white/5 py-2 px-4 rounded-xl">Connexion</button>}
            {!isSubscriptionActive && <button onClick={() => setShowPaymentModal(true)} className="bg-amber-500 text-slate-950 px-6 py-2 rounded-xl text-[10px] font-black uppercase shadow-2xl shadow-amber-500/20 active:scale-95 transition-all">PRO MODE</button>}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-16 relative z-10">
        {status === 'thinking' && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-3xl animate-in fade-in">
                <div className="text-center space-y-8">
                    <Loader2 className="w-24 h-24 text-amber-500 animate-spin mx-auto scale-150 opacity-50" />
                    <div className="space-y-4">
                        <p className="text-4xl font-black italic text-white uppercase tracking-tighter">GÉNÉRATION RÉUSSIE45</p>
                        <p className="text-amber-500 font-mono text-xs tracking-[0.5em] uppercase animate-pulse">{step}</p>
                    </div>
                </div>
            </div>
        )}

        {status === 'error' && (
            <div className="mb-10 p-10 bg-red-500/10 border border-red-500/20 rounded-[3rem] flex items-center gap-8 animate-in slide-in-from-top group overflow-hidden">
                <AlertCircle className="w-12 h-12 text-red-500" />
                <div><p className="text-[10px] font-black text-red-500/50 uppercase tracking-widest mb-1">ÉCHEC OPÉRATIONNEL</p><p className="text-xl font-bold text-red-400">{errorMsg}</p></div>
                <button onClick={() => setStatus('idle')} className="ml-auto text-red-500/50 hover:text-red-500"><X className="w-10 h-10" /></button>
            </div>
        )}

        {view === 'explore' && (
          <div className="text-center space-y-24 max-w-5xl mx-auto">
            <div className="space-y-12">
               <div className="inline-flex items-center gap-3 px-6 py-2 bg-white/5 border border-white/10 rounded-full text-amber-500 text-[10px] font-black uppercase tracking-[0.3em]"><Sparkles className="w-4 h-4" /> Excellence & Transformation</div>
               <h1 className="text-7xl md:text-[10rem] font-black text-white leading-[0.8] tracking-tighter">Votre futur <span className="text-amber-500 italic">commence ici.</span></h1>
               <form onSubmit={handleSearch} className="max-w-4xl mx-auto p-4 bg-slate-900 border border-white/5 rounded-[3.5rem] flex h-28 shadow-3xl overflow-hidden mt-16 relative">
                 <Search className="absolute left-12 top-1/2 -translate-y-1/2 w-8 h-8 text-slate-700" />
                 <input type="text" placeholder="Quelle compétence voulez-vous dominer ?" className="flex-1 bg-transparent border-none text-3xl px-20 text-white font-bold outline-none placeholder:text-slate-800" value={skill} onChange={(e) => setSkill(e.target.value)} />
                 <button type="submit" className="bg-amber-500 text-slate-950 px-16 rounded-[2.8rem] font-black uppercase text-xl hover:bg-amber-400 active:scale-95 transition-all shadow-2xl">GÉNÉRER</button>
               </form>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-left pt-20 border-t border-white/5">
                <h3 className="col-span-full text-[11px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-4">EXPLORER LES CYCLES RÉCENTS</h3>
                {publicRoadmaps.map(r => (
                  <div key={r.id} onClick={() => { setRoadmap(r); setView('course'); }} className="bg-slate-900/60 border border-white/5 p-12 rounded-[4rem] group hover:bg-slate-900 hover:border-amber-500/40 transition-all flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-10"><div className="bg-slate-800 p-6 rounded-3xl group-hover:rotate-12 transition-transform"><BookOpen className="w-10 h-10 text-amber-500" /></div><div><h4 className="font-black text-4xl capitalize text-white mb-2 leading-none">{r.title}</h4><span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{r.modules?.length || 0} MODULES STRATÉGIQUES</span></div></div>
                    <ChevronRight className="w-10 h-10 text-slate-700 group-hover:text-amber-500 transition-all" />
                  </div>
                ))}
            </div>
          </div>
        )}

        {view === 'course' && roadmap && (
          <div className="grid lg:grid-cols-12 gap-16 animate-in slide-in-from-bottom-20 duration-700">
            <div className="lg:col-span-4"><div className="bg-slate-900 border border-white/10 p-12 rounded-[4.5rem] sticky top-40"><p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-4">Cycle Expertise</p><h2 className="text-6xl font-black mb-12 text-white italic capitalize leading-none pr-4">{roadmap.title}</h2><div className="h-6 bg-slate-800 rounded-full p-1.5 border border-white/5"><div className="h-full bg-amber-500 rounded-full transition-all duration-1000 shadow-[0_0_30px_rgba(245,158,11,0.5)]" style={{ width: `${progressPercent}%` }} /></div><p className="text-xs font-black text-slate-600 uppercase mt-6 ml-4">Progression: {progressPercent}%</p></div></div>
            <div className="lg:col-span-8 space-y-20 pb-40">
               {roadmap.modules.map((m, i) => (
                 <div key={i} className="space-y-12">
                   <h3 className="font-black text-4xl text-slate-800 italic flex items-center gap-10"><span className="text-6xl not-italic opacity-20">0{i+1}</span> {m.name}</h3>
                   <div className="grid gap-8">
                     {m.videos.map(v => {
                       const locked = !v.isFree && !isSubscriptionActive;
                       const completed = userProfile?.completed_videos?.includes(v.id);
                       return (
                         <div key={v.id} className={cn("p-12 rounded-[4rem] border transition-all flex items-center gap-10 shadow-4xl", locked ? "bg-slate-900/10 opacity-30 cursor-not-allowed border-transparent" : "bg-slate-900 border-white/5 hover:border-amber-500/50 cursor-pointer")} onClick={() => !locked && setActiveVideo(v)}>
                           <div className={cn("w-24 h-24 rounded-[2.5rem] flex items-center justify-center transition-all", completed ? "bg-green-500/10 text-green-500 shadow-[0_0_20px_rgba(34,197,94,0.2)]" : "bg-slate-800 text-amber-500 shadow-2xl")}>{completed ? <CheckCircle2 className="w-12 h-12" /> : (locked ? <Lock className="w-10 h-10" /> : <PlayCircle className="w-12 h-12" />)}</div>
                           <div className="flex-1"><h4 className="font-black text-3xl text-white italic leading-tight">{v.title}</h4><span className="text-[10px] font-black text-slate-700 uppercase mt-3 block tracking-widest">VALIDATION REQUISE</span></div>
                           {!locked && <button onClick={(e) => { e.stopPropagation(); toggleComplete(v.id); }} className={cn("p-6 rounded-3xl transition-all", completed ? "text-green-500" : "text-slate-800 hover:text-white")}><CheckCircle2 className="w-10 h-10" /></button>}
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/99 backdrop-blur-[60px] animate-in zoom-in">
          <div className="bg-slate-900 border border-white/5 rounded-[5rem] w-full max-w-2xl p-20 text-center relative shadow-3xl">
            <button onClick={() => setShowPaymentModal(false)} className="absolute top-12 right-12"><X className="w-12 h-12 text-slate-700 hover:text-white" /></button>
            <div className="bg-amber-500 w-24 h-24 rounded-[2rem] flex items-center justify-center mx-auto mb-12 shadow-2xl shadow-amber-500/40 rotate-12"><Zap className="w-12 h-12 text-slate-950 fill-current" /></div>
            <h2 className="text-7xl font-black mb-10 italic text-white uppercase tracking-tighter">REUSSITE<span className="text-amber-500">PRO</span></h2>
            <div className="bg-slate-950 p-16 rounded-[4rem] mb-16 flex justify-between items-center text-left border border-white/5"><div className="text-8xl font-black text-white italic">2000 <span className="text-3xl text-slate-800">F</span></div><CreditCard className="w-14 h-14 text-slate-800" /></div>
            <button onClick={processPayment} className="w-full bg-white text-slate-950 py-10 rounded-[3rem] font-black text-4xl shadow-3xl hover:bg-amber-500 transition-all active:scale-95">ACTIVER L'ACCÈS 45J</button>
          </div>
        </div>
      )}

      {activeVideo && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/99 backdrop-blur-[80px] animate-in fade-in">
          <div className="w-full max-w-7xl h-full flex flex-col gap-10">
            <div className="flex justify-between items-center"><h2 className="font-black text-5xl text-white italic truncate pr-20">{activeVideo.title}</h2><button onClick={() => setActiveVideo(null)} className="p-8 bg-white/5 rounded-[2.5rem] hover:bg-white/10 transition-all"><X className="w-12 h-12 text-white" /></button></div>
            <div className="flex-1 grid lg:grid-cols-12 gap-12">
               <div className="lg:col-span-8 bg-slate-900 rounded-[5rem] overflow-hidden border border-white/5 shadow-2xl relative"><iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${activeVideo.ytId}?autoplay=1&modestbranding=1`} frameBorder="0" allowFullScreen></iframe></div>
               <div className="lg:col-span-4 bg-slate-900 border border-white/5 rounded-[5rem] flex flex-col p-14"><div className="text-xs font-black uppercase text-amber-500 mb-10 tracking-[0.5em] italic">Journal d'Expertise</div><textarea className="flex-1 bg-transparent text-2xl text-slate-300 resize-none outline-none italic leading-relaxed placeholder:text-slate-800" placeholder="Consignez vos clés de réussite..." value={userNotes} onChange={(e) => setUserNotes(e.target.value)}></textarea><button onClick={() => toggleComplete(activeVideo.id)} className={cn("mt-10 py-8 rounded-[3rem] font-black text-2xl shadow-3xl transition-all", userProfile?.completed_videos?.includes(activeVideo.id) ? "bg-green-500 text-white" : "bg-white text-slate-950")}>{userProfile?.completed_videos?.includes(activeVideo.id) ? "ÉLEVÉ ✅" : "VALIDER LE MODULE"}</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default App;
