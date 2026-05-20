import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, UserPlus, CheckCircle, Wallet, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Settings, BarChart3, TrendingUp, DollarSign, History, RotateCcw } from "lucide-react";
import {
  getUsers, getPrizes, createUser, deleteUser,
  updateUserCredit, withdrawUserBalance, markPrizePaid, markAllPrizesPaid, getStats, getConfig, saveConfig,
  updateMasterReserve,
  resetStats, getStatsHistory, addStatsHistory, clearStatsHistory, deleteAllUsers,
  User, Prize, GlobalStats, CasinoConfig, CHIP_PRICE, StatHistoryEntry
} from "@/lib/store";
import { toast } from "sonner";

const Admin = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [stats, setStats] = useState<GlobalStats>({ totalIn: 0, totalOut: 0, masterReserve: 0 });
  const [config, setConfig] = useState<CasinoConfig>({ targetRTP: 0.1 });
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserCredit, setNewUserCredit] = useState(1000);
  const [newUserBank, setNewUserBank] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statsHistory, setStatsHistory] = useState<StatHistoryEntry[]>([]);
  const [createdUser, setCreatedUser] = useState<{name: string, pass: string} | null>(null);
  const [withdrawUser, setWithdrawUser] = useState<User | null>(null);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [usersData, prizesData, statsData, configData] = await Promise.all([
        getUsers(),
        getPrizes(),
        getStats(),
        getConfig(),
      ]);
      setUsers(usersData);
      setPrizes(prizesData);
      setStats(statsData);
      setConfig(configData);
      setStatsHistory(getStatsHistory());
    } catch (err) {
      if (!silent) toast.error("Error al cargar datos");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Suscripcion en tiempo real - se actualiza solo sin recargar
    import("@/integrations/supabase/client").then(({ supabase }) => {
      const channel = supabase
        .channel("admin-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => loadData(true))
        .on("postgres_changes", { event: "*", schema: "public", table: "prizes" }, () => loadData(true))
        .on("postgres_changes", { event: "*", schema: "public", table: "stats" }, () => loadData(true))
        .subscribe();
      (window as any).__adminChannel = channel;
    });
    return () => {
      const ch = (window as any).__adminChannel;
      if (ch) import("@/integrations/supabase/client").then(({ supabase }) => supabase.removeChannel(ch));
    };
  }, []);

  // Marcar usuarios offline si no se ven hace mas de 30s
  useEffect(() => {
    const interval = setInterval(() => {
      setUsers(prev => prev.map(u => {
        if (u.online && Date.now() - u.last_seen > 30000) {
          return { ...u, online: false };
        }
        return u;
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Polling silencioso cada 5 segundos para mantener estadisticas totalmente frescas mientras juegan
  useEffect(() => {
    const interval = setInterval(() => {
      loadData(true);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserPassword.trim()) {
      toast.error("Debes ingresar nombre y contrasena");
      return;
    }
    const user = await createUser(newUserName.trim(), newUserCredit, newUserPassword.trim(), newUserBank.trim());
    if (user) {
      toast.success(`Usuario '${user.name}' creado con éxito.`);
      setCreatedUser({ name: user.name, pass: newUserPassword });
      setNewUserName("");
      setNewUserPassword("");
      setNewUserCredit(1000);
      setNewUserBank("");
      await loadData();
    } else {
      toast.error("Error al crear usuario. Verifica que el nombre no este duplicado.");
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawUser) return;
    try {
      await withdrawUserBalance(withdrawUser.id);
      toast.success(`Saldo retirado con éxito para ${withdrawUser.name}`);
      setWithdrawUser(null);
      await loadData();
    } catch (err) {
      toast.error("Error al procesar el retiro");
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    const ok = await deleteUser(userId);
    if (ok) {
      toast.success(`Usuario '${userName}' eliminado`);
      await loadData();
    } else {
      toast.error("Error al eliminar usuario");
    }
  };

  const handleAddCredit = async (userId: string, amount: number) => {
    await updateUserCredit(userId, amount);
    toast.success(`+${amount} fichas acreditadas`);
    await loadData();
  };

  const handleMarkPaid = async (prizeId: string, paid: boolean) => {
    await markPrizePaid(prizeId, paid);
    await loadData();
  };

  const handlePayAll = async () => {
    if (!confirm("¿Estás seguro de marcar TODOS los premios pendientes como pagados?")) return;
    setLoading(true);
    await markAllPrizesPaid();
    toast.success("Todos los premios marcados como pagados.");
    await loadData();
    setLoading(false);
  };

  const handleSaveConfig = async () => {
    await saveConfig(config);
    toast.success("Configuracion guardada");
  };

  const handleResetStats = async () => {
    if (confirm("¿Estás seguro de reiniciar todas las estadísticas a cero? Esta acción guardará los datos actuales en el historial.")) {
      const profit = stats.totalIn - stats.totalOut;
      const rtp = stats.totalIn > 0 ? (stats.totalOut / stats.totalIn) * 100 : 0;
      addStatsHistory({
        date: Date.now(),
        totalIn: stats.totalIn,
        totalOut: stats.totalOut,
        profit,
        rtp
      });
      await resetStats();
      toast.success("Estadísticas reiniciadas con éxito");
      loadData();
    }
  };

  const handleClearHistory = () => {
    if (confirm("¿Estás seguro de eliminar todo el historial de estadísticas?")) {
      clearStatsHistory();
      setStatsHistory([]);
      toast.success("Historial eliminado");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado al portapapeles");
  };

  const pendingPrizes = prizes.filter(p => !p.paid);
  const paidPrizes = prizes.filter(p => p.paid);
  const totalPendingAmount = pendingPrizes.reduce((sum, p) => sum + p.amount, 0);

  const filteredUsers = users.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user ? user.name : userId;
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-black uppercase tracking-tight">Monero Slot Web 3 / Panel de Administracion </h1>
          <p className="text-muted-foreground mt-1"> Gestion de usuarios, premios y configuracion</p>
        </div>

        {loading && (
          <div className="text-center py-8 text-muted-foreground">Cargando datos...</div>
        )}





        <Tabs defaultValue="users">
          <TabsList className="mb-6 grid grid-cols-4 w-full max-w-lg">
            <TabsTrigger value="users"><UserPlus className="w-4 h-4 mr-1" />Usuarios</TabsTrigger>
            <TabsTrigger value="prizes"><DollarSign className="w-4 h-4 mr-1" />Premios</TabsTrigger>
            <TabsTrigger value="stats"><BarChart3 className="w-4 h-4 mr-1" />Stats</TabsTrigger>
            <TabsTrigger value="config"><Settings className="w-4 h-4 mr-1" />Config</TabsTrigger>
          </TabsList>

          {/* TAB USUARIOS */}
          <TabsContent value="users">


            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Lista de Usuarios ({filteredUsers.length})</CardTitle>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" onClick={() => loadData()}>Recargar</Button>
                  </div>
                </div>
                <div className="w-full max-w-sm ml-4">
                  <Input 
                    placeholder="Buscar por nombre de usuario..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Billetera</TableHead>
                      <TableHead>Billetera Conectada</TableHead>
                      <TableHead>Fichas</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Online</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map(u => {
                      const pass = u.wallet_address || '123456';
                      const isWallet = pass.startsWith('0x') && pass.length > 20;
                      const displayPass = isWallet ? `${pass.slice(0, 6)}...${pass.slice(-4)}` : pass;
                      return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs">{u.id.toString().slice(0, 8)}</span>
                            <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copyToClipboard(u.id.toString())}>
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="font-bold">{u.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded">{displayPass}</span>
                            <Button size="icon" variant="ghost" className="h-5 w-5" title="Copiar Billetera" onClick={() => copyToClipboard(pass)}>
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          {u.bank_info ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded max-w-[150px] truncate">{u.bank_info}</span>
                              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copyToClipboard(u.bank_info || '')}>
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">No cargado</span>
                          )}
                        </TableCell>
                        <TableCell>{u.credit}</TableCell>
                        <TableCell>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${u.active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {u.active ? 'ACTIVO' : 'INACTIVO'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${u.online ? 'bg-blue-500/20 text-blue-400' : 'bg-muted text-muted-foreground'}`}>
                            {u.online ? 'EN LINEA' : 'OFFLINE'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="destructive"><Trash2 className="w-3 h-3 mr-1" />Eliminar</Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Eliminar usuario</DialogTitle>
                                  <DialogDescription>Esta accion no se puede deshacer. Se eliminaran todos sus premios.</DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                  <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                                  <DialogClose asChild>
                                    <Button variant="destructive" onClick={() => handleDeleteUser(u.id, u.name)}>Eliminar</Button>
                                  </DialogClose>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB PREMIOS */}
          <TabsContent value="prizes">
            <Card className="mb-4">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Premios Pendientes ({pendingPrizes.length})</CardTitle>
                  <CardDescription>Total pendiente: {totalPendingAmount.toLocaleString()} fichas ({(totalPendingAmount * CHIP_PRICE).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT)</CardDescription>
                </div>
                {pendingPrizes.length > 0 && (
                  <Button onClick={handlePayAll} variant="default" className="bg-green-600 hover:bg-green-700 text-white font-black">
                    PAGAR A TODOS
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Pagado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingPrizes.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-bold">{getUserName(p.user_id)}</TableCell>
                        <TableCell>{p.amount.toLocaleString()} fichas ({(p.amount * CHIP_PRICE).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT)</TableCell>
                        <TableCell>{new Date(p.date).toLocaleString('es-AR')}</TableCell>
                        <TableCell>
                          <Checkbox
                            checked={p.paid}
                            onCheckedChange={(checked) => handleMarkPaid(p.id, !!checked)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {pendingPrizes.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Sin premios pendientes</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Premios Pagados ({paidPrizes.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paidPrizes.slice(0, 20).map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-bold">{getUserName(p.user_id)}</TableCell>
                        <TableCell>{p.amount.toLocaleString()} fichas ({(p.amount * CHIP_PRICE).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT)</TableCell>
                        <TableCell>{new Date(p.date).toLocaleString('es-AR')}</TableCell>
                        <TableCell><CheckCircle className="w-4 h-4 text-green-400" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB STATS */}
          <TabsContent value="stats">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-black">Estadísticas Globales</h2>
              <Button onClick={handleResetStats} variant="destructive" className="font-bold gap-2">
                <RotateCcw className="w-4 h-4" />
                Reiniciar Estadísticas
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-primary"><Wallet className="w-5 h-5" />Reserva Global</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-2xl font-black text-primary">{stats.masterReserve.toLocaleString()} fichas</p>
                  <p className="text-sm font-bold text-success mt-1">{(stats.masterReserve * CHIP_PRICE).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT</p>
                  <p className="text-xs font-bold text-muted-foreground mt-1">Soporte para premios</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5" />Total Apostado</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-xl font-black">{stats.totalIn.toLocaleString()} fichas</p>
                  <p className="text-sm font-bold text-success mt-1">{(stats.totalIn * CHIP_PRICE).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5" />Total Pagado</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-xl font-black">{stats.totalOut.toLocaleString()} fichas</p>
                  <p className="text-sm font-bold text-success mt-1">{(stats.totalOut * CHIP_PRICE).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT</p>
                </CardContent>
              </Card>
              <Card className="border-warning/50 bg-warning/5">
                <CardHeader><CardTitle className="flex items-center gap-2 text-warning"><DollarSign className="w-5 h-5" />Ganancias</CardTitle></CardHeader>
                <CardContent>
                  <p className={`text-xl font-black ${stats.totalIn - stats.totalOut >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {(stats.totalIn - stats.totalOut).toLocaleString()} fichas
                  </p>
                  <p className={`text-sm font-bold mt-1 ${stats.totalIn - stats.totalOut >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {((stats.totalIn - stats.totalOut) * CHIP_PRICE).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" />RTP Real</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-2xl font-black">
                    {stats.totalIn > 0 ? ((stats.totalOut / stats.totalIn) * 100).toFixed(1) : 0}%
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* GESTIÓN DE RESERVA */}
            <Card className="mb-8 border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Wallet className="w-5 h-5 text-primary" />Gestión de Reserva de Premios</CardTitle>
                <CardDescription>Añade fichas a la reserva para permitir que el casino entregue premios grandes.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-4">
                <div className="flex-1 max-w-xs">
                  <Input 
                    type="number" 
                    id="reserveAmount" 
                    placeholder="Cantidad a añadir..." 
                    className="bg-background"
                  />
                </div>
                <Button 
                  className="font-black bg-primary hover:bg-primary/90"
                  onClick={async () => {
                    const input = document.getElementById('reserveAmount') as HTMLInputElement;
                    const val = Number(input.value);
                    if (val === 0) return;
                    await updateMasterReserve(val);
                    toast.success(`Reserva actualizada: ${val > 0 ? '+' : ''}${val} fichas`);
                    input.value = "";
                    loadData();
                  }}
                >
                  ACTUALIZAR RESERVA
                </Button>
                <p className="text-[10px] text-muted-foreground italic flex-1">
                  * 10 fichas equivalen a 1 USDT. Si recargas 100 USDT en tu billetera real, deberías añadir 1000 fichas aquí.
                </p>
              </CardContent>
            </Card>

            {/* Historial */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><History className="w-5 h-5" />Historial de Reinicios</CardTitle>
                  <CardDescription>Registro de las estadísticas antes de cada reinicio</CardDescription>
                </div>
                {statsHistory.length > 0 && (
                  <Button onClick={handleClearHistory} variant="outline" size="sm" className="text-destructive hover:bg-destructive/10">
                    Limpiar Historial
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Apostado</TableHead>
                      <TableHead>Pagado</TableHead>
                      <TableHead>Ganancia</TableHead>
                      <TableHead>RTP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statsHistory.map(h => (
                      <TableRow key={h.id}>
                        <TableCell>{new Date(h.date).toLocaleString('es-AR')}</TableCell>
                        <TableCell>{h.totalIn.toLocaleString()} fichas ({(h.totalIn * CHIP_PRICE).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT)</TableCell>
                        <TableCell>{h.totalOut.toLocaleString()} fichas ({(h.totalOut * CHIP_PRICE).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT)</TableCell>
                        <TableCell className={h.profit >= 0 ? 'text-success font-bold' : 'text-destructive font-bold'}>
                          {h.profit > 0 ? '+' : ''}{h.profit.toLocaleString()} fichas ({(h.profit * CHIP_PRICE).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT)
                        </TableCell>
                        <TableCell>{h.rtp.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                    {statsHistory.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                          No hay registros en el historial
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB CONFIG */}
          <TabsContent value="config">
            <Card>
              <CardHeader>
                <CardTitle>Configuracion del Casino</CardTitle>
                <CardDescription>Ajusta el RTP objetivo del sistema.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest mb-1 block">RTP Objetivo (0.01 = 1%, 0.1 = 10%)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={config.targetRTP}
                    onChange={e => setConfig({ ...config, targetRTP: Number(e.target.value) })}
                    className="max-w-xs"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Valor actual: {(config.targetRTP * 100).toFixed(0)}% de retorno al jugador</p>
                </div>
                <Button onClick={handleSaveConfig} className="font-black">GUARDAR CONFIGURACION</Button>
              </CardContent>
            </Card>
            <Card className="border-destructive/30 bg-destructive/5 mt-8">
              <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                  <Trash2 className="w-5 h-5" /> Zona de Peligro
                </CardTitle>
                <CardDescription>
                  Estas acciones son permanentes y no se pueden deshacer.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center justify-between p-4 bg-background rounded-xl border">
                  <div>
                    <p className="font-bold">Borrar Todos los Usuarios</p>
                    <p className="text-xs text-muted-foreground">Elimina todas las cuentas de usuario y sus historiales de premios.</p>
                  </div>
                  <Button 
                    variant="destructive" 
                    onClick={async () => {
                      if (confirm("¿ESTÁS SEGURO? Esto eliminará TODOS los usuarios y sus premios permanentemente.")) {
                        const success = await deleteAllUsers();
                        if (success) {
                          toast.success("Sistema reiniciado con éxito.");
                          loadData();
                        } else {
                          toast.error("Error al reiniciar el sistema.");
                        }
                      }
                    }}
                  >
                    REINICIAR SISTEMA
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// Subcomponente para dialog de carga de fichas
const CreditDialog = ({ user, onAdd }: { user: User; onAdd: (id: string, amount: number) => void }) => {
  const [amount, setAmount] = useState(1000);
  return (
    <div className="space-y-4 py-2">
      <Input
        type="number"
        value={amount}
        onChange={e => setAmount(Number(e.target.value))}
        placeholder="Cantidad de fichas"
      />
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancelar</Button>
        </DialogClose>
        <DialogClose asChild>
          <Button onClick={() => onAdd(user.id, amount)} className="font-black">
            ACREDITAR {amount} FICHAS
          </Button>
        </DialogClose>
      </DialogFooter>
    </div>
  );
};

export default Admin;
