import React, { useEffect, useState } from 'react';
import {
  getPublishedSeason,
  refreshSeasonTheme,
  subscribeSeason,
  type PublishedSeason,
} from '../../lib/seasons/applyTheme';
import { getActiveTheme, SEASON_PREVIEW_EVENT } from '../../lib/seasons';

const SeasonThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    const theme = getActiveTheme(new Date());
    document.documentElement.dataset.season = theme.id;
    const run = () => {
      void refreshSeasonTheme();
    };
    run();
    const timer = window.setInterval(run, 60 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(SEASON_PREVIEW_EVENT, run);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(SEASON_PREVIEW_EVENT, run);
    };
  }, []);
  return <>{children}</>;
};

export function usePublishedSeason(): PublishedSeason {
  const [published, setPublished] = useState(getPublishedSeason);
  useEffect(() => {
    setPublished(getPublishedSeason());
    return subscribeSeason(setPublished);
  }, []);
  return published;
}

export default SeasonThemeProvider;
