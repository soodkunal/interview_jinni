'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import Card from '@/components/Card' 
import Image from 'next/image'
import { 
  FaComments, 
  FaBrain, 
  FaMicrophone, 
  FaClipboardList, 
  FaRoute, 
  FaUsers 
} from 'react-icons/fa'

export default function Dashboard() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { session } } = await supabase.auth.getSession() 

      if (!session) {
        router.push('/')
      } else {
        setUser(session.user) 
        setLoading(false)
      }
    }
    fetchUser()
  }, [supabase, router])

  // Function to handle sign-out (retained for local logic)
  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const navItems = [
    { name: 'Live Hub', href: '/live', description: 'Practice live with your peers.', icon: <FaUsers className="text-climby-600" /> },
    { name: 'Mock Interviews', href: '/interview', description: 'Get AI-powered feedback.', icon: <FaMicrophone className="text-climby-600" /> },
    { name: 'Practice Quizzes', href: '/practice', description: 'Test your knowledge.', icon: <FaBrain className="text-climby-600" /> },
    { name: 'Career Paths', href: '/career', description: 'Analyze your skill gaps.', icon: <FaRoute className="text-climby-600" /> },
    { name: 'My Sessions', href: '/sessions', description: 'Review your past attempts.', icon: <FaClipboardList className="text-climby-600" /> },
    { name: 'Review Hub', href: '/review', description: 'Help other students.', icon: <FaComments className="text-climby-600" /> },
  ]

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>
  }

  const userName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email

  return (
    // Reverted to the light background structure
    <div className="min-h-[calc(100vh-80px)] bg-gray-50"> 
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* --- 1. HERO SECTION (Main Header Gradient) --- */}
        <div 
             className="mb-10 p-8 rounded-xl shadow-lg transition-all duration-500" 
             style={{ backgroundImage: 'linear-gradient(135deg, #1e3a8a, #0c4a6e)' }} // Dark blue to deeper slate
        >
          <h2 className="text-4xl font-bold font-heading text-white mb-2">
            Welcome back, {userName}! 
          </h2>
          <p className="text-xl text-climby-200">
            What would you like to work on today?
          </p>
        </div>

        {/* --- 2. NAV GRID (RESTORED TEXT CONTRAST) --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {navItems.map((item) => (
            <a 
              key={item.name}
              href={item.href}
              className="group"
            >
              <Card 
                // Card is now BG-WHITE for maximum contrast
                className="h-full bg-white text-gray-900 
                           group-hover:shadow-xl group-hover:border-climby-500 
                           border border-gray-200 transition-all duration-200"
              >
                {/* 3. ICON STYLING */}
                <div className="text-3xl mb-3">
                  {item.icon}
                </div>
                
                {/* RESTORED TEXT COLOR */}
                <h3 className="text-xl font-heading font-semibold text-gray-900">
                  {item.name}
                </h3>
                <p className="text-gray-600 mt-1">
                  {item.description}
                </p>
              </Card>
            </a>
          ))}
        </div>
      </main>
    </div>
  )
}