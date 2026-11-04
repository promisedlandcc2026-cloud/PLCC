import handler from './api/_utils/core.js';
import dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });

async function repro() {
    const req = {
        method: 'GET',
        url: '/api/vault?resource=events&subResource=checkin&query=Mahabir',
        query: {
            resource: 'events',
            subResource: 'checkin',
            query: 'Mahabir'
        },
        headers: {}
    };

    const res = {
        status: (code) => {
            console.log('Status:', code);
            return res;
        },
        json: (data) => {
            console.log('JSON Output:', JSON.stringify(data, null, 2));
            return res;
        },
        end: () => {
            console.log('Response ended');
            return res;
        }
    };

    try {
        await handler(req, res);
    } catch (err) {
        console.error('Handler crashed:', err);
    }
}

repro();
