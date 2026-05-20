import { supabase } from './supabase';

// 1 ficha = 0.10 USDT  →  10 fichas = 1 USDT
export const CHIP_PRICE = 0.10;

export type User = {
  id: string;
  name: string;
  credit: number;
  total_won: number;
  avatar_url?: string;
  wallet_address?: string;
  online?: boolean;
  last_seen?: number;
  last_deposit?: number;
  created_at?: number;
  active?: boolean;
  session_token?: string;
  total_bet?: number;
  total_deposited?: number;
  bank_info?: string;
};

export type Prize = {
  id: string;
  user_id: string;
  amount: number;
  date: number;
  paid: boolean;
};

export interface GlobalStats {
  totalIn: number;
  totalOut: number;
  masterReserve: number;
}

export type StatHistoryEntry = {
  id: string;
  date: number;
  totalIn: number;
  totalOut: number;
  profit: number;
  rtp: number;
};

export type CasinoConfig = {
  targetRTP: number;
};

// ─── USUARIOS ───────────────────────────────────────────────

export const getUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase.from('users').select('*').order('total_won', { ascending: false });
  if (error) { console.error('getUsers error:', error.message); return []; }
  return data as User[];
};

export const getTopWinners = async (): Promise<User[]> => {
  const { data, error } = await supabase
    .from('users')
    .select('name, total_won, avatar_url')
    .gt('total_won', 0)
    .order('total_won', { ascending: false })
    .limit(5);
  
  if (error) { console.error('getTopWinners error:', error.message); return []; }
  return (data ?? []) as any[];
};

export const updateAvatar = async (userId: string, avatarUrl: string): Promise<boolean> => {
  const { error } = await supabase
    .from('users')
    .update({ avatar_url: avatarUrl } as any)
    .eq('id', userId);
  return !error;
};

export const createUser = async (
  name: string,
  initialCredit: number = 1000,
  password: string = '123456',
  bankInfo: string = ''
): Promise<User | null> => {
  const trimmedUser = name.trim();
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .ilike('name', trimmedUser)
    .single();

  if (existingUser) {
    console.error('createUser error: Usuario ya existe');
    return null; // O podríamos lanzar un error para que la UI lo atrape
  }

  // Intentamos crear con las columnas nuevas, si falla reintentamos sin ellas
  const { data, error } = await supabase
    .from('users')
    .insert([{
      name: trimmedUser,
      credit: initialCredit,
      online: false,
      last_seen: Date.now(),
      last_deposit: Date.now(),
      created_at: Date.now(),
      wallet_address: password,
      active: true,
      total_deposited: initialCredit,
      total_bet: 0,
      total_won: 0,
      avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(trimmedUser)}`,
      bank_info: bankInfo,
    } as any])
    .select()
    .single();

  if (error) {
    console.warn('createUser intentando sin columnas de stats:', error.message);
    const { data: dataFallback, error: errorFallback } = await supabase
      .from('users')
      .insert([{
        name: trimmedUser,
        credit: initialCredit,
        online: false,
        last_seen: Date.now(),
        last_deposit: Date.now(),
        created_at: Date.now(),
        wallet_address: password,
        active: true,
        avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(trimmedUser)}`,
        bank_info: bankInfo, // Intentamos guardar el banco incluso en el fallback
      } as any])
      .select()
      .single();
    
    if (errorFallback) {
      console.warn('createUser segundo intento sin bank_info...');
      const { data: dataFinal, error: errorFinal } = await supabase
        .from('users')
        .insert([{
          name: trimmedUser,
          credit: initialCredit,
          online: false,
          last_seen: Date.now(),
          last_deposit: Date.now(),
          created_at: Date.now(),
          wallet_address: password,
          active: true,
        }])
        .select()
        .single();
      
      if (errorFinal) { console.error('createUser error fatal:', errorFinal.message); return null; }
      return dataFinal as User;
    }
    return dataFallback as User;
  }
  return data as User;
};

export const deleteUser = async (userId: string): Promise<boolean> => {
  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) { console.error('deleteUser error:', error.message); return false; }
  await supabase.from('prizes').delete().eq('user_id', userId);
  return true;
};

