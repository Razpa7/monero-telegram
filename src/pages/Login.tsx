"use client"

import { useState, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { loginWithWallet, registerWalletUser } from "@/lib/store"
import { toast } from "sonner"
import { Volume2, VolumeX, Wallet, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWeb3 } from "@/contexts/Web3Context"

// step: "splash" | "video" | "login"
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

  // Admin sequence: tap LEFT clover 2x then RIGHT clover 3x
  const handleLeftClover = () => {
    if (rightTaps > 0) {
      setLeftTaps(1)
      setRightTaps(0)
      return
    }
    const next = leftTaps + 1
    setLeftTaps(next)
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

  // PASO 1: SPLASH
  if (step === "splash") {
    return (
      <div className="fixed inset-0 bg-[#0a0a0e] flex flex-col items-center justify-center px-6 overflow-hidden">
        <div className="relative z-10 flex flex-col items-center w-full max-w-lg mx-auto">
          <div className="flex items-center justify-center gap-4 mb-4">
            <img
              src="/usdt.png"
              alt="Logo"
              className="w-14 h-14 sm:w-16 sm:h-16 object-contain select-none"
            />
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-black italic tracking-tighter bg-gradient-to-r from-orange-500 to-red-600 bg-clip-text text-transparent drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] leading-tight">
              MONERO
            </h1>
          </div>
          
          <h2 className="text-white text-sm sm:text-base font-black tracking-[0.3em] uppercase mb-14 text-center opacity-90">
            The New Era of Web3 Casino
          </h2>

          <button
            onClick={handleContinuar}
            className="w-full max-w-[320px] px-10 py-5 rounded-full font-black text-xl text-white tracking-[0.2em] uppercase bg-gradient-to-r from-[#e11d48] via-[#a855f7] to-[#06b6d4] shadow-[0_0_40px_rgba(168,85,247,0.4)] transform hover:scale-105 active:scale-95 transition-all duration-300"
          >
            Continue
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
    <div className="w-full min-h-screen relative flex items-center justify-center p-4 bg-[#050508] overflow-hidden font-sans">
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-orange-600/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md mx-auto">
        <div className="relative p-8 sm:p-10 rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl bg-[#0a0a0f]">
          <div className="absolute inset-0 opacity-10 bg-cover bg-center mix-blend-overlay" style={{ backgroundImage: `url('/images/casino-bg.png')` }} />
          <span onClick={handleLeftClover}  className="absolute top-2 left-3  text-3xl cursor-default select-none z-20">🍀</span>
          <span onClick={handleRightClover} className="absolute top-2 right-3 text-3xl cursor-default select-none z-20">🍀</span>
          <span onClick={handleLeftClover}  className="absolute bottom-2 left-3  text-3xl cursor-default select-none z-20">🍀</span>
          <span onClick={handleRightClover} className="absolute bottom-2 right-3 text-3xl cursor-default select-none z-20">🍀</span>

          <div className="relative z-10 text-center mb-10">
            <h1 className="text-5xl font-black italic tracking-tighter bg-gradient-to-r from-orange-500 to-red-600 bg-clip-text text-transparent mb-2">
              MONERO SLOT
            </h1>
            <p className="text-white font-black text-xl tracking-[0.1em] uppercase opacity-90">
              SIGN IN
            </p>
          </div>

          <div className="relative z-10 space-y-8">
            {!address ? (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="block text-white/70 text-[11px] font-black tracking-[0.2em] uppercase text-center">
                    ENTER YOUR PLAYER NAME
                  </label>
                  <input
                    type="text"
                    value={newWalletName}
                    onChange={(e) => setNewWalletName(e.target.value)}
                    placeholder="Your Player Name"
                    className="w-full h-16 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/20 text-center text-lg font-bold focus:outline-none focus:border-orange-500/50 focus:bg-white/10 transition-all shadow-inner"
                  />
                </div>
                
                {isOnMobile && !(window as any).ethereum && (
                  <div className="flex items-start gap-3 p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl">
                    <Smartphone className="w-5 h-5 text-orange-400 mt-0.5 shrink-0" />
                    <p className="text-orange-300/80 text-[11px] font-bold leading-relaxed">
                      To connect MetaMask on mobile, the button will open the MetaMask app with this page loaded automatically.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={connectWallet}
                  disabled={loading}
                  className="w-full h-16 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white font-black text-lg rounded-2xl flex items-center justify-center gap-4 shadow-[0_10px_25px_-5px_rgba(249,115,22,0.4)] transform hover:translate-y-[-2px] active:translate-y-[0px] transition-all disabled:opacity-60"
                >
                  {isOnMobile && !(window as any).ethereum
                    ? <Smartphone className="w-6 h-6" />
                    : <Wallet className="w-6 h-6" />
                  }
                  {loading
                    ? "CONNECTING..."
                    : isOnMobile && !(window as any).ethereum
                      ? "OPEN IN METAMASK"
                      : "CONNECT WALLET"
                  }
                </button>
              </div>
            ) : (
              <div className="w-full h-16 bg-green-500/10 border border-green-500/30 text-green-400 font-black text-lg rounded-2xl flex items-center justify-center gap-4 backdrop-blur-sm">
                <Wallet className="w-6 h-6" />
                CONNECTED
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
