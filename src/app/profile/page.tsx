'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import Card from '@/components/Card'

// Type for our 'public.users' table
type PublicUserProfile = {
  id: number // <-- The ID we want to display!
  auth_id: string
  full_name: string
  avatar_url: string | null
  email: string 
}

// Type for user skill (Unchanged)
type UserSkill = {
  id: number
  user_id: number
  skill_name: string
  proficiency_level: string
}

export default function ProfilePage() {
  const supabase = createClient()
  const router = useRouter()
  
  const [profile, setProfile] = useState<PublicUserProfile | null>(null)
  const [skills, setSkills] = useState<UserSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [newSkill, setNewSkill] = useState('')

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        router.push('/'); return
      } else {
        const fetchPageData = async (user: any) => {
            // 1. Get public user profile (FIXED QUERY)
            const { data: publicProfile, error: profileError } = await supabase
              .from('users')
              .select('id, auth_id, full_name, avatar_url, email') // <-- NOW INCLUDES 'id'
              .eq('auth_id', user.id)
              .single()

            if (profileError || !publicProfile) {
              setLoading(false); return
            }
            setProfile(publicProfile)
              
            // 2. Fetch user's skills (Unchanged)
            const { data: user_skills, error: skillsError } = await supabase
              .from('user_skills')
              .select('id, user_id, skill_name, proficiency_level')
              .eq('user_id', publicProfile.id)

            if (skillsError) {
              console.error('Error fetching user skills:', skillsError)
            } else if (user_skills) {
              setSkills(user_skills as UserSkill[])
            }
            setLoading(false)
        }
        fetchPageData(session.user);
      }
    })
    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [supabase, router])

  // handleAddSkill, handleDeleteSkill, handleSignOut (Unchanged)
  const handleAddSkill = async () => {
    if (newSkill.trim() === '' || !profile) return
    const { data: newSkillRecord, error } = await supabase
      .from('user_skills')
      .insert({
        user_id: profile.id,
        skill_name: newSkill.trim(),
        proficiency_level: 'beginner',
      })
      .select('id, user_id, skill_name, proficiency_level')
      .single()

    if (error) {
      console.error('Error adding skill:', error)
    } else if (newSkillRecord) {
      setSkills([...skills, newSkillRecord as UserSkill])
      setNewSkill('')
    }
  }

  const handleDeleteSkill = async (skillId: number) => {
    const { error } = await supabase
      .from('user_skills')
      .delete()
      .eq('id', skillId)

    if (error) {
      console.error('Error deleting skill:', error)
    } else {
      setSkills(skills.filter((skill) => skill.id !== skillId))
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        Loading...
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center space-x-4">
          <Image
            src={profile?.avatar_url || '/default-avatar.png'}
            alt="Profile picture"
            width={80}
            height={80}
            className="rounded-full"
          />
          <div>
            <h1 className="text-3xl font-bold font-heading text-gray-900">
              {profile?.full_name || 'Your Profile'}
            </h1>
            <p className="text-gray-600 text-sm">
              {profile?.email}
            </p>
            {/* --- FIX: Display User ID --- */}
            <p className="text-gray-500 text-xs mt-1">
              **Your User ID:** <span className="font-semibold text-climby-700">{profile?.id}</span>
            </p>
            {/* --------------------------- */}
          </div>
        </div>
        
        <button
          onClick={handleSignOut}
          className="bg-red-500 text-white py-2 px-4 rounded-md hover:bg-red-600 transition-colors text-sm font-medium mt-3"
        >
          Sign Out
        </button>
      </div>
      
      <Card className="mb-6">
        <h2 className="text-2xl font-semibold font-heading mb-4">Add a New Skill</h2>
        <div className="flex space-x-2">
          <input
            type="text"
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value)}
            placeholder="e.g., React, Python, SQL"
            className="flex-grow p-2 border rounded-md text-black"
          />
          <button
            onClick={handleAddSkill}
            className="bg-white text-climby-600 border border-climby-500 py-2 px-4 rounded-md hover:bg-climby-50 disabled:bg-gray-400 disabled:text-white"
            disabled={!profile}
          >
            Add Skill
          </button>
        </div>
        {!profile && !loading && (
          <p className="text-red-500 text-sm mt-2">
            Could not load your user profile. Please try refreshing.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="text-2xl font-semibold font-heading mb-4">Your Current Skills</h2>
        {skills.length > 0 ? (
          <ul className="space-y-2">
            {skills.map((skill) => (
              <li 
                key={skill.id} 
                className="flex justify-between items-center p-3 bg-gray-100 rounded-md"
              >
                <span className="text-gray-800">{skill.skill_name}</span>
                <button
                  onClick={() => handleDeleteSkill(skill.id)}
                  className="text-red-500 hover:text-red-700 text-sm font-medium"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500">You haven't added any skills yet.</p>
        )}
      </Card>
    </div>
  )
}