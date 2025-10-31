module.exports = {
  plugins: {
    '@tailwindcss/postcss': {}, // This line is the fix
    autoprefixer: {},
  },
}