export const deleteAllUsers = async (): Promise<boolean> => {
  // Eliminar todos los premios
  await supabase.from('prizes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  // Eliminar todos los usuarios
  const { error } = await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) { console.error('deleteAllUsers error:', error.message); return false; }
  return true;
};

export const updateWalletAddress = async (userId: string, newWallet: string): Promise<boolean> => {
  const { error } = await supabase
    .from('users')
    .update({ wallet_address: newWallet })
    .eq('id', userId);
  if (error) { console.error('updateWalletAddress error:', error.message); return false; }
  return true;
};

export const loginUser = async (
  username: string,
  pass: string
): Promise<{ success: boolean; user?: User; error?: string; requireOverride?: boolean; tempToken?: string }> => {
  const trimmedUser = username.trim().toLowerCase();
  const trimmedPass = pass.trim();

  // PASO 1: buscar por nombre (case-insensitive)
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .ilike('name', trimmedUser);

  if (error) {
    console.error('loginUser error:', error.message);
    return { success: false, error: 'Error al conectar con la base de datos.' };
  }

  const user = users?.[0] as User | undefined;

  if (!user) {
    return { success: false, error: 'El usuario no existe. Verifica tu nombre de usuario.' };
  }

  // PASO 2: verificar billetera/clave
  if (user.wallet_address?.trim() !== trimmedPass) {
    return { success: false, error: 'Credenciales incorrectas.' };
  }

  // PASO 3: verificar cuenta activa
  if (user.active === false) {
    return { success: false, error: 'Tu cuenta esta inactiva. Contacta al administrador.' };
  }

  // PASO 4: verificar inactividad (30 dias sin actividad alguna)
  const INACTIVITY_LIMIT = 30 * 24 * 60 * 60 * 1000;
  const lastActivity = Math.max(user.last_deposit || 0, user.last_seen || 0, user.created_at || 0);
  if (lastActivity > 0 && Date.now() - lastActivity > INACTIVITY_LIMIT) {
    return { success: false, error: 'Tu cuenta fue cerrada por inactividad de 30 dias. Contacta al administrador.' };
  }

  // PASO 5: verificar inicio de sesion simultaneo
  // Solo bloquear si la sesion sigue ACTIVA (last_seen en los ultimos 2 minutos).
  // Si no, asumimos que el usuario cerro el navegador y permitimos entrar normal.
  const SESSION_ACTIVE_WINDOW = 2 * 60 * 1000;
  const sessionIsLive = user.online && user.session_token && (Date.now() - (user.last_seen || 0) < SESSION_ACTIVE_WINDOW);
  if (sessionIsLive) {
    const tempToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    return { success: false, requireOverride: true, tempToken, user };
  }

  // Login exitoso
  const sessionToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  await supabase
    .from('users')
    .update({ online: true, last_seen: Date.now(), session_token: sessionToken })
    .eq('id', user.id);

  return { success: true, user: { ...user, session_token: sessionToken } };
};

export const forceLogin = async (userId: string, tempToken: string): Promise<void> => {
  await supabase
    .from('users')
    .update({ online: true, last_seen: Date.now(), session_token: tempToken })
    .eq('id', userId);
};

export const loginWithWallet = async (
  walletAddress: string
): Promise<{ success: boolean; user?: User; error?: string; notFound?: boolean }> => {
  console.log('Iniciando loginWithWallet para:', walletAddress);
  
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .eq('wallet_address', walletAddress.toLowerCase());

  if (error) {
    console.error('Error de Supabase en loginWithWallet:', error);
    return { success: false, error: `Error DB: ${error.message}` };
  }

  if (!users || users.length === 0) {
    console.log('No se encontró usuario con la billetera:', walletAddress);
    return { success: false, error: 'Usuario no encontrado', notFound: true };
  }

  const user = users[0] as User;
  console.log('Usuario encontrado con billetera:', user.name);

  if (user.active === false) {
    return { success: false, error: 'Tu cuenta esta inactiva.' };
  }

  const sessionToken = Math.random().toString(36).substring(2, 15);
  await supabase
    .from('users')
    .update({ online: true, last_seen: Date.now(), session_token: sessionToken })
    .eq('id', user.id);

  return { success: true, user: { ...user, session_token: sessionToken } };
};

