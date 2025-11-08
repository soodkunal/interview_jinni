'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

// --- Types ---
type PublicUserProfile = { id: number; auth_id: string; }
type AnalysisFeedback = {
  overall_score: number; overall_feedback: string;
  question_feedback: { question: string; feedback: string }[];
}
type MockSession = {
  id: number; session_date: string; ai_score: number | null; analysis_status: string | null;
  recording_url: string | null; ai_feedback: string | null; typed_answers: Record<number, string> | null;
  user_id: number; 
}

// NOTE: We change the PeerFeedback type to be robust
type PeerFeedback = {
  id: number; peer_score: number; comments: string; created_at: string;
  // This is the array structure the database is returning, we fix it in the fetch
  users: { full_name: string | null; email: string | null; } | null; 
}

export default function SessionDetailPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const { id } = params 

  const [profile, setProfile] = useState<PublicUserProfile | null>(null)
  const [session, setSession] = useState<MockSession | null>(null)
  const [feedback, setFeedback] = useState<AnalysisFeedback | null>(null)
  
  const [peerReviews, setPeerReviews] = useState<PeerFeedback[]>([])
  const [isRequesting, setIsRequesting] = useState(false)
  const [requestStatus, setRequestStatus] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setLoading(false); setError('No session ID provided.'); return
    }

    const fetchSessionDetails = async () => {
      setLoading(true)
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: publicProfile, error: profileError } = await supabase
        .from('users').select('id, auth_id').eq('auth_id', user.id).single()

      if (profileError || !publicProfile) { setError('Could not load your user profile.'); setLoading(false); return }
      setProfile(publicProfile)
      
      // 1. Fetch the specific session
      const { data: sessionData, error: sessionError } = await supabase
        .from('mock_interview_sessions')
        .select('*') 
        .eq('id', id)
        .single()

      if (sessionError || !sessionData) { setError('Could not load this session.'); setLoading(false); return }
      
      // 2. Security Check: Ensure the user owns this session
      if (sessionData.user_id !== publicProfile.id) {
        setError('You do not have permission to view this session.')
        setLoading(false); return
      }
      setSession(sessionData)
      
      // 3. Try to parse the AI feedback
      if (sessionData.ai_feedback && sessionData.analysis_status === 'completed') {
        try {
          const parsedFeedback = JSON.parse(sessionData.ai_feedback)
          setFeedback(parsedFeedback)
        } catch (e) { console.error('Error parsing feedback JSON:', e) }
      }
      
      // 4. Fetch existing peer reviews (THE FINAL FIX)
      const { data: reviewData } = await supabase
        .from('mock_interview_feedback')
        .select(`
          id, peer_score, comments, created_at,
          reviewer_profile:reviewer_id ( full_name, email ) // <--- RENAMED THE JOIN
        `)
        .eq('session_id', id)
        
      if (reviewData) {
        // FIX: Transform the array results to match the PeerFeedback type
        const transformedReviews = (reviewData as any[]).map(review => ({
            ...review,
            users: review.reviewer_profile[0] || null // Safely access the first user object
        }));
        setPeerReviews(transformedReviews as PeerFeedback[])
      }
      
      // 5. Check if a review has already been requested
      const { data: requestData } = await supabase
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

  // --- Handle Request Review ---
  const handleRequestReview = async () => {
    if (!session || !profile || session.analysis_status !== 'completed') {
      setError('Cannot request review: Session analysis is not complete.')
      return
    }
    
    // Check if the user is using the intended owner ID to make the request
    if (session.user_id !== profile.id) {
        setError('Only the session owner can request a peer review.');
        return;
    }

    setIsRequesting(true); setError(null);
    
    try {
      await supabase
        .from('peer_review_requests')
        .insert({
          session_id: session.id,
          requester_id: profile.id,
          status: 'pending' 
        })
      
      setRequestStatus('pending'); // Update UI
      
    } catch (err) {
      console.error('Error creating request:', err);
      setError('Failed to create request. Check console.');
    } finally {
      setIsRequesting(false);
    }
  }

  const renderContent = () => {
    if (loading) { return <div className="flex justify-center items-center p-8">Loading session...</div> }
    if (error) { return <p className="text-red-500 bg-red-100 p-3 rounded-md">{error}</p> }
    if (!session) { return <p>Session not found.</p> }

    return (
      <div className="space-y-6">
        {/* --- 1. Session Summary --- */}
        <div className="p-6 bg-white shadow-md rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Session Details</h2>
          <p><strong>Date:</strong> {new Date(session.session_date).toLocaleString()}</p>
          <p><strong>Type:</strong> {session.recording_url ? 'Audio' : 'Text'}</p>
          <p><strong>Status:</strong> {session.analysis_status}</p>
          
          {session.recording_url && (
            <div className="mt-4">
              <h4 className="font-semibold text-black">Your Recording:</h4>
              <p className="text-sm text-gray-500 italic">Recording path: {session.recording_url}</p>
              {/* Note: In a production app, we would generate a signed URL here */}
            </div>
          )}
        </div>

        {/* --- 2. AI Feedback --- */}
        {feedback ? (
          <div className="p-6 bg-white shadow-md rounded-lg space-y-4">
            <h2 className="text-2xl font-semibold mb-2">AI Analysis</h2>
            <div className="text-center p-6 bg-blue-50 rounded-lg">
              <p className="text-lg font-medium text-blue-800">Overall Score</p>
              <p className="text-6xl font-bold text-blue-600 my-2">{feedback.overall_score}<span className="text-2xl">/10</span></p>
            </div>
            {/* Detailed Feedback (omitted for brevity) */}
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
            {session.analysis_status === 'processing' ? 'Analysis is still running...' : 'This session is not yet analyzed.'}
          </p>
        )}
        
        {/* --- 3. Peer Review Section --- */}
        <div className="p-6 bg-white shadow-md rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Peer Review</h2>
          
          {/* CRITICAL CHECK: Show button ONLY if status is COMPLETED and NO request exists */}
          {(session.analysis_status === 'completed') && (requestStatus === null) && (peerReviews.length === 0) && (
            <button
              onClick={handleRequestReview}
              disabled={isRequesting}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400"
            >
              {isRequesting ? 'Submitting Request...' : 'Request Peer Review'}
            </button>
          )}

          {requestStatus === 'pending' && (
            <p className="text-blue-600 font-medium">Your request is pending review.</p>
          )}
          
          {/* Render peer reviews if they exist or show 'No reviews' message */}
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