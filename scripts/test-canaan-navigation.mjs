/**
 * Easier navigation in Canaan (Nov 20 2026): clearer menu groups, one place per tool,
 * and one tap to the other PLCC apps. Run: node --test scripts/test-canaan-navigation.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('Canaan navigation', () => {
  const nav = read('lib/simpleNav.tsx');

  it('groups have plain names (no old "Connect" group) and an Admin group', () => {
    assert.match(nav, /label: 'Church life'/);
    assert.ok(!/label: 'Connect',/.test(nav));
    assert.match(nav, /id: 'admin',\s*label: 'Admin'/);
    assert.match(nav, /label: 'Ka Link tools'/);
  });

  it('no duplicate labels in the menu', () => {
    const labels = [...nav.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
    const items = labels.filter((l) => !['Main', 'Attendance', 'Events & check-in', 'Giving', 'Church life', 'Ka Link tools', 'Admin', 'Account'].includes(l));
    const dupes = items.filter((l, i) => items.indexOf(l) !== i);
    assert.deepEqual(dupes, []);
    assert.match(nav, /label: 'Attendance dashboard'/);
  });

  it('Chat is named for where it opens (Ka Link), on the menu and the phone bar', () => {
    assert.match(nav, /label: 'Ka Link \(chat & calls\)', path: '\/community\/chat'/);
    assert.match(read('components/Layout/MobileBottomNav.tsx'), /label: 'Ka Link', path: '\/community\/chat'/);
  });

  it('no More page: its tools are in the menu (Admin) or Settings tabs; old links go Home', () => {
    assert.ok(!/path: '\/more'/.test(nav));
    assert.match(nav, /label: 'Reports & Insights', path: '\/reports'/);
    assert.match(nav, /label: 'Servant Keeper', path: '\/admin\/servant-keeper'/);
    const app = read('App.tsx');
    assert.match(app, /<Route path="\/more" element=\{<Navigate to="\/dashboard" replace \/>\} \/>/);
    assert.ok(!/MorePage/.test(app));
    const perms = read('lib/permissions.ts');
    assert.match(perms, /'\/reports': \[Role\.ADMIN, Role\.PASTOR\]/);
    for (const f of ['pages/admin/BlockedMembers.tsx', 'pages/admin/KaLinkTeam.tsx', 'pages/admin/SignInProblems.tsx', 'pages/admin/KaLinkMusic.tsx', 'pages/admin/Policies.tsx']) {
      assert.ok(!read(f).includes("navigate('/more')"), f);
    }
  });

  it('one tap to other PLCC apps: top bar (bigger screens) and the menu (phones)', () => {
    assert.match(read('components/Layout/Topbar.tsx'), /<AppsMenu isAuthenticated=/);
    const apps = read('components/Layout/AppsMenu.tsx');
    assert.match(apps, /signedInAppUrl\(id, isAuthenticated\)/);
    assert.match(apps, /navigate\('\/launcher'\)/);
    assert.match(nav, /label: 'Other PLCC apps', path: '\/launcher'/);
  });
});