export const registerWalletUser = async (
  name: string,
  walletAddress: string
): Promise<{ success: boolean; user?: User; error?: string }> => {
  const trimmedName = name.trim();
  const lowerWallet = walletAddress.toLowerCase();
  
  // 1. PRIMERO: Verificar si la billetera YA está vinculada a algun usuario
  const { data: walletUser } = await supabase
    .from('users')
    .select('*')
    .eq('wallet_address', lowerWallet)
    .maybeSingle();

  if (walletUser) {
    console.log('Billetera ya vinculada a:', walletUser.name);
    return await loginWithWallet(lowerWallet);
  }

  // 2. Si la billetera es nueva, verificar si el nombre ya existe
  const { data: existingUser } = await supabase
    .from('users')
    .select('*')
    .ilike('name', trimmedName)
    .maybeSingle();

  if (existingUser) {
    // Si el usuario existe y ya tiene OTRA billetera, no dejamos entrar
    const currentWallet = existingUser.wallet_address;
    if (currentWallet && currentWallet.startsWith('0x') && currentWallet.length > 30) {
      return { success: false, error: 'Este nombre de usuario ya está vinculado a otra billetera.' };
    }

    // Si existe pero no tiene billetera (usuario legacy), vinculamos esta nueva billetera
    console.log('Vinculando billetera nueva a cuenta legacy:', trimmedName);
    const { error: updateError } = await supabase
      .from('users')
      .update({ wallet_address: lowerWallet })
      .eq('id', existingUser.id);

    if (updateError) {
      return { success: false, error: `Error al vincular: ${updateError.message}` };
    }
    
    return await loginWithWallet(lowerWallet);
  }

  // 3. Si todo es nuevo, crear usuario
  const result = await createUser(trimmedName, 0, lowerWallet, lowerWallet);
  if (!result) {
    return { success: false, error: 'Error al crear el usuario. Intenta con otro nombre.' };
  }
  
  return await loginWithWallet(lowerWallet);
};

export const validateUser = async (id: string): Promise<User | null> => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as User;
};

export const initUser = async (userId: string, localSessionToken?: string): Promise<User | null> => {
  const user = await validateUser(userId);
  if (!user) return null;

  // Inactividad de 30 dias en lugar de 7, basada en cualquier actividad
  const INACTIVITY_LIMIT = 30 * 24 * 60 * 60 * 1000;
  const lastActivity = Math.max(user.last_deposit || 0, user.last_seen || 0, user.created_at || 0);
  if (lastActivity > 0 && Date.now() - lastActivity > INACTIVITY_LIMIT) {
    return null;
  }
  if (user.active === false) return null;

  // Solo expulsar si hay otro token Y la otra sesion sigue viva (last_seen < 2 min)
  const SESSION_ACTIVE_WINDOW = 2 * 60 * 1000;
  if (
    localSessionToken &&
    user.session_token &&
    user.session_token !== localSessionToken &&
    Date.now() - (user.last_seen || 0) < SESSION_ACTIVE_WINDOW
  ) {
    return null;
  }

  await supabase
    .from('users')
    .update({ online: true, last_seen: Date.now() })
    .eq('id', userId);

  return { ...user, online: true, last_seen: Date.now() };
};

export const setOffline = async (userId: string): Promise<void> => {
  await supabase
    .from('users')
    .update({ online: false, last_seen: Date.now() })
    .eq('id', userId);
};

export const updateUserCredit = async (userId: string, amountChange: number): Promise<void> => {
  const user = await validateUser(userId);
  if (!user) return;
  const update: Partial<User> = { credit: user.credit + amountChange };
  if (amountChange > 0) {
    update.last_deposit = Date.now();
    update.total_deposited = (user.total_deposited || 0) + amountChange;
  }
  
  const { error } = await supabase.from('users').update(update as any).eq('id', userId);
  if (error && amountChange > 0) {
    await supabase.from('users').update({ 
      credit: user.credit + amountChange,
      last_deposit: Date.now() 
    }).eq('id', userId);
  }
};

