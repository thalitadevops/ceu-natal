// Ponto de entrada para a Vercel. A lógica fica em server/core.js.
import { handle } from '../server/core.js';

export const GET = (request) => handle('config', request, process.env);
export const POST = (request) => handle('config', request, process.env);
