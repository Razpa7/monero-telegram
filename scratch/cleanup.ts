import { deleteAllUsers } from './src/lib/store';

async function cleanup() {
  console.log('Iniciando borrado total de usuarios...');
  const success = await deleteAllUsers();
  if (success) {
    console.log('¡Éxito! Todos los usuarios y premios han sido eliminados.');
  } else {
    console.log('Hubo un error al intentar borrar los datos.');
  }
}

cleanup();
