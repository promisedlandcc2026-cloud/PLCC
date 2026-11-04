import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import express from 'express';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
config({ path: join(__dirname, '.env.local') });

const app = express();
const PORT = 5001;

// Middleware
app.use(cors());
// LiveKit webhooks use application/webhook+json and require the raw body for signature checks.
app.use(
    express.json({
        type: ['application/json', 'application/webhook+json'],
        verify: (req, _res, buf) => {
            const url = String(req.originalUrl || req.url || '');
            if (url.includes('livekit-webhook')) {
                (req).rawBody = buf.toString('utf8');
            }
        },
    })
);
app.use(express.urlencoded({ extended: true }));

// Log all requests
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// API route handler using middleware
app.use('/api', async (req, res) => {
    try {
        const apiPath = req.path.substring(1); // Remove leading /
        const pathParts = apiPath.split('/').filter(p => p && !p.includes('?'));

        console.log(`Loading API handler for path: ${apiPath}`);
        console.log(`Path parts:`, pathParts);

        // Try different possible file locations
        let handlerPath = null;

        // Option 0: /api/module.ts (e.g., /api/vault.ts)
        const directPath = join(__dirname, 'api', `${pathParts[0]}.ts`);
        if (existsSync(directPath)) {
            handlerPath = directPath;
            console.log(`Found handler at: ${directPath}`);
        }

        // Option 1: /api/module/index.ts (e.g., /api/tools/index.ts)
        if (!handlerPath) {
            const indexPath = join(__dirname, 'api', pathParts[0], 'index.ts');
            if (existsSync(indexPath)) {
                handlerPath = indexPath;
                console.log(`Found handler at: ${indexPath}`);
            }
        }

        // Option 2: /api/module/submodule.ts (e.g., /api/auth/login.ts)
        if (!handlerPath && pathParts.length > 1) {
            const subPath = join(__dirname, 'api', pathParts[0], `${pathParts[1]}.ts`);
            if (existsSync(subPath)) {
                handlerPath = subPath;
                console.log(`Found handler at: ${subPath}`);
            }
        }

        if (!handlerPath) {
            // Match production rewrite: unknown /api/* routes go through vault
            const vaultPath = join(__dirname, 'api', 'vault.ts');
            if (existsSync(vaultPath) && pathParts[0] !== 'servant-keeper') {
                handlerPath = vaultPath;
                console.log(`Falling back to vault handler for: ${apiPath}`);
            }
        }

        if (!handlerPath) {
            console.error(`No handler found for: ${apiPath}`);
            return res.status(404).json({ error: 'API endpoint not found' });
        }

        // Import the handler module
        const module = await import(handlerPath);
        const handler = module.default;

        if (typeof handler !== 'function') {
            console.error(`Invalid handler at ${handlerPath}`);
            return res.status(500).json({ error: 'Invalid API handler' });
        }

        console.log(`Executing handler from: ${handlerPath}`);

        // Execute the handler with Vercel-style request/response
        await handler(req, res);
    } catch (error) {
        console.error('API Error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                ok: false,
                error: error.message,
                stack: error.stack
            });
        }
    }
});

app.listen(PORT, () => {
    console.log(`\n🚀 Dev API Server running on http://localhost:${PORT}`);
    console.log(`   Ready to handle /api/* requests\n`);
    console.log(`Environment check:`);
    console.log(`  VITE_SUPABASE_URL: ${process.env.VITE_SUPABASE_URL ? '✓' : '✗'}`);
    console.log(`  SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗'}\n`);
});
