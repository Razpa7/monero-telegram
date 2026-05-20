import React, { useState, useEffect } from "react";
import { X, ArrowRight, Wallet, Loader2 } from "lucide-react";
import { Contract, parseUnits, formatUnits } from "ethers";
import { useWeb3 } from "@/contexts/Web3Context";
import { toast } from "sonner";
import { updateUserCredit } from "@/lib/store";
import { useTonAddress, useTonConnectUI, TonConnectButton } from '@tonconnect/ui-react';

// BSC USDT Contract Address
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
// Master Wallet to receive deposits (USER SHOULD CHANGE THIS)
const MASTER_WALLET = "0xedc636263965E56976Cbdbd01c90Dd6d40d3Cc5f"; 

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

interface CashierModalProps {
  userId: string;
  currentCredit: number;
  language?: "es" | "en";
  onClose: () => void;
  onSuccess: (amount: number) => void;
  onWithdrawSuccess: (amount: number) => void;
}

export const CashierModal = ({ 
  userId, 
  currentCredit, 
  language = "es", 
  onClose, 
  onSuccess, 
  onWithdrawSuccess 
}: CashierModalProps) => {
  const { address: bscAddress, provider, signer, connectWallet: connectBscWallet } = useWeb3();
  const tonAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const isTelegram = typeof window !== "undefined" && !!(window as any).Telegram?.WebApp?.initData;
  const address = isTelegram ? tonAddress : bscAddress;

  const MASTER_TON_WALLET = "UQAEWwHn5S4h2D50LidJ3WJ4C4pCwqT_4pZ5gNf8oHh9pCg9"; // Billetera TON del administrador
  const [usdtBalance, setUsdtBalance] = useState<string | null>(null);
  const [bnbBalance, setBnbBalance] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");

  // Translations map
  const t = {
    es: {
      title: "CAJERO WEB 3",
      availableBalance: "Tu Saldo Disponible",
      chips: "FICHAS",
      ratio: "1 USDT = 10 fichas",
      deposit: "Depositar",
      withdraw: "Retirar",
      connectPrompt: "Conecta tu billetera para depositar USDT (Red BSC)",
      connectWallet: "Conectar MetaMask",
      linkedWallet: "Billetera Vinculada",
      usdtBalance: "Saldo USDT",
      bnbBalance: "Saldo BNB (Red)",
      depositAmountLabel: "Monto a depositar (USDT)",
      withdrawAmountLabel: "Monto a retirar (USDT)",
      minDepositNote: "* Mínimo: 2 USDT = 20 fichas.",
      minWithdrawNote: "* Mínimo de retiro: 5 USDT = 50 fichas.",
      willReceive: "Recibirás:",
      willDeliver: "Entregarás:",
      confirmDeposit: "Confirmar Depósito",
      confirmWithdraw: "Confirmar Retiro",
      networkWarning: "Asegúrate de estar en la red Binance Smart Chain (BSC)",
      // Toasts/errors
      connectWalletToast: "Por favor, conecta tu billetera primero",
      minDepositToast: "El mínimo de compra es de 2 USDT",
      insufficientUsdt: "Saldo de USDT insuficiente",
      approveTx: "Por favor, aprueba la transacción en MetaMask...",
      txSent: "Transacción enviada. Esperando confirmación...",
      successDeposit: "¡Depósito exitoso! Has recibido {chips} fichas.",
      connectWithdrawWalletToast: "Conecta tu billetera para recibir los fondos",
      minWithdrawToast: "El retiro mínimo es de 5 USDT",
      insufficientChips: "No tienes suficientes fichas",
      withdrawRequested: "Retiro solicitado: {amount} USDT serán enviados a tu billetera.",
      withdrawError: "Error al procesar el retiro",
      walletReadError: "Error al leer la billetera. Asegúrate de estar en la red BSC.",
    },
    en: {
      title: "WEB 3 CASHIER",
      availableBalance: "Your Available Balance",
      chips: "CHIPS",
      ratio: "1 USDT = 10 chips",
      deposit: "Deposit",
      withdraw: "Withdraw",
      connectPrompt: "Connect your wallet to deposit USDT (BSC Network)",
      connectWallet: "Connect MetaMask",
      linkedWallet: "Linked Wallet",
      usdtBalance: "USDT Balance",
      bnbBalance: "BNB Balance (Gas)",
      depositAmountLabel: "Amount to deposit (USDT)",
      withdrawAmountLabel: "Amount to withdraw (USDT)",
      minDepositNote: "* Minimum: 2 USDT = 20 chips.",
      minWithdrawNote: "* Minimum withdrawal: 5 USDT = 50 chips.",
      willReceive: "You will receive:",
      willDeliver: "You will deliver:",
      confirmDeposit: "Confirm Deposit",
      confirmWithdraw: "Confirm Withdrawal",
      networkWarning: "Make sure you are on the Binance Smart Chain (BSC) network",
      // Toasts/errors
      connectWalletToast: "Please connect your wallet first",
      minDepositToast: "The minimum purchase is 2 USDT",
      insufficientUsdt: "Insufficient USDT balance",
      approveTx: "Please approve the transaction in MetaMask...",
      txSent: "Transaction sent. Waiting for confirmation...",
      successDeposit: "Successful deposit! You have received {chips} chips.",
      connectWithdrawWalletToast: "Connect your wallet to receive the funds",
      minWithdrawToast: "The minimum withdrawal is 5 USDT",
      insufficientChips: "Insufficient chips balance",
      withdrawRequested: "Withdrawal requested: {amount} USDT will be sent to your wallet.",
      withdrawError: "Error processing withdrawal",
      walletReadError: "Error reading wallet. Make sure you are on the BSC network.",
    }
  }[language];

  // 1 USDT = 10 fichas → 1 ficha = 0.10 USDT
  const CHIPS_PER_USDT = 10;
  const MIN_DEPOSIT_USDT = 2;
  const MIN_WITHDRAW_USDT = 5;
  const maxWithdrawUsdt = currentCredit / CHIPS_PER_USDT;

  const fetchBalances = async () => {
    if (isTelegram && tonAddress) {
      setRefreshing(true);
      try {
        setUsdtBalance("Conectado");
        setBnbBalance("N/A");
      } finally {
        setRefreshing(false);
      }
      return;
    }
    if (address && provider) {
      setRefreshing(true);
      try {
        console.log("Iniciando consulta de saldos para:", address);
        
        // 1. Obtener BNB Nativo (Directo del provider)
        const nativeBal = await provider.getBalance(address);
        setBnbBalance(formatUnits(nativeBal, 18));

        // 2. Obtener USDT (Intentando con el contrato)
        const usdtContract = new Contract(USDT_ADDRESS, [
          "function balanceOf(address owner) view returns (uint256)",
          "function decimals() view returns (uint8)"
        ], provider);

        const [bal, decimals] = await Promise.all([
          usdtContract.balanceOf(address),
          usdtContract.decimals().catch(() => 18) // Fallback a 18
        ]);
        
        setUsdtBalance(formatUnits(bal, decimals));
        console.log("Saldos cargados:", formatUnits(bal, decimals), "USDT");
      } catch (error) {
        console.error("Error crítico al consultar saldos:", error);
        toast.error(t.walletReadError);
      } finally {
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    fetchBalances();
  }, [address, provider]);

  const handleTonDeposit = async () => {
    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount < MIN_DEPOSIT_USDT) {
      toast.error(t.minDepositToast);
      return;
    }

    setLoading(true);
    try {
      const usdtAmountNano = Math.round(depositAmount * 1_000_000);

      // Transacción de transferencia estándar de Jetton (USDT) en TON
      const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 360,
        messages: [
          {
            address: "EQCxE6mUtQJKFnGfaEMPZZhpDST1mqRIQO-A9Is7SRQLjXe9", // USDT Master Contract en TON
            amount: "50000000", // 0.05 TON para gas
            payload: "te6cckEBAQEAYgAAsQ+KfqUAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAA"
          }
        ]
      };

      toast.info("Por favor, aprueba la transacción en tu Telegram Wallet...");
      const result = await tonConnectUI.sendTransaction(transaction);
      
      if (result) {
        toast.info("Procesando depósito... Acreditando fichas.");
        const chipsToCredit = Math.round(depositAmount * CHIPS_PER_USDT);
        
        await updateUserCredit(userId, chipsToCredit);
        onSuccess(chipsToCredit);
        
        toast.success(t.successDeposit.replace("{chips}", chipsToCredit.toLocaleString()));
        onClose();
      }
    } catch (error) {
      console.error("Error en depósito TON:", error);
      toast.error("Error al procesar el depósito en la red TON");
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (isTelegram) {
      await handleTonDeposit();
      return;
    }
    if (!address || !signer) {
      toast.error(t.connectWalletToast);
      return;
    }
    
    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount < MIN_DEPOSIT_USDT) {
      toast.error(t.minDepositToast);
      return;
    }

    if (depositAmount > parseFloat(usdtBalance || "0")) {
      toast.error(t.insufficientUsdt);
      return;
    }

    setLoading(true);
    try {
      const usdtContract = new Contract(USDT_ADDRESS, ERC20_ABI, signer);
      const amountParsed = parseUnits(amount, 18);
      
      toast.info(t.approveTx);
      const tx = await usdtContract.transfer(MASTER_WALLET, amountParsed);
      
      toast.info(t.txSent);
      await tx.wait();

      // 1 USDT = 10 Fichas (0.10 USDT per chip)
      const chipsToCredit = Math.round(depositAmount * CHIPS_PER_USDT);
      
      await updateUserCredit(userId, chipsToCredit);
      onSuccess(chipsToCredit);
      
      toast.success(t.successDeposit.replace("{chips}", chipsToCredit.toLocaleString()));
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!address) {
      toast.error(t.connectWithdrawWalletToast);
      return;
    }
    const chipsAmount = Math.round(parseFloat(amount) * CHIPS_PER_USDT);
    if (isNaN(chipsAmount) || parseFloat(amount) < MIN_WITHDRAW_USDT) {
      toast.error(t.minWithdrawToast);
      return;
    }
    if (chipsAmount > currentCredit) {
      toast.error(t.insufficientChips);
      return;
    }

    setLoading(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data, error } = await supabase.functions.invoke('withdraw', {
        body: { 
          userId, 
          amountUsdt: parseFloat(amount),
          walletAddress: address,
          chipsAmount: chipsAmount
        }
      });

      if (error) throw error;
      
      onWithdrawSuccess(chipsAmount);
      toast.success(t.withdrawRequested.replace("{amount}", amount));
      onClose();
    } catch (error: any) {
      console.error("Withdrawal error", error);
      toast.error(error.message || t.withdrawError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-[110]" onClick={onClose}>
      <div className="bg-[#121212] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-black text-white tracking-widest uppercase">{t.title}</h2>
          <button onClick={onClose}><X className="text-white/60 hover:text-white transition-colors" /></button>
        </div>

        {/* SALDO ACTUAL */}
        <div className="mb-6 p-4 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl flex justify-between items-center shadow-inner">
          <div>
            <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">{t.availableBalance}</p>
            <p className="text-2xl font-black text-white leading-none">{currentCredit.toLocaleString()} <span className="text-xs text-white/40">{t.chips}</span></p>
          </div>
          <div className="text-right">
            <p className="text-xs font-black text-success">{(currentCredit / CHIPS_PER_USDT).toFixed(4)} USDT</p>
            <p className="text-[9px] text-white/30 italic">{t.ratio}</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6 bg-white/5 p-1 rounded-2xl border border-white/5">
          <button 
            onClick={() => { setMode("deposit"); setAmount(""); }}
            className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${mode === 'deposit' ? 'bg-success text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
          >
            {t.deposit}
          </button>
          <button 
            onClick={() => { setMode("withdraw"); setAmount(""); }}
            className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${mode === 'withdraw' ? 'bg-destructive text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
          >
            {t.withdraw}
          </button>
        </div>

        {!address ? (
          <div className="text-center py-6">
            <Wallet className="w-16 h-16 text-warning mx-auto mb-4 opacity-50" />
            <p className="text-white/60 mb-6 font-bold">{t.connectPrompt}</p>
            <button 
              onClick={isTelegram ? undefined : connectBscWallet}
              className="bg-warning text-black font-black uppercase tracking-wider px-8 py-4 rounded-2xl active:scale-95 transition-all w-full"
            >
              {t.connectWallet}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3 relative overflow-hidden">
              {refreshing && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-10">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                </div>
              )}
              
              <div className="flex justify-between items-center">
                <span className="text-white/40 font-bold uppercase text-[10px]">{t.linkedWallet}</span>
                <span className="text-white/80 font-mono text-[10px] bg-white/5 px-2 py-1 rounded flex items-center gap-2">
                  {address.slice(0, 8)}...{address.slice(-8)}
                  <button onClick={fetchBalances} className="text-primary hover:text-white transition-colors">
                    <Loader2 className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                  </button>
                </span>
              </div>
              
              <div className="h-px bg-white/5 w-full"></div>
              
              <div className="flex justify-between items-center">
                <span className="text-white/60 font-bold uppercase text-xs">{t.usdtBalance}</span>
                <span className="text-success font-black text-lg">
                  {usdtBalance !== null ? parseFloat(usdtBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "---"} USDT
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-white/60 font-bold uppercase text-xs">{t.bnbBalance}</span>
                <span className="text-warning font-black text-xs">
                   {bnbBalance !== null ? parseFloat(bnbBalance).toFixed(4) : "---"} BNB
                </span>
              </div>
            </div>

            <div>
              <label className="text-white/60 font-bold uppercase text-xs mb-2 block">
                {mode === 'deposit' ? t.depositAmountLabel : t.withdrawAmountLabel}
              </label>
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={mode === 'deposit' ? `Min. ${MIN_DEPOSIT_USDT}` : `Min. ${MIN_WITHDRAW_USDT}`}
                step="0.10"
                min={mode === 'deposit' ? MIN_DEPOSIT_USDT : MIN_WITHDRAW_USDT}
                className="w-full bg-[#1a1a24] border border-white/10 rounded-xl p-4 text-white font-black text-2xl focus:outline-none focus:border-warning transition-colors"
              />
              {mode === 'deposit' ? (
                <p className="text-[10px] text-white/30 mt-1 italic">{t.minDepositNote}</p>
              ) : (
                <p className="text-[10px] text-white/30 mt-1 italic">{t.minWithdrawNote}</p>
              )}
            </div>
            
            <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-between">
              <span className="text-white/80 font-bold text-sm">
                {mode === 'deposit' ? t.willReceive : t.willDeliver}
              </span>
              <span className={`font-black text-xl ${mode === 'deposit' ? 'text-primary' : 'text-destructive'}`}>
                {amount ? Math.round(parseFloat(amount) * CHIPS_PER_USDT).toLocaleString() : 0} {t.chips}
              </span>
            </div>

            <button 
              onClick={mode === 'deposit' ? handleDeposit : handleWithdraw}
              disabled={loading || !amount || (mode === 'deposit' && usdtBalance !== null && parseFloat(amount) > parseFloat(usdtBalance)) || (mode === 'withdraw' && parseFloat(amount) > maxWithdrawUsdt)}
              className={`w-full text-white font-black uppercase tracking-wider px-8 py-4 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100 ${mode === 'deposit' ? 'bg-success' : 'bg-destructive'}`}
            >
              {loading ? <Loader2 className="animate-spin w-6 h-6" /> : (mode === 'deposit' ? t.confirmDeposit : t.confirmWithdraw)}
              {!loading && <ArrowRight className="w-5 h-5" />}
            </button>
            <p className="text-center text-[10px] text-white/40 italic">{t.networkWarning}</p>
          </div>
        )}
      </div>
    </div>
  );
};
