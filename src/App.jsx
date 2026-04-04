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
  if (!YOUTUBE_API_KEY) throw new Error("Clé YouTube manquante dans la configuration.");
  
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=5&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.error) {
    if (data.error.code === 403) throw new Error("Quota YouTube dépassé ou clé non autorisée.");
    throw new Error(data.error.message);
  }
  
  if (!data.items || data.items.length === 0) throw new Error("Aucune vidéo trouvée pour cette compétence.");
  
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
  const [step, setStep] = useState(''); // Current generation step
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
      const { data } = await insforge.database.from('roadmaps').select('*').order('created_at', { ascending: false });
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

        setStep('Interrogation de YouTube API...');
        const realVideos = await fetchYouTubeVideos(skill);

        setStep('Structuration du cycle de formation...');
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
              name: "Phase 2: Mise en Pratique", 
              videos: realVideos.slice(2, 4).map((v, idx) => ({
                id: `v2-${idx}`, ytId: v.ytId, title: v.title, isFree: false, duration: '45:00'
              }))
            }
          ]
        };

        setStep('Sauvegarde dans la base de données...');
        const { data, error } = await insforge.database
          .from('roadmaps')
          .insert([newRoadmap])
          .select()
          .single();
        
        if (error) throw new Error(`Erreur Base de données: ${error.message}`);
        
        if (data) {
          setRoadmap(data);
          setPublicRoadmaps(prev => [data, ...prev]);
        }
        setStatus('ready');
        setView('course');
    } catch (err) {
        console.error("Search Logic Error:", err);
        setStatus('error');
        setErrorMsg(err.message || "Une erreur inconnue est survenue.");
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
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-amber-500/30">
      <nav className="border-b border-white/5 bg-slate-950/80 backdrop-blur-3xl sticky top-0 z-50 py-4">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-5 cursor-pointer" onClick={() => setView('explore')}><Medal className="w-8 h-8 text-amber-500" /><span className="text-2xl font-black italic text-white uppercase">Réussite<span className="text-amber-500">45</span></span></div>
          <div className="flex gap-4">
            {userProfile?.is_admin && <button onClick={() => setView('admin')}><BarChart3 className="w-6 h-6 text-slate-500" /></button>}
            {user ? <button onClick={handleSignOut}><LogOut className="w-6 h-6 text-slate-500" /></button> : <button onClick={() => setView('explore')} className="text-xs font-black uppercase text-slate-500">Connexion</button>}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-16 relative z-10">
        {status === 'thinking' && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-in fade-in">
                <div className="text-center space-y-8">
                    <div className="relative w-24 h-24 mx-auto">
                        <Loader2 className="w-24 h-24 text-amber-500 animate-spin absolute inset-0" />
                        <div className="absolute inset-4 bg-amber-500/20 rounded-full animate-pulse" />
                    </div>
                    <div className="space-y-4">
                        <p className="text-3xl font-black italic text-white uppercase tracking-tighter">GÉNÉRATION EN COURS</p>
                        <p className="text-amber-500 font-mono text-sm tracking-[0.3em] uppercase">{step}</p>
                    </div>
                </div>
            </div>
        )}

        {status === 'error' && (
            <div className="mb-10 p-8 bg-red-500/10 border border-red-500/20 rounded-[3rem] flex flex-col md:flex-row items-center gap-8 animate-in slide-in-from-top group relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4"><button onClick={() => setStatus('idle')}><X className="text-red-500/50 hover:text-red-500" /></button></div>
                <div className="bg-red-500/10 p-4 rounded-2xl"><AlertCircle className="w-10 h-10 text-red-500" /></div>
                <div className="text-center md:text-left">
                    <p className="text-[10px] font-black text-red-500/50 uppercase tracking-widest mb-1">ERREUR DE GÉNÉRATION</p>
                    <p className="text-lg font-bold text-red-400">{errorMsg}</p>
                </div>
                <button onClick={handleSearch} className="md:ml-auto bg-red-500 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase hover:bg-red-600 transition-all">Réessayer</button>
            </div>
        )}

        {view === 'explore' && (
          <div className="max-w-5xl mx-auto text-center space-y-24">
            <h1 className="text-7xl md:text-9xl font-black text-white leading-none tracking-tighter">Maitrisez n'importe <span className="text-amber-500 italic">quelle compétence.</span></h1>
            <form onSubmit={handleSearch} className="max-w-3xl mx-auto p-4 bg-slate-900 border border-white/5 rounded-[3rem] flex h-24 shadow-2xl relative">
                <input type="text" placeholder="Entrez un domaine d'expertise..." className="flex-1 bg-transparent border-none text-2xl px-10 text-white font-bold outline-none" value={skill} onChange={(e) => setSkill(e.target.value)} />
                <button type="submit" className="bg-amber-500 text-slate-950 px-12 rounded-[2.5rem] font-black uppercase text-xl transition-all hover:bg-amber-400">Générer</button>
            </form>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-left">
               {publicRoadmaps.map(r => (
                 <div key={r.id} onClick={() => { setRoadmap(r); setView('course'); }} className="bg-slate-900 border border-white/5 p-10 rounded-[4rem] hover:border-amber-500/40 cursor-pointer group transition-all flex items-center justify-between">
                   <div className="flex items-center gap-8"><div className="bg-slate-800 p-6 rounded-3xl group-hover:rotate-6 transition-all"><BookOpen className="w-8 h-8 text-amber-500" /></div><div><h4 className="font-black text-3xl capitalize text-white mb-2">{r.title}</h4><span className="text-[10px] font-black text-slate-600 uppercase">{r.modules?.length || 0} ÉTAPES</span></div></div>
                   <ChevronRight className="w-8 h-8 text-slate-500 group-hover:text-amber-500 transition-all" />
                 </div>
               ))}
            </div>
          </div>
        )}

        {view === 'course' && roadmap && (
          <div className="grid lg:grid-cols-12 gap-16 animate-in fade-in slide-in-from-bottom-10">
            <div className="lg:col-span-4 space-y-8">
               <div className="bg-slate-900 border border-white/10 p-12 rounded-[4rem]">
                 <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-4 italic">Cycle de Maitrise</p>
                 <h2 className="text-5xl font-black mb-10 text-white capitalize">{roadmap.title}</h2>
                 <div className="h-4 bg-slate-800 rounded-full p-1"><div className="h-full bg-amber-500 rounded-full transition-all duration-1000" style={{ width: `${progressPercent}%` }} /></div>
               </div>
            </div>
            <div className="lg:col-span-8 space-y-16 pb-40">
               {roadmap.modules.map((m, i) => (
                 <div key={i} className="space-y-10">
                   <h3 className="font-black text-3xl text-slate-700 italic">0{i+1}. {m.name}</h3>
                   <div className="grid gap-6">
                     {m.videos.map(v => {
                       const locked = !v.isFree && !isSubscriptionActive;
                       const completed = userProfile?.completed_videos?.includes(v.id);
                       return (
                         <div key={v.id} className={cn("flex items-center gap-8 p-10 rounded-[3rem] border transition-all", locked ? "bg-slate-900/10 opacity-30 cursor-not-allowed" : "bg-slate-900 border-white/10 hover:border-amber-500/50 cursor-pointer")} onClick={() => !locked && setActiveVideo(v)}>
                           <div className={cn("w-20 h-20 rounded-[2.2rem] flex items-center justify-center", completed ? "bg-green-500/10 text-green-500" : "bg-slate-800 text-amber-500")}>{completed ? <CheckCircle2 className="w-10 h-10" /> : (locked ? <Lock className="w-8 h-8" /> : <PlayCircle className="w-10 h-10" />)}</div>
                           <div className="flex-1"><h4 className="font-black text-2xl text-white italic">{v.title}</h4></div>
                           {!locked && <button onClick={(e) => { e.stopPropagation(); toggleComplete(v.id); }} className={cn("p-4", completed ? "text-green-500" : "text-slate-800 hover:text-white")}><CheckCircle2 className="w-8 h-8" /></button>}
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/98 backdrop-blur-3xl animate-in zoom-in">
          <div className="bg-slate-900 border border-white/5 rounded-[4rem] w-full max-w-xl p-16 text-center relative shadow-3xl">
            <button onClick={() => setShowPaymentModal(false)} className="absolute top-8 right-8"><X className="w-10 h-10 text-slate-800" /></button>
            <h2 className="text-6xl font-black mb-10 italic text-white uppercase">REUSSITE<span className="text-amber-500">PRO</span></h2>
            <div className="bg-slate-950 p-12 rounded-[3.5rem] mb-12 flex justify-between items-center text-left"><div className="text-7xl font-black text-white">2000 <span className="text-2xl text-slate-800">F</span></div><CreditCard className="w-10 h-10 text-slate-800" /></div>
            <button onClick={processPayment} className="w-full bg-white text-slate-950 py-8 rounded-[2.5rem] font-black text-3xl hover:bg-amber-500 transition-all">S'ABONNER 45J</button>
          </div>
        </div>
      )}

      {activeVideo && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/99 backdrop-blur-3xl animate-in fade-in">
          <div className="w-full max-w-7xl h-full flex flex-col gap-8">
            <div className="flex justify-between items-center"><h2 className="font-black text-4xl text-white italic truncate pr-10">{activeVideo.title}</h2><button onClick={() => setActiveVideo(null)} className="p-6 bg-white/5 rounded-3xl"><X className="w-10 h-10" /></button></div>
            <div className="flex-1 grid lg:grid-cols-12 gap-10">
               <div className="lg:col-span-8 bg-slate-900 rounded-[4rem] overflow-hidden border border-white/5 shadow-2xl relative"><iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${activeVideo.ytId}?autoplay=1&modestbranding=1`} frameBorder="0" allowFullScreen></iframe></div>
               <div className="lg:col-span-4 bg-slate-900 border border-white/10 rounded-[4rem] flex flex-col p-10"><div className="text-xs font-black uppercase text-amber-500 mb-6 italic">Journal d'Expertise</div><textarea className="flex-1 bg-transparent text-lg text-slate-400 resize-none outline-none italic leading-relaxed" placeholder="Notez ici les concepts clés..." value={userNotes} onChange={(e) => setUserNotes(e.target.value)}></textarea><button onClick={() => toggleComplete(activeVideo.id)} className={cn("mt-6 py-6 rounded-[2rem] font-black text-xl transition-all", userProfile?.completed_videos?.includes(activeVideo.id) ? "bg-green-500 text-white" : "bg-white text-slate-950")}>{userProfile?.completed_videos?.includes(activeVideo.id) ? "ÉTAPE VALIDÉE" : "VALIDER L'ÉTAPE"}</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
