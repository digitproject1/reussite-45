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
  Medal, Target, LogIn, LogOut
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

// --- GOOGLE YOUTUBE API HELPER ---
const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

const fetchYouTubeVideos = async (query) => {
  if (!YOUTUBE_API_KEY) {
    console.warn("YouTube API Key missing. Using fallback mock data.");
    return null;
  }
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=5&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.items.map(item => ({
      ytId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.high.url,
      duration: '15:00' // YouTube search snippet doesn't include duration, would need contentDetails call
    }));
  } catch (err) {
    console.error("YouTube Fetch Error:", err);
    return null;
  }
};

const App = () => {
  const [user, setUser] = useState(null); // { id, email, name, ... }
  const [view, setView] = useState('explore'); // explore, course, admin, my-learning, auth
  const [adminTab, setAdminTab] = useState('finance'); 
  const [skill, setSkill] = useState('');
  const [status, setStatus] = useState('idle');
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
  const [authMode, setAuthMode] = useState('login'); // login, signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [authError, setAuthError] = useState('');

  // --- 1. AUTHENTICATION ---
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data, error } = await insforge.auth.getCurrentUser();
        if (data?.user) {
          setUser(data.user);
        }
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
    else {
      setUser(data.user);
      setView('explore');
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setAuthError('');
    const { data, error } = await insforge.auth.signUp({ email, password, name });
    if (error) setAuthError(error.message);
    else {
      if (data?.requireEmailVerification) {
        setAuthError("Un email de vérification a été envoyé.");
      } else {
        setUser(data.user);
        setView('explore');
      }
    }
  };

  const handleSignOut = async () => {
    await insforge.auth.signOut();
    setUser(null);
    setUserProfile(null);
    setView('explore');
  };

  // --- 2. DATA FETCHING (InsForge DB) ---
  useEffect(() => {
    if (!user) return;

    // Fetch User Profile
    const fetchProfile = async () => {
      const { data, error } = await insforge.database
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        setUserProfile(data);
        if (activeVideo) setUserNotes(data.notes?.[activeVideo.id] || "");
      } else {
        // Create initial profile
        const newProfile = {
          id: user.id,
          is_admin: false,
          is_paid: false,
          is_banned: false,
          notes: {},
          completed_videos: []
        };
        const { data: created } = await insforge.database
          .from('user_profiles')
          .insert([newProfile])
          .select()
          .single();
        if (created) setUserProfile(created);
      }
    };

    fetchProfile();
  }, [user, activeVideo]);

  // Fetch Public Roadmaps
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

  // Admin Data
  useEffect(() => {
    if (!user || !userProfile?.is_admin) return;

    const fetchAdminData = async () => {
      const { data: txs } = await insforge.database
        .from('transactions')
        .select('*')
        .order('timestamp', { ascending: false });
      if (txs) setTransactions(txs);

      const { data: users } = await insforge.database
        .from('user_profiles')
        .select('*');
      if (users) setApprenants(users);
    };

    fetchAdminData();
  }, [user, userProfile?.is_admin]);

  // Sync Notes to InsForge
  const notesTimeout = useRef(null);
  useEffect(() => {
    if (!user || !activeVideo) return;
    
    if (notesTimeout.current) clearTimeout(notesTimeout.current);
    notesTimeout.current = setTimeout(async () => {
      await insforge.database
        .from('user_profiles')
        .update({
          notes: { ...userProfile?.notes, [activeVideo.id]: userNotes }
        })
        .eq('id', user.id);
    }, 1500);

    return () => clearTimeout(notesTimeout.current);
  }, [userNotes, activeVideo, user]);

  // --- 3. BUSINESS LOGIC ---
  const isSubscriptionActive = useMemo(() => {
    if (userProfile?.is_admin) return true;
    if (!userProfile?.expiry_date || userProfile?.is_banned) return false;
    const expiry = new Date(userProfile.expiry_date);
    return expiry > new Date();
  }, [userProfile]);

  const daysLeft = useMemo(() => {
    if (!userProfile?.expiry_date) return 0;
    const expiry = new Date(userProfile.expiry_date);
    const diff = expiry.getTime() - new Date().getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [userProfile]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!skill.trim()) return;
    setStatus('thinking');

    const existing = publicRoadmaps.find(r => r.title.toLowerCase() === skill.toLowerCase());
    
    if (existing) {
      setRoadmap(existing);
      setStatus('ready');
      setView('course');
    } else {
      // 1. Fetch Real YouTube Data if Key exists
      const realVideos = await fetchYouTubeVideos(skill);
      
      const newRoadmap = {
        title: skill,
        modules: [
          { 
            name: "Phase 1: Initiation", 
            videos: realVideos ? realVideos.slice(0, 2).map((v, idx) => ({
              id: `v1-${idx}`,
              ytId: v.ytId,
              title: v.title,
              isFree: idx === 0,
              duration: '12:30'
            })) : [
              { id: 'v1', ytId: 'jS4aFq5dxas', title: `Introduction à : ${skill}`, isFree: true, duration: '12:30' },
              { id: 'v2', ytId: 'P_m-9E5xYyE', title: "Maîtriser les briques essentielles", isFree: false, duration: '18:45' }
            ] 
          },
          { 
            name: "Phase 2: Mise en Pratique", 
            videos: realVideos ? realVideos.slice(2, 4).map((v, idx) => ({
              id: `v2-${idx}`,
              ytId: v.ytId,
              title: v.title,
              isFree: false,
              duration: '45:00'
            })) : [
              { id: 'v3', ytId: 'W6NZfCO5SIk', title: "Projet concret étape par étape", isFree: false, duration: '45:00' }
            ] 
          }
        ]
      };

      const { data, error } = await insforge.database
        .from('roadmaps')
        .insert([newRoadmap])
        .select()
        .single();
      
      if (data) {
        setRoadmap(data);
        setPublicRoadmaps([data, ...publicRoadmaps]);
      }
      setStatus('ready');
      setView('course');
    }
  };

  const processPayment = async () => {
    if (!user) {
        setView('auth');
        setShowPaymentModal(false);
        return;
    }
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 45);

    await insforge.database
      .from('user_profiles')
      .update({
        is_paid: true,
        expiry_date: expiry.toISOString()
      })
      .eq('id', user.id);

    await insforge.database
      .from('transactions')
      .insert([{
        user_id: user.id,
        amount: 2000
      }]);

    setShowPaymentModal(false);
    // Refresh profile locally or via refetch
    setUserProfile({ ...userProfile, is_paid: true, expiry_date: expiry.toISOString() });
  };

  const toggleComplete = async (videoId) => {
    if (!isSubscriptionActive && videoId !== 'v1') return;
    const currentCompleted = userProfile?.completed_videos || [];
    const newCompleted = currentCompleted.includes(videoId) 
      ? currentCompleted.filter(id => id !== videoId)
      : [...currentCompleted, videoId];

    await insforge.database
      .from('user_profiles')
      .update({ completed_videos: newCompleted })
      .eq('id', user.id);
    
    setUserProfile({ ...userProfile, completed_videos: newCompleted });
  };

  const totalVideos = roadmap?.modules?.reduce((acc, m) => acc + m.videos.length, 0) || 1;
  const progressPercent = Math.min(100, Math.round(((userProfile?.completed_videos?.length || 0) / totalVideos) * 100));

  // --- VIEWS ---
  const AdminDashboard = () => {
    const totalRevenue = transactions.reduce((acc, t) => acc + t.amount, 0);
    return (
      <div className="space-y-10 animate-in fade-in duration-500 pb-20">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
             <BarChart3 className="w-10 h-10 text-amber-500" />
             <h2 className="text-4xl font-black italic text-white uppercase tracking-tighter">CONTRÔLE<span className="text-amber-500 block text-[10px] tracking-widest mt-1">REUSSITE45 HUB</span></h2>
          </div>
          <div className="flex bg-slate-900/50 p-2 rounded-[2rem] border border-white/5 backdrop-blur-xl">
            {['finance', 'users'].map(tab => (
              <button 
                key={tab}
                onClick={() => setAdminTab(tab)}
                className={cn("px-8 py-3 rounded-2xl text-[10px] font-black tracking-widest transition-all uppercase", adminTab === tab ? "bg-amber-500 text-slate-950" : "text-slate-500 hover:text-white")}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {adminTab === 'finance' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="bg-slate-900 p-10 rounded-[3rem] border border-white/5 shadow-2xl">
               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">REVENU TOTAL</p>
               <h3 className="text-5xl font-black text-white italic">{totalRevenue.toLocaleString()} F</h3>
            </div>
          </div>
        )}

        {adminTab === 'users' && (
           <div className="bg-slate-900 rounded-[3rem] border border-white/5 overflow-hidden shadow-2xl">
              <table className="w-full text-left">
                 <thead className="bg-slate-950 border-b border-white/5">
                    <tr>
                       <th className="px-10 py-6 text-[10px] font-black uppercase text-slate-500">UTILISATEUR</th>
                       <th className="px-10 py-6 text-[10px] font-black uppercase text-slate-500">STATUT</th>
                       <th className="px-10 py-6 text-[10px] font-black uppercase text-slate-500">EXPIRATION</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-white/5">
                    {apprenants.map(a => (
                       <tr key={a.id} className="hover:bg-white/[0.02]">
                          <td className="px-10 py-6 text-sm font-mono text-slate-400">{a.id.slice(0, 8)}...</td>
                          <td className="px-10 py-6">
                             {a.is_paid ? <span className="bg-amber-500/10 text-amber-500 px-3 py-1 rounded-full text-[10px] font-black">PREMIUM</span> : <span className="text-slate-600 text-[10px]">GUEST</span>}
                          </td>
                          <td className="px-10 py-6 text-xs font-bold text-slate-300">
                             {a.expiry_date ? new Date(a.expiry_date).toLocaleDateString() : 'N/A'}
                          </td>
                       </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        )}
      </div>
    );
  };

  const AuthView = () => (
    <div className="max-w-md mx-auto py-20 animate-in zoom-in duration-500">
        <div className="bg-slate-900 p-12 rounded-[4rem] border border-white/10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-32 h-32 bg-amber-500/10 blur-[60px] rounded-full" />
            <h2 className="text-4xl font-black mb-8 text-white text-center italic">{authMode === 'login' ? 'CONNEXION' : 'REJOINDRE'}</h2>
            <form onSubmit={authMode === 'login' ? handleLogin : handleSignup} className="space-y-6">
                <div>
                   <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-4">Email</label>
                   <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-slate-950 border border-white/5 rounded-2xl px-6 py-4 text-white focus:border-amber-500/50 outline-none transition-all" placeholder="user@reussite.com" required />
                </div>
                {authMode === 'signup' && (
                    <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-4">Nom</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-slate-950 border border-white/5 rounded-2xl px-6 py-4 text-white placeholder:text-slate-800" placeholder="Votre nom" required />
                    </div>
                )}
                <div>
                   <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-4">Mot de passe</label>
                   <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-950 border border-white/5 rounded-2xl px-6 py-4 text-white border-white/5 focus:border-amber-500/50 transition-all outline-none" placeholder="••••••••" required />
                </div>
                {authError && <p className="text-red-500 text-[10px] font-black text-center uppercase tracking-widest">{authError}</p>}
                <button type="submit" className="w-full bg-amber-500 text-slate-950 py-5 rounded-2xl font-black text-sm uppercase shadow-2xl shadow-amber-500/20 active:scale-95 transition-all">
                    {authMode === 'login' ? 'Se Connecter' : 'Créer un compte'}
                </button>
            </form>
            <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="w-full mt-8 text-slate-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all">
                {authMode === 'login' ? 'Pas encore membre ? Rejoignez-nous' : 'Déjà inscrit ? Connectez-vous'}
            </button>
        </div>
    </div>
  );

  if (isLoading) return <div className="min-h-screen bg-[#020617] flex items-center justify-center text-amber-500"><RefreshCcw className="animate-spin w-10 h-10" /></div>;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-amber-500/30">
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-500 rounded-full blur-[140px]" />
      </div>

      <nav className="border-b border-white/5 bg-slate-950/80 backdrop-blur-3xl sticky top-0 z-50 py-4">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-5 cursor-pointer" onClick={() => setView('explore')}>
            <div className="bg-amber-500 p-3 rounded-2xl shadow-2xl shadow-amber-500/20"><Medal className="w-7 h-7 text-slate-950" /></div>
            <div className="flex flex-col">
              <span className="text-3xl font-black tracking-tighter uppercase italic text-white leading-none">Réussite<span className="text-amber-500">45</span></span>
              <span className="text-[10px] font-black text-slate-500 uppercase mt-1 tracking-[0.3em]">InsForge Edition</span>
            </div>
          </div>

          <div className="flex items-center gap-8">
            {user ? (
               <div className="flex items-center gap-8">
                  <button onClick={() => setView('my-learning')} className={cn("hidden sm:flex flex-col items-center", view === 'my-learning' ? "text-amber-500" : "text-slate-500")}>
                    <Trophy className="w-6 h-6 mb-1" />
                    <span className="text-[9px] font-black uppercase">Ma Réussite</span>
                  </button>
                  {userProfile?.is_admin && (
                    <button onClick={() => setView('admin')} className={cn("flex flex-col items-center", view === 'admin' ? "text-white" : "text-slate-500")}>
                      <BarChart3 className="w-6 h-6 mb-1" />
                    </button>
                  )}
                  <button onClick={handleSignOut} className="text-slate-500 hover:text-white transition-all"><LogOut className="w-6 h-6" /></button>
               </div>
            ) : (
                <button onClick={() => setView('auth')} className="flex items-center gap-2 text-[11px] font-black uppercase text-slate-500 hover:text-white transition-all border border-white/5 px-6 py-2 rounded-2xl"><LogIn className="w-4 h-4" /> Connexion</button>
            )}
            
            {!isSubscriptionActive && (
              <button onClick={() => setShowPaymentModal(true)} className="bg-amber-500 text-slate-950 px-8 py-3 rounded-2xl text-[11px] font-black uppercase shadow-2xl shadow-amber-500/20 active:scale-95 transition-all">Passez Pro</button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-16 relative z-10">
        {view === 'auth' && <AuthView />}
        
        {view === 'explore' && (
          <div className="max-w-5xl mx-auto text-center space-y-24">
            <div className="space-y-10">
              <div className="inline-flex items-center gap-3 px-6 py-2 bg-white/5 border border-white/10 text-amber-500 rounded-full text-[11px] font-black uppercase tracking-widest">
                <Sparkles className="w-4 h-4" /> Plateforme de Transformation Digitale
              </div>
              <h1 className="text-7xl md:text-9xl font-black tracking-tighter leading-[0.8] text-white">Maitrisez n'importe <span className="text-amber-500 italic">quelle compétence.</span></h1>
              <form onSubmit={handleSearch} className="max-w-3xl mx-auto mt-20 p-3 bg-slate-900 border border-white/10 rounded-[3rem] flex shadow-2xl overflow-hidden h-24">
                <div className="flex-1 flex items-center px-10 gap-6">
                   <Search className="w-7 h-7 text-slate-500" />
                   <input type="text" placeholder="Quel est votre défi aujourd'hui ?" className="bg-transparent border-none focus:ring-0 text-xl w-full py-4 text-white font-bold outline-none" value={skill} onChange={(e) => setSkill(e.target.value)} />
                </div>
                <button type="submit" className="bg-amber-500 text-slate-950 font-black px-12 rounded-[2.5rem] text-lg uppercase transition-all hover:bg-amber-400">Explorer</button>
              </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-left pt-20">
               <h3 className="col-span-full text-[11px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-4">EXPLORER LA BIBLIOTHÈQUE</h3>
               {publicRoadmaps.map(r => (
                 <div key={r.id} onClick={() => { setRoadmap(r); setView('course'); }} className="bg-slate-900/40 border border-white/5 p-10 rounded-[4rem] hover:bg-slate-900 hover:border-amber-500/40 cursor-pointer transition-all flex items-center justify-between group shadow-2xl backdrop-blur-sm">
                   <div className="flex items-center gap-8">
                     <div className="bg-slate-800 p-6 rounded-3xl group-hover:rotate-6 transition-transform"><BookOpen className="w-8 h-8 text-amber-500" /></div>
                     <div>
                       <h4 className="font-black text-3xl capitalize text-white mb-2 leading-none">{r.title}</h4>
                       <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{r.modules?.length || 0} ÉTAPES</span>
                     </div>
                   </div>
                   <ChevronRight className="w-8 h-8 text-slate-500 group-hover:text-amber-500 transition-all" />
                 </div>
               ))}
               {publicRoadmaps.length === 0 && <p className="col-span-full text-center text-slate-600 font-bold italic py-20 text-xl">Aucune roadmap générée pour le moment. Soyez le premier !</p>}
            </div>
          </div>
        )}

        {view === 'course' && roadmap && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
            <div className="lg:col-span-4 space-y-10">
              <div className="bg-slate-900 border border-white/10 p-12 rounded-[4rem] shadow-2xl relative overflow-hidden flex flex-col min-h-[500px]">
                <span className="text-[11px] font-black text-amber-500 uppercase tracking-widest mb-6">Cycle de Maitrise Professionnelle</span>
                <h2 className="text-5xl font-black mb-10 capitalize leading-none tracking-tighter italic text-white">{roadmap.title}</h2>
                <div className="space-y-4">
                  <div className="flex justify-between text-[11px] font-black uppercase text-slate-500">
                    <span>Progression</span>
                    <span className="text-amber-500">{progressPercent}%</span>
                  </div>
                  <div className="h-4 bg-slate-800 rounded-full overflow-hidden p-1 border border-white/5"><div className="h-full bg-amber-500 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all duration-1000" style={{ width: `${progressPercent}%` }} /></div>
                </div>
                {!isSubscriptionActive && (
                  <div className="mt-12 p-8 bg-amber-500/10 border border-amber-500/20 rounded-[3rem] text-center">
                    <Zap className="w-12 h-12 text-amber-500 mx-auto mb-6 fill-current" />
                    <p className="font-bold text-amber-200 mb-8 italic">Passez à l'expertise métier. Accès Full pour 2000 FCFA.</p>
                    <button onClick={() => setShowPaymentModal(true)} className="w-full bg-amber-500 text-slate-950 py-5 rounded-[2rem] font-black shadow-2xl">ACTIVER LE CYCLE</button>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-8 space-y-16 pb-40">
              {roadmap.modules.map((m, i) => (
                <div key={i} className="space-y-10">
                  <h3 className="font-black text-3xl text-slate-700 italic flex items-center gap-6"><span className="text-amber-500/40 text-4xl font-black not-italic">0{i+1}.</span> {m.name}</h3>
                  <div className="grid gap-6">
                    {m.videos.map(v => {
                      const locked = !v.isFree && !isSubscriptionActive;
                      const completed = userProfile?.completed_videos?.includes(v.id);
                      return (
                        <div key={v.id} className={cn("group flex items-center gap-8 p-10 rounded-[3rem] border transition-all", locked ? "bg-slate-900/30 opacity-40 grayscale cursor-not-allowed" : "bg-slate-900 border-white/10 hover:border-amber-500/50 cursor-pointer shadow-2xl")} onClick={() => !locked && setActiveVideo(v)}>
                          <div className={cn("w-20 h-20 rounded-[2rem] flex items-center justify-center transition-all", completed ? "bg-green-500/10 text-green-500" : "bg-slate-800 text-amber-500")}>{completed ? <CheckCircle2 className="w-10 h-10" /> : (locked ? <Lock className="w-8 h-8 text-slate-700" /> : <PlayCircle className="w-10 h-10" />)}</div>
                          <div className="flex-1"><h4 className={cn("font-black text-2xl truncate", locked ? "text-slate-700" : "text-white")}>{v.title}</h4><span className="text-[10px] font-black text-slate-600 uppercase mt-2 block">{v.duration} MIN</span></div>
                          {!locked && <button onClick={(e) => { e.stopPropagation(); toggleComplete(v.id); }} className={cn("p-4 rounded-2xl transition-all", completed ? "text-green-500" : "text-slate-700 hover:text-white")}><CheckCircle2 className="w-8 h-8" /></button>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'admin' && <AdminDashboard />}
        
        {view === 'my-learning' && (
           <div className="max-w-5xl mx-auto py-10"><div className="bg-gradient-to-br from-amber-500 to-amber-700 p-16 rounded-[4rem] shadow-2xl relative overflow-hidden text-slate-950"><h2 className="text-5xl font-black mb-12 italic tracking-tighter">MA PROGRESSION EXPERT</h2><div className="flex gap-20"><div className="text-left"><p className="text-8xl font-black leading-none">{userProfile?.completed_videos?.length || 0}</p><p className="text-[11px] font-black uppercase mt-4 tracking-[0.2em] opacity-60">LEÇONS VALIDÉES</p></div></div></div></div>
        )}
      </main>

      {showPaymentModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/98 backdrop-blur-3xl animate-in zoom-in duration-300">
          <div className="bg-slate-900 border border-white/10 rounded-[4rem] w-full max-w-xl p-16 text-center relative shadow-[0_100px_150px_rgba(0,0,0,1)]">
            <button onClick={() => setShowPaymentModal(false)} className="absolute top-8 right-8 text-slate-600 hover:text-white"><X className="w-10 h-10" /></button>
            <div className="bg-amber-500 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-10 rotate-12 shadow-2xl shadow-amber-500/30"><Zap className="w-12 h-12 text-slate-950 fill-current" /></div>
            <h2 className="text-6xl font-black mb-6 italic text-white uppercase tracking-tighter leading-none">REUSSITE<span className="text-amber-500">PRO</span></h2>
            <div className="bg-slate-950 p-12 rounded-[3.5rem] mb-12 flex justify-between items-center text-left border border-white/5"><div className="text-7xl font-black text-white leading-none">2000 <span className="text-2xl text-slate-700 italic">F</span></div><CreditCard className="w-10 h-10 text-slate-700" /></div>
            <button onClick={processPayment} className="w-full bg-white text-slate-950 py-8 rounded-[2.5rem] font-black text-3xl shadow-2xl hover:bg-amber-400 active:scale-95 transition-all">S'ABONNER 45J</button>
          </div>
        </div>
      )}

      {activeVideo && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-[#01030e]/99 backdrop-blur-[40px] animate-in fade-in duration-500">
          <div className="w-full max-w-7xl h-full flex flex-col py-4 gap-8">
            <div className="flex items-center justify-between">
               <div className="flex items-center gap-8 text-white"><div className="bg-amber-500 p-4 rounded-2xl"><Play className="w-8 h-8 text-slate-950 fill-current" /></div><h2 className="font-black text-4xl italic uppercase tracking-tighter leading-none">{activeVideo.title}</h2></div>
               <button onClick={() => setActiveVideo(null)} className="p-6 bg-white/5 rounded-3xl text-slate-400 hover:text-white ring-1 ring-white/10"><X className="w-10 h-10" /></button>
            </div>
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-10 overflow-hidden">
               <div className="lg:col-span-8 flex flex-col gap-10">
                  <div className="flex-1 bg-slate-900 rounded-[4rem] overflow-hidden border border-white/5 shadow-2xl"><iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${activeVideo.ytId}?autoplay=1&modestbranding=1`} frameBorder="0" allowFullScreen></iframe></div>
                  <div className="bg-slate-900/50 p-10 rounded-[3.5rem] border border-white/5 flex justify-between items-center"><div className="flex items-center gap-6 text-white"><Flame className="text-amber-500 w-8 h-8 animate-pulse" /><span className="text-xl font-black italic">Mode Focus Activé</span></div><button onClick={() => toggleComplete(activeVideo.id)} className={cn("px-14 py-6 rounded-[2rem] font-black uppercase text-base shadow-2xl transition-all", userProfile?.completed_videos?.includes(activeVideo.id) ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-white text-slate-950 hover:bg-amber-400")}>{userProfile?.completed_videos?.includes(activeVideo.id) ? "ÉTAPE VALIDÉE" : "VALIDER L'ÉTAPE"}</button></div>
               </div>
               <div className="lg:col-span-4 bg-slate-900 border border-white/10 rounded-[4rem] flex flex-col shadow-2xl"><div className="p-10 border-b border-white/5 text-xs font-black uppercase text-white tracking-[0.4em] flex items-center gap-4"><StickyNote className="w-5 h-5 text-amber-500" /> Journal d'Expertise</div><textarea className="flex-1 bg-transparent p-10 text-lg text-slate-300 resize-none outline-none italic placeholder:text-slate-800 leading-relaxed font-medium" placeholder="Saisissez ici vos synthèses et concepts clés..." value={userNotes} onChange={(e) => setUserNotes(e.target.value)}></textarea></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
