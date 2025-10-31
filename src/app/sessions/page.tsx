'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

// Define a type for our session data
type MockSession = {
  id: number
  session_date: string
  ai_score: number | null
  analysis_status: string | null
  recording_url: string | null // We use this to determine the type (Audio/Text)
}

// Helper to format the status
const formatStatus = (status: string | null) => {
  switch (status) {
    case 'completed':
      return <span className="font-medium text-green-600">Completed</span>
    case 'processing':
      return <span className="font-medium text-blue-600">Processing...</span>
    case 'failed':
      return <span className="font-medium text-red-600">Failed</span>
    default:
      return <span className="font-medium text-gray-500">Pending</span>
  }
}

export default function SessionsPage() {
  const supabase = createClient()
  const router = useRouter()
  
  const [sessions, setSessions] = useState<MockSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSessions = async () => {
      setLoading(true)
      
      // 1. Get the authenticated user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/'); return
      }

      // 2. Get their public profile to find the bigint 'id'
      const { data: publicProfile, error: profileError } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', user.id)
        .single()

      if (profileError || !publicProfile) {
        console.error('Error fetching profile:', profileError)
        setError('Could not load your user profile.')
        setLoading(false); return
      }
      
      // 3. Fetch all sessions for that user_id
      const { data: sessionData, error: sessionError } = await supabase
        .from('mock_interview_sessions')
        .select('id, session_date, ai_score, analysis_status, recording_url')
        .eq('user_id', publicProfile.id)
        .order('session_date', { ascending: false }) // Show newest first

      if (sessionError) {
        console.error('Error fetching sessions:', sessionError)
        setError('Could not load your sessions.')
      } else if (sessionData) {
        setSessions(sessionData)
      }
      setLoading(false)
    }

    fetchSessions()
  }, [supabase, router])

  const renderContent = () => {
    if (loading) {
      return <div className="flex justify-center items-center p-8">Loading sessions...</div>
    }
    
    if (error) {
      return <p className="text-red-500 bg-red-100 p-3 rounded-md">{error}</p>
    }

    if (sessions.length === 0) {
      return (
        <div className="text-center p-8 bg-gray-50 rounded-lg">
          <h2 className="text-xl font-medium text-gray-700">No sessions found</h2>
          <p className="text-gray-500 mt-2">
            Go to the "Mock Interviews" page to complete your first session.
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {sessions.map((session) => (
          <a
            key={session.id}
            href={`/sessions/${session.id}`}
            className="block p-4 bg-white shadow-md rounded-lg flex justify-between items-center hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="text-lg font-semibold text-gray-800">
                {new Date(session.session_date).toLocaleString()}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Type: {session.recording_url ? 'Audio' : 'Text'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold">
                {session.ai_score ? `${session.ai_score} / 10` : '--'}
              </p>
              <p className="text-sm">
                {formatStatus(session.analysis_status)}
              </p>
            </div>
          </a>
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">My Past Sessions</h1>
        {renderContent()}
      </div>
    </div>
  )
}