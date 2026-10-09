// Auth handler for LangGraph Server — DDR-016, Option A.
// registerAuth duck-type checks for '~handlerCache'; no Auth class to import.
// When AUTH_TOKEN is unset: open in dev, fail-closed (500) in production.
import { timingSafeEqual } from 'node:crypto';

export const auth = {
  '~handlerCache': {
    authenticate: async (
      request: Request,
    ): Promise<string | { identity: string; is_authenticated: boolean }> => {
      // CORS preflight must not be blocked — browsers don't send auth on OPTIONS.
      if (request.method === 'OPTIONS') return 'anonymous';
      const token = process.env['AUTH_TOKEN'];
      if (!token) {
        // Fail-closed in production so a missing env var doesn't silently open the API.
        if (process.env['NODE_ENV'] === 'production') {
          throw { status: 500, headers: {}, message: 'AUTH_TOKEN not configured' };
        }
        return 'anonymous';
      }
      const authHeader = request.headers.get('Authorization') ?? '';
      const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      const tokenBuf = Buffer.from(token);
      const bearerBuf = Buffer.from(bearer);
      const valid = bearer.length === token.length && timingSafeEqual(bearerBuf, tokenBuf);
      if (!valid) {
        throw { status: 401, headers: {}, message: 'Unauthorized' };
      }
      return { identity: 'authenticated-user', is_authenticated: true };
    },
    callbacks: {},
  },
};
