## Objetivo

Cerrar el último flanco de la arquitectura Server-Authoritative: que el cliente no exponga funciones capaces de mutar saldo/premios, y que no quede RNG en la página del juego.

## Cambios

### 1. `src/lib/store.ts` — eliminar funciones inseguras

- Borrar `recordBet` (líneas ~485-508).
- Borrar `recordWin` (líneas ~514-530).
- Borrar las constantes `MASTER_WALLET` y `USDT_ADDRESS` que sólo servían como comentario en ese bloque (no se usan en ninguna otra parte del cliente).

Verificado: ningún archivo de `src/` importa estas funciones. La única vía para descontar apuesta y acreditar premio queda la edge function `spin` (vía `playSpin`).

Nota: el RPC `process_win_with_reserve` seguirá existiendo en la base de datos porque la edge function lo invoca con la service role key. Si quieres además revocar el `EXECUTE` para el rol `anon`/`authenticated` desde el SQL, lo podemos hacer en una migración aparte (recomendado como segunda capa de defensa, pero fuera del alcance de esta tarea).

### 2. `src/pages/Index.tsx` — quitar RNG local

- Eliminar `const randSym = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];` (línea 16).
- Reemplazar los dos usos cosméticos por una función pura sin RNG (`fillerSym(i)` que cicla sobre `SYMBOLS`), que sólo sirve para llenar los rodillos durante la animación de giro:
  - Línea 405 (estado inicial de `reels`): grid 5x4 inicial determinístico.
  - Línea 586 (relleno largo durante el spin): 5x12 cíclico.

El resultado real del giro sigue viniendo de `result.grid` del servidor; estos símbolos sólo son blur visual mientras los rodillos giran.

## Validación

- `rg "recordBet|recordWin|randSym" src` debe devolver vacío.
- Build limpio sin errores TS.
- Tirada en el preview: el grid final debe seguir siendo el del servidor y el saldo sincronizarse con `result.credit` / `result.winnings`.
