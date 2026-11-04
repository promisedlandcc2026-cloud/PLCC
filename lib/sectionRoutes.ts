import { Section } from '../types';

export function routeForSection(section: Section): string {
  const routes: Record<Section, string> = {
    [Section.Dashboard]: '/dashboard',
    [Section.People]: '/members',
    [Section.Community]: '/community/video',
    [Section.Giving]: '/giving-form-url',
    [Section.Finance]: '/finance/ledger',
    [Section.Tags]: '/tags',
    [Section.Attendance]: '/attendance/sessions',
    [Section.Events]: '/events/overview',
    [Section.Forms]: '/elements/forms',
    [Section.FollowUps]: '/follow-ups',
    [Section.Communication]: '/communication/announcements',
    [Section.More]: '/more',
  };

  return routes[section];
}

