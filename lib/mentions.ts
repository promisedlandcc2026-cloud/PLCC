import React from 'react';

/**
 * Parses text and highlights @mentions.
 */
export const highlightMentions = (text: string) => {
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      // Fix: Use React.createElement instead of JSX to avoid parsing errors in a .ts file
      return React.createElement(
        'span',
        {
          key: i,
          className: "text-blue-600 font-semibold bg-blue-50 px-1 rounded cursor-pointer hover:bg-blue-100 transition-colors"
        },
        part
      );
    }
    return part;
  });
};