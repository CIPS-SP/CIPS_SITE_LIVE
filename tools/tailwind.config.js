// Tailwind settings for the live site. Compiles the page classes into site/css/tailwind.css (the pages no longer load Tailwind
// from its website). Run from tools/:   npm install   then   npm run tailwind
// Same theme the pages used to pass to the Tailwind script (cdn.tailwindcss.com 3.4.17).
module.exports = {
  content: [
    '../site/**/*.html',
    '../site/js/**/*.js',
    '../site/home/**/*.js',
    '../site/_beats/!(_vendor)/**/*.{html,js}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#1A1D22', deep: '#23262C', navy: '#30343C', sea: '#1C5D82', sky: '#4A90C2',
        gold: '#0080C0', goldl: '#4FB0E4', cream: '#F7F4EE', paper: '#FBFAF7',
      },
      fontFamily: {
        serif: ['Montserrat', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: { widest2: '0.28em' },
      maxWidth: { '8xl': '88rem' },
    },
  },
};
