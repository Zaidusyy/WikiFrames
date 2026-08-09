/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Wiki-inspired palette (originals, not trademarked assets — see PDR §23).
        wiki: {
          blue: '#3366cc',
          'blue-dark': '#2a4b8d',
          'blue-light': '#eaf3ff',
          ink: '#202122',
          slate: '#54595d',
          line: '#c8ccd1',
          paper: '#f8f9fa',
          green: '#00af89',
          red: '#d73333',
          amber: '#fc3',
          purple: '#6b4ba1',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Linux Libertine', '"Times New Roman"', 'serif'],
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.06), 0 4px 16px rgba(32,33,34,.06)',
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