export const withdrawUserBalance = async (userId: string): Promise<void> => {
  const user = await validateUser(userId);
  if (!user) return;
  
  // 1. Ponemos el crédito y ganancias en 0
  await supabase.from('users').update({ 
    credit: 0,
    total_won: 0,
    online: false 
  }).eq('id', userId);
  
  // 2. Marcamos TODOS sus premios como PAGADOS
  const { error } = await supabase
    .from('prizes')
    .update({ paid: true })
    .eq('user_id', userId);
    
  if (error) {
    console.error('Error al marcar premios como pagados:', error.message);
  }

  console.log(`Usuario ${user.name} retiró ${user.credit} fichas. Todos los premios marcados como pagados.`);
};

// ─── PREMIOS ────────────────────────────────────────────────

export const getPrizes = async (): Promise<Prize[]> => {
  const { data, error } = await supabase
    .from('prizes')
    .select('*')
    .order('date', { ascending: false });
  if (error) { console.error('getPrizes error:', error.message); return []; }
  return data as Prize[];
};

export const addPrize = async (userId: string, amount: number): Promise<void> => {
  await supabase.from('prizes').insert([{
    user_id: userId,
    amount,
    date: Date.now(),
    paid: false,
  }]);
};

export const markPrizePaid = async (prizeId: string, paid: boolean): Promise<void> => {
  await supabase.from('prizes').update({ paid }).eq('id', prizeId);
};

export const markAllPrizesPaid = async (): Promise<void> => {
  await supabase.from('prizes').update({ paid: true }).eq('paid', false);
};

// ─── ESTADISTICAS GLOBALES ──────────────────────────────────

export const getStats = async (): Promise<GlobalStats> => {
  const { data } = await supabase
    .from('stats')
    .select('*')
    .eq('id', 1)
    .single();
  const d = data as any;
  return d ? {
    totalIn: d.total_in,
    totalOut: d.total_out,
    masterReserve: d.master_reserve || 0
  } : { totalIn: 0, totalOut: 0, masterReserve: 0 };
};

export const updateMasterReserve = async (amount: number): Promise<void> => {
  await supabase.rpc('increment_stat', { field: 'master_reserve', val: amount });
};

// recordBet / recordWin eliminados: la única vía para mutar saldo es la edge function `spin`.

// ─── SPIN SERVER-AUTHORITATIVE ──────────────────────────────
// El servidor genera el grid y calcula el premio. El cliente solo anima.
export type SpinResult = {
  success: boolean;
  grid: string[][];
  wins: { lineIdx: number; cells: [number, number][]; amount: number }[];
  win: number;
  requestedWin: number;
  credit: number;
  winnings: number;
  error?: string;
};

export const playSpin = async (
  userId: string,
  bet: number,
  sessionToken?: string
): Promise<SpinResult> => {
  const { data, error } = await supabase.functions.invoke('spin', {
    body: { userId, bet, sessionToken },
  });
  if (error || !data?.success) {
    return {
      success: false,
      grid: [], wins: [], win: 0, requestedWin: 0, credit: 0, winnings: 0,
      error: data?.error || error?.message || 'Error en la tirada',
    };
  }
  return data as SpinResult;
};

export const resetStats = async (): Promise<void> => {
  await supabase.from('stats').update({ total_in: 0, total_out: 0 }).eq('id', 1);
};

export const getStatsHistory = (): StatHistoryEntry[] => {
  const h = localStorage.getItem('monero_stats_history');
  return h ? JSON.parse(h) : [];
};

export const addStatsHistory = (entry: Omit<StatHistoryEntry, 'id'>) => {
  const h = getStatsHistory();
  h.unshift({ ...entry, id: Math.random().toString(36).substr(2, 9) });
  localStorage.setItem('monero_stats_history', JSON.stringify(h));
};

export const clearStatsHistory = () => {
  localStorage.removeItem('monero_stats_history');
};

// ─── CONFIGURACION CASINO ───────────────────────────────────

export const getConfig = async (): Promise<CasinoConfig> => {
  const { data } = await supabase
    .from('config')
    .select('*')
    .eq('id', 1)
    .single();
  return data ? { targetRTP: data.target_rtp } : { targetRTP: 0.1 };
};

export const saveConfig = async (config: CasinoConfig): Promise<void> => {
  await supabase
    .from('config')
    .upsert({ id: 1, target_rtp: config.targetRTP });
};
