export const getAudit = async () => {
    try {
        const mod = await import('./audit.js').catch(() => import('./audit'));
        return mod.logAudit;
    } catch (e) {
        console.error('Failed to load Audit utility:', e);
        return () => Promise.resolve();
    }
};

export const getResend = async () => {
    const key = process.env.RESEND_API_KEY || process.env.VITE_RESEND_API_KEY || '';
    if (!key) return null;
    try {
        const { Resend } = await import('resend');
        return new Resend(key);
    } catch (e) {
        console.error('Failed to load Resend:', e);
        return null;
    }
};

export const getBcrypt = async () => {
    try {
        return await import('bcryptjs');
    } catch (e) {
        console.error('Failed to load Bcrypt:', e);
        return null;
    }
};
