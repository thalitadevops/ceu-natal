// Ponto de entrada para a Vercel. A lógica fica em server/core.js.
import { handle } from '../server/core.js';

export const GET = (request) => handle('checkout', request, process.env);
export const POST = (request) => handle('checkout', request, process.env);
