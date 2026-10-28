export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef3ff',
          100: '#e0eaff',
          500: '#4f78f2',
          600: '#3563e9',
          700: '#2851d0',
        },
        navy: {
          900: '#15233b',
          800: '#1c304c',
        },
      },
    },
  },
  plugins: [],
};
