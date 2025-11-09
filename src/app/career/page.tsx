'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Card from '@/components/Card' 

// Type definitions (Unchanged)
type PublicUserProfile = { id: number }
type UserSkill = { skill_name: string }
type JobRole = { id: number; title: string }
type RequiredSkill = { skill_name: string }
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

  // --- Data Fetching Logic (Robust Auth Listener) ---
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        router.push('/')
      } else {
        const fetchPageData = async (user: any) => {
            const { data: publicProfile } = await supabase
              .from('users').select('id').eq('auth_auth', user.id).single()
            
            if (!publicProfile) { setLoading(false); return }
            setProfile(publicProfile)
            
            const { data: skillsData } = await supabase
              .from('user_skills').select('skill_name').eq('user_id', publicProfile.id)
            if (skillsData) setMySkills(skillsData)
            
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

  
  // --- handleAnalyzeGap (Core Logic Unchanged) ---
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
        const prompt = `List the top 10 most important technical skills for a "${jobTitleToAnalyze}" role. Return the list as a simple comma-separated string. For example: Skill1, Skill2, Skill3`;
        const response = await fetch('/api/generate/skills', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: prompt }),
        })
        if (!response.ok) { throw new Error('Failed to fetch from Gemini API') }
        
        const data = await response.json()
        requiredSkillsList = data.skillsText.split(',').map((s: string) => s.trim())
        
      } else {
        const { data: requiredSkillsData, error } = await supabase
          .from('skills').select('skill_name').eq('job_role_id', selectedJobId)

        if (error) throw error;
        
        requiredSkillsList = requiredSkillsData.map((s: RequiredSkill) => s.skill_name);
        
        const prompt = `I have a list of skills for a "${jobTitleToAnalyze}": ${requiredSkillsList.join(', ')}. Please refine this list: remove any obvious redundancies and check for any major missing skills. Return the final list as a simple comma-separated string.`;
        
        const refineResponse = await fetch('/api/generate/skills', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: prompt }),
        })

        if (refineResponse.ok) {
          const refinedData = await refineResponse.json()
          requiredSkillsList = refinedData.skillsText.split(',').map((s: string) => s.trim())
        }
      }

      // Compare the lists to find the gaps
      const mySkillSet = new Set(mySkills.map(skill => skill.skill_name.toLowerCase()))
      const gaps: string[] = []

      requiredSkillsList.forEach((reqSkill) => {
        if (!mySkillSet.has(reqSkill.toLowerCase())) {
          gaps.push(reqSkill)
        }
      })
      
      setSkillGaps(gaps)
      
      // Fetch learning resources for the gaps
      if (gaps.length > 0) {
        const { data: resourcesData } = await supabase
          .from('learning_resources').select('*')
          .in('skill_name', gaps.map(g => g.charAt(0).toUpperCase() + g.slice(1)))

        if (resourcesData) { setLearningResources(resourcesData as LearningResource[]) }
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
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>
  }

  return (
    // Max width wrapper for consistency
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold font-heading text-gray-900 mb-6">Career Path Analysis</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* --- COLUMN 1: Skill Input and List --- */}
        <div className="lg:col-span-1">
            <Card className="h-full border border-gray-200">
                <h2 className="text-2xl font-semibold font-heading text-gray-900 mb-4">Your Current Skills</h2>
                {mySkills.length > 0 ? (
                <ul className="list-disc list-inside space-y-2 pl-4">
                    {mySkills.map((skill, index) => (
                    <li key={index} className="text-gray-700">{skill.skill_name}</li>
                    ))}
                </ul>
                ) : (
                <p className="text-gray-500">Go to your profile to add skills.</p>
                )}
            </Card>
        </div>

        {/* --- COLUMN 2: Job Selection and Analysis Button (FIX APPLIED) --- */}
        <div className="lg:col-span-2">
            <Card className="h-full border border-climby-200 shadow-lg">
                <h2 className="text-2xl font-semibold font-heading text-climby-700 mb-4">Select or Define Target Role</h2>
                
                {/* Job Selection */}
                <select
                    value={selectedJobId}
                    onChange={(e) => {
                        setSelectedJobId(e.target.value)
                        setCustomJobTitle('')
                        setAnalysisDone(false)
                    }}
                    className="w-full p-3 border border-gray-300 rounded-md text-gray-900 bg-white shadow-sm focus:border-climby-500 focus:ring-2 focus:ring-climby-500 transition-shadow duration-150"
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
                    <span className="flex-shrink mx-4 text-gray-500 font-medium">OR CUSTOM SEARCH</span>
                    <div className="flex-grow border-t border-gray-300"></div>
                </div>

                {/* Custom Job Input */}
                <input
                    type="text"
                    value={customJobTitle}
                    onChange={(e) => {
                        setCustomJobTitle(e.target.value)
                        setSelectedJobId('')
                        setAnalysisDone(false)
                    }}
                    placeholder="Type a custom job title (e.g., 'AI Ethicist')"
                    className="w-full p-3 border border-gray-300 rounded-md text-gray-900 bg-white shadow-sm focus:border-climby-500 focus:ring-2 focus:ring-climby-500 transition-shadow duration-150"
                />
                
                {/* Analyze Button - CRITICAL VISIBILITY FIX APPLIED */}
                <button
                    onClick={handleAnalyzeGap}
                    disabled={isAnalyzing || (!selectedJobId && !customJobTitle.trim())}
                    // FIX: Apply high-contrast border style to guarantee visibility
                    className="w-full bg-white text-climby-600 border-2 border-climby-500 py-3 px-4 rounded-md hover:bg-climby-50 mt-6 
                               disabled:bg-gray-400 disabled:text-white font-semibold text-lg shadow-md transition-all duration-200"
                >
                    {isAnalyzing ? 'Analyzing Skill Gap...' : 'Analyze Skill Gap'}
                </button>
            </Card>
        </div>
      </div>
      
      {/* --- Results Area (Below the main grid) --- */}
      {analysisDone && (
        <Card className="mt-8 border border-gray-200">
            <h2 className="text-2xl font-semibold font-heading text-gray-900 mb-4">Analysis Results</h2>
            {skillGaps.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Gaps List */}
                    <div>
                        <h3 className="text-xl font-semibold text-red-600 mb-3">Missing Skills ({skillGaps.length}):</h3>
                        <ul className="space-y-3">
                            {skillGaps.map((gap) => (
                                <li key={gap} className="flex items-center space-x-2 text-gray-800 font-medium">
                                    {/* Red gradient indicator */}
                                    <span className="text-red-500 text-xl font-extrabold">&times;</span> 
                                    <span>{gap}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    
                    {/* Resources */}
                    <div>
                        <h3 className="text-xl font-semibold text-climby-700 mb-3">Recommended Resources:</h3>
                        <ul className="space-y-3">
                            {skillGaps.map(gap => {
                                const resources = learningResources.filter(res => res.skill_name.toLowerCase() === gap.toLowerCase())
                                return (
                                    <li key={gap} className="border-l-4 border-climby-500 pl-3 transition-colors duration-200 hover:bg-gray-50 rounded-r-md">
                                        <p className="font-semibold text-gray-800">{gap}</p>
                                        <ul className="text-sm list-disc list-inside text-gray-600 ml-3">
                                            {resources.length > 0 ? (
                                                resources.map((resource) => (
                                                    <li key={resource.id}>
                                                        <a 
                                                            href={resource.url} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:underline"
                                                        >
                                                            {resource.resource_title} ({resource.resource_type})
                                                        </a>
                                                    </li>
                                                ))
                                            ) : (
                                                <li>No specific resources found.</li>
                                            )}
                                        </ul>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                </div>
            ) : (
                // Success Message Card
                <p className="text-green-600 text-lg font-medium p-4 bg-green-50 rounded-lg">
                    You have all the required skills for this role! Excellent work.
                </p>
            )}
        </Card>
      )}
    </div>
  )
}