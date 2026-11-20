/** Nov 20 2026: the PLCC ONE bell opens your alerts (not the Settings page). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const home = readFileSync(join(root, 'components/awcone/PlccOneHome.tsx'), 'utf8');
describe('PLCC ONE bell', () => {
  it('opens the notifications list in place, with an unread dot', () => {
    assert.ok(!home.includes("navigate('/notifications')"), 'no jump to Settings');
    assert.match(home, /<PlccNotificationBell \/>/);
    assert.match(home, /<NotificationDrawer\s+isOpen=\{open\}/);
    assert.match(home, /fetchAuthorized\('\/api\/vault\?resource=notifications'\)/);
    assert.match(home, /unread > 0 \? \(/);
  });
});
