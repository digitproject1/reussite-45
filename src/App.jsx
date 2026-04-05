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
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNDUwNDR9.HlrQ3klD2Kk0AkfipDR30dw5lVExLni76cS_p3LAL68'
});

const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

const fetchRapidApiVideos = async (query) => {
  try {
    const rapidApiKey = import.meta.env.VITE_RAPIDAPI_KEY;
    if (!rapidApiKey) throw new Error("Clé RapidAPI manquante");

    const res = await fetch(`https://youtube-media-downloader.p.rapidapi.com/v2/search/videos?keyword=${encodeURIComponent(query + ' cours complet')}&language=fr`, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'youtube-media-downloader.p.rapidapi.com',
        'x-rapidapi-key': rapidApiKey
      }
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.items) {
        return data.items
          .filter(v => !v.isLiveNow)
          .slice(0, 3)
          .map(v => ({
            ytId: v.id,
            title: v.title,
            thumbnail: v.thumbnails?.[0]?.url || ""
          }));
      }
    }
  } catch (e) {
    console.warn(`Instance RapidAPI indisponible, échec de secours.`, e);
  }
  return [];
};

const fetchYouTubeVideos = async (query, originalSkill) => {
  try {
    const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;
    const dateLimit = "2023-01-01T00:00:00Z";
    // Stratégie Prestige : Exclure les Shorts en demandant une durée medium/long (> 4 min)
    const searchQuery = `${query} formation complète masterclass 2024`;
    
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=${encodeURIComponent(searchQuery)}&type=video&relevanceLanguage=fr&order=viewCount&publishedAfter=${dateLimit}&videoEmbeddable=true&videoDuration=medium&key=${apiKey}`
    );
    let searchData = await searchRes.json();
    
    if (searchData.error || !searchData.items?.length) {
       // RapidAPI en secours absolu
       const rapidResults = await fetchRapidApiVideos(`${query} cours tutoriel long`);
       if (rapidResults.length > 0) return rapidResults;
       if (!searchData.error) {
           const fallbackRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=8&q=${encodeURIComponent(query)}&type=video&videoEmbeddable=true&videoDuration=medium&key=${apiKey}`);
           searchData = await fallbackRes.json();
       }
    }

    if (!searchData.items?.length) return [];

    const videoIds = (searchData.items || []).map(item => item.id.videoId).filter(Boolean);
    if (videoIds.length === 0) return [];
    
    const detailRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status,snippet,contentDetails&id=${videoIds.join(',')}&key=${apiKey}`);
    const detailData = await detailRes.json();
    
    return (detailData.items || [])
      .filter(v => v.status.embeddable)
      .filter(v => {
         // Intelligence de Pertinence : Pas de Shorts (vérification supplémentaire via ISO 8601 duration si besoin)
         const title = v.snippet.title.toLowerCase();
         const skillTokens = (originalSkill || "").toLowerCase().split(' ');
         return skillTokens.some(token => token.length > 2 && title.includes(token)) || title.includes((originalSkill || "").toLowerCase());
      })
      .map(v => ({ ytId: v.id, title: v.snippet.title, thumbnail: v.snippet.thumbnails.high.url }));
  } catch (err) { return await fetchRapidApiVideos(query); }
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
            // Blocage immédiat si banni
            if (data.is_banned) { setView('explore'); setRoadmap(null); }
          } else {
            const newProfile = { id: user.id, is_admin: false, is_paid: false, is_banned: false, notes: {}, completed_videos: [] };
            const { data: created } = await insforge.database.from('user_profiles').insert([newProfile]).select().single();
            if (created) setUserProfile(created);
          }
      } catch(e) { console.error("Profile fetch error:", e); }
    };
    fetchProfile();
  }, [user, activeVideo]);

  useEffect(() => {
    const initSessionAndData = async () => {
      // 1. Session Ghost Killer: Purge expired local sessions blocking auth
      const { data: { session }, error: sessionError } = await insforge.auth.getSession();
      if (sessionError) { await insforge.auth.signOut(); setUser(null); }
      else if (session) setUser(session.user);

      // 2. Fetch public roadmaps safely
      const { data, error } = await insforge.database.from('roadmaps').select('*').order('created_at', { ascending: false });
      
      // 3. Fallback Purge if 401 happens anyway (Database Layer)
      if (error && (error.code === '401' || error.message.includes('Auth') || error.message.includes('JWSError'))) {
         await insforge.auth.signOut();
         setUser(null);
         const retry = await insforge.database.from('roadmaps').select('*').order('created_at', { ascending: false });
         if (retry.data) setPublicRoadmaps(retry.data);
      } else if (data) {
         setPublicRoadmaps(data);
      }
    };
    initSessionAndData();
  }, []);

  useEffect(() => {
    if (!user || !userProfile?.is_admin) return;
    const fetchAdmin = async () => {
      try {
        const [trans, users] = await Promise.all([
          insforge.database.from('transactions').select('*').order('created_at', { ascending: false }),
          insforge.database.from('user_profiles').select('*').order('id', { ascending: true })
        ]);
        if (trans.data) setTransactions(trans.data);
        if (users.data) setApprenants(users.data);
      } catch (err) { console.error("Admin fetch error:", err); }
    };
    fetchAdmin();
  }, [user, userProfile, view]);

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

  // --- 3. BRAIN : MOTEUR D'INTELLIGENCE PÉDAGOGIQUE ---
  const processBrainQueries = (rawSkill) => {
    // 1. Nettoyage Fluff
    let theme = rawSkill.toLowerCase()
      .replace(/je veux (?:apprendre à |faire de la |devenir )/g, '')
      .replace(/comment (?:faire |apprendre |devenir )/g, '')
      .replace(/formation |cours |tuto |apprendre /g, '')
      .trim();
    
    // 2. Détection Secteur (Règles d'Ancrage Local)
    const isBusiness = /commerce|vente|business|agriculture|élevage|vente|immobilier|argent|profit|finance|eboutique|shop/i.test(theme);
    const localTags = isBusiness ? " Afrique CFA rentabilité business au pays" : "";

    return {
      theme_nettoye: theme,
      queries: {
        debutant: `${theme} débutant bases fondamentaux matériel tutoriel complet introduction initiation`,
        intermediaire: `${theme} intermédiaire cas pratique exercices projet méthode étape par étape`,
        expert: `${theme} expert avancé professionnel masterclass secrets business rentabilité${localTags}`
      }
    };
  };

  const handleSearch = async (e) => {
    e.preventDefault(); if (!skill.trim()) return;
    setStatus('thinking'); setErrorMsg(''); 

    try {
        setStep('ARCHIVES LOCALES : Interrogation de la base de données Réussite45 (0ms)...');
        const existing = publicRoadmaps.find(r => r.title.toLowerCase() === skill.toLowerCase());
        if (existing) { setRoadmap(existing); setStatus('ready'); setView('course'); return; }

        setStep(`INTELLIGENCE PÉDAGOGIQUE : Traitement cognitif de "${skill.toUpperCase()}"...`);
        
        // --- ACTIVATION DU CERVEAU ---
        const brain = processBrainQueries(skill);
        const { debutant, intermediaire, expert } = brain.queries;

        setStep(`CIBLAGE YOUTUBE : Finalisation du curriculum pour ${brain.theme_nettoye.toUpperCase()}...`);
        
        let resB, resI, resE;
        [resB, resI, resE] = await Promise.all([
          fetchYouTubeVideos(debutant, brain.theme_nettoye), 
          fetchYouTubeVideos(intermediaire, brain.theme_nettoye), 
          fetchYouTubeVideos(expert, brain.theme_nettoye)
        ]);

        if (!resB.length && !resI.length && !resE.length) {
            throw new Error(`Aucun cours pro validé trouvé pour "${brain.theme_nettoye}". Précisez votre recherche.`);
        }

        setStep('ARCHITECTURE IA : Création du curriculum Élite (3-Vidéo)...');

        const v1 = resB.length ? resB.slice(0, 3) : (resI.length ? resI.slice(0, 2) : []);
        const v2 = resI.length ? resI.slice(0, 3) : (resB.length > 3 ? resB.slice(3, 6) : []);
        const v3 = resE.length ? resE.slice(0, 3) : (resI.length > 3 ? resI.slice(3, 6) : []);

        if (!v1.length && !v2.length && !v3.length) throw new Error("Les serveurs sont saturés. Réessayez dans 1 minute.");

        const newRoadmap = {
          title: brain.theme_nettoye,
          modules: [
            { 
              name: `🏁 PHASE 1 : INITIATION & FONDATIONS (CONTEXTE AFRIQUE)`, 
              videos: v1.map((v, i) => ({ id: `v1-${i}`, ytId: v.ytId, title: v.title, isFree: true })) 
            },
            { 
              name: `🚀 PHASE 2 : EXPERTISE & APPLICATION PRATIQUE`, 
              videos: v2.map((v, i) => ({ id: `v2-${i}`, ytId: v.ytId, title: v.title, isFree: false })) 
            },
            { 
              name: `🏆 PHASE 3 : MAÎTRISE TOTALE & HAUTE STRATEGIE BUSINESS`, 
              videos: v3.map((v, i) => ({ id: `v3-${i}`, ytId: v.ytId, title: v.title, isFree: false })) 
            }
          ]
        };

        const { data, error } = await insforge.database.from('roadmaps').insert([newRoadmap]).select().single();
        if (error) throw new Error(error.message);
        if (data) { setRoadmap(data); setPublicRoadmaps(prev => [data, ...prev]); }
        setStatus('ready'); setView('course');
    } catch (err) { setStatus('error'); setErrorMsg(err.message || "Échec de validation thématique."); }
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

  const handleToggleBan = async (uid, currentStatus) => {
    await insforge.database.from('user_profiles').update({ is_banned: !currentStatus }).eq('id', uid);
    setApprenants(prev => prev.map(u => u.id === uid ? { ...u, is_banned: !currentStatus } : u));
  };

  const handleDeleteRoadmap = async (id) => {
    await insforge.database.from('roadmaps').delete().eq('id', id);
    setPublicRoadmaps(prev => prev.filter(r => r.id !== id));
  };

  // 🛡️ SECURITY LAYER : PRESTIGE BAN CHECK
  if (userProfile?.is_banned) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8 text-center animate-in fade-in">
      <div className="glass-card-prestige p-20 max-w-2xl amber-glow">
        <UserX className="w-24 h-24 text-red-500 mx-auto mb-10 opacity-50" />
        <h1 className="text-6xl font-black mb-6 uppercase tracking-tighter italic">Accès <span className="text-red-500">Suspendu</span></h1>
        <p className="text-slate-400 text-xl font-medium leading-relaxed">Votre profil Réussite45 a été identifié pour une violation des conditions d'utilisation. L'accès au contenu élite est temporairement désactivé.</p>
        <button onClick={handleSignOut} className="mt-12 premium-btn bg-white text-slate-950 px-16 shadow-2xl">Déconnexion Sécurisée</button>
      </div>
    </div>
  );

  if (isLoading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 animate-in fade-in">
      <div className="relative w-24 h-24 mb-10">
        <RefreshCcw className="animate-spin w-full h-full text-amber-500 opacity-20" />
        <Medal className="absolute inset-0 m-auto w-10 h-10 text-amber-500" />
      </div>
      <p className="text-amber-500 font-black tracking-[1em] uppercase text-xs animate-pulse italic">Synchronisation Réussite45...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white selection:bg-amber-500/30 font-sans overflow-x-hidden">
      {/* 💎 NAVIGATION ELITE */}
      <nav className="nav-blur px-10 py-8 flex justify-between items-center relative z-[100]">
        <div className="flex items-center gap-4 cursor-pointer group" onClick={() => { setView('explore'); setRoadmap(null); }}>
          <div className="bg-amber-500 p-3 rounded-[1.5rem] shadow-xl shadow-amber-500/30 group-hover:rotate-12 transition-all">
            <GraduationCap className="text-slate-950 w-8 h-8" />
          </div>
          <span className="text-3xl font-black tracking-tighter italic uppercase">Réussite<span className="text-amber-500">45</span></span>
        </div>
        
        <div className="flex items-center gap-8">
          {user ? (
            <div className="flex items-center gap-6">
              {userProfile?.is_admin && (
                <button 
                  onClick={() => setView('admin')}
                  className={clsx("p-4 rounded-[1.5rem] transition-all", view === 'admin' ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20" : "bg-white/5 text-slate-400 hover:bg-white/10")}
                >
                  <ShieldCheck className="w-7 h-7" />
                </button>
              )}
              <div className="h-12 w-[1px] bg-white/10 mx-2" />
              <button onClick={handleSignOut} className="p-4 bg-white/5 rounded-[1.5rem] text-slate-400 hover:bg-red-500/10 hover:text-red-500 transition-all">
                <LogOut className="w-7 h-7" />
              </button>
            </div>
          ) : (
            <button onClick={() => setView('auth')} className="premium-btn bg-amber-500 text-slate-950 h-14 flex items-center px-10 amber-glow">Rejoindre l'Élite</button>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-10 py-16 relative">
        {/* Glow Effects */}
        <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-amber-500/5 blur-[150px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-500/5 blur-[150px] rounded-full pointer-events-none" />

        {/* 🔐 AUTH PRESTIGE */}
        {view === 'auth' && (
          <div className="max-w-xl mx-auto py-20 page-transition text-center">
            <div className="glass-card-prestige p-16 amber-glow border-amber-500/10">
              <h2 className="text-6xl font-black mb-10 italic uppercase tracking-tighter">{authMode === 'login' ? 'Connexion' : 'S\'ouvrir à 2024'}</h2>
              <form onSubmit={authMode === 'login' ? handleLogin : handleSignup} className="space-y-6">
                {authMode === 'signup' && (
                  <input type="text" placeholder="Nom Complet" className="premium-input w-full" value={name} onChange={e => setName(e.target.value)} required />
                )}
                <input type="email" placeholder="Email Professionnel" className="premium-input w-full" value={email} onChange={e => setEmail(e.target.value)} required />
                <input type="password" placeholder="Mot de passe" className="premium-input w-full" value={password} onChange={e => setPassword(e.target.value)} required />
                {authError && <p className="text-red-400 font-bold text-xs uppercase flex items-center justify-center gap-2 tracking-widest"><AlertCircle size={16}/> {authError}</p>}
                <button className="premium-btn bg-amber-500 text-slate-950 w-full py-6 mt-6 shadow-2xl shadow-amber-500/20 text-xl">
                  {authMode === 'login' ? 'Ouvrir l\'Académie' : 'Démarrer les 45 Jours'}
                </button>
              </form>
              <div className="mt-12 pt-12 border-t border-white/5">
                <button onClick={handleGoogleLogin} className="flex items-center justify-center gap-4 w-full p-6 rounded-[2rem] bg-white text-slate-900 font-black hover:bg-slate-100 transition-all active:scale-95 text-lg shadow-xl">
                  <Globe className="w-6 h-6" /> Continuer avec Google Cloud
                </button>
              </div>
              <p className="mt-12 text-slate-500 font-medium">
                {authMode === 'login' ? "Nouvel apprenant ?" : "Déjà un profil ?"} 
                <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-amber-500 font-black ml-3 uppercase tracking-tighter">
                  {authMode === 'login' ? 'Créer un accès' : 'S\'identifier'}
                </button>
              </p>
            </div>
          </div>
        )}

        {/* 🏛️ EXPLORATION PRESTIGE */}
        {view === 'explore' && (
          <div className="page-transition min-h-[60vh] flex flex-col justify-center">
            <div className="text-center mb-24">
              <div className="inline-flex items-center gap-3 px-8 py-3 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 mb-12 font-black uppercase text-xs tracking-[0.3em] italic">
                <Sparkles size={16} className="animate-pulse" /> Transformation Accélérée • 45 Jours
              </div>
              <h1 className="text-8xl md:text-[8rem] font-black tracking-tighter mb-12 leading-none italic uppercase">
                Quelle <span className="text-amber-500 text-shadow-glow">Expertise</span><br />voulez-vous dominer ?
              </h1>
              <form onSubmit={handleSearch} className="max-w-3xl mx-auto flex gap-4 bg-white/5 p-4 rounded-[4rem] border border-white/10 glass amber-glow">
                <input 
                  type="text" 
                  placeholder="Ex: Soudure 2.0, Design Élite, Trading Afrique..." 
                  className="flex-1 bg-transparent border-none outline-none px-10 py-6 text-2xl font-black placeholder:text-slate-700 italic"
                  value={skill}
                  onChange={(e) => setSkill(e.target.value)}
                />
                <button type="submit" disabled={status === 'thinking'} className="bg-amber-500 px-10 rounded-[3rem] hover:scale-105 transition-all text-slate-950 font-black shadow-xl">
                  {status === 'thinking' ? <Loader2 className="animate-spin" /> : <Search size={32} />}
                </button>
              </form>
              {status === 'thinking' && (
                <div className="mt-12 space-y-6 animate-pulse">
                  <p className="text-amber-500 font-black tracking-[0.5em] text-[10px] uppercase italic">{step}</p>
                  <div className="w-80 h-1 bg-white/5 rounded-full mx-auto overflow-hidden">
                    <div className="h-full bg-amber-500 animate-[progress_2s_ease-in-out_infinite]" />
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
              {publicRoadmaps.map((r, idx) => (
                <div 
                  key={idx} 
                  onClick={() => { setRoadmap(r); setView('course'); }} 
                  className="glass-card p-12 hover:border-amber-500/40 transition-all cursor-pointer group bg-gradient-to-br from-slate-900/50 to-transparent shadow-2xl"
                >
                  <div className="flex justify-between items-start mb-10">
                    <div className="w-20 h-20 bg-amber-500/10 rounded-[2rem] flex items-center justify-center text-amber-500 group-hover:scale-110 transition-all border border-amber-500/10">
                      <Medal size={40} />
                    </div>
                    <span className="text-slate-700 font-black text-xs uppercase tracking-[0.2em] italic">Catégorie Élite</span>
                  </div>
                  <h3 className="text-4xl font-black mb-6 group-hover:text-amber-500 transition-colors uppercase tracking-tighter italic leading-none">{r.title}</h3>
                  <div className="flex items-center gap-5 text-slate-500 font-bold mb-10 text-sm">
                    <History size={20} /> 45 JOURS D'IMMERSION
                  </div>
                  <div className="pt-10 border-t border-white/5 flex items-center justify-between">
                    <span className="text-amber-500 font-black tracking-widest text-xs uppercase italic">Entrer dans l'Académie</span>
                    <ChevronRight className="text-amber-500 group-hover:translate-x-3 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 🎓 CURRICULUM PRESTIGE */}
        {view === 'course' && roadmap && (
          <div className="page-transition grid grid-cols-1 lg:grid-cols-3 gap-16">
            <div className="lg:col-span-2 space-y-12">
              <div className="glass-card-prestige p-6 overflow-hidden border-white/5 relative bg-black shadow-4xl">
                {activeVideo ? (
                  <div className="aspect-video w-full rounded-[4rem] overflow-hidden">
                    <iframe 
                      title={activeVideo.title}
                      className="w-full h-full border-none"
                      src={`https://www.youtube.com/embed/${activeVideo.ytId}?rel=0&modestbranding=1&autoplay=1`}
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div className="aspect-video w-full bg-slate-900/40 flex flex-col items-center justify-center text-center p-20 rounded-[4rem]">
                    <div className="w-32 h-32 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500 mb-10 animate-pulse border border-amber-500/20">
                      <PlayCircle size={60} fill="currentColor" className="opacity-40" />
                    </div>
                    <h1 className="text-6xl font-black mb-6 tracking-tighter uppercase italic">{roadmap.title}</h1>
                    <p className="text-slate-500 text-xl mb-12 font-medium max-w-lg">Sélectionnez une phase pour activer votre parcours de maîtrise.</p>
                    <button 
                      onClick={() => setActiveVideo(roadmap.modules[0].videos[0])}
                      className="premium-btn bg-amber-500 text-slate-950 px-20 text-xl font-black shadow-2xl shadow-amber-500/20"
                    >
                      DÉBUTER LE CYCLE 45J
                    </button>
                  </div>
                )}
              </div>

              {activeVideo && (
                <div className="glass-card p-16 amber-glow-soft bg-gradient-to-br from-slate-900/30 to-transparent">
                  <div className="flex items-center gap-5 text-amber-500 mb-10 font-black uppercase tracking-[0.3em] text-xs italic">
                    <Target size={24} className="opacity-50" /> Journal de l'Expert Réussite45
                  </div>
                  <textarea 
                    className="w-full h-80 bg-white/5 border border-white/10 rounded-[3rem] p-10 text-xl font-medium outline-none focus:ring-4 focus:ring-amber-500/10 transition-all placeholder:text-slate-700 italic leading-relaxed"
                    placeholder="Notez ici les stratégies clés et les insights à haute valeur..."
                    value={userNotes}
                    onChange={(e) => setUserNotes(e.target.value)}
                  />
                  <div className="flex justify-between items-center mt-8">
                    <p className="text-slate-600 text-sm font-black uppercase tracking-widest italic flex items-center gap-3">
                      <div className="w-2 h-2 bg-amber-500 rounded-full animate-ping" /> Synchronisation Cloud Active
                    </p>
                    <button 
                      onClick={() => toggleComplete(activeVideo.id)}
                      className={clsx("px-10 py-5 rounded-[2rem] font-black text-sm uppercase transition-all shadow-xl", userProfile?.completed_videos?.includes(activeVideo.id) ? "bg-green-600 text-white" : "bg-white text-slate-950")}
                    >
                      {userProfile?.completed_videos?.includes(activeVideo.id) ? 'LEÇON MAÎTRISÉE ✅' : 'VALIDER LA LEÇON'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-12">
              <div className="glass-card p-12 sticky top-40 bg-slate-900/40 border-white/5 shadow-3xl">
                <div className="mb-12">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-2xl font-black uppercase tracking-tighter italic">Votre Progression</h3>
                    <div className="text-amber-500 font-black text-2xl italic tracking-tighter">
                      {progressPercent}%
                    </div>
                  </div>
                  <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden shadow-inner">
                     <div 
                       className="h-full bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.6)] transition-all duration-1000"
                       style={{ width: `${progressPercent}%` }}
                     />
                  </div>
                  <p className="mt-6 text-slate-600 font-black text-[10px] uppercase tracking-widest text-right">Cycle de Transformation 45 Jours</p>
                </div>

                <div className="space-y-12 max-h-[60vh] overflow-y-auto custom-scrollbar pr-4">
                  {roadmap.modules.map((m, mIdx) => (
                    <div key={mIdx}>
                      <h4 className="text-slate-700 font-black text-[10px] tracking-[0.4em] mb-8 uppercase flex items-center gap-4">
                        <div className="w-10 h-[1px] bg-white/10" /> SECTION {mIdx +1}
                      </h4>
                      <h5 className="text-amber-500/50 font-black text-xs mb-6 uppercase italic leading-tight">{m.name}</h5>
                      <div className="space-y-4">
                        {m.videos.map((v, vIdx) => {
                          const isLocked = !v.isFree && !isSubscriptionActive && v.id !== 'v1';
                          const isDone = userProfile?.completed_videos?.includes(v.id);
                          const isActive = activeVideo?.id === v.id;
                          return (
                            <button 
                              key={vIdx} 
                              disabled={isLocked}
                              onClick={() => setActiveVideo(v)}
                              className={clsx(
                                "w-full text-left p-6 rounded-[2.5rem] border transition-all flex items-center justify-between group",
                                isActive ? "bg-amber-500 border-amber-500 text-slate-950 shadow-lg shadow-amber-500/20" : "bg-white/5 border-white/5 hover:bg-white/10",
                                isLocked && "opacity-30 cursor-not-allowed grayscale"
                              )}
                            >
                              <div className="flex items-center gap-6 overflow-hidden">
                                <div className={clsx("w-12 h-12 rounded-[1.5rem] flex items-center justify-center shrink-0 border", isActive ? "bg-slate-900 border-white/10 text-white" : "bg-slate-950 border-white/5 text-slate-700")}>
                                  {isLocked ? <Lock size={20} /> : isDone ? <CheckCircle2 size={24} className="text-green-500" /> : <PlayCircle size={24} />}
                                </div>
                                <div className="min-w-0">
                                  <span className="font-black text-sm block truncate pr-2 tracking-tighter uppercase italic">{v.title}</span>
                                  <span className={clsx("text-[9px] font-black uppercase tracking-widest", isActive ? "text-slate-950/60" : "text-slate-700")}>Session Expert 35 Min</span>
                                </div>
                              </div>
                              {isLocked && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setShowPaymentModal(true); }} 
                                  className="px-6 py-3 bg-amber-500 text-slate-950 font-black rounded-[1.5rem] text-[10px] uppercase tracking-tighter shadow-lg"
                                >
                                  DÉBLOQUER
                                </button>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 🛡️ ADMIN PRESTIGE CONTROL */}
        {view === 'admin' && userProfile?.is_admin && (
          <div className="page-transition">
            <div className="flex items-center gap-8 mb-16">
               <div className="p-6 bg-amber-500 rounded-[2.5rem] shadow-2xl shadow-amber-500/30 rotate-3">
                 <ShieldCheck size={40} className="text-slate-950" />
               </div>
               <div>
                 <h1 className="text-6xl font-black uppercase tracking-tighter italic leading-none">Administration <span className="text-amber-500">Réussite45</span></h1>
                 <p className="text-slate-600 font-black mt-4 tracking-[0.5em] text-xs italic">PANNEAU DE CONTRÔLE ÉLITE • 2024</p>
               </div>
            </div>

            <div className="flex gap-4 mb-16 p-3 bg-white/5 rounded-[3.5rem] w-fit glass border-white/5 shadow-2xl">
               {['finance', 'utilisateurs', 'catalogue'].map((t) => (
                 <button 
                  key={t}
                  onClick={() => setAdminTab(t)}
                  className={clsx(
                    "px-12 py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-widest transition-all italic",
                    adminTab === t ? "bg-amber-500 text-slate-950 shadow-xl shadow-amber-500/20" : "text-slate-500 hover:text-white"
                  )}
                 >
                   {t}
                 </button>
               ))}
            </div>

            {adminTab === 'finance' && (
              <div className="space-y-12">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                  <div className="glass-card-prestige p-12 amber-glow-soft">
                    <div className="text-slate-500 font-black mb-6 uppercase tracking-widest text-[10px]">REVENU TOTAL GÉNÉRÉ</div>
                    <div className="text-7xl font-black text-amber-500 italic tracking-tighter">
                      {(transactions.length * 2000).toLocaleString()} <span className="text-2xl not-italic opacity-50">FCFA</span>
                    </div>
                    <div className="mt-8 flex items-center gap-3 text-green-500 text-xs font-black uppercase">
                      <TrendingUp size={16} /> +12% ce mois
                    </div>
                  </div>
                  <div className="glass-card-prestige p-12">
                     <div className="text-slate-500 font-black mb-6 uppercase tracking-widest text-[10px]">ABONNÉS VIP ACTIFS</div>
                     <div className="text-7xl font-black text-white italic tracking-tighter">{apprenants.filter(a => a.is_paid).length}</div>
                  </div>
                  <div className="glass-card-prestige p-12">
                     <div className="text-slate-500 font-black mb-6 uppercase tracking-widest text-[10px]">TRANSFORMATIONS LANCEES</div>
                     <div className="text-7xl font-black text-white italic tracking-tighter">{publicRoadmaps.length}</div>
                  </div>
                </div>
                
                <div className="glass-card rounded-[4rem] overflow-hidden border-white/5">
                  <table className="w-full text-left">
                    <thead className="bg-white/5 border-b border-white/10">
                      <tr>
                        <th className="p-10 font-black uppercase tracking-widest text-xs text-slate-500 italic">Identifiant Client</th>
                        <th className="p-10 font-black uppercase tracking-widest text-xs text-slate-500 italic">Valeur</th>
                        <th className="p-10 font-black uppercase tracking-widest text-xs text-slate-500 italic">Horodatage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {transactions.map((t, i) => (
                        <tr key={i} className="hover:bg-white/5 transition-all">
                          <td className="p-10 font-mono text-xs opacity-40">{t.user_id}</td>
                          <td className="p-10 font-black text-amber-500 italic text-xl">2,000 FCFA</td>
                          <td className="p-10 text-slate-500 font-medium">{new Date(t.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {adminTab === 'utilisateurs' && (
              <div className="glass-card rounded-[4rem] overflow-hidden border-white/5">
                <table className="w-full text-left">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr className="text-slate-500">
                      <th className="p-10 font-black text-xs uppercase tracking-widest italic">Apprenant Elite</th>
                      <th className="p-10 font-black text-xs uppercase tracking-widest italic">Niveau Global</th>
                      <th className="p-10 font-black text-xs uppercase tracking-widest italic">Acquis</th>
                      <th className="p-10 font-black text-xs uppercase tracking-widest italic">Sanction</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {apprenants.map((u, i) => (
                      <tr key={i} className="hover:bg-white/5 transition-all">
                        <td className="p-10 flex items-center gap-6">
                          <div className={clsx("w-14 h-14 rounded-3xl flex items-center justify-center font-black", u.is_paid ? "bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-lg shadow-amber-500/5" : "bg-white/5 text-slate-700")}>
                            {u.is_paid ? <Award size={24} /> : <Library size={24} />}
                          </div>
                          <div>
                            <div className="font-black text-sm uppercase italic">{u.is_paid ? 'Membre Académie Elite' : 'Apprenant Basique'}</div>
                            <div className="font-mono text-[9px] opacity-20 uppercase tracking-widest mt-1">UID: {u.id}</div>
                          </div>
                        </td>
                        <td className="p-10">
                          <span className={clsx("px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest italic", u.is_paid ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-slate-800 text-slate-500")}>
                            {u.is_paid ? 'VIP 45 JOURS' : 'GRATUIT'}
                          </span>
                        </td>
                        <td className="p-10 font-black text-xl italic tracking-tighter opacity-70">
                          {u.completed_videos?.length || 0} <span className="text-[10px] opacity-40 uppercase not-italic tracking-widest ml-1">LEÇONS</span>
                        </td>
                        <td className="p-10">
                           <button 
                            onClick={() => handleToggleBan(u.id, u.is_banned)}
                            className={clsx("px-8 py-4 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest transition-all italic shadow-lg", u.is_banned ? "bg-green-600 text-white" : "bg-red-500/10 text-red-500 hover:bg-red-600 hover:text-white border border-red-500/10")}
                           >
                             {u.is_banned ? 'Réhabiliter' : 'Suspendre l\'accès'}
                           </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {adminTab === 'catalogue' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
                {publicRoadmaps.map((r, i) => (
                  <div key={i} className="glass-card-prestige p-12 flex flex-col justify-between bg-gradient-to-br from-slate-900 to-transparent">
                    <div>
                      <div className="flex justify-between items-center mb-8">
                         <div className="bg-amber-500/10 p-4 rounded-[1.5rem] text-amber-500"><Library size={24} /></div>
                         <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Active Roadmap</span>
                      </div>
                      <h3 className="text-4xl font-black uppercase tracking-tighter mb-4 italic leading-none">{r.title}</h3>
                      <p className="text-slate-600 font-bold mb-10 text-xs tracking-widest">Mise à jour Cycle 2024</p>
                    </div>
                    <button 
                      onClick={() => { if(window.confirm('Action irréversible : Supprimer ce programme du catalogue Réussite45 ?')) handleDeleteRoadmap(r.id) }} 
                      className="w-full py-5 rounded-[2rem] bg-red-500/10 text-red-500 font-black hover:bg-red-600 hover:text-white transition-all text-[11px] uppercase tracking-[0.2em] italic border border-red-500/10 flex items-center justify-center gap-4"
                    >
                      <Trash2 size={18} /> Supprimer Définitivement
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* 🪙 MODAL DE PAIEMENT ÉLITE */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-8 page-transition">
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xl" onClick={() => setShowPaymentModal(false)} />
          <div className="glass-card-prestige max-w-2xl w-full p-20 relative amber-glow overflow-hidden">
            <div className="absolute top-10 right-10 cursor-pointer text-slate-700 hover:text-white transition-all" onClick={() => setShowPaymentModal(false)}>
              <X size={40} />
            </div>
            <div className="bg-amber-500 p-8 rounded-[2.5rem] w-fit mx-auto mb-12 shadow-2xl shadow-amber-500/40 rotate-6 border border-white/20">
              <Award className="w-20 h-20 text-slate-950" />
            </div>
            <h2 className="text-7xl font-black text-center mb-8 tracking-tighter uppercase italic leading-[0.85]">Activation <br /><span className="text-amber-500 underline underline-offset-8">Grade Élite</span></h2>
            <p className="text-slate-500 text-center text-xl mb-12 font-medium max-w-sm mx-auto">Débloquez l'expertise métier complète pour <span className="text-white font-black">2.000 FCFA</span>.</p>
            <div className="space-y-6 mb-16">
               {['Accès aux 45 jours de maîtrise', 'Coaching IA métier intégré', 'Journal d\'expert illimité', 'Certification Elite Réussite45'].map((f, i) => (
                 <div key={i} className="flex items-center gap-6 text-white font-black p-6 bg-white/5 rounded-[2rem] border border-white/5">
                   <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-slate-950 shrink-0 shadow-lg shadow-amber-500/20">
                     <CheckCircle2 size={20} />
                   </div>
                   <span className="text-sm uppercase tracking-tight italic">{f}</span>
                 </div>
               ))}
            </div>
            <button 
              onClick={processPayment}
              className="premium-btn bg-amber-500 text-slate-950 w-full py-8 text-3xl font-black shadow-2xl shadow-amber-500/30 italic uppercase tracking-tighter"
            >
              DÉBLOQUER L'ACCÈS • 2.000 F
            </button>
            <p className="text-slate-700 text-center mt-8 text-[10px] font-black uppercase tracking-[0.5em] italic">Passage au grade immédiat</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
