import React, { useState } from "react";
import { X, ArrowRight, Loader2, Wallet } from "lucide-react";
import { useWeb3 } from "@/contexts/Web3Context";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

interface WithdrawModalProps {
  userId: string;
  currentCredit: number;
  language?: "es" | "en";
  onClose: () => void;
  onSuccess: (withdrawnChips: number) => void;
}

export const WithdrawModal = ({ userId, currentCredit, language = "es", onClose, onSuccess }: WithdrawModalProps) => {
  const { address, connectWallet } = useWeb3();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const maxUsdt = currentCredit / 10;

  // Translation map
  const t = {
    es: {
      title: "RETIRAR FONDOS",
      connectPrompt: "Conecta tu billetera MetaMask para poder retirar tus ganancias.",
      connectWallet: "Conectar MetaMask",
      availableChips: "Fichas Disponibles",
      withdrawQuestion: "¿Cuántos USDT quieres retirar?",
      maxLabel: "Máx {max} USDT",
      willDeduct: "Se descontarán:",
      chips: "Fichas",
      withdrawButton: "Retirar a Billetera",
      walletSendNote: "La transacción se enviará a: {wallet}",
      // Toasts/errors
      connectWalletToast: "Conecta tu billetera para recibir los fondos",
      minWithdrawToast: "El retiro mínimo es de 5 USDT",
      insufficientChipsToast: "No tienes suficientes fichas",
      successWithdraw: "Retiro exitoso. {amount} USDT enviados a tu billetera.",
      failedWithdraw: "No se pudo procesar el retiro automático",
    },
    en: {
      title: "WITHDRAW FUNDS",
      connectPrompt: "Connect your MetaMask wallet to withdraw your winnings.",
      connectWallet: "Connect MetaMask",
      availableChips: "Available Chips",
      withdrawQuestion: "How many USDT do you want to withdraw?",
      maxLabel: "Max {max} USDT",
      willDeduct: "Will be deducted:",
      chips: "Chips",
      withdrawButton: "Withdraw to Wallet",
      walletSendNote: "The transaction will be sent to: {wallet}",
      // Toasts/errors
      connectWalletToast: "Connect your wallet to receive the funds",
      minWithdrawToast: "The minimum withdrawal is 5 USDT",
      insufficientChipsToast: "Insufficient chips balance",
      successWithdraw: "Successful withdrawal. {amount} USDT sent to your wallet.",
      failedWithdraw: "Could not process automatic withdrawal",
    }
  }[language];

  const handleWithdraw = async () => {
    if (!address) {
      toast.error(t.connectWalletToast);
      return;
    }
    const chipsAmount = parseFloat(amount) * 10; // Si el usuario ingresa USDT
    if (isNaN(chipsAmount) || parseFloat(amount) < 5) {
      toast.error(t.minWithdrawToast);
      return;
    }
    if (chipsAmount > currentCredit) {
      toast.error(t.insufficientChipsToast);
      return;
    }

    setLoading(true);
    try {
      // Llamamos a la Edge Function de Supabase para que firme y envíe el USDT
      const { data, error } = await supabase.functions.invoke('withdraw', {
        body: { 
          userId, 
          amountChips: chipsAmount, 
          destinationAddress: address 
        }
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || t.failedWithdraw);
      }

      toast.success(t.successWithdraw.replace("{amount}", data.usdtSent));
      onSuccess(chipsAmount);
      onClose();
    } catch (error: any) {
      console.error("Withdrawal error", error);
      toast.error(error.message || t.failedWithdraw);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-[110]" onClick={onClose}>
      <div className="bg-[#121212] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-white tracking-widest uppercase text-destructive">{t.title}</h2>
          <button onClick={onClose}><X className="text-white/60 hover:text-white transition-colors" /></button>
        </div>

        {!address ? (
          <div className="text-center py-6">
            <Wallet className="w-16 h-16 text-destructive mx-auto mb-4 opacity-50" />
            <p className="text-white/60 mb-6 font-bold">{t.connectPrompt}</p>
            <button 
              onClick={connectWallet}
              className="bg-warning text-black font-black uppercase tracking-wider px-8 py-4 rounded-2xl active:scale-95 transition-all w-full"
            >
              {t.connectWallet}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-[#1a1a24] p-4 rounded-2xl border border-white/5 flex justify-between items-center">
              <span className="text-white/60 font-bold uppercase text-xs">{t.availableChips}</span>
              <span className="text-white font-black text-lg">{currentCredit.toLocaleString()}</span>
            </div>

            <div>
              <div className="flex justify-between items-end mb-2">
                <label className="text-white/60 font-bold uppercase text-xs block">{t.withdrawQuestion}</label>
                <button onClick={() => setAmount(maxUsdt.toString())} className="text-xs font-bold text-primary underline">MAX</button>
              </div>
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t.maxLabel.replace("{max}", maxUsdt.toString())}
                className="w-full bg-[#1a1a24] border border-white/10 rounded-xl p-4 text-white font-black text-2xl focus:outline-none focus:border-destructive transition-colors"
              />
            </div>
            
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center justify-between">
              <span className="text-white/80 font-bold text-sm">{t.willDeduct}</span>
              <span className="text-destructive font-black text-xl">
                {amount ? parseFloat(amount) * 10 : 0} {t.chips}
              </span>
            </div>

            <button 
              onClick={handleWithdraw}
              disabled={loading || !amount}
              className="w-full bg-destructive text-white font-black uppercase tracking-wider px-8 py-4 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100"
            >
              {loading ? <Loader2 className="animate-spin w-6 h-6" /> : t.withdrawButton}
              {!loading && <ArrowRight className="w-5 h-5" />}
            </button>
            <div className="text-center">
              <p className="text-[10px] text-white/40 italic">
                {t.walletSendNote.replace("{wallet}", `${address.slice(0, 6)}...${address.slice(-4)}`)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
