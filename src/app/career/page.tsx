'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

// Type for our profile
type PublicUserProfile = {
  id: number // bigint
}

// Type for user skills
type UserSkill = {
  skill_name: string
}

// Type for job roles
type JobRole = {
  id: number // bigint
  title: string
}

// Type for the 'skills' table
type RequiredSkill = {
  skill_name: string
}

// Type for the 'learning_resources' table
type LearningResource = {
  id: number
  skill_name: string
  resource_title: string
  url: string
  resource_type: string
}

export default function CareerPage() {
  const supabase = createClient()
  const router = useRouter()
  
  // --- FIX: ADDED MISSING 'user' STATE ---
  const [user, setUser] = useState<any>(null) 
  // ----------------------------------------
  
  const [profile, setProfile] = useState<PublicUserProfile | null>(null)
  const [mySkills, setMySkills] = useState<UserSkill[]>([])
  const [allJobs, setAllJobs] = useState<JobRole[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [customJobTitle, setCustomJobTitle] = useState<string>('')

  const [skillGaps, setSkillGaps] = useState<string[]>([])
  const [learningResources, setLearningResources] = useState<LearningResource[]>([])
  
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisDone, setAnalysisDone] = useState(false)

  // --- Data Fetching Logic (Now correctly inside the component) ---
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        // User logged out, send to login
        router.push('/')
      } else {
        // User is logged in, set the user and fetch page data
        setUser(session.user) // <-- This setter is now defined
        
        const fetchPageData = async (user: any) => {
            // 1. Get public user profile
            const { data: publicProfile, error: profileError } = await supabase
              .from('users').select('id').eq('auth_id', user.id).single()
            
            if (profileError || !publicProfile) {
              setLoading(false); return
            }
            setProfile(publicProfile)
            
            // 2. Fetch user's skills
            const { data: skillsData } = await supabase
              .from('user_skills').select('skill_name').eq('user_id', publicProfile.id)
            if (skillsData) setMySkills(skillsData)
            
            // 3. Fetch all job roles
            const { data: jobsData } = await supabase
              .from('job_roles').select('id, title')
            if (jobsData) setAllJobs(jobsData)

            setLoading(false)
        }
        
        fetchPageData(session.user);
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [supabase, router])

  
  // --- handleAnalyzeGap (Unchanged) ---
  const handleAnalyzeGap = async () => {
    const jobTitleToAnalyze = customJobTitle.trim() || 
      allJobs.find(job => job.id.toString() === selectedJobId)?.title;

    if (!jobTitleToAnalyze) {
      setSkillGaps([]); setLearningResources([]); setAnalysisDone(false);
      return;
    }

    setIsAnalyzing(true)
    setAnalysisDone(false)
    setLearningResources([])
    setSkillGaps([])

    let requiredSkillsList: string[] = []

    try {
      if (customJobTitle.trim()) {
        // FLOW 1: Custom Job Title (Use Gemini API)
        const prompt = `List the top 10 most important technical skills for a "${jobTitleToAnalyze}" role. 
          Return the list as a simple comma-separated string. For example: Skill1, Skill2, Skill3`;

        const response = await fetch('/api/generate/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: prompt }),
        })

        if (!response.ok) {
          throw new Error('Failed to fetch from Gemini API')
        }
        
        const data = await response.json()
        requiredSkillsList = data.skillsText.split(',').map((s: string) => s.trim())
        
      } else {
        // FLOW 2: Pre-defined Job (Use Supabase)
        const { data: requiredSkillsData, error } = await supabase
          .from('skills')
          .select('skill_name')
          .eq('job_role_id', selectedJobId)

        if (error) throw error
        
        requiredSkillsList = requiredSkillsData.map((s: RequiredSkill) => s.skill_name)
        
        // ENHANCEMENT: Refine the Supabase list with Gemini
        const prompt = `I have a list of skills for a "${jobTitleToAnalyze}": ${requiredSkillsList.join(', ')}.
          Please refine this list: remove any obvious redundancies and check for any major missing skills.
          Return the final list as a simple comma-separated string.`;
        
        const refineResponse = await fetch('/api/generate/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: prompt }),
        })

        if (refineResponse.ok) {
          const refinedData = await refineResponse.json()
          requiredSkillsList = refinedData.skillsText.split(',').map((s: string) => s.trim())
        }
      }

      // 3. Compare the lists to find the gaps
      const mySkillSet = new Set(mySkills.map(skill => skill.skill_name.toLowerCase()))
      const gaps: string[] = []

      requiredSkillsList.forEach((reqSkill) => {
        if (!mySkillSet.has(reqSkill.toLowerCase())) {
          gaps.push(reqSkill)
        }
      })
      
      setSkillGaps(gaps)
      
      // 4. Fetch learning resources for the gaps
      if (gaps.length > 0) {
        const { data: resourcesData } = await supabase
          .from('learning_resources')
          .select('*')
          .in('skill_name', gaps.map(g => g.charAt(0).toUpperCase() + g.slice(1)))

        if (resourcesData) {
          setLearningResources(resourcesData as LearningResource[])
        }
      }

    } catch (error) {
      console.error('Error during analysis:', error)
    } finally {
      setIsAnalyzing(false)
      setAnalysisDone(true)
    }
  }
  // ------------------------------------------

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        Loading...
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold font-heading text-gray-900 mb-6">Career Path Analysis</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* --- Section 1: Your Skills --- */}
        <div className="p-6 bg-white shadow-md rounded-lg">
          <h2 className="text-2xl font-semibold font-heading mb-4">Your Skills</h2>
          {mySkills.length > 0 ? (
            <ul className="list-disc list-inside space-y-1">
              {mySkills.map((skill, index) => (
                <li key={index} className="text-gray-700">{skill.skill_name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">Go to your profile to add skills.</p>
          )}
        </div>

        {/* --- Section 2: Skill Gap Analysis --- */}
        <div className="p-6 bg-white shadow-md rounded-lg row-span-2">
          <h2 className="text-2xl font-semibold font-heading mb-4">Select a Target Job</h2>
          <select
            value={selectedJobId}
            onChange={(e) => {
              setSelectedJobId(e.target.value)
              setCustomJobTitle('')
              setAnalysisDone(false)
            }}
            className="w-full p-2 border rounded-md text-black"
          >
            <option value="">-- Choose a pre-defined job --</option>
            {allJobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>

          <div className="flex items-center my-4">
            <div className="flex-grow border-t border-gray-300"></div>
            <span className="flex-shrink mx-4 text-gray-500">OR</span>
            <div className="flex-grow border-t border-gray-300"></div>
          </div>

          <input
            type="text"
            value={customJobTitle}
            onChange={(e) => {
              setCustomJobTitle(e.target.value)
              setSelectedJobId('')
              setAnalysisDone(false)
            }}
            placeholder="Type a custom job title (e.g., 'AI Ethicist')"
            className="w-full p-2 border rounded-md text-black"
          />
          
          <button
            onClick={handleAnalyzeGap}
            disabled={isAnalyzing || (!selectedJobId && !customJobTitle.trim())}
            className="w-full bg-climby-500 text-white py-2 px-4 rounded-md hover:bg-climby-600 mt-4 disabled:bg-gray-400"
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze Skill Gap'}
          </button>

          {/* --- Results Area --- */}
          {analysisDone && (
            <div className="mt-6">
              <h3 className="text-xl font-semibold">Analysis Results:</h3>
              {skillGaps.length > 0 ? (
                <div className="mt-2 space-y-4">
                  <p className="font-medium text-red-600">You have {skillGaps.length} skill gap(s):</p>
                  {skillGaps.map((gap, index) => (
                    <div key={index} className="pl-2">
                      <h4 className="font-semibold text-lg text-gray-800">{gap}</h4>
                      <ul className="list-disc list-inside pl-2 mt-1 space-y-1">
                        {learningResources
                          .filter(res => res.skill_name.toLowerCase() === gap.toLowerCase())
                          .map(resource => (
                            <li key={resource.id}>
                              <a 
                                href={resource.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-climby-600 hover:underline"
                              >
                                {resource.resource_title}
                              </a>
                              <span className="text-sm text-gray-500 italic ml-2">({resource.resource_type})</span>
                            </li>
                          ))}
                        {learningResources.filter(res => res.skill_name.toLowerCase() === gap.toLowerCase()).length === 0 && (
                          <p className="text-gray-500 text-sm italic">No learning resources found for this skill.</p>
                        )}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-green-600 mt-2 font-medium">
                  You have all the required skills for this role!
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}