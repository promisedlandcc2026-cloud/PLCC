import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import HomeHeroBanner from '../components/Dashboard/HomeHeroBanner';
import { NavContext, type NavContextType } from '../lib/NavContext';
import { Role } from '../types';

function render(role: Role, nextService: { title: string; whenLabel: string; dateYmd: string } | null) {
  return renderToStaticMarkup(<MemoryRouter><NavContext.Provider value={{ userRole: role } as NavContextType}><HomeHeroBanner greeting="Good morning" userName="Sample" nextService={nextService} /></NavContext.Provider></MemoryRouter>);
}
const admin = render(Role.SUPER_ADMIN, { title: 'Sunday Worship', whenLabel: 'Sunday, 10:00 AM', dateYmd: '2026-11-22' });
assert.match(admin, /Sunday Worship/);
assert.match(admin, /Sunday, 10:00 AM/);
assert.match(admin, /canaan-sunrise-road\.png/);
assert.match(admin, /Open check-in/);
assert.match(admin, /Members &amp; households/);
assert.match(admin, /Post Canaan News/);
assert.match(admin, /Send a Tribes alert/);
const member = render(Role.MEMBER, null);
assert.doesNotMatch(member, /Members &amp; households|Post Canaan News|Send a Tribes alert/);
assert.match(member, /See upcoming services and events/);
assert.doesNotMatch(member, /10:00 AM/);
console.log('Canaan Home smoke: approved artwork, live-event display, fallback, and role-scoped actions passed.');
