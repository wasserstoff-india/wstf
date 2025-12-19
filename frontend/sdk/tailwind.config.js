/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./docs/**/*.{html,js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./react/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'Menlo', 'monospace'],
            },
        },
    },
    plugins: [],
}
