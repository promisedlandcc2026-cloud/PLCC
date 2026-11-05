/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./pages/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./lib/**/*.{js,ts,jsx,tsx}",
        "./App.tsx",
        "./api/_utils/huddleGallery.ts",
    ],
    theme: {
        extend: {
            screens: {
                'xs': '320px',
            },
            colors: {
                burgundy: {
                    DEFAULT: '#1d372c',
                    dark: '#12231c',
                    light: '#2b4a3c',
                },
                ink: '#0d1a14',
                gold: {
                    DEFAULT: '#C9A35A',
                    light: '#E8D8B2',
                    cream: '#f6f1e6',
                }
            },
            boxShadow: {
                xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
                '2xs': '0 1px 0 0 rgb(0 0 0 / 0.04)',
            },
            fontSize: {
                // Raise the floor so labels stay legible
                xs: ['0.8125rem', { lineHeight: '1.25rem' }], // 13px
                sm: ['0.9375rem', { lineHeight: '1.375rem' }], // 15px
            },
        }
    },
    plugins: [
        require('@tailwindcss/typography'),
    ],
}
