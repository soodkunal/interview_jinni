'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Image from 'next/image'
// import Button from '@/components/Button' // <-- We are removing this component dependency

export default function Home() {
  const supabase = createClient()
  const router = useRouter()
  
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push('/dashboard')
      } else {
        setLoading(false)
      }
    }
    checkSession()
    
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.push('/dashboard')
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [supabase, router])

  async function handleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/dashboard`,
      },
    })
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-100"><p>Loading...</p></div>;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white shadow-md rounded-lg flex flex-col items-center">
        
        {/* Logo and Title */}
        <Image
          src="/Interview_jinni_logo.png" // Use the consistent internal name
          alt="Interview Jinni Logo"
          width={80}
          height={80}
          className="mx-auto mb-4"
        />
        <h1 className="text-2xl font-bold font-heading text-center mb-6">
          Interview Jinni
        </h1>

        {/* --- FINAL FIX: Universal Style Override (Inlined CSS) --- */}
        <button
          onClick={handleSignIn}
          // Use hardcoded colors and a dark border to guarantee visibility
          style={{ backgroundColor: '#0284c7', color: 'white', borderColor: '#0c4a6e', borderWidth: '1px' }} 
          className="w-full py-2 px-4 rounded-md transition-colors shadow-md font-medium"
        >
          Sign in / Sign up with Google
        </button>
        {/* --------------------------------------------------------- */}
      </div>
    </div>
  )
}