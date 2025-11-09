import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        heading: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
      },
      colors: {
        climby: {
          '50': '#f0f9ff',
          '100': '#e0f2fe',
          // ... (existing blues)
          '500': '#0ea5e9', 
          '600': '#0284c7',
          '700': '#0369a1',
          '800': '#075985',
          '900': '#0c4a6e',
        },
        background: { // Custom Dark Background Colors
          dark: '#0f172a', // Main dark background
          card: '#1e293b', // Dark card background
        },
      },
      boxShadow: {
        '3xl': '0 35px 60px -15px rgba(0, 0, 0, 0.5)', // Deep shadow for lifted effect
      }
    },
  },
  plugins: [require('@tailwindcss/forms')],
}
export default config