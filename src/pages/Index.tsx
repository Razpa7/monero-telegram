import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Volume2, VolumeX, Settings as SettingsIcon, X, Trophy, Clover, Plus, Minus, User as UserIcon, Wallet, Coins, Moon, Sun } from "lucide-react";
import confetti from "canvas-confetti";
import { playSpin as playSpinSfx, playReelStop, playWin, playClick, startMusic, stopMusic } from "@/lib/sounds";
import { initUser, setOffline, updateUserCredit, addPrize, getPrizes, Prize, User, validateUser, getUsers, getTopWinners, updateAvatar, getStats, playSpin, getConfig, CHIP_PRICE } from "@/lib/store";
import { CashierModal } from "@/components/CashierModal";
import { WithdrawModal } from "@/components/WithdrawModal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input as UIInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useWeb3 } from "@/contexts/Web3Context";

const SYMBOLS = ["🍇", "🍉", "🔔", "7️⃣", "📊", "🍋", "⭐"];
// Solo relleno cosmético durante la animación de giro. El resultado real viene del servidor.
const fillerSym = (i: number) => SYMBOLS[i % SYMBOLS.length];

// 21 paylines for 5x4 grid. Each entry = row index per reel (0=top, 1, 2, 3=bottom)
const PAYLINES: number[][] = [
  [1,1,1,1,1], // 1
  [2,2,2,2,2], // 2
  [0,0,0,0,0], // 3
  [3,3,3,3,3], // 4
  [0,1,2,3,2], // 5
  [3,2,1,0,1], // 6
  [1,0,1,2,3], // 7
  [2,3,2,1,0], // 8
  [0,0,1,1,2], // 9
  [3,3,2,2,1], // 10
  [1,1,2,2,3], // 11
  [2,2,1,1,0], // 12
  [0,1,0,1,0], // 13
  [3,2,3,2,3], // 14
  [1,2,1,2,1], // 15
  [2,1,2,1,2], // 16
  [0,1,1,1,0], // 17
  [3,2,2,2,3], // 18
  [1,0,0,0,1], // 19
  [2,3,3,3,2], // 20
  [0,3,0,3,0], // 21
];

const symbolMultiplier = (s: string, count: number) => {
  if (count < 3) return 0;
  // Ajustado para coincidir con la nueva tabla explicativa
  if (s === "7️⃣") return count === 5 ? 500 : count === 4 ? 200 : 100;
  if (s === "📊") return count === 5 ? 250 : count === 4 ? 100 : 50;
  if (s === "⭐") return count === 5 ? 150 : count === 4 ? 60 : 30;
  if (s === "🔔") return count === 5 ? 125 : count === 4 ? 50 : 25;
  // Frutas (Uva, Sandia, Limon)
  return count === 5 ? 75 : count === 4 ? 30 : 15;
};

type WinningLine = { lineIdx: number; cells: [number, number][]; amount: number };

const SYMBOL_IMAGES: Record<string, string> = {
  "🍇": "/slot_grapes_1778033029814.png",
  "🍉": "/slot_watermelon_1778033044325.png",
  "🍋": "/slot_lemon_1778033059475.png",
  "🔔": "/slot_bell_1778033074823.png",
  "⭐": "/slot_star_1778033094610.png",
  "7️⃣": "/slot_seven_1778033107783.png",
  "📊": "/slot_bar_1778033272509.png"
};

const Reel = ({
  symbols,
  spinning,
  highlights,
}: {
  symbols: string[];
  spinning: boolean;
  highlights: Set<number>;
}) => {
  const [hasSpun, setHasSpun] = useState(false);
  const isSpinning = symbols.length > 4;

  useEffect(() => {
    if (isSpinning) setHasSpun(true);
  }, [isSpinning]);

  const animationClass = isSpinning 
    ? "animate-spin-reel" 
    : (hasSpun ? "animate-bounce-stop" : "");

  return (
    <div className="reel flex-1 min-w-0 h-full relative">
      <div className={`flex flex-col h-full ${animationClass}`}>
        {symbols.map((s, i) => (
          <div
            key={i}
            className={`flex-1 min-h-0 flex items-center justify-center select-none transition-all p-2 bg-[#15151a] rounded-xl m-[2px] shadow-inner ${
              highlights.has(i) ? "bg-warning/20 ring-2 ring-warning animate-pulse" : ""
            }`}
          >
            <img src={SYMBOL_IMAGES[s]} alt={s} className="w-full h-full object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.8)]" />
          </div>
        ))}
      </div>
    </div>
  );
};

function InfoCard({ label, value, subValue, color, highlight }: { label: string; value: number; subValue?: string; color: string; highlight?: boolean }) {
  return (
    <div className={`bg-[#2a2a35] rounded-xl p-1.5 flex flex-col items-center justify-center border ${highlight ? 'border-[#ffaa00] shadow-[0_0_15px_rgba(255,170,0,0.3)]' : 'border-transparent'}`}>
      <span className="text-[8px] font-black text-white/50 uppercase tracking-tighter leading-none mb-1">{label}</span>
      <span className={`text-base font-black leading-none ${color}`}>
        {value.toLocaleString()}
      </span>
      {subValue && <span className={`text-[8px] font-bold mt-0.5 ${highlight ? 'text-[#ffaa00]' : 'text-success/80'}`}>{subValue}</span>}
    </div>
  );
}

