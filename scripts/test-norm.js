const first = (val) => Array.isArray(val) ? val[0] : val;

function testNormalization(query) {
    const rawResource = first(query.resource);
    const rawSubResource = first(query.subResource);
    const rawType = first(query.type);

    let resource = rawResource;
    let subResource = rawSubResource || rawType;

    console.log(`Input: resource=${rawResource}, subResource=${rawSubResource}`);

    // Legacy Aliasing Logic
    if (!resource || resource === 'chat' || resource === 'prayer' || resource === 'worship') {
        subResource = subResource || resource || rawType;
        resource = 'community';
    } else if (resource === 'forms' || resource === 'reports' || resource === 'submissions' || resource === 'security_logs' || resource === 'followup_templates' || resource === 'followup_workflows') {
        subResource = subResource || resource || rawType;
        resource = 'tools';
    }

    // Normalize subResource for Community
    if (resource === 'community') {
        if (subResource === 'unread-count' || subResource === 'channels' || subResource === 'messages' || subResource === 'dm-channel' || subResource === 'mentors') {
            query.chatType = subResource;
            subResource = 'chat';
        }
        if (!subResource) subResource = 'chat';
    }

    console.log(`Normalized: resource=${resource}, subResource=${subResource}, chatType=${query.chatType}\n`);
}

console.log('--- Test 1: Minutes (no query) ---');
testNormalization({});

console.log('--- Test 2: Minutes (explicit) ---');
testNormalization({ resource: 'minutes' });

console.log('--- Test 3: Unread Count ---');
testNormalization({ resource: 'chat', subResource: 'unread-count' });
