import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The frontend now talks to the Django backend rather than Gemini directly,
 * so the GEMINI_API_KEY is no longer injected into client bundles. The only
 * env vars the FE cares about are:
 *   - VITE_API_BASE_URL: where the backend lives (default localhost:8000/api)
 *   - VITE_DEFAULT_INSTITUTE_SLUG: tenant slug for dev (subdomain in prod)
 */
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
        server: {
            port: 3000,
            host: '0.0.0.0',
        },
        plugins: [react()],
        define: {
            'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
                env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1',
            ),
            'import.meta.env.VITE_DEFAULT_INSTITUTE_SLUG': JSON.stringify(
                env.VITE_DEFAULT_INSTITUTE_SLUG || 'default',
            ),
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            },
        },
    };
});
