// Auth handler for LangGraph Server — DDR-016, Option A.
// registerAuth duck-type checks for '~handlerCache'; no Auth class to import.
// When AUTH_TOKEN is unset the handler allows all requests (local dev bypass).
export const auth = {
  '~handlerCache': {
    authenticate: async (
      request: Request,
    ): Promise<string | { identity: string; is_authenticated: boolean }> => {
      const token = process.env['AUTH_TOKEN'];
      if (!token) {
        return 'anonymous';
      }
      const authHeader = request.headers.get('Authorization') ?? '';
      const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!bearer || bearer !== token) {
        throw { status: 401, headers: {}, message: 'Unauthorized' };
      }
      return { identity: 'authenticated-user', is_authenticated: true };
    },
    callbacks: {},
  },
};
