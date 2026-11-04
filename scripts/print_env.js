
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
console.log("DATABASE_URL:", process.env.DATABASE_URL);
console.log("Keys existing:", Object.keys(process.env).filter(k => k.includes('DB') || k.includes('POSTGRES') || k.includes('URL')));
