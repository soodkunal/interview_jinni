'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import Image from 'next/image'
import Link from 'next/link'
import { FaBars, FaTimes } from 'react-icons/fa' // Import menu icons

export default function Navbar() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false) // State for mobile menu

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    fetchUser()
  }, [supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const avatarUrl = user?.user_metadata?.avatar_url
  
  if (!user) {
    return null // Don't render if logged out
  }

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
      {/* --- Main Nav Bar --- */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-4 flex justify-between items-center">
          
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center space-x-2">
            <Image
              src="/Interview_jinni_logo.png"
              alt="Interview Jinni Logo"
              width={32}
              height={32}
            />
            <h1 className="text-2xl font-bold font-heading text-climby-600">
              Interview Jinni
            </h1>
          </Link>
          
          {/* Desktop Nav (hidden on small screens) */}
          <div className="hidden md:flex items-center space-x-4">
            <Link href="/profile" className="text-gray-600 hover:text-climby-600 font-medium">
              My Profile
            </Link>
            <button
              onClick={handleSignOut}
              className="bg-climby-500 text-white py-2 px-4 rounded-md hover:bg-climby-600 transition-colors text-sm font-medium"
            >
              Sign Out
            </button>
            <Link href="/profile" title="View Profile">
              <Image
                src={avatarUrl || '/default-avatar.png'}
                alt="Your profile picture"
                width={40}
                height={40}
                className="rounded-full"
              />
            </Link>
          </div>

          {/* Mobile Menu Button (hidden on medium screens and up) */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-gray-700 text-2xl"
            >
              {isMobileMenuOpen ? <FaTimes /> : <FaBars />}
            </button>
          </div>
        </div>
      </div>

      {/* --- Mobile Menu (Dropdown) --- */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute bg-white w-full shadow-lg border-t border-gray-200 py-4">
          <div className="px-4 flex items-center mb-4">
            <Image
              src={avatarUrl || '/default-avatar.png'}
              alt="Your profile picture"
              width={40}
              height={40}
              className="rounded-full"
            />
            <span className="ml-3 font-medium text-gray-700">
              {user.user_metadata?.full_name || user.email}
            </span>
          </div>
          
          <Link 
            href="/profile" 
            className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
            onClick={() => setIsMobileMenuOpen(false)} // Close menu on click
          >
            My Profile
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full text-left px-4 py-2 text-red-600 hover:bg-gray-100 font-medium"
          >
            Sign Out
          </button>
        </div>
      )}
    </header>
  )
}