/** @type {import('tailwindcss').Config} */
//
// Design tokens follow Codex, the Wikimedia Design System
// (https://doc.wikimedia.org/codex/latest/design-tokens/overview.html), so the
// product reads as part of the ecosystem it serves: the same progressive blue,
// neutral greys, 2px corners and system type stack as the wikis themselves.
// Values only — no Codex code is bundled, and no Wikimedia marks are used.
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    // Codex corners: 2px for controls and surfaces, pills and circles for
    // chips and avatars. Larger steps exist only for illustrative hero art.
    borderRadius: {
      none: '0',
      sm: '2px',
      DEFAULT: '2px',
      md: '2px',
      lg: '2px',
      xl: '2px',
      '2xl': '4px',
      '3xl': '8px',
      full: '9999px',
    },
    extend: {
      colors: {
        wiki: {
          // Progressive (Codex color-progressive and its states).
          blue: '#3366cc',
          'blue-hover': '#3056a9',
          'blue-dark': '#233566',
          'blue-light': '#eaf3ff',
          // Text.
          ink: '#202122',
          slate: '#54595d',
          muted: '#72777d',
          // Borders: interactive controls vs. dividers and surfaces.
          border: '#a2a9b1',
          line: '#c8ccd1',
          // Backgrounds.
          paper: '#f8f9fa',
          neutral: '#eaecf0',
          // Status (Codex semantic colours).
          success: '#177860',
          'success-border': '#196551',
          'success-bg': '#dff2eb',
          warning: '#886425',
          'warning-border': '#ab7f2a',
          'warning-bg': '#fdf2d5',
          error: '#bf3c2c',
          'error-border': '#9f3526',
          'error-bg': '#ffe9e5',
          // Accent palette used in shipped frame artwork.
          green: '#00af89',
          red: '#d73333',
          amber: '#ffcc33',
          purple: '#6b4ba1',
        },
      },
      fontFamily: {
        // Vector's heading stack and Codex's system-sans stack.
        serif: ["'Linux Libertine'", 'Georgia', 'Times', "'Source Serif Pro'", 'serif'],
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          "'Segoe UI'",
          'Roboto',
          'Lato',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        // Codex box-shadow-medium, for things that float: menus, dialogs, toasts.
        card: '0 1px 1px rgba(0,0,0,.04)',
        float: '0 4px 4px rgba(0,0,0,.06), 0 0 8px rgba(0,0,0,.08)',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        floaty: {
          '0%,100%': { transform: 'translateY(0) rotate(-2deg)' },
          '50%': { transform: 'translateY(-10px) rotate(2deg)' },
        },
      },
      animation: {
        marquee: 'marquee 32s linear infinite',
        floaty: 'floaty 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
