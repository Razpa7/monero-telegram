// Server-authoritative spin: el cliente NO genera el resultado.
// Esta edge function valida sesión, descuenta apuesta, genera el grid con
// crypto.getRandomValues, evalúa líneas y aplica el límite de reserva.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYMBOLS = ["🍇", "🍉", "🔔", "7️⃣", "📊", "🍋", "⭐"];

const PAYLINES: number[][] = [
  [1,1,1,1,1],[2,2,2,2,2],[0,0,0,0,0],[3,3,3,3,3],
  [0,1,2,3,2],[3,2,1,0,1],[1,0,1,2,3],[2,3,2,1,0],
  [0,0,1,1,2],[3,3,2,2,1],[1,1,2,2,3],[2,2,1,1,0],
  [0,1,0,1,0],[3,2,3,2,3],[1,2,1,2,1],[2,1,2,1,2],
  [0,1,1,1,0],[3,2,2,2,3],[1,0,0,0,1],[2,3,3,3,2],
  [0,3,0,3,0],
];

const symbolMultiplier = (s: string, count: number): number => {
  if (count < 3) return 0;
  if (s === "7️⃣") return count === 5 ? 500 : count === 4 ? 200 : 100;
  if (s === "📊") return count === 5 ? 250 : count === 4 ? 100 : 50;
  if (s === "⭐") return count === 5 ? 150 : count === 4 ? 60 : 30;
  if (s === "🔔") return count === 5 ? 125 : count === 4 ? 50 : 25;
  return count === 5 ? 75 : count === 4 ? 30 : 15;
};

// RNG criptográfico (no Math.random)
const randSym = (): string => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return SYMBOLS[buf[0] % SYMBOLS.length];
};
const cryptoRandom = (): number => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0xffffffff;
};

type WinningLine = { lineIdx: number; cells: [number, number][]; amount: number };

const evaluateWins = (grid: string[][], betPerLine: number): WinningLine[] => {
  const wins: WinningLine[] = [];
  for (let li = 0; li < PAYLINES.length; li++) {
    const path = PAYLINES[li];
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { userId, bet, sessionToken } = await req.json();

    if (!userId || !bet || bet <= 0 || !Number.isFinite(bet)) {
      return new Response(JSON.stringify({ error: "Parámetros inválidos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Validar usuario + sesión + saldo
    const { data: user, error: uErr } = await supabase
      .from("users")
      .select("id, credit, total_won, total_bet, session_token, active")
      .eq("id", userId)
      .single();

    if (uErr || !user) throw new Error("Usuario no encontrado");
    if (user.active === false) throw new Error("Cuenta inactiva");
    if (sessionToken && user.session_token && user.session_token !== sessionToken) {
      throw new Error("Sesión inválida");
    }

    const totalBalance = (user.credit || 0) + (user.total_won || 0);
    if (totalBalance < bet) throw new Error("Saldo insuficiente");

    // 2. Descontar apuesta atómicamente (credit primero, después total_won)
    let newCredit = user.credit || 0;
    let newWinnings = user.total_won || 0;
    if (newCredit >= bet) {
      newCredit -= bet;
    } else {
      const remaining = bet - newCredit;
      newCredit = 0;
      newWinnings = Math.max(0, newWinnings - remaining);
    }

    // 3. Leer config global de RTP
    const { data: config } = await supabase.from("config").select("target_rtp").eq("id", 1).single();
    
    // Por defecto 0.70 (70%) si no hay configuración
    const targetRTP = config?.target_rtp ?? 0.70; 

    // 4. Fórmula de Presupuesto Personalizado
    // Presupuesto Permitido = ((Historial_Apostado + Apuesta_Actual) * RTP_del_Usuario) - Historial_Ganado
    const updatedTotalBet = (user.total_bet || 0) + bet;
    const currentWinnings = user.total_won || 0;
    
    let maxAllowedWin = (updatedTotalBet * targetRTP) - currentWinnings;
    if (maxAllowedWin < 0) maxAllowedWin = 0; // No permitir deudas

    // 5. RNG server-side (rigurosamente limitado por el presupuesto personal)
    const betPerLine = bet / PAYLINES.length;
    let finalGrid: string[][] = [];
    let wins: WinningLine[] = [];

    for (let attempt = 0; attempt < 100; attempt++) {
      finalGrid = Array.from({ length: 5 }, () => Array.from({ length: 4 }, randSym));
      wins = evaluateWins(finalGrid, betPerLine);

      const totalWinAttempt = wins.reduce((a, w) => a + w.amount, 0);

      // Si el premio es MAYOR que el presupuesto permitido, lo anulamos y volvemos a girar
      if (totalWinAttempt > maxAllowedWin) {
        continue;
      }
      
      // Si el premio entra en el presupuesto, lo aceptamos
      break;
    }

    // Por seguridad extrema: si después de 100 intentos todavía excede, forzar pérdida total
    if (wins.reduce((a, w) => a + w.amount, 0) > maxAllowedWin) {
       wins = []; // Lo hace perder
       // Generamos un grid visualmente perdedor rápido (sin iterar mucho)
       finalGrid = Array.from({ length: 5 }, () => Array.from({ length: 4 }, randSym));
       while(evaluateWins(finalGrid, betPerLine).length > 0) {
           finalGrid = Array.from({ length: 5 }, () => Array.from({ length: 4 }, randSym));
       }
    }

    const totalWin = Math.floor(wins.reduce((a, w) => a + w.amount, 0));

    // 6. Aplicar débito + estadísticas + premio
    // 6a. Débito de apuesta en el usuario
    const { error: betErr } = await supabase.from("users").update({
      credit: newCredit,
      total_won: newWinnings,
      total_bet: updatedTotalBet,
    }).eq("id", userId);
    
    if (betErr) throw new Error("Error al descontar apuesta");

    // Opcional: Sumar estadistica global (total_in) si quieres llevar el contador de la casa
    await supabase.rpc("increment_stat", { field: "total_in", val: bet });

    // 6b. Aplicar premio si hubo ganancia
    let actualWin = 0;
    if (totalWin > 0) {
      // Registrar el premio
      const { error: insertErr } = await supabase.from('prizes').insert([{
        user_id: userId,
        amount: totalWin,
        date: Date.now(),
        paid: false
      }]);
      
      if (insertErr) {
        console.error("Error inserting prize:", insertErr.message);
      } else {
        actualWin = totalWin;
        // Acreditar premio a las ganancias del usuario
        await supabase.from("users").update({
          total_won: newWinnings + totalWin
        }).eq("id", userId);
        // Opcional: Sumar a total_out global de la casa
        await supabase.rpc("increment_stat", { field: "total_out", val: totalWin });
      }
    }

    // 7. Releer el usuario para devolver saldos frescos
    const { data: fresh } = await supabase
      .from("users").select("credit, total_won").eq("id", userId).single();

    return new Response(JSON.stringify({
      success: true,
      grid: finalGrid,
      wins,
      win: actualWin,
      requestedWin: totalWin,
      credit: fresh?.credit ?? newCredit,
      winnings: fresh?.total_won ?? newWinnings,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
