import type { Metadata } from 'next'
// 1. Import Poppins and Inter
import { Inter, Poppins } from 'next/font/google' 
import './globals.css'
import IncomingCallModal from '@/components/IncomingCallModal'
import Navbar from '@/components/Navbar'

// 2. Configure the fonts
const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter', // Create a CSS variable
})
const poppins = Poppins({ 
  subsets: ['latin'], 
  weight: ['500', '600', '700'], // Load specific weights
  variable: '--font-poppins', // Create a CSS variable
})

export const metadata: Metadata = {
  title: 'Interview Jinni',
  description: 'AI-Powered Career Preparation',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body className={`${inter.variable} ${poppins.variable} font-sans bg-gray-50`}>
        {/* We need a wrapper to ensure the modal isn't part of the main layout */}
        <div id="app-wrapper">
          <Navbar /> {/* <-- 2. ADD IT HERE */}
          <main>
            {children} {/* <-- 3. WRAP CHILDREN IN MAIN */}
          </main>
          <IncomingCallModal />
        </div>
      </body>
    </html>
  )
}