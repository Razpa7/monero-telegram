"use client"

import { useState, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { loginWithWallet, registerWalletUser } from "@/lib/store"
import { toast } from "sonner"
import { Volume2, VolumeX, Wallet, Smartphone, Sparkles, Shield, Trophy } from "lucide-react"
import { useWeb3 } from "@/contexts/Web3Context"
import { playClick } from "@/lib/sounds"

export default function Login() {
  const [step, setStep] = useState<"splash" | "video" | "login">("splash")
  const [loading, setLoading] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [newWalletName, setNewWalletName] = useState("")
  // Admin secret sequence: left clover x2 then right clover x3
  const [leftTaps, setLeftTaps] = useState(0)
  const [rightTaps, setRightTaps] = useState(0)

  const [isTelegram, setIsTelegram] = useState(false)
  const [tgLoading, setTgLoading] = useState(false)

  const { address, connectWallet, disconnectWallet, isOnMobile } = useWeb3()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)

  // Si ya hay sesión activa, ir directo al juego (comprobando ambos storages para resiliencia)
  useEffect(() => {
    const session = sessionStorage.getItem("banger_session") || localStorage.getItem("banger_session")
    if (session) {
      sessionStorage.setItem("banger_session", session)
      localStorage.setItem("banger_session", session)
      navigate("/play")
    }
  }, [navigate])

  // Detección automática del entorno de Telegram y Login Silencioso / Auto-Registro
  useEffect(() => {
    const handleTelegramLogin = async () => {
      if (typeof window !== "undefined" && (window as any).Telegram?.WebApp?.initData) {
        const tg = (window as any).Telegram.WebApp
        
        try {
          tg.ready()
          tg.expand()
          
          const tgUser = tg.initDataUnsafe?.user
          if (tgUser) {
            setIsTelegram(true)
            setTgLoading(true)
            
            const tgWallet = `tg_${tgUser.id}`
            const tgName = tgUser.username 
              ? `@${tgUser.username}` 
              : `${tgUser.first_name} ${tgUser.last_name || ""}`.trim() || `User ${tgUser.id}`

            // Intentar login
            const result = await loginWithWallet(tgWallet)
            if (result.success && result.user) {
              sessionStorage.setItem("banger_session", result.user.id)
              localStorage.setItem("banger_session", result.user.id)
              if (result.user.session_token) {
                sessionStorage.setItem("banger_token", result.user.session_token)
                localStorage.setItem("banger_token", result.user.session_token)
              }
              toast.success(`¡Bienvenido de nuevo, ${result.user.name}!`)
              navigate("/play")
            } else if (result.notFound) {
              // Registrar nuevo usuario de Telegram
              const regResult = await registerWalletUser(tgName, tgWallet)
              if (regResult?.success && regResult.user) {
                sessionStorage.setItem("banger_session", regResult.user.id)
                localStorage.setItem("banger_session", regResult.user.id)
                if (regResult.user.session_token) {
                  sessionStorage.setItem("banger_token", regResult.user.session_token)
                  localStorage.setItem("banger_token", regResult.user.session_token)
                }
                toast.success(`¡Perfil creado para ${regResult.user.name}!`)
                navigate("/play")
              } else {
                toast.error(regResult?.error || "Error al registrar tu cuenta de Telegram")
              }
            } else {
              toast.error(result.error || "Error al iniciar sesión")
            }
          }
        } catch (err) {
          console.error("Error en auto-login de Telegram:", err)
        } finally {
          setTgLoading(false)
        }
      }
    }
    
    handleTelegramLogin()
  }, [navigate])

  // Al conectar billetera MetaMask, hacer login automático en navegadores tradicionales
  useEffect(() => {
    const handleWalletLogin = async () => {
      if (address) {
        setLoading(true)
        const result = await loginWithWallet(address)
        if (result.success && result.user) {
          sessionStorage.setItem("banger_session", result.user.id)
          localStorage.setItem("banger_session", result.user.id)
          if (result.user.session_token) {
            sessionStorage.setItem("banger_token", result.user.session_token)
            localStorage.setItem("banger_token", result.user.session_token)
          }
          toast.success(`Welcome, ${result.user.name}`)
          navigate("/play")
        } else {
          if (result.notFound) {
            if (!newWalletName.trim()) {
              toast.error("Please enter your player name before connecting your wallet.")
              disconnectWallet()
              setLoading(false)
              return
            }
            const regResult = await registerWalletUser(newWalletName.trim(), address)
            if (regResult?.success && regResult.user) {
              sessionStorage.setItem("banger_session", regResult.user.id)
              localStorage.setItem("banger_session", regResult.user.id)
              if (regResult.user.session_token) {
                sessionStorage.setItem("banger_token", regResult.user.session_token)
                localStorage.setItem("banger_token", regResult.user.session_token)
              }
              toast.success(`Welcome, ${regResult.user.name}`)
              navigate("/play")
            } else {
              toast.error(regResult?.error || "Error registering wallet")
              disconnectWallet()
            }
          } else {
            toast.error(result.error || "Error connecting wallet")
            disconnectWallet()
          }
        }
        setLoading(false)
      }
    }
    handleWalletLogin()
  }, [address, navigate])

  const handleLeftClover = () => {
    if (rightTaps > 0) {
      setLeftTaps(1)
      setRightTaps(0)
    } else {
      setLeftTaps(prev => prev + 1)
    }
  }

  const handleRightClover = () => {
    if (leftTaps < 2) return
    const next = rightTaps + 1
    if (next >= 3) {
      setLeftTaps(0)
      setRightTaps(0)
      const inputUser = window.prompt("Admin Username:")
      if (inputUser) {
        const inputPass = window.prompt("Admin Password:")
        if (inputUser === "AntonioTomas" && inputPass === "729330") {
          navigate("/admin")
        } else {
          toast.error("Invalid credentials.")
        }
      }
    } else {
      setRightTaps(next)
    }
  }

  const handleContinuar = () => {
    playClick()
    if (typeof window !== "undefined" && (window as any).Telegram?.WebApp?.HapticFeedback) {
      (window as any).Telegram.WebApp.HapticFeedback.notificationOccurred("success")
    } else if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100])
    }

    setStep("video")
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.muted = false
        videoRef.current.volume = 1
        videoRef.current.play().catch(console.error)
        setIsMuted(false)
      }
    }, 100)
  }

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted
      setIsMuted(videoRef.current.muted)
    }
  }

  // Pantalla de carga y auto-login de Telegram
  if (isTelegram && tgLoading) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0e] flex flex-col items-center justify-center px-6 overflow-hidden font-sans">
        {/* Glowing Backgrounds */}
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none animate-pulse" />

        <div className="relative z-10 flex flex-col items-center w-full max-w-md mx-auto text-center space-y-8">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl animate-ping" />
            <div className="relative w-24 h-24 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(59,130,246,0.5)] border border-blue-400/30">
              <svg className="w-12 h-12 text-white fill-current transform -translate-x-0.5 translate-y-0.5" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.95 1.23-5.51 3.63-.52.36-.99.53-1.41.52-.46-.01-1.35-.26-2.01-.48-.81-.27-1.46-.42-1.4-.88.03-.24.36-.49.99-.74 3.87-1.68 6.45-2.79 7.74-3.32 3.68-1.5 4.44-1.76 4.94-1.77.11 0 .36.03.52.16.14.11.18.27.2.39.02.1.03.35.01.52z"/>
              </svg>
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-black italic tracking-tighter bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent">
              MONERO TELEGRAM
            </h1>
            <p className="text-white/60 font-bold text-xs tracking-[0.25em] uppercase">
              Iniciando Sesión Segura...
            </p>
          </div>

          <div className="flex gap-2">
            <span className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
            <span className="w-3 h-3 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
            <span className="w-3 h-3 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
          </div>
        </div>
      </div>
    )
  }

  // PASO 1: SPLASH - PAGINA DE BIENVENIDA PREMIUM
  if (step === "splash") {
    return (
      <div className="fixed inset-0 bg-[#040407] flex flex-col items-center justify-start sm:justify-center px-4 sm:px-6 overflow-y-auto sm:overflow-hidden font-sans select-none scrollbar-none py-6 sm:py-0">
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes shimmer {
            100% { transform: translateX(200%); }
          }
          @keyframes float-y-slow {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-15px) rotate(5deg); }
          }
          @keyframes float-y-medium {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-25px) rotate(-10deg); }
          }
          @keyframes float-y-fast {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(8deg); }
          }
          @keyframes pulse-glow {
            0%, 100% { filter: drop-shadow(0 0 15px rgba(249,115,22,0.3)); }
            50% { filter: drop-shadow(0 0 35px rgba(249,115,22,0.7)); }
          }
          @keyframes border-glow {
            0%, 100% { border-color: rgba(249,115,22,0.2); }
            50% { border-color: rgba(249,115,22,0.6); }
          }
          @keyframes coin-spin {
            0% { transform: rotateY(0deg); }
            100% { transform: rotateY(360deg); }
          }
        `}} />
        
        {/* Glowing Ambient Lights */}
        <div className="absolute top-[-10%] left-[-10%] w-[450px] h-[450px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[450px] h-[450px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-orange-600/5 rounded-full blur-[140px] pointer-events-none" />

        {/* Floating Game Assets - 3D Elements that characterize the Slot machine */}
        {/* Lucky Seven */}
        <div 
          className="absolute top-[10%] left-[8%] w-16 h-16 sm:w-24 sm:h-24 opacity-30 pointer-events-none"
          style={{ animation: 'float-y-slow 6s ease-in-out infinite' }}
        >
          <img src="/slot_seven_1778033107783.png" alt="Seven" className="w-full h-full object-contain filter drop-shadow-[0_10px_15px_rgba(0,0,0,0.6)]" />
        </div>
        
        {/* Golden Star */}
        <div 
          className="absolute top-[18%] right-[8%] w-14 h-14 sm:w-20 sm:h-20 opacity-25 pointer-events-none"
          style={{ animation: 'float-y-medium 8s ease-in-out infinite', animationDelay: '1s' }}
        >
          <img src="/slot_star_1778033094610.png" alt="Star" className="w-full h-full object-contain filter drop-shadow-[0_10px_15px_rgba(0,0,0,0.6)]" />
        </div>

        {/* Watermelon */}
        <div 
          className="absolute bottom-[20%] left-[6%] w-16 h-16 sm:w-22 sm:h-22 opacity-20 pointer-events-none"
          style={{ animation: 'float-y-fast 7s ease-in-out infinite', animationDelay: '2s' }}
        >
          <img src="/slot_watermelon_1778033044325.png" alt="Watermelon" className="w-full h-full object-contain filter drop-shadow-[0_10px_15px_rgba(0,0,0,0.6)]" />
        </div>

        {/* Golden Bell */}
        <div 
          className="absolute bottom-[12%] right-[10%] w-14 h-14 sm:w-22 sm:h-22 opacity-35 pointer-events-none"
          style={{ animation: 'float-y-slow 5s ease-in-out infinite', animationDelay: '0.5s' }}
        >
          <img src="/slot_bell_1778033074823.png" alt="Bell" className="w-full h-full object-contain filter drop-shadow-[0_10px_15px_rgba(0,0,0,0.6)]" />
        </div>

        {/* Grape */}
        <div 
          className="absolute top-[45%] left-[4%] w-12 h-12 sm:w-16 sm:h-16 opacity-15 pointer-events-none"
          style={{ animation: 'float-y-medium 9s ease-in-out infinite', animationDelay: '3s' }}
        >
          <img src="/slot_grapes_1778033029814.png" alt="Grapes" className="w-full h-full object-contain filter drop-shadow-[0_10px_15px_rgba(0,0,0,0.6)]" />
        </div>

        {/* BAR */}
        <div 
          className="absolute bottom-[48%] right-[4%] w-14 h-14 sm:w-20 sm:h-20 opacity-20 pointer-events-none"
          style={{ animation: 'float-y-fast 8s ease-in-out infinite', animationDelay: '1.5s' }}
        >
          <img src="/slot_bar_1778033272509.png" alt="BAR" className="w-full h-full object-contain filter drop-shadow-[0_10px_15px_rgba(0,0,0,0.6)]" />
        </div>

        {/* USDT Gold Coins */}
        <div 
          className="absolute top-[32%] right-[6%] w-10 h-10 opacity-30 pointer-events-none animate-bounce"
          style={{ animationDuration: '4s' }}
        >
          <img src="/usdt.png" alt="USDT" className="w-full h-full object-contain filter drop-shadow-[0_5px_8px_rgba(0,0,0,0.5)]" />
        </div>
        <div 
          className="absolute bottom-[35%] left-[8%] w-12 h-12 opacity-25 pointer-events-none animate-bounce"
          style={{ animationDuration: '5s', animationDelay: '0.8s' }}
        >
          <img src="/usdt.png" alt="USDT" className="w-full h-full object-contain filter drop-shadow-[0_5px_8px_rgba(0,0,0,0.5)]" />
        </div>

        {/* Main Glassmorphic Panel */}
        <div className="relative z-10 w-full max-w-xl p-6 sm:p-10 rounded-[2.5rem] backdrop-blur-xl bg-white/[0.01] border border-white/5 shadow-[0_0_80px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.05)] text-center flex flex-col items-center space-y-8 sm:space-y-10 my-auto">
          
          {/* Secrets taps invisible anchors */}
          <div className="absolute top-2 left-2 flex gap-1 z-20">
            <span onClick={handleLeftClover} className="text-xl cursor-default opacity-0 select-none">🍀</span>
            <span onClick={handleRightClover} className="text-xl cursor-default opacity-0 select-none">🍀</span>
          </div>

          {/* Logo / Casino Board Emblem */}
          <div className="relative flex flex-col items-center">
            {/* Red-Orange Pulsing Backlight */}
            <div className="absolute w-28 h-28 sm:w-36 sm:h-36 bg-gradient-to-r from-orange-500 to-red-600 rounded-full blur-2xl opacity-20 animate-pulse" />
            
            {/* High-End Ring around the spinning gold coin */}
            <div className="relative w-20 h-20 sm:w-26 sm:h-26 bg-[#08080c] border-2 border-orange-500/30 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(249,115,22,0.2)]">
              <img
                src="/usdt.png"
                alt="USDT Logo"
                className="w-12 h-12 sm:w-16 sm:h-16 object-contain"
                style={{ animation: 'coin-spin 4s linear infinite' }}
              />
              {/* Overlay highlight */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none" />
            </div>
            
            {/* Title with multi-layered neon glow */}
            <h1 className="mt-4 text-5xl sm:text-6xl font-black italic tracking-tighter bg-gradient-to-r from-yellow-400 via-orange-500 to-red-600 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(249,115,22,0.5)]">
              MONERO SLOT
            </h1>
            <div className="h-[2px] w-28 bg-gradient-to-r from-transparent via-orange-500 to-transparent mt-2" />
          </div>

          {/* Subtitle & Welcome Text */}
          <div className="space-y-2 sm:space-y-3">
            <h2 className="text-white font-black text-[11px] sm:text-xs tracking-[0.3em] uppercase opacity-95 flex items-center justify-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-yellow-400 animate-pulse" />
              THE PREMIUM WEB3 SLOTS EXPERIENCE
              <Sparkles className="w-3.5 h-3.5 text-yellow-400 animate-pulse" />
            </h2>
            <p className="text-white/60 text-xs sm:text-sm max-w-sm mx-auto leading-relaxed">
              Gira los rodillos, diviértete a lo grande y gana premios directos a tu wallet en <span className="text-orange-400 font-bold">USDT (Red TON)</span>.
            </p>
          </div>

          {/* Core Symbol Rewards Display (What Characterizes The Game) */}
          <div className="w-full bg-black/40 border border-white/5 rounded-3xl p-4 space-y-3">
            <h3 className="text-white/50 text-[10px] font-black tracking-wider uppercase text-center">
              SÍMBOLOS LEGENDARIOS DEL JUEGO
            </h3>
            
            <div className="grid grid-cols-4 gap-2">
              {/* Symbol 1: Seven */}
              <div className="bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 rounded-2xl p-2 flex flex-col items-center transition-all duration-300 transform hover:scale-105">
                <div className="w-10 h-10 mb-1 flex items-center justify-center">
                  <img src="/slot_seven_1778033107783.png" alt="Seven" className="w-8 h-8 object-contain" />
                </div>
                <span className="text-[9px] font-black text-red-500">SEVEN</span>
                <span className="text-[8px] text-white/40 font-bold mt-0.5">X500 PAY</span>
              </div>
              
              {/* Symbol 2: BAR */}
              <div className="bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 rounded-2xl p-2 flex flex-col items-center transition-all duration-300 transform hover:scale-105">
                <div className="w-10 h-10 mb-1 flex items-center justify-center">
                  <img src="/slot_bar_1778033272509.png" alt="BAR" className="w-8 h-8 object-contain" />
                </div>
                <span className="text-[9px] font-black text-yellow-500">BAR</span>
                <span className="text-[8px] text-white/40 font-bold mt-0.5">X250 PAY</span>
              </div>

              {/* Symbol 3: Star */}
              <div className="bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 rounded-2xl p-2 flex flex-col items-center transition-all duration-300 transform hover:scale-105">
                <div className="w-10 h-10 mb-1 flex items-center justify-center">
                  <img src="/slot_star_1778033094610.png" alt="Star" className="w-8 h-8 object-contain" />
                </div>
                <span className="text-[9px] font-black text-amber-400">STAR</span>
                <span className="text-[8px] text-white/40 font-bold mt-0.5">X150 PAY</span>
              </div>

              {/* Symbol 4: Bell */}
              <div className="bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 rounded-2xl p-2 flex flex-col items-center transition-all duration-300 transform hover:scale-105">
                <div className="w-10 h-10 mb-1 flex items-center justify-center">
                  <img src="/slot_bell_1778033074823.png" alt="Bell" className="w-8 h-8 object-contain" />
                </div>
                <span className="text-[9px] font-black text-yellow-400">BELL</span>
                <span className="text-[8px] text-white/40 font-bold mt-0.5">X125 PAY</span>
              </div>
            </div>
          </div>

          {/* Value Propositions / Features Grid */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full">
            <div className="p-2.5 sm:p-3 rounded-2xl bg-white/[0.01] border border-white/5 flex flex-col items-center justify-center space-y-1 transition-all hover:bg-white/[0.03]">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-1">
                <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
              </div>
              <span className="text-[9px] sm:text-[10px] font-black text-white/80 tracking-wider uppercase">TON Connect</span>
              <span className="text-[7px] sm:text-[8px] text-white/40 font-medium">Billetera Directa</span>
            </div>
            
            <div className="p-2.5 sm:p-3 rounded-2xl bg-white/[0.01] border border-white/5 flex flex-col items-center justify-center space-y-1 transition-all hover:bg-white/[0.03]">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-1">
                <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-400" />
              </div>
              <span className="text-[9px] sm:text-[10px] font-black text-white/80 tracking-wider uppercase">USDT Payouts</span>
              <span className="text-[7px] sm:text-[8px] text-white/40 font-medium">Retiros Rápidos</span>
            </div>
            
            <div className="p-2.5 sm:p-3 rounded-2xl bg-white/[0.01] border border-white/5 flex flex-col items-center justify-center space-y-1 transition-all hover:bg-white/[0.03]">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-1">
                <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-400" />
              </div>
              <span className="text-[9px] sm:text-[10px] font-black text-white/80 tracking-wider uppercase">Fair Play</span>
              <span className="text-[7px] sm:text-[8px] text-white/40 font-medium">Azar Provable</span>
            </div>
          </div>

          {/* Shimmering Golden-Orange Launch Handle Button */}
          <button
            onClick={handleContinuar}
            className="group relative w-full max-w-sm h-14 sm:h-16 rounded-2xl font-black text-sm sm:text-base text-white tracking-[0.2em] uppercase overflow-hidden shadow-[0_15px_40px_rgba(249,115,22,0.25)] transition-all duration-300 transform hover:scale-[1.03] active:scale-[0.98]"
          >
            {/* Background Gradient */}
            <div className="absolute inset-0 bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 transition-all duration-300 group-hover:opacity-90" />
            
            {/* Border Inner Glow */}
            <div className="absolute inset-[1px] bg-[#08080c] rounded-[15px] transition-all duration-300 group-hover:opacity-0" />
            
            {/* Shimmer Effect */}
            <div className="absolute inset-0 w-1/2 h-full bg-white/10 transform -skew-x-12 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />

            <span className="relative z-10 flex items-center justify-center gap-2 text-white group-hover:text-[#08080c] transition-colors duration-300 font-extrabold">
              INICIAR JUEGO
              <svg className="w-4 h-4 sm:w-5 h-5 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </span>
          </button>
        </div>
      </div>
    )
  }

  // PASO 2: VIDEO
  if (step === "video") {
    return (
      <div className="fixed inset-0 z-[100] bg-black touch-none overflow-hidden overscroll-none sm:flex sm:items-center sm:justify-center sm:p-4 sm:bg-[#0a0510]">
        <div className="absolute inset-0 w-full h-full sm:relative sm:inset-auto sm:max-w-[400px] sm:max-h-[850px] sm:rounded-[2rem] overflow-hidden sm:border-[6px] sm:border-gray-900 sm:shadow-2xl sm:shadow-purple-900/40 bg-black">
          <video
            ref={videoRef}
            src="/videos/welcome.mp4"
            className="absolute inset-0 m-auto w-[85%] h-[85%] object-contain object-center pointer-events-none select-none"
            onEnded={() => setStep("login")}
            playsInline
            preload="auto"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0510]/80 via-transparent to-transparent pointer-events-none" />
          <div className="absolute bottom-10 left-6 right-6 flex justify-between items-center z-[120]">
            <button
              onClick={toggleMute}
              className="p-4 bg-black/60 hover:bg-black/80 border border-white/10 text-white rounded-full backdrop-blur-md transition-all"
            >
              {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
            </button>
            <button
              onClick={() => setStep("login")}
              className="px-8 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black rounded-full backdrop-blur-md transition-all uppercase text-[10px] tracking-[0.2em]"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    )
  }

  // PASO 3: LOGIN
  return (
    <div className="w-full min-h-screen relative flex items-center justify-center p-4 bg-[#040407] overflow-hidden font-sans select-none">
      {/* Background ambient glows */}
      <div className="absolute top-1/4 left-1/4 w-[450px] h-[450px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] bg-orange-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '1.5s' }} />

      {/* Floating Elements (cosmetic, blurry) */}
      <div className="absolute top-[15%] left-[10%] w-16 h-16 opacity-10 blur-[1px] pointer-events-none animate-bounce">
        <img src="/slot_seven_1778033107783.png" alt="seven" className="w-full h-full object-contain" />
      </div>
      <div className="absolute bottom-[20%] right-[10%] w-16 h-16 opacity-15 blur-[2px] pointer-events-none animate-bounce" style={{ animationDelay: '1s' }}>
        <img src="/slot_star_1778033094610.png" alt="star" className="w-full h-full object-contain" />
      </div>

      <div className="relative z-10 w-full max-w-md mx-auto">
        <div className="relative p-8 sm:p-10 rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl bg-[#08080c] backdrop-blur-xl">
          {/* Casino overlay pattern */}
          <div className="absolute inset-0 opacity-[0.03] bg-cover bg-center mix-blend-overlay" style={{ backgroundImage: `url('/images/casino-bg.png')` }} />
          
          {/* Secret clover taps anchors on login screen */}
          <span onClick={handleLeftClover}  className="absolute top-3 left-4  text-2xl cursor-default select-none z-20 hover:scale-110 active:scale-95 transition-transform">🍀</span>
          <span onClick={handleRightClover} className="absolute top-3 right-4 text-2xl cursor-default select-none z-20 hover:scale-110 active:scale-95 transition-transform">🍀</span>
          <span onClick={handleLeftClover}  className="absolute bottom-3 left-4  text-2xl cursor-default select-none z-20 hover:scale-110 active:scale-95 transition-transform">🍀</span>
          <span onClick={handleRightClover} className="absolute bottom-3 right-4 text-2xl cursor-default select-none z-20 hover:scale-110 active:scale-95 transition-transform">🍀</span>

          <div className="relative z-10 text-center mb-8">
            <h1 className="text-4xl sm:text-5xl font-black italic tracking-tighter bg-gradient-to-r from-orange-400 via-orange-500 to-red-600 bg-clip-text text-transparent mb-2">
              MONERO SLOT
            </h1>
            <p className="text-white font-black text-sm tracking-[0.2em] uppercase opacity-90">
              CONECTAR CUENTA
            </p>
          </div>

          <div className="relative z-10 space-y-6">
            {!address ? (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="block text-white/70 text-[10px] font-black tracking-[0.2em] uppercase text-center">
                    INGRESA TU NOMBRE DE JUGADOR
                  </label>
                  <input
                    type="text"
                    value={newWalletName}
                    onChange={(e) => setNewWalletName(e.target.value)}
                    placeholder="Escribe tu alias de la suerte..."
                    className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/20 text-center text-base font-bold focus:outline-none focus:border-orange-500/50 focus:bg-white/10 transition-all shadow-inner"
                  />
                </div>
                
                {isOnMobile && !(window as any).ethereum && (
                  <div className="flex items-start gap-3 p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl">
                    <Smartphone className="w-5 h-5 text-orange-400 mt-0.5 shrink-0" />
                    <p className="text-orange-300/80 text-[11px] font-semibold leading-relaxed">
                      Para conectar MetaMask en móvil, esta opción abrirá la app de MetaMask automáticamente.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={connectWallet}
                  disabled={loading}
                  className="w-full h-14 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white font-black text-base rounded-2xl flex items-center justify-center gap-3 shadow-[0_10px_25px_-5px_rgba(249,115,22,0.4)] transform hover:translate-y-[-2px] active:translate-y-[0px] transition-all disabled:opacity-60"
                >
                  {isOnMobile && !(window as any).ethereum
                    ? <Smartphone className="w-5 h-5" />
                    : <Wallet className="w-5 h-5" />
                  }
                  {loading
                    ? "CONECTANDO..."
                    : isOnMobile && !(window as any).ethereum
                      ? "ABRIR EN METAMASK"
                      : "CONECTAR BILLETERA"
                  }
                </button>
              </div>
            ) : (
              <div className="w-full h-14 bg-green-500/10 border border-green-500/30 text-green-400 font-black text-base rounded-2xl flex items-center justify-center gap-3 backdrop-blur-sm">
                <Wallet className="w-5 h-5" />
                CONECTADO CON ÉXITO
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
