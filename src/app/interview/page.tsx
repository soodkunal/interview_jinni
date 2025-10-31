'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'

// --- Types ---
type PublicUserProfile = {
  id: number // bigint
  auth_id: string
}
type JobRole = {
  id: number // bigint
  title: string
}
type RequiredSkill = {
  skill_name: string
}
type InterviewQuestion = {
  id: number
  question_text: string
  question_type: string
}
type AnalysisFeedback = {
  overall_score: number
  overall_feedback: string
  question_feedback: {
    question: string
    feedback: string
  }[]
}

// --- Component ---
export default function InterviewPage() {
  const supabase = createClient()
  const router = useRouter()

  // --- State ---
  const [profile, setProfile] = useState<PublicUserProfile | null>(null)
  const [allJobs, setAllJobs] = useState<JobRole[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [customJobTitle, setCustomJobTitle] = useState<string>('')
  
  const [questions, setQuestions] = useState<InterviewQuestion[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [loadingPage, setLoadingPage] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // --- NEW Input Type State ---
  const [inputType, setInputType] = useState<'audio' | 'text'>('audio')
  const [typedAnswers, setTypedAnswers] = useState<Record<number, string>>({}) // Stores {questionId: "answer"}

  // --- Recording & Analysis State ---
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [sessionId, setSessionId] =useState<number | null>(null)
  
  const [analysisStatus, setAnalysisStatus] = useState<'pending' | 'processing' | 'completed' | 'failed'>('pending')
  const [feedback, setFeedback] = useState<AnalysisFeedback | null>(null)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  // ---------------------------

  // --- useEffect (Unchanged) ---
  useEffect(() => {
    const fetchData = async () => {
      setLoadingPage(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/'); return
      }
      const { data: publicProfile, error: profileError } = await supabase
        .from('users').select('id, auth_id').eq('auth_id', user.id).single()
      if (profileError || !publicProfile) {
        console.error('Error fetching profile:', profileError)
        setError('Could not load user profile.'); setLoadingPage(false); return
      }
      setProfile(publicProfile)
      const { data: jobsData, error: jobsError } = await supabase
        .from('job_roles').select('id, title')
      if (jobsError) {
        console.error('Error fetching job roles:', jobsError)
      } else if (jobsData) {
        setAllJobs(jobsData)
      }
      setLoadingPage(false)
    }
    fetchData()
  }, [supabase, router])

  // --- handleGenerateQuestions (Slightly updated) ---
  const handleGenerateQuestions = async () => {
    setIsGenerating(true)
    setError(null)
    setQuestions([])
    setAudioUrl(null)
    setSessionId(null)
    setFeedback(null)
    setAnalysisStatus('pending')
    setTypedAnswers({}) // <-- NEW: Reset typed answers
    // ... (rest of the function is identical)
    const isCustomJob = customJobTitle.trim() !== ''
    const jobTitle = isCustomJob ? customJobTitle.trim() : allJobs.find(j => j.id.toString() === selectedJobId)?.title
    const jobRoleId = isCustomJob ? null : selectedJobId
    if (!jobTitle) {
      setError('Please select or type a job title.'); setIsGenerating(false); return
    }
    try {
      let skillNames: string[] = []
      if (isCustomJob) {
        const skillsPrompt = `List the top 10 most important technical skills for a "${jobTitle}" role. Return the list as a simple comma-separated string.`
        const response = await fetch('/api/generate/skills', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: skillsPrompt }),
        })
        if (!response.ok) throw new Error('Failed to generate skills for custom job.')
        const data = await response.json()
        skillNames = data.skillsText.split(',').map((s: string) => s.trim())
      } else {
        const { data: skillsData, error: skillsError } = await supabase
          .from('skills').select('skill_name').eq('job_role_id', selectedJobId)
        if (skillsError) throw skillsError
        skillNames = skillsData.map((s: RequiredSkill) => s.skill_name)
      }
      if (skillNames.length === 0) {
        throw new Error('No skills found for this job. Cannot generate questions.')
      }
      const response = await fetch('/api/generate/interview_questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobRoleId, jobTitle, skillNames }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.details || 'Failed to generate questions')
      setQuestions(data)
    } catch (err) {
      console.error(err); setError((err as Error).message)
    } finally {
      setIsGenerating(false)
    }
  }

  // --- startRecording (Unchanged) ---
  const startRecording = async () => {
    if (!profile) {
      setError('User profile not loaded. Cannot start session.'); return
    }
    if (questions.length === 0) {
      setError('No questions were generated. Cannot start session.'); return
    }
    setError(null); setAudioUrl(null);
    let newSessionId: number;
    try {
      const { data, error } = await supabase
        .from('mock_interview_sessions')
        .insert({ 
          user_id: profile.id, session_date: new Date().toISOString(),
          questions_asked: questions, analysis_status: 'pending'
        })
        .select('id').single()
      if (error) throw error
      if (!data) throw new Error("Could not create session in database.")
      newSessionId = data.id 
      setSessionId(newSessionId) 
    } catch (error) {
      console.error('Error creating session:', error); setError('Failed to create a new session.'); return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      audioChunksRef.current = []
      mediaRecorderRef.current.ondataavailable = (event) => audioChunksRef.current.push(event.data)
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        uploadRecording(audioBlob, newSessionId)
      }
      mediaRecorderRef.current.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Error accessing microphone:', err); setError('Could not access microphone.')
    }
  }
  
  // --- stopRecording (Unchanged) ---
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  // --- uploadRecording (Unchanged, this is the fixed version) ---
  const uploadRecording = async (audioBlob: Blob, currentSessionId: number) => {
    if (!profile) {
      setError('User profile not loaded. Cannot upload.'); return
    }
    if (!currentSessionId) { 
      setError('No active session. Cannot upload.'); return
    }
    setIsUploading(true); setError(null);
    const filePath = `${profile.auth_id}/${currentSessionId}.webm`
    try {
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('recordings').upload(filePath, audioBlob)
      if (uploadError) throw uploadError
      const { error: dbError } = await supabase
        .from('mock_interview_sessions')
        .update({ 
          recording_url: filePath, // Saving the PATH
          analysis_status: 'processing' 
        })
        .eq('id', currentSessionId)
      if (dbError) throw dbError
      const localAudioUrl = URL.createObjectURL(audioBlob)
      setAudioUrl(localAudioUrl) 
      setAnalysisStatus('processing') 
      triggerAnalysis(currentSessionId) 
    } catch (error) {
      console.error('Error uploading file:', error); setError(`Upload failed: ${(error as Error).message}`)
    } finally {
      setIsUploading(false)
    }
  }
  
  // --- *** NEW: Functions for Text Input *** ---
  
  // 1. Handle typing in any text area
  const handleAnswerChange = (questionId: number, text: string) => {
    setTypedAnswers(prev => ({
      ...prev,
      [questionId]: text,
    }))
  }

  // 2. Submit all written answers
  const submitTextAnswers = async () => {
    if (!profile) {
      setError('User profile not loaded. Cannot start session.'); return
    }
    // Check if at least one answer is written
    if (Object.keys(typedAnswers).length === 0 || Object.values(typedAnswers).every(ans => ans.trim() === '')) {
      setError('Please write at least one answer before submitting.'); return
    }
    
    setError(null)
    setAnalysisStatus('processing') // Show "Analyzing..."
    
    let newSessionId: number;
    try {
      // 1. Create a new session with the typed answers
      const { data, error } = await supabase
        .from('mock_interview_sessions')
        .insert({ 
          user_id: profile.id, 
          session_date: new Date().toISOString(),
          questions_asked: questions, 
          typed_answers: typedAnswers, // <-- SAVE THE TEXT ANSWERS
          analysis_status: 'processing' // <-- Set to 'processing'
        })
        .select('id')
        .single()
        
      if (error) throw error
      if (!data) throw new Error("Could not create session in database.")
      newSessionId = data.id
      setSessionId(newSessionId)
      
      // 2. Trigger the analysis immediately
      triggerAnalysis(newSessionId)

    } catch (error) {
      console.error('Error submitting text answers:', error)
      setError('Failed to submit your answers.')
      setAnalysisStatus('failed')
    }
  }
  
  // --- triggerAnalysis & Polling (Unchanged) ---
  const triggerAnalysis = async (sessionIdToAnalyze: number) => {
    try {
      const response = await fetch('/api/analyze/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdToAnalyze }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.details || 'Analysis API failed')
      }
      if (data.analysis_status === 'completed') {
        const feedbackData = JSON.parse(data.ai_feedback)
        setFeedback(feedbackData)
        setAnalysisStatus('completed')
      } else {
        pollForAnalysisResults(sessionIdToAnalyze)
      }
    } catch (err) {
      console.error('Error triggering analysis:', err); setError((err as Error).message); setAnalysisStatus('failed')
    }
  }
  const pollForAnalysisResults = async (sessionIdToPoll: number) => {
    // ... (This function is identical to the previous step)
    const interval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('mock_interview_sessions').select('analysis_status, ai_feedback').eq('id', sessionIdToPoll).single()
        if (error) throw error
        if (data.analysis_status === 'completed') {
          clearInterval(interval); const feedbackData = JSON.parse(data.ai_feedback);
          setFeedback(feedbackData); setAnalysisStatus('completed');
        } else if (data.analysis_status === 'failed') {
          clearInterval(interval); setError('Analysis failed. Please try again.'); setAnalysisStatus('failed');
        }
      } catch (err) {
        clearInterval(interval); console.error('Error polling for results:', err);
        setError('Error fetching analysis results.'); setAnalysisStatus('failed');
      }
    }, 5000)
  }
  
  // --- *** Render logic (Heavily Updated) *** ---
  if (loadingPage) {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Mock Interview Practice</h1>

        {questions.length === 0 ? (
          // --- SETUP STAGE (Unchanged) ---
          <div className="p-6 bg-white shadow-md rounded-lg">
            {/* ... (This JSX is identical to the previous step) ... */}
            <h2 className="text-2xl font-semibold mb-4">Prepare for your Interview</h2>
            {error && <p className="text-red-500 bg-red-100 p-3 rounded-md mb-4">{error}</p>}
            <div className="mb-4">
              <label htmlFor="job-role" className="block text-sm font-medium text-gray-700">Select a Job Role:</label>
              <select id="job-role" value={selectedJobId} onChange={(e) => { setSelectedJobId(e.target.value); setCustomJobTitle(''); }} className="w-full p-2 border rounded-md mt-1 text-black">
                <option value="">-- Choose a pre-defined job --</option>
                {allJobs.map(job => <option key={job.id} value={job.id}>{job.title}</option>)}
              </select>
            </div>
            <div className="flex items-center my-4">
              <div className="flex-grow border-t border-gray-300"></div><span className="flex-shrink mx-4 text-gray-500">OR</span><div className="flex-grow border-t border-gray-300"></div>
            </div>
            <div className="mb-4">
              <label htmlFor="custom-job" className="block text-sm font-medium text-gray-700">Type a Custom Job Title:</label>
              <input type="text" id="custom-job" value={customJobTitle} onChange={(e) => { setCustomJobTitle(e.target.value); setSelectedJobId(''); }} placeholder="e.g., 'Cloud Security Analyst'" className="w-full p-2 border rounded-md mt-1 text-black" />
            </div>
            <button onClick={handleGenerateQuestions} disabled={isGenerating || (!selectedJobId && !customJobTitle.trim()) || !profile} className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400">
              {isGenerating ? 'Generating Questions...' : 'Generate Interview Questions'}
            </button>
            {!profile && <p className="text-red-500 text-sm mt-2">Loading profile...</p>}
          </div>
        ) : (
          // --- *** INTERVIEW & RESULTS STAGE (UPDATED) *** ---
          <div className="p-6 bg-white shadow-md rounded-lg">
            <h2 className="text-2xl font-semibold mb-4">Your Session</h2>
            
            {/* 1. Questions List (Only show if not completed) */}
            {analysisStatus !== 'completed' && (
              <div className="space-y-4">
                {questions.map((q, index) => (
                  <div key={q.id} className="p-4 bg-gray-100 rounded-md">
                    <span className="text-xs font-semibold text-blue-600 uppercase">{q.question_type}</span>
                    <p className="text-lg text-gray-800 mt-1">{index + 1}. {q.question_text}</p>
                  </div>
                ))}
              </div>
            )}
            
            {/* 2. Input Controls (NEW: Toggle) */}
            <div className="mt-6 p-4 border-t">
              <h3 className="text-xl font-semibold mb-4">Your Answer</h3>
              {error && <p className="text-red-500 bg-red-100 p-3 rounded-md mb-4">{error}</p>}
              
              {/* --- NEW: Input Type Toggle --- */}
              <div className="flex justify-center mb-4">
                <div className="flex rounded-md bg-gray-200 p-1">
                  <button
                    onClick={() => setInputType('audio')}
                    className={`px-4 py-2 rounded-md font-medium ${inputType === 'audio' ? 'bg-white shadow' : 'text-gray-600'}`}
                  >
                    Audio
                  </button>
                  <button
                    onClick={() => setInputType('text')}
                    className={`px-4 py-2 rounded-md font-medium ${inputType === 'text' ? 'bg-white shadow' : 'text-gray-600'}`}
                  >
                    Text
                  </button>
                </div>
              </div>

              {/* --- A: Audio Controls --- */}
              {inputType === 'audio' && (
                <div className="flex items-center space-x-4">
                  <button onClick={startRecording} disabled={isRecording || isUploading || analysisStatus === 'processing'} className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400">Start Recording</button>
                  <button onClick={stopRecording} disabled={!isRecording || isUploading} className="bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:bg-gray-400">Stop Recording</button>
                  {isRecording && <span className="text-red-500 animate-pulse">Recording...</span>}
                </div>
              )}
              
              {/* --- B: Text Controls --- */}
              {inputType === 'text' && (
                <div className="space-y-4">
                  {questions.map((q, index) => (
                    <div key={q.id}>
                      <label htmlFor={`q-${q.id}`} className="block font-medium text-gray-700">
                        {index + 1}. {q.question_text}
                      </label>
                      <textarea
                        id={`q-${q.id}`}
                        rows={4}
                        value={typedAnswers[q.id] || ''}
                        onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                        className="w-full p-2 border rounded-md mt-1 text-black"
                        placeholder="Type your answer here..."
                      />
                    </div>
                  ))}
                  <button
                    onClick={submitTextAnswers}
                    disabled={analysisStatus === 'processing' || isGenerating}
                    className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400"
                  >
                    Submit Written Answers
                  </button>
                </div>
              )}
            </div>

            {/* 3. Analysis & Results Section (Updated) */}
            {(isUploading || analysisStatus === 'processing' || analysisStatus === 'completed' || audioUrl) && (
              <div className="mt-6 p-4 border-t">
                <h3 className="text-xl font-semibold mb-4">Your Results</h3>
                {isUploading && <p className="text-blue-600 mt-4">Uploading, please wait...</p>}
                
                {analysisStatus === 'processing' && (
                  <div className="text-blue-600 mt-4 font-semibold">
                    <p>Submission received! Analyzing your answers... (This may take a minute)</p>
                  </div>
                )}
                
                {analysisStatus === 'failed' && (
                  <p className="text-red-500 mt-4">Analysis failed. Please try again.</p>
                )}
                
                {analysisStatus === 'completed' && feedback && (
                  <div className="space-y-4">
                    {/* ... (Result display is identical to previous step) ... */}
                    <div className="text-center p-6 bg-blue-50 rounded-lg">
                      <p className="text-lg font-medium text-blue-800">Overall Score</p>
                      <p className="text-6xl font-bold text-blue-600 my-2">{feedback.overall_score}<span className="text-2xl">/10</span></p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-lg text-black">Overall Feedback:</h4>
                      <p className="text-gray-700 mt-1">{feedback.overall_feedback}</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-lg text-black">Detailed Feedback:</h4>
                      <div className="space-y-3 mt-2">
                        {feedback.question_feedback.map((qf, index) => (
                          <div key={index} className="p-3 bg-gray-100 rounded-md">
                            <p className="font-medium text-gray-800">{qf.question}</p>
                            <p className="text-gray-600 mt-1">{qf.feedback}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Only show audio player if an audioUrl exists */}
                {audioUrl && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-black">Your Recording:</h4>
                    <audio src={audioUrl} controls className="w-full mt-2" />
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => { setQuestions([]); setError(null); setAudioUrl(null); setFeedback(null); setAnalysisStatus('pending'); setTypedAnswers({}); }}
              disabled={isRecording || isUploading || analysisStatus === 'processing'}
              className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 mt-6 disabled:bg-gray-400"
            >
              Start a New Session
            </button>
          </div>
        )}
      </div>
    </div>
  )
}