function PayoutItem({ sym, x3, x4, x5, label }: any) {
  return (
    <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 space-y-3">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-[#15151a] rounded-xl flex items-center justify-center p-2 shadow-inner border border-white/5">
          <img src={SYMBOL_IMAGES[sym]} alt={sym} className="w-full h-full object-contain" />
        </div>
        <span className="text-lg font-black text-white tracking-widest uppercase italic">{label || sym}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-2 bg-white/5 rounded-xl border border-white/5">
          <p className="text-[10px] font-bold text-white/40 uppercase">3x</p>
          <p className="text-warning font-black text-lg">x{x3}</p>
        </div>
        <div className="text-center p-2 bg-white/5 rounded-xl border border-white/5">
          <p className="text-[10px] font-bold text-white/40 uppercase">4x</p>
          <p className="text-warning font-black text-lg">x{x4}</p>
        </div>
        <div className="text-center p-2 bg-white/5 rounded-xl border border-white/5 ring-1 ring-warning/30">
          <p className="text-[10px] font-bold text-warning uppercase">5x</p>
          <p className="text-warning font-black text-lg">x{x5}</p>
        </div>
      </div>
    </div>
  );
}

function PayoutsModal({ onClose, language }: { onClose: () => void, language: string }) {
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-[100]" onClick={onClose}>
      <div className="bg-[#121212] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6 sticky top-0 bg-[#121212] z-10 pb-2">
          <h2 className="text-xl font-black text-white tracking-widest uppercase">{language === 'es' ? 'TABLA DE PAGOS' : 'PAYTABLE'}</h2>
          <button onClick={onClose}><X className="text-white/60" /></button>
        </div>
        <div className="space-y-4">
          <PayoutItem sym="7️⃣" x3={100} x4={200} x5={500} />
          <PayoutItem sym="📊" x3={50} x4={100} x5={250} />
          <PayoutItem sym="⭐" x3={30} x4={60} x5={150} />
          <PayoutItem sym="🔔" x3={25} x4={50} x5={125} />
          <PayoutItem sym="🍇" x3={15} x4={30} x5={75} label={language === 'es' ? 'FRUTAS' : 'FRUITS'} />
          
          <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl mt-6">
            <p className="text-[11px] text-white/60 leading-relaxed italic">
              * {language === 'es' ? 'Los premios se multiplican por la' : 'Prizes are multiplied by the'} <span className="text-primary font-bold">{language === 'es' ? 'Apuesta por Línea' : 'Bet per Line'}</span>.
              <br />
              * {language === 'es' ? 'Los símbolos deben ser consecutivos desde la primera columna de la izquierda.' : 'Symbols must be consecutive starting from the leftmost column.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ sound, music, language, darkMode, onToggleSound, onToggleMusic, setLanguage, setDarkMode, onClose }: any) {
  const t = {
    es: {
      settings: "CONFIGURACIÓN",
      sound: "SONIDO",
      music: "MÚSICA",
      language: "IDIOMA",
      theme: "TEMA",
      dark: "OSCURO",
      light: "CLARO",
      logout: "CERRAR SESIÓN"
    },
    en: {
      settings: "SETTINGS",
      sound: "SOUND",
      music: "MUSIC",
      language: "LANGUAGE",
      theme: "THEME",
      dark: "DARK",
      light: "LIGHT",
      logout: "LOG OUT"
    }
  }[language as 'es' | 'en'] || {
    settings: "CONFIGURACIÓN",
    sound: "SONIDO",
    music: "MÚSICA",
    language: "IDIOMA",
    theme: "TEMA",
    dark: "OSCURO",
    light: "CLARO",
    logout: "CERRAR SESIÓN"
  };

  return (
    <div className={`fixed inset-0 ${darkMode ? 'bg-black/90' : 'bg-black/60'} backdrop-blur-md flex items-center justify-center p-4 z-[100] transition-colors duration-300`} onClick={onClose}>
      <div className={`${darkMode ? 'bg-[#121212] border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.7)]' : 'bg-white border-black/5 shadow-2xl'} border rounded-[32px] p-6 w-full max-w-sm transition-all duration-300`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-8">
          <div className="flex flex-col">
            <h2 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-black'} tracking-widest uppercase`}>{t.settings}</h2>
            <div className="h-1 w-8 bg-primary rounded-full mt-1"></div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-full ${darkMode ? 'bg-white/5 hover:bg-white/10 text-white/60' : 'bg-black/5 hover:bg-black/10 text-black/60'} transition-colors`}>
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={onToggleSound} className={`py-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all active:scale-95 ${darkMode ? 'bg-zinc-800/50 border border-white/5' : 'bg-zinc-50 border border-black/5 shadow-sm'}`}>
              <span className={`font-black text-[10px] uppercase tracking-widest ${darkMode ? 'text-white/40' : 'text-black/40'}`}>{t.sound}</span>
              {sound ? <Volume2 className="text-success w-5 h-5" /> : <VolumeX className="text-destructive w-5 h-5" />}
            </button>
            <button onClick={onToggleMusic} className={`py-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all active:scale-95 ${darkMode ? 'bg-zinc-800/50 border border-white/5' : 'bg-zinc-50 border border-black/5 shadow-sm'}`}>
              <span className={`font-black text-[10px] uppercase tracking-widest ${darkMode ? 'text-white/40' : 'text-black/40'}`}>{t.music}</span>
              <span className={`font-black text-sm ${music ? "text-success" : "text-destructive"}`}>{music ? "ON" : "OFF"}</span>
            </button>
          </div>

          <div className={`p-5 rounded-2xl space-y-5 ${darkMode ? 'bg-zinc-800/50 border border-white/5' : 'bg-zinc-50 border border-black/5'}`}>
            <div className="flex justify-between items-center">
              <span className={`font-black text-xs uppercase tracking-widest ${darkMode ? 'text-white/70' : 'text-black/70'}`}>{t.language}</span>
              <div className="flex gap-2 bg-black/10 p-1 rounded-xl">
                <button onClick={() => setLanguage('es')} className={`px-4 py-1.5 rounded-lg font-black text-[10px] transition-all ${language === 'es' ? 'bg-primary text-white shadow-lg' : 'text-white/30 hover:text-white/60'}`}>ESP</button>
                <button onClick={() => setLanguage('en')} className={`px-4 py-1.5 rounded-lg font-black text-[10px] transition-all ${language === 'en' ? 'bg-primary text-white shadow-lg' : 'text-white/30 hover:text-white/60'}`}>ENG</button>
              </div>
            </div>

            <div className="h-[1px] w-full bg-white/5"></div>

            <div className="flex justify-between items-center">
              <span className={`font-black text-xs uppercase tracking-widest ${darkMode ? 'text-white/70' : 'text-black/70'}`}>{t.theme}</span>
              <button 
                onClick={() => setDarkMode(!darkMode)} 
                className={`flex items-center gap-3 px-4 py-1.5 rounded-xl font-black text-[10px] transition-all ${darkMode ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'bg-warning/20 text-warning border border-warning/30'}`}
              >
                {darkMode ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                {darkMode ? t.dark : t.light}
              </button>
            </div>
          </div>

          <button 
            onClick={() => { sessionStorage.removeItem("banger_session"); sessionStorage.removeItem("banger_token"); window.location.href = "/"; }} 
            className="w-full py-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 font-black text-[11px] uppercase tracking-[0.2em] hover:bg-red-500 hover:text-white transition-all active:scale-[0.98]"
          >
            {t.logout}
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({ prizes, onClose }: { prizes: Prize[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-[100]" onClick={onClose}>
      <div className="bg-[#121212] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6 shrink-0">
          <h2 className="text-xl font-black text-white tracking-widest uppercase">HISTORIAL</h2>
          <button onClick={onClose}><X className="text-white/60" /></button>
        </div>
        <div className="overflow-y-auto space-y-3 pr-2 custom-scrollbar">
          {prizes.length === 0 ? (
            <p className="text-center text-white/40 py-10 italic">No hay premios registrados.</p>
          ) : (
            prizes.map(p => (
              <div key={p.id} className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 flex justify-between items-center">
                <div>
                  <p className="text-[10px] text-white/40 mb-1">{new Date(p.date).toLocaleString()}</p>
                  <p className={`text-xs font-black ${p.paid ? 'text-success' : 'text-warning'}`}>{p.paid ? 'PAGADO' : 'PENDIENTE'}</p>
                </div>
                <p className="text-xl font-black text-warning tracking-tighter">{p.amount}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function WinModal({ amount, autoSpin, language, onClose }: { amount: number; autoSpin?: boolean; language: string; onClose: () => void }) {
  const pesos = amount * CHIP_PRICE;

  useEffect(() => {
    if (autoSpin) {
      const timer = setTimeout(onClose, 2500);
      return () => clearTimeout(timer);
    }
  }, [autoSpin, onClose]);

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 z-[101] animate-in fade-in duration-500">
      <div className="text-center">
        <Trophy className="w-24 h-24 text-warning mx-auto mb-6 animate-bounce" />
        <h2 className="text-5xl font-black text-white mb-2 tracking-tighter italic">{language === 'es' ? '¡FELICIDADES!' : 'CONGRATULATIONS!'}</h2>
        <p className="text-xl font-black text-warning mb-4 tracking-widest">{language === 'es' ? 'HAS GANADO' : 'YOU WON'}</p>
        <div className="text-7xl font-black text-white mb-2 drop-shadow-[0_0_30px_rgba(255,255,255,0.4)]">
          {amount} <span className="text-3xl text-white/70">{language === 'es' ? 'FICHAS' : 'CHIPS'}</span>
        </div>
        <p className="text-2xl font-black text-success mb-10 tracking-wider">
          {language === 'es' ? 'EQUIVALENTE EN USDT' : 'USDT EQUIVALENT'} ${pesos.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
        </p>
        <Button onClick={onClose} className="bg-warning text-black font-black text-xl px-12 py-8 rounded-3xl hover:bg-warning/90 transform active:scale-95 transition-all">
          CONTINUAR
        </Button>
      </div>
    </div>
  );
}

function LeaderboardModal({ winners, onClose }: { winners: User[], onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      <Card className="w-full max-w-md bg-[#12121a] border-primary/20 shadow-[0_0_50px_rgba(249,115,22,0.15)] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent" />
        <button onClick={onClose} className="absolute right-4 top-4 text-white/40 hover:text-white z-10"><X className="w-6 h-6" /></button>
        
        <CardHeader className="text-center pt-8">
          <div className="relative inline-block mx-auto mb-4">
            <Trophy className="w-16 h-16 text-warning filter drop-shadow-[0_0_15px_rgba(251,191,36,0.6)]" />
            <div className="absolute -bottom-2 -right-2 bg-primary text-white text-[10px] font-black px-2 py-1 rounded-full border-2 border-[#12121a]">TOP 5</div>
          </div>
          <CardTitle className="text-3xl font-black text-white uppercase tracking-tighter italic">HALL OF FAME</CardTitle>
          <CardDescription className="text-primary/60 font-bold uppercase tracking-widest text-[10px]">Los Reyes del Monero Web 3</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 pb-8">
          {winners.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Trophy className="w-12 h-12 text-white/10" />
              <p className="text-white/30 font-black uppercase text-sm tracking-widest text-center">
                Aún no hay ganadores
              </p>
              <p className="text-white/20 text-[10px] font-bold uppercase tracking-wider text-center">
                ¡Sé el primero en conquistar el podio!
              </p>
            </div>
          ) : (
            winners.map((player, idx) => (
            <div key={idx} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${idx === 0 ? 'bg-primary/10 border-primary/30 scale-105' : 'bg-white/5 border-white/5'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${idx === 0 ? 'bg-warning text-black' : 'bg-white/10 text-white/40'}`}>
                {idx + 1}
              </div>
              <div className="w-10 h-10 rounded-full border border-white/10 overflow-hidden bg-white/5">
                <img src={player.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${player.name}`} alt={player.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-white font-black uppercase text-sm tracking-tight">{player.name}</p>
                <p className="text-[10px] text-white/40 font-bold uppercase">Jugador Pro</p>
              </div>
              <div className="text-right">
                <p className="text-success font-black leading-none">{player.total_won.toLocaleString()}</p>
                <p className="text-[9px] text-white/20 font-black uppercase">Fichas Ganadas</p>
              </div>
            </div>
          ))
          )}

          <Button onClick={onClose} className="w-full py-6 rounded-2xl bg-primary text-white hover:bg-primary/90 font-black uppercase tracking-widest mt-4 shadow-lg shadow-primary/20">
            VOLVER AL JUEGO
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

const Index = () => {
  const navigate = useNavigate();
  const userId = sessionStorage.getItem("banger_session");
  const [isValidUser, setIsValidUser] = useState<boolean | null>(null);
  const [credit, setCredit] = useState(0);
  const [total_won, setWinnings] = useState(0);
  const [userName, setUserName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [walletAddr, setWalletAddr] = useState("");
  const [totalBet, setTotalBet] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [topWinners, setTopWinners] = useState<User[]>([]);
  const [showAccount, setShowAccount] = useState(false);
  const [lines, setLines] = useState(1);
  const [betPerLine, setBetPerLine] = useState(1);
  const [win, setWin] = useState(0);
  const [sound, setSound] = useState(true);
  const [music, setMusic] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showPayouts, setShowPayouts] = useState(false);
  const [showCashier, setShowCashier] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [language, setLanguage] = useState<'es' | 'en'>('en');
  const [darkMode, setDarkMode] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [reels, setReels] = useState<string[][]>(
    Array.from({ length: 5 }, (_, r) => Array.from({ length: 4 }, (_, c) => fillerSym(r + c)))
  );
  const [winLines, setWinLines] = useState<WinningLine[]>([]);
  const [showWinModal, setShowWinModal] = useState(false);
  const [autoSpin, setAutoSpin] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const { address, connectWallet, disconnectWallet } = useWeb3();
  const soundRef = useRef(sound);
  soundRef.current = sound;

  // Inicialización de Telegram WebApp
  useEffect(() => {
    if ((window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      tg.ready();
      tg.expand();
      tg.enableClosingConfirmation();
      tg.setHeaderColor('#0a0a0e');
      tg.setBackgroundColor('#0a0a0e');
    }
  }, []);

    // Force logout if wallet disconnects (solo fuera de Telegram)
  useEffect(() => {
    const isTelegram = typeof window !== "undefined" && !!(window as any).Telegram?.WebApp?.initData;
    if (!isTelegram && !address && isValidUser) {
      console.log("Billetera desconectada. Cerrando sesión...");
      sessionStorage.removeItem("banger_session");
      sessionStorage.removeItem("banger_token");
      setOffline(userId || "");
      navigate("/");
    }
  }, [address, isValidUser, navigate, userId]);

  useEffect(() => {
    if (music && sound) startMusic();
    else stopMusic();
    return () => stopMusic();
  }, [music, sound]);



  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) { setIsValidUser(false); return; }
      const token = sessionStorage.getItem("banger_token") || undefined;
      const u = await initUser(userId, token);
      if (cancelled) return;
      if (u) {
        setCredit(u.credit);
        setWinnings(u.total_won || 0);
        setUserName(u.name);
        setAvatarUrl(u.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.name}`);
        setWalletAddr(u.wallet_address || "");
        setTotalBet(u.total_bet || 0);
        setIsValidUser(true);
      } else {
        setIsValidUser(false);
      }
    })();
    return () => {
      cancelled = true;
      if (userId) setOffline(userId);
    };
  }, [userId]);

  // Heartbeat: actualiza last_seen cada 15s y verifica la sesión
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(async () => {
      const token = sessionStorage.getItem("banger_token") || undefined;
      const u = await initUser(userId, token);
      if (!u) {
        setIsValidUser(false);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [userId]);

  const totalBalance = credit + total_won;
  const bet = lines * betPerLine;

  const t = {
    es: {
      player: "JUGADOR",
      lines: "LÍNEAS",
      bet: "APUESTA",
      spin: "GIRAR",
      auto: "AUTO",
      cashier: "CAJERO",
      account: "CUENTA",
      balance: "SALDO",
      won: "GANADO",
      total_won: "TOTAL GANADO",
      win_title: "¡FELICIDADES!",
      win_subtitle: "HAS GANADO",
      chips: "FICHAS",
      winnings: "GANANCIAS",
      equiv_pesos: "EQUIVALENTE EN PESOS",
      buy_chips: "COMPRAR FICHAS / RETIRAR USDT",
      available_withdraw: "DISPONIBLE PARA RETIRO",
      payouts: "tabla de pagos",
      stop_auto: "DETENER AUTO",
      auto_spin: "AUTO GIRAR",
      max: "Máx",
      min: "Mín",
      access_denied: "Acceso Denegado",
      session_expired: "Tu sesión ha expirado o es inválida.",
      go_home: "Ir al Inicio"
    },
    en: {
      player: "PLAYER",
      lines: "LINES",
      bet: "BET",
      spin: "SPIN",
      auto: "AUTO",
      cashier: "CASHIER",
      account: "ACCOUNT",
      balance: "BALANCE",
      won: "WON",
      total_won: "TOTAL WON",
      win_title: "CONGRATULATIONS!",
      win_subtitle: "YOU WON",
      chips: "CHIPS",
      winnings: "WINNINGS",
      equiv_pesos: "PESOS EQUIVALENT",
      buy_chips: "BUY CHIPS / WITHDRAW USDT",
      available_withdraw: "AVAILABLE FOR WITHDRAW",
      payouts: "payout table",
      stop_auto: "STOP AUTO",
      auto_spin: "AUTO SPIN",
      max: "Max",
      min: "Min",
      access_denied: "Access Denied",
      session_expired: "Your session has expired or is invalid.",
      go_home: "Go Home"
    }
  }[language];

  const evaluateWins = (grid: string[][]): WinningLine[] => {
    const wins: WinningLine[] = [];
    for (let li = 0; li < lines; li++) {
      const path = PAYLINES[li];
      if (!path) continue;
      const first = grid[0][path[0]];
      let count = 1;
      for (let r = 1; r < 5; r++) {
        if (grid[r][path[r]] === first) count++;
        else break;
      }
      const mult = symbolMultiplier(first, count);
      if (mult > 0) {
        const cells: [number, number][] = [];
        for (let r = 0; r < count; r++) cells.push([r, path[r]]);
        wins.push({ lineIdx: li, cells, amount: mult * betPerLine });
      }
    }
    return wins;
  };

  const fireConfetti = () => {
    confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 } });
    setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 70, origin: { x: 0 } }), 200);
    setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 70, origin: { x: 1 } }), 400);
  };

  const spin = async () => {
    if (spinning || totalBalance < bet || !userId) return;

    // SERVER-AUTHORITATIVE: el servidor genera RNG, evalúa premios y
    // descuenta apuesta atómicamente. El cliente solo anima el resultado.
    const token = sessionStorage.getItem("banger_token") || undefined;

    if (sound) playSpinSfx();
    setWin(0);
    setWinLines([]);
    setSpinning(true);

    if ((window as any).Telegram?.WebApp?.HapticFeedback) {
      (window as any).Telegram.WebApp.HapticFeedback.impactOccurred('medium');
    }

    const result = await playSpin(userId, bet, token);

    if (!result.success) {
      setSpinning(false);
      toast.error(result.error || "Error en la tirada");
      return;
    }

    // Sincronizar saldo con el servidor (fuente de verdad)
    setCredit(result.credit);
    setWinnings(result.winnings);

    const finalGrid = result.grid;
    const wins = result.wins;

    setReels(Array.from({ length: 5 }, (_, r) => Array.from({ length: 12 }, (_, c) => fillerSym(r + c))));

    const stops = [800, 1100, 1400, 1700, 2000];
    stops.forEach((t, idx) => {
      setTimeout(() => {
        if (sound) playReelStop();
        setReels(prev => {
          const next = [...prev];
          next[idx] = finalGrid[idx];
          return next;
        });
        
        if ((window as any).Telegram?.WebApp?.HapticFeedback) {
          (window as any).Telegram.WebApp.HapticFeedback.impactOccurred('light');
        }

        if (idx === 4) {
          setSpinning(false);
          if (wins.length > 0 && result.win > 0) {
            setWin(result.win);
            // 'winnings' ya viene actualizado del servidor; no sumamos en cliente
            setWinLines(wins);
            setShowWinModal(true);
            if (sound) playWin();
            fireConfetti();
            
            if ((window as any).Telegram?.WebApp?.HapticFeedback) {
              (window as any).Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
          }
        }
      }, t);
    });
  };

  const highlightsByReel: Set<number>[] = Array.from({ length: 5 }, () => new Set<number>());
  winLines.forEach(w => w.cells.forEach(([r, row]) => highlightsByReel[r].add(row)));

  useEffect(() => {
    let timeoutId: any;
    if (autoSpin && !spinning && !showWinModal) {
      if (credit >= bet) {
        timeoutId = setTimeout(() => {
          spin();
        }, 1000);
      } else {
        setAutoSpin(false);
        toast.error("Saldo insuficiente para auto-girar");
      }
    }
    return () => clearTimeout(timeoutId);
  }, [autoSpin, spinning, showWinModal, credit, bet]);

  if (isValidUser === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#0a0f1e]">
        <Card className="max-w-md w-full border-destructive/50 bg-destructive/5">
          <CardHeader className="text-center">
            <X className="w-16 h-16 text-destructive mx-auto mb-4" />
            <CardTitle className="text-2xl font-black uppercase text-white">Acceso Denegado</CardTitle>
            <CardDescription className="text-white/60">
              Tu sesión ha expirado, tu cuenta no es válida, o iniciaste sesión en otro dispositivo.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
             <Button onClick={() => { sessionStorage.removeItem("banger_session"); sessionStorage.removeItem("banger_token"); navigate("/"); }} className="bg-primary hover:bg-primary/90">
               Ir al Inicio
             </Button>
          </CardContent>
        </Card>
      </div>
    );
  }



  if (isValidUser === null) return null;

  return (
    <main className={`min-h-screen ${darkMode ? 'bg-[#0a0f1e]' : 'bg-gray-100'} flex flex-col items-center justify-center p-4 overflow-hidden safe-area-inset font-sans transition-colors duration-500`}>
      <style>{`
        .safe-area-inset {
          padding-top: env(safe-area-inset-top);
          padding-bottom: env(safe-area-inset-bottom);
        }
        .animate-spin-reel {
          animation: spinReel 0.1s linear infinite;
        }
        @keyframes spinReel {
          0% { transform: translateY(-50%); }
          100% { transform: translateY(0); }
        }
        .animate-bounce-stop {
          animation: bounceStop 0.3s ease-out;
        }
        @keyframes bounceStop {
          0% { transform: translateY(-10px); }
          50% { transform: translateY(5px); }
          100% { transform: translateY(0); }
        }
        .girar-glow {
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.8), 0 0 30px rgba(59, 130, 246, 0.4);
          position: relative;
        }
        .girar-glow::before {
          content: '';
          position: absolute;
          inset: -4px;
          border-radius: inherit;
          border: 2px solid rgba(59, 130, 246, 0.6);
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.8);
          pointer-events: none;
        }
        .girar-glow::after {
          content: '';
          position: absolute;
          inset: -8px;
          border-radius: inherit;
          border: 1px solid rgba(59, 130, 246, 0.3);
          pointer-events: none;
        }
        .girar-active {
          transform: scale(0.95) translateY(2px);
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.4);
        }
      `}</style>

      {/* HEADER REORGANIZADO SEGÚN DISEÑO */}
      <div className="w-full max-w-[500px] flex flex-col mb-4 px-2 space-y-2">
        
        {/* FILA SUPERIOR: SONIDO | TÍTULO | BILLETERA */}
        <div className="w-full flex justify-between items-start">
          {/* Botón de Sonido (Capsula Vertical) */}
          <button 
            onClick={() => { setSound(!sound); playClick(); }} 
            className="w-10 h-14 rounded-full bg-zinc-900/90 flex flex-col items-center justify-center border border-white/10 shadow-lg hover:bg-zinc-800 transition-all active:scale-95"
          >
            {sound ? <Volume2 className="w-5 h-5 text-success" /> : <VolumeX className="w-5 h-5 text-destructive" />}
          </button>

          {/* Bloque Central de Título */}
          <div className="text-center flex-1 mt-1">
            <h1 className="text-3xl sm:text-4xl font-black tracking-widest text-transparent whitespace-nowrap uppercase italic leading-none" 
                style={{ WebkitTextStroke: '1px #f97316', filter: 'drop-shadow(0 0 8px rgba(249,115,22,0.8))' }}>
              Monero Web 3
            </h1>
            <p className="text-[11px] font-black text-pink-500 uppercase tracking-widest mt-2 mb-1">
              {t.player}: {userName}
            </p>
            {/* Separador de puntos naranjas */}
            <div className="flex items-center justify-center gap-2 opacity-80">
               <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-warning"></div>
               <div className="w-2 h-2 rounded-full bg-warning shadow-[0_0_8px_rgba(255,165,0,1)]"></div>
               <div className="w-1.5 h-1.5 rounded-full bg-warning shadow-[0_0_8px_rgba(255,165,0,1)] opacity-70"></div>
               <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-warning"></div>
            </div>
          </div>

          {/* Badge de Billetera */}
          <div className="pt-1">
            {address ? (
              <div className="h-10 px-3 rounded-xl bg-success/10 flex items-center justify-center border border-success/40 text-[10px] font-black text-success tracking-tighter">
                {address.slice(0, 4)}...{address.slice(-4)}
              </div>
            ) : (
              <button onClick={() => connectWallet()} className="h-10 px-3 rounded-xl bg-warning/20 border border-warning/50 text-warning text-[10px] font-black animate-pulse">
                CONECTAR
              </button>
            )}
          </div>
        </div>

        {/* FILA INFERIOR: TROFEO | LÍNEAS | AJUSTES/USER */}
        <div className="w-full flex justify-between items-end">
          {/* Botón de Ranking (Capsula Vertical) */}
          <button 
            onClick={async () => { 
              const top = await getTopWinners();
              setTopWinners(top);
              setShowLeaderboard(true);
              if (sound) playClick(); 
            }}
            className="w-10 h-14 rounded-full bg-zinc-900/90 flex items-center justify-center border border-white/10 shadow-lg hover:bg-zinc-800 transition-all active:scale-95 group"
          >
            <Trophy className="w-5 h-5 text-warning group-hover:scale-110 transition-transform" />
          </button>

          {/* Selector de Idioma — junto al podio */}
          <div className="flex gap-1 bg-zinc-900/90 p-1 rounded-full border border-white/10 shadow-lg mb-0.5">
            <button
              onClick={() => { setLanguage('es'); if (sound) playClick(); }}
              className={`px-2.5 py-1 rounded-full font-black text-[9px] transition-all ${
                language === 'es'
                  ? 'bg-primary text-white shadow'
                  : 'text-white/30 hover:text-white/60'
              }`}
            >
              ES
            </button>
            <button
              onClick={() => { setLanguage('en'); if (sound) playClick(); }}
              className={`px-2.5 py-1 rounded-full font-black text-[9px] transition-all ${
                language === 'en'
                  ? 'bg-primary text-white shadow'
                  : 'text-white/30 hover:text-white/60'
              }`}
            >
              EN
            </button>
          </div>

          {/* Indicador de Líneas (Central) */}
          <div className="text-center mb-1">
            <div className="text-pink-500 font-black text-lg leading-none">{lines}</div>
            <div className="text-pink-500 font-black text-[10px] tracking-widest uppercase leading-none">{t.lines}</div>
          </div>

          {/* Botones de Acción (Cajas) */}
          <div className="flex gap-2 mb-1">
            <button 
              onClick={() => { setShowSettings(true); if (sound) playClick(); }} 
              className="w-11 h-11 rounded-xl bg-zinc-800/80 flex items-center justify-center border border-white/10 shadow-lg hover:bg-zinc-700 transition-all"
            >
              <SettingsIcon className="w-5 h-5 text-white/80" />
            </button>
            <button 
              onClick={() => { setShowAccount(true); if (sound) playClick(); }} 
              className="w-11 h-11 rounded-xl bg-zinc-800/80 flex items-center justify-center border border-white/10 shadow-lg hover:bg-zinc-700 transition-all"
            >
              <UserIcon className="w-5 h-5 text-white/80" />
            </button>
          </div>
        </div>
      </div>


      {/* SLOT GRID 5x4 */}
      <div className="w-full max-w-[500px] aspect-[5/4] bg-[#1a1a24] rounded-3xl p-1.5 border border-white/5 shadow-2xl flex gap-0.5 relative overflow-hidden">
        {reels.map((r, i) => (
          <Reel key={i} symbols={r} spinning={spinning} highlights={highlightsByReel[i]} />
        ))}
        
        {/* Winning lines overlay */}
        {winLines.length > 0 && !spinning && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
            {winLines.map((wl, i) => (
              <g key={i} className="animate-pulse">
                {wl.cells.slice(0, -1).map((cell, idx) => {
                  const nextCell = wl.cells[idx + 1];
                  const getX = (c: number) => `${(c * 20) + 10}%`;
                  const getY = (r: number) => `${(r * 25) + 12.5}%`;
                  return (
                    <line
                      key={idx}
                      x1={getX(cell[0])}
                      y1={getY(cell[1])}
                      x2={getX(nextCell[0])}
                      y2={getY(nextCell[1])}
                      stroke="#ff0000"
                      strokeWidth="4"
                      strokeLinecap="round"
                      filter="drop-shadow(0 0 5px #ff0000)"
                    />
                  );
                })}
              </g>
            ))}
          </svg>
        )}
      </div>

      {/* COMPRAR FICHAS BUTTON */}
      <div className="w-full max-w-[500px] mt-4 px-1">
        <button 
          onClick={() => { setShowCashier(true); if (sound) playClick(); }}
          className="w-full py-4 rounded-[20px] bg-gradient-to-r from-success to-emerald-600 text-white font-black uppercase shadow-[0_0_20px_rgba(34,197,94,0.3)] active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 border border-white/10"
        >
          <div className="flex items-center gap-3">
            <Coins className="w-6 h-6" />
            <span className="text-xl">{t.buy_chips}</span>
          </div>
          <span className="text-[10px] opacity-80 tracking-widest bg-black/20 px-3 py-0.5 rounded-full">
            {t.available_withdraw}: {(totalBalance * 0.10).toFixed(2)} USDT
          </span>
        </button>
      </div>

      {/* INFO CARDS */}
      <div className="w-full max-w-[500px] grid grid-cols-5 gap-1.5 mt-6 px-1">
        <InfoCard label={t.chips} value={Math.floor(credit)} subValue={`$ ${(credit * 0.10).toFixed(2)} USDT`} color="text-blue-400" />
        <InfoCard label={t.winnings} value={Math.floor(total_won)} subValue={`${(total_won * 0.10).toFixed(2)} USDT`} color="text-success" highlight={true} />
        <button onClick={() => { setLines(l => l >= 21 ? 1 : l + 1); if (sound) playClick(); }} className="active:scale-95 transition-transform relative">
          <InfoCard label={t.lines} value={lines} color="text-success" subValue={language === 'en' ? 'TAP' : 'PULSAR'} />
        </button>
        <InfoCard label={t.bet} value={Math.floor(bet)} subValue={`$ ${(bet * 0.10).toFixed(2)} USDT`} color="text-white/60" />
        <InfoCard label="TOTAL" value={Math.floor(totalBalance)} subValue={`$ ${(totalBalance * 0.10).toFixed(2)} USDT`} color="text-warning" />
      </div>

      {/* BOTTOM BUTTONS */}
      <div className="w-full max-w-[500px] mt-6 px-2 space-y-4">
        <div className="flex justify-between items-center gap-2">
          <button 
            onClick={() => { setShowPayouts(true); if (sound) playClick(); }}
            className="flex-1 py-4 rounded-[20px] bg-[#d32f2f] text-white font-bold text-[13px] shadow-lg active:translate-y-0.5 transition-all uppercase"
          >
            {t.payouts}
          </button>
          <button 
            onClick={() => { setAutoSpin(!autoSpin); if (sound) playClick(); }}
            className={`flex-1 py-4 rounded-[20px] font-bold text-[13px] shadow-lg active:translate-y-0.5 transition-all ${autoSpin ? 'bg-warning text-black shadow-[0_0_15px_rgba(255,170,0,0.5)]' : 'bg-zinc-800 text-white border border-white/5'}`}
          >
            {autoSpin ? t.stop_auto : t.auto_spin}
          </button>
          <div className="flex gap-2">
            <button disabled={autoSpin} onClick={() => { setBetPerLine(b => Math.max(1, b - 1)); if (sound) playClick(); }} className={`w-12 h-12 rounded-2xl text-white font-black text-2xl flex items-center justify-center border-b-4 transition-all ${autoSpin ? 'bg-zinc-800 opacity-50 border-zinc-900 cursor-not-allowed' : 'bg-zinc-700 border-zinc-900 active:translate-y-0.5 active:border-b-0'}`}>
              <Minus className="w-6 h-6" />
            </button>
            <button disabled={autoSpin} onClick={() => { setBetPerLine(b => Math.min(100, b + 1)); if (sound) playClick(); }} className={`w-12 h-12 rounded-2xl text-white font-black text-2xl flex items-center justify-center border-b-4 transition-all ${autoSpin ? 'bg-zinc-800 opacity-50 border-zinc-900 cursor-not-allowed' : 'bg-zinc-700 border-zinc-900 active:translate-y-0.5 active:border-b-0'}`}>
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_1fr_1.5fr] gap-3 items-center mt-2">
          <button 
            disabled={autoSpin}
            onClick={() => { setBetPerLine(10); if (sound) playClick(); }}
            className={`py-4 rounded-3xl text-white font-black text-sm transition-all border border-white/5 ${autoSpin ? 'bg-[#1c1c21] opacity-50 cursor-not-allowed' : 'bg-[#1c1c21] active:translate-y-0.5'}`}
          >
            {t.max}
          </button>
          <button 
            disabled={autoSpin}
            onClick={() => { setBetPerLine(1); if (sound) playClick(); }}
            className={`py-4 rounded-3xl text-white font-black text-sm transition-all border border-white/5 ${autoSpin ? 'bg-[#1c1c21] opacity-50 cursor-not-allowed' : 'bg-[#1c1c21] active:translate-y-0.5'}`}
          >
            {t.min}
          </button>
          <button 
            onClick={autoSpin ? () => setAutoSpin(false) : spin}
            disabled={(!autoSpin && spinning) || totalBalance < bet}
            className={`py-5 rounded-3xl bg-gradient-to-b from-[#4da8fb] to-[#1d5ce5] text-white font-black text-2xl uppercase transition-all disabled:opacity-50 girar-glow ${spinning ? 'girar-active' : 'active:scale-95'}`}
          >
            {autoSpin ? `${t.auto}...` : t.spin}
          </button>
        </div>
      </div>

      {showSettings && (
        <SettingsModal 
          sound={sound} 
          music={music} 
          language={language}
          darkMode={darkMode}
          onToggleSound={() => setSound(!sound)} 
          onToggleMusic={() => setMusic(!music)} 
          setLanguage={setLanguage}
          setDarkMode={setDarkMode}
          onClose={() => setShowSettings(false)} 
        />
      )}

      {showPayouts && <PayoutsModal onClose={() => setShowPayouts(false)} language={language} />}
      {showWinModal && win > 0 && <WinModal amount={win} autoSpin={autoSpin} language={language} onClose={() => setShowWinModal(false)} />}
      {showAccount && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
          <Card className="w-full max-w-md bg-[#1a1a24] border-white/10 shadow-2xl relative">
            <button onClick={() => setShowAccount(false)} className="absolute right-4 top-4 text-white/40 hover:text-white"><X className="w-6 h-6" /></button>
            <CardHeader className="text-center">
              <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2 border-2 border-primary/50 overflow-hidden shadow-[0_0_20px_rgba(249,115,22,0.3)]">
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              </div>
              <CardTitle className="text-2xl font-black text-white uppercase tracking-tighter">Mi Cuenta</CardTitle>
              <CardDescription className="text-white/60">Información del jugador</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                  <span className="text-white/40 font-bold uppercase text-[10px]">Usuario</span>
                  <span className="text-white font-black text-sm">{userName}</span>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                  <span className="text-white/40 font-bold uppercase text-[10px]">Billetera</span>
                  <span className="text-primary font-mono text-[11px]">
                    {walletAddr ? `${walletAddr.slice(0, 6)}...${walletAddr.slice(-4)}` : "No vinculada"}
                  </span>
                </div>
              </div>

              {/* AVATAR SELECTOR */}
              <div className="space-y-2">
                <p className="text-[9px] text-white/40 font-black uppercase text-center tracking-widest">Cambiar Avatar</p>
                <div className="flex justify-center gap-2">
                  {['Big Smile', 'Felix', 'Jasper', 'Milo', 'Lucky'].map(seed => (
                    <button 
                      key={seed}
                      onClick={async () => {
                        const newUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
                        const ok = await updateAvatar(userId || "", newUrl);
                        if (ok) setAvatarUrl(newUrl);
                      }}
                      className={`w-10 h-10 rounded-lg border-2 transition-all ${avatarUrl.includes(seed) ? 'border-primary bg-primary/20' : 'border-white/10 bg-white/5 hover:border-white/30'}`}
                    >
                      <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`} alt={seed} className="w-full h-full" />
                    </button>
                  ))}
                </div>
              </div>

              {/* STATS GRID */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-primary/5 border border-primary/10 rounded-xl text-center">
                  <p className="text-[9px] text-white/40 font-bold uppercase mb-1">Volumen Apostado</p>
                  <p className="text-white font-black">{totalBet.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-success/5 border border-success/10 rounded-xl text-center">
                  <p className="text-[9px] text-white/40 font-bold uppercase mb-1">Total Ganado</p>
                  <p className="text-success font-black">{total_won.toLocaleString()}</p>
                </div>
              </div>

              {/* FAIR PLAY BADGE */}
              <div className="flex items-center justify-center gap-2 py-2 border-y border-white/5">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-[10px] font-black text-success uppercase tracking-widest">RTP Verificado • Juego Justo</span>
              </div>

              {/* SECURITY TIP */}
              <div className="p-4 bg-warning/5 border border-warning/10 rounded-xl">
                <p className="text-[10px] text-warning/80 leading-relaxed italic text-center">
                  "Tu seguridad es primero: Nunca compartas tu frase semilla. Monero Web 3 nunca te pedirá tus claves privadas."
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <Button onClick={() => setShowAccount(false)} className="w-full py-5 rounded-xl bg-white text-black hover:bg-white/90 font-black uppercase tracking-widest text-xs">
                  CERRAR VENTANA
                </Button>
                <div className="flex gap-2">
                  <Button onClick={() => { setShowAccount(false); setShowCashier(true); }} className="flex-1 py-5 rounded-xl bg-success text-white hover:bg-success/90 font-black uppercase tracking-widest text-xs">
                    DEPOSITAR
                  </Button>
                  <Button onClick={() => { setShowAccount(false); setShowCashier(true); }} className="flex-1 py-5 rounded-xl bg-destructive text-white hover:bg-destructive/90 font-black uppercase tracking-widest text-xs">
                    RETIRAR
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showCashier && userId && (
        <CashierModal 
          userId={userId} 
          currentCredit={totalBalance}
          language={language}
          onClose={() => setShowCashier(false)} 
          onSuccess={(chips) => {
            setCredit(c => c + chips);
          }} 
          onWithdrawSuccess={(chips) => {
            // Subtract from credit then winnings
            if (credit >= chips) {
              setCredit(c => c - chips);
            } else {
              const remaining = chips - credit;
              setCredit(0);
              setWinnings(w => Math.max(0, w - remaining));
            }
          }}
        />
      )}

      {showWithdraw && userId && (
        <WithdrawModal 
          userId={userId} 
          currentCredit={totalBalance}
          language={language}
          onClose={() => setShowWithdraw(false)} 
          onSuccess={(chips) => {
            // Subtract from credit then winnings
            if (credit >= chips) {
              setCredit(c => c - chips);
            } else {
              const remaining = chips - credit;
              setCredit(0);
              setWinnings(w => Math.max(0, w - remaining));
            }
          }} 
        />
      )}

      {/* FOOTER */}
      <footer className="mt-8 mb-4 text-center">
        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Monero Slot Web 3 Premium Edition © 2024</p>
      </footer>
      {showLeaderboard && (
        <LeaderboardModal 
          winners={topWinners} 
          onClose={() => setShowLeaderboard(false)} 
        />
      )}
    </main>
  );
};




export default Index;
