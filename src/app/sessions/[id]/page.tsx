'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

// --- Types ---
type PublicUserProfile = {
  id: number // bigint
  auth_id: string
}
type AnalysisFeedback = {
  overall_score: number
  overall_feedback: string
  question_feedback: {
    question: string
    feedback: string
  }[]
}
type MockSession = {
  id: number
  session_date: string
  ai_score: number | null
  analysis_status: string | null
  recording_url: string | null
  ai_feedback: string | null
  typed_answers: Record<number, string> | null
  user_id: number // We need this to create the request
}
// NEW: Type for peer feedback
type PeerFeedback = {
  id: number
  peer_score: number
  comments: string
  created_at: string
  users: {
    full_name: string | null
    email: string | null
  } | null // To show who wrote the review
}

export default function SessionDetailPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const { id } = params

  const [profile, setProfile] = useState<PublicUserProfile | null>(null) // Current user
  const [session, setSession] = useState<MockSession | null>(null)
  const [feedback, setFeedback] = useState<AnalysisFeedback | null>(null)
  
  // NEW: State for peer reviews
  const [peerReviews, setPeerReviews] = useState<PeerFeedback[]>([])
  const [isRequesting, setIsRequesting] = useState(false)
  const [requestStatus, setRequestStatus] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setLoading(false)
      setError('No session ID provided.')
      return
    }

    const fetchSessionDetails = async () => {
      setLoading(true)
      
      // 1. Get the authenticated user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/'); return
      }

      // 2. Get their public profile
      const { data: publicProfile, error: profileError } = await supabase
        .from('users').select('id, auth_id').eq('auth_id', user.id).single()

      if (profileError || !publicProfile) {
        setError('Could not load your user profile.'); setLoading(false); return
      }
      setProfile(publicProfile)
      
      // 3. Fetch the specific session
      const { data: sessionData, error: sessionError } = await supabase
        .from('mock_interview_sessions')
        .select('*') // Get all columns
        .eq('id', id)
        .single()

      if (sessionError || !sessionData) {
        setError('Could not load this session.'); setLoading(false); return
      }
      
      // 4. Security Check: Ensure the user owns this session
      if (sessionData.user_id !== publicProfile.id) {
        setError('You do not have permission to view this session.')
        setLoading(false); return
      }
      setSession(sessionData)
      
      // 5. Try to parse the AI feedback
      if (sessionData.ai_feedback && sessionData.analysis_status === 'completed') {
        try {
          const parsedFeedback = JSON.parse(sessionData.ai_feedback)
          setFeedback(parsedFeedback)
        } catch (e) { console.error('Error parsing feedback JSON:', e) }
      }
      
      // 6. NEW: Fetch existing peer reviews for this session
      const { data: reviewData, error: reviewError } = await supabase
        .from('mock_interview_feedback')
        .select(`
          id, peer_score, comments, created_at,
          users:reviewer_id ( full_name, email )
        `)
        .eq('session_id', id)
        
      if (reviewData) {
        setPeerReviews(reviewData as PeerFeedback[])
      }
      
      // 7. NEW: Check if a review has already been requested
      const { data: requestData, error: requestError } = await supabase
        .from('peer_review_requests')
        .select('status')
        .eq('session_id', id)
        .eq('requester_id', publicProfile.id)
        .limit(1)
        
      if (requestData && requestData.length > 0) {
        setRequestStatus(requestData[0].status)
      }
      
      setLoading(false)
    }

    fetchSessionDetails()
  }, [supabase, router, id])

  // --- NEW FUNCTION: Request a Peer Review ---
  const handleRequestReview = async () => {
    if (!session || !profile) {
      setError('Cannot create a request: session or profile not loaded.')
      return
    }
    
    setIsRequesting(true)
    setError(null)
    
    try {
      const { data, error } = await supabase
        .from('peer_review_requests')
        .insert({
          session_id: session.id,
          requester_id: profile.id,
          status: 'pending' // This is a public request for anyone
        })
      
      if (error) throw error
      
      setRequestStatus('pending') // Update UI to show "Pending"
      
    } catch (err) {
      console.error('Error creating request:', err)
      setError((err as Error).message)
    } finally {
      setIsRequesting(false)
    }
  }

  const renderContent = () => {
    if (loading) {
      return <div className="flex justify-center items-center p-8">Loading session...</div>
    }
    if (error) {
      return <p className="text-red-500 bg-red-100 p-3 rounded-md">{error}</p>
    }
    if (!session) {
      return <p>Session not found.</p>
    }

    return (
      <div className="space-y-6">
        {/* --- 1. Session Summary (Unchanged) --- */}
        <div className="p-6 bg-white shadow-md rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Session Details</h2>
          <p><strong>Date:</strong> {new Date(session.session_date).toLocaleString()}</p>
          <p><strong>Type:</strong> {session.recording_url ? 'Audio' : 'Text'}</p>
          <p><strong>Status:</strong> {session.analysis_status}</p>
          
          {session.recording_url && (
            <div className="mt-4">
              <h4 className="font-semibold text-black">Your Recording:</h4>
              <p className="text-sm text-gray-500 italic">Recording path: {session.recording_url}</p>
            </div>
          )}
        </div>

        {/* --- 2. AI Feedback (Unchanged) --- */}
        {feedback ? (
          <div className="p-6 bg-white shadow-md rounded-lg space-y-4">
            <h2 className="text-2xl font-semibold mb-2">AI Analysis</h2>
            {/* ... (rest of the AI feedback JSX is identical) ... */}
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
        ) : (
          <p className="text-gray-600 p-6 bg-white shadow-md rounded-lg">
            This session is still pending analysis or has failed.
          </p>
        )}
        
        {/* --- 3. NEW: Peer Review Section --- */}
        <div className="p-6 bg-white shadow-md rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Peer Review</h2>
          
          {/* --- Request Button --- */}
          {requestStatus === null && peerReviews.length === 0 && (
            <button
              onClick={handleRequestReview}
              disabled={isRequesting}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400"
            >
              {isRequesting ? 'Submitting...' : 'Request Peer Review'}
            </button>
          )}
          
          {requestStatus === 'pending' && (
            <p className="text-blue-600 font-medium">Your request is pending review.</p>
          )}
          
          {/* --- Submitted Peer Reviews List --- */}
          {peerReviews.length > 0 ? (
            <div className="space-y-4 mt-4">
              {peerReviews.map(review => (
                <div key={review.id} className="p-4 bg-gray-50 rounded-lg border">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">
                      Review by {review.users?.full_name || review.users?.email || 'Anonymous'}
                    </h3>
                    <p className="text-xl font-bold text-green-700">
                      {review.peer_score} / 10
                    </p>
                  </div>
                  <p className="text-gray-700 mt-2">{review.comments}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Submitted on: {new Date(review.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 italic mt-4">
              No peer reviews have been submitted for this session yet.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <a href="/sessions" className="text-blue-600 hover:underline mb-4 block">&larr; Back to all sessions</a>
        {renderContent()}
      </div>
    </div>
  )
}