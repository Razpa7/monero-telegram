import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { BrowserProvider, Signer } from "ethers";
import { toast } from "sonner";

// BSC Mainnet params
const BSC_CHAIN_ID = "0x38"; // 56 in decimal
const BSC_CHAIN_PARAMS = {
  chainId: BSC_CHAIN_ID,
  chainName: "BNB Smart Chain Mainnet",
  nativeCurrency: {
    name: "BNB",
    symbol: "BNB",
    decimals: 18,
  },
  rpcUrls: ["https://bsc-dataseed.binance.org/"],
  blockExplorerUrls: ["https://bscscan.com/"],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Devuelve true si el dispositivo es móvil/tablet */
const isMobile = (): boolean =>
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

/** Devuelve true si estamos DENTRO del browser nativo de MetaMask Mobile */
const isMetaMaskMobileBrowser = (): boolean =>
  isMobile() && !!(window as any).ethereum?.isMetaMask;

/**
 * Abre la dApp en el navegador interno de MetaMask Mobile (deep link).
 * Si la app no está instalada, redirige a la tienda correspondiente.
 */
const openInMetaMaskMobile = () => {
  const dappUrl = window.location.href.replace(/^https?:\/\//, "");
  const metamaskDeepLink = `https://metamask.app.link/dapp/${dappUrl}`;
  window.location.href = metamaskDeepLink;
};

// ── Context ───────────────────────────────────────────────────────────────────

interface Web3ContextType {
  address: string | null;
  provider: BrowserProvider | null;
  signer: Signer | null;
  chainId: string | null;
  isOnMobile: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  switchNetworkToBSC: () => Promise<boolean>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export const Web3Provider = ({ children }: { children: ReactNode }) => {
  const [address, setAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [isOnMobile] = useState<boolean>(isMobile());

  // Initialize provider and check connection
  useEffect(() => {
    const initWeb3 = async () => {
      try {
        if (typeof window !== "undefined" && (window as any).ethereum) {
          const browserProvider = new BrowserProvider((window as any).ethereum);
          setProvider(browserProvider);

          // Check if already connected
          const accounts = await (window as any).ethereum.request({
            method: "eth_accounts",
          });
          const hasSession = sessionStorage.getItem("banger_session");
          if (accounts.length > 0 && hasSession) {
            setAddress(accounts[0]);
            const currentSigner = await browserProvider.getSigner();
            setSigner(currentSigner);
          }

          // Get current chain
          const currentChainId = await (window as any).ethereum.request({
            method: "eth_chainId",
          });
          setChainId(currentChainId);

          // Listen for account changes
          (window as any).ethereum.on(
            "accountsChanged",
            (newAccounts: string[]) => {
              if (newAccounts.length > 0) {
                setAddress(newAccounts[0]);
              } else {
                setAddress(null);
                setSigner(null);
              }
            }
          );

          // Listen for chain changes
          (window as any).ethereum.on("chainChanged", (newChainId: string) => {
            setChainId(newChainId);
            window.location.reload();
          });
        }
      } catch (err) {
        console.error("Error initializing Web3 context", err);
      }
    };

    initWeb3();

    return () => {
      if ((window as any).ethereum) {
        (window as any).ethereum.removeAllListeners("accountsChanged");
        (window as any).ethereum.removeAllListeners("chainChanged");
      }
    };
  }, []);

  const switchNetworkToBSC = async (): Promise<boolean> => {
    if (!(window as any).ethereum) return false;

    try {
      await (window as any).ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BSC_CHAIN_ID }],
      });
      return true;
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await (window as any).ethereum.request({
            method: "wallet_addEthereumChain",
            params: [BSC_CHAIN_PARAMS],
          });
          return true;
        } catch (addError) {
          console.error("Error adding BSC network", addError);
          toast.error("Error al añadir la red BSC a MetaMask");
          return false;
        }
      }
      console.error("Error switching network", switchError);
      toast.error("Error al cambiar a la red BSC");
      return false;
    }
  };

  const connectWallet = async () => {
    // ── CASO 1: window.ethereum disponible (PC o MetaMask Mobile Browser) ──
    if ((window as any).ethereum) {
      try {
        const accounts = await (window as any).ethereum.request({
          method: "eth_requestAccounts",
        });
        if (accounts.length > 0) {
          setAddress(accounts[0]);

          // Rebuild provider if needed (primer connect en móvil)
          let activeProvider = provider;
          if (!activeProvider) {
            activeProvider = new BrowserProvider((window as any).ethereum);
            setProvider(activeProvider);
          }

          const currentSigner = await activeProvider.getSigner();
          setSigner(currentSigner);

          // Ensure BSC network
          const currentChainId = await (window as any).ethereum.request({
            method: "eth_chainId",
          });
          if (currentChainId !== BSC_CHAIN_ID) {
            await switchNetworkToBSC();
          }

          toast.success("Billetera conectada exitosamente");
        }
      } catch (error: any) {
        console.error("Error connecting wallet:", error);
        if (error.code === 4001) {
          toast.error(
            "Conexión rechazada. Por favor, aprueba la solicitud en MetaMask."
          );
        } else if (error.code === -32002) {
          toast.error(
            "Ya hay una solicitud pendiente. Por favor, abre MetaMask."
          );
        } else {
          toast.error(error.message || "Error al conectar la billetera");
        }
      }
      return;
    }

    // ── CASO 2: Móvil SIN window.ethereum → Redirigir a MetaMask Mobile ──
    if (isMobile()) {
      toast.info(
        "Abriendo MetaMask Mobile... Si no tienes la app, serás redirigido a descargarla.",
        { duration: 3000 }
      );
      // Pequeño delay para que el toast sea visible antes del redirect
      setTimeout(() => {
        openInMetaMaskMobile();
      }, 800);
      return;
    }

    // ── CASO 3: PC sin extensión ──
    toast.error(
      "MetaMask no está instalado. Instala la extensión en tu navegador.",
      {
        action: {
          label: "Instalar",
          onClick: () =>
            window.open("https://metamask.io/download/", "_blank"),
        },
        duration: 6000,
      }
    );
  };

  const disconnectWallet = () => {
    setAddress(null);
    setSigner(null);
    toast.info("Billetera desconectada localmente");
  };

  return (
    <Web3Context.Provider
      value={{
        address,
        provider,
        signer,
        chainId,
        isOnMobile,
        connectWallet,
        disconnectWallet,
        switchNetworkToBSC,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
};
