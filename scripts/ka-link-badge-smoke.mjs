// Ka Link name badges (Nov 27, 2026). Run: npx tsx scripts/ka-link-badge-smoke.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mod from '../api/_utils/kaLinkBadge.ts';
const { kaLinkBadge } = mod;

describe('Ka Link badges', () => {
  it('a title wins over the role', () => {
    assert.equal(kaLinkBadge('SUPER_ADMIN', 'Apostle'), 'Apostle');
    assert.equal(kaLinkBadge('SUPER_ADMIN', 'Pastor'), 'Pastor');
    assert.equal(kaLinkBadge('MEMBER', 'Ps. Grace'), 'Pastor');
    assert.equal(kaLinkBadge('ADMIN', 'Bishop'), 'Bishop');
  });
  it('Super Admins without a title show Super Admin; others get none', () => {
    assert.equal(kaLinkBadge('SUPER_ADMIN', ''), 'Super Admin');
    assert.equal(kaLinkBadge('SUPER_ADMIN', null), 'Super Admin');
    assert.equal(kaLinkBadge('PASTOR', null), 'Pastor');
    assert.equal(kaLinkBadge('ADMIN', null), null);
    assert.equal(kaLinkBadge('MEMBER', 'Prayer team'), null);
  });
});
