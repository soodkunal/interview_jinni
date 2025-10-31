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

  // Reverting to original useEffect: Checks for session on mount
  useEffect(() => {
    const fetchUser = async () => {
      // 1. Get the session first
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/')
      } else {
        // 2. If the session exists, the user object is INSIDE the session.
        setUser(session.user) 
        setLoading(false)
      }
  }
    fetchUser()
  }, [supabase, router])

  // Function to handle sign-out
  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  // Define our navigation links as an array
  const navItems = [
    { name: 'Live Hub', href: '/live', description: 'Practice live with your peers.', icon: <FaUsers className="text-climby-500" /> },
    { name: 'Mock Interviews', href: '/interview', description: 'Get AI-powered feedback.', icon: <FaMicrophone className="text-climby-500" /> },
    { name: 'Practice Quizzes', href: '/practice', description: 'Test your knowledge.', icon: <FaBrain className="text-climby-500" /> },
    { name: 'Career Paths', href: '/career', description: 'Analyze your skill gaps.', icon: <FaRoute className="text-climby-500" /> },
    { name: 'My Sessions', href: '/sessions', description: 'Review your past attempts.', icon: <FaClipboardList className="text-climby-500" /> },
    { name: 'Review Hub', href: '/review', description: 'Help other students.', icon: <FaComments className="text-climby-500" /> },
  ]

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        Loading...
      </div>
    )
  }

  const userName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email
  
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h2 className="text-3xl font-bold font-heading text-gray-900 mb-4">
        Welcome back, {userName}!
      </h2>
      <p className="text-lg text-gray-600 mb-8">
        What would you like to work on today?
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {navItems.map((item) => (
          <a 
            key={item.name}
            href={item.href}
            className="group"
          >
            <Card className="h-full group-hover:shadow-xl group-hover:border-climby-500 border-2 border-transparent transition-all duration-300">
              <div className="text-3xl mb-4">
                {item.icon}
              </div>
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
    </div>
  )
}