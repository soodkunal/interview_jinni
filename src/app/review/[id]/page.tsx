'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import Image from 'next/image'

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
  questions_asked: any[] | null;
}
type PeerFeedback = {
  id: number; peer_score: number; comments: string; created_at: string;
  users: { full_name: string | null; email: string | null; } | null; 
}
// --- FINAL FIX: SIMPLIFY ReviewRequest TYPE STRUCTURE ---
type ReviewRequest = {
  id: number; session_id: number;
  // We rely on simple object access for the joined tables now
  requester_profile: any; 
  mock_interview_sessions: any;
  status: string;
}
// -----------------------------------------------------------

export default function ReviewDetailPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const { id } = params 

  const [profile, setProfile] = useState<PublicUserProfile | null>(null)
  const [request, setRequest] = useState<ReviewRequest | null>(null)
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

      const { data: publicProfile } = await supabase
        .from('users').select('id, auth_id').eq('auth_id', user.id).single()

      if (!publicProfile) { setError('Could not load your user profile.'); setLoading(false); return }
      setProfile(publicProfile)
      
      // 1. Fetch the original session data for comparison 
      const { data: sessionData, error: sessionError } = await supabase
        .from('mock_interview_sessions')
        .select('*')
        .eq('id', id)
        .single()

      if (sessionError || !sessionData) { setError('Could not load this session.'); setLoading(false); return }
      
      // 2. Fetch the review request and all nested data 
      const { data: requestData, error: requestError } = await supabase
        .from('peer_review_requests')
        .select(`
          id,
          session_id,
          status,
          requester_profile:requester_id ( full_name, email ), 
          mock_interview_sessions:session_id ( id, recording_url, questions_asked, user_id )
        `)
        .eq('id', id)
        .single()
        
      if (requestError || !requestData) { setError('Could not find this review request.'); setLoading(false); return }
      
      // --- FINAL FIX: EXPLICITLY CAST TO ANY BEFORE THE FINAL CAST ---
      setRequest(requestData as any as ReviewRequest) 
      // ----------------------------------------------------------------
      
      // 3. Parse the AI feedback (using the sessionData fetched earlier)
      if (sessionData.ai_feedback && sessionData.analysis_status === 'completed') {
        try {
          const parsedFeedback = JSON.parse(sessionData.ai_feedback)
          setFeedback(parsedFeedback)
        } catch (e) { console.error('Error parsing feedback JSON:', e) }
      }
      
      // 4. Fetch existing peer reviews 
      const { data: reviewData } = await supabase
        .from('mock_interview_feedback')
        .select(`
          id, peer_score, comments, created_at,
          reviewer_profile:reviewer_id ( full_name, email )
        `)
        .eq('session_id', id)
        
      if (reviewData) { 
          const transformedReviews = (reviewData as any[]).map(review => ({
              ...review,
              users: review.reviewer_profile 
          }));
          setPeerReviews(transformedReviews as PeerFeedback[]) 
      }
      
      // 5. Check request status
      if (requestData.status) { setRequestStatus(requestData.status) }
      
      setLoading(false)
    }

    fetchSessionDetails()
  }, [supabase, router, id])

  // --- Handle Submit (UNCHANGED LOGIC) ---
  const handleRequestReview = async () => {
    if (!request || !profile) { setError('Cannot create a request: session or profile not loaded.'); return }
    
    setIsRequesting(true); setError(null);
    
    try {
      const { error } = await supabase
        .from('peer_review_requests')
        .insert({
          session_id: request.session_id,
          requester_id: profile.id,
          status: 'pending' 
        })
      
      if (error) throw error
      
      setRequestStatus('pending')
      
    } catch (err) {
      console.error('Error creating request:', err)
      setError((err as Error).message)
    } finally {
      setIsRequesting(false)
    }
  }

  // --- Render Logic (FINAL ACCESS FIX) ---
  const renderContent = () => {
    if (loading) {
      return <div className="flex justify-center items-center p-8">Loading session...</div>
    }
    if (error) {
      return <p className="text-red-500 bg-red-100 p-3 rounded-md">{error}</p>
    }
    if (!request || !request.mock_interview_sessions) {
      return <p>Session data not found.</p>
    }

    // Access the profile and session data, assuming it's the first element if array
    const session = Array.isArray(request.mock_interview_sessions) 
        ? request.mock_interview_sessions[0] 
        : request.mock_interview_sessions;

    const requesterProfile = Array.isArray(request.requester_profile) 
        ? request.requester_profile[0] 
        : request.requester_profile;
        
    const requesterName = requesterProfile?.full_name || 'Anonymous User'

    return (
      <div className="space-y-6">
        {/* --- 1. Session Content --- */}
        <div className="p-6 bg-white shadow-md rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">
            Reviewing Session for {requesterName}
          </h2>
          
          {session.recording_url && (
            <div className="mb-4">
              <h3 className="font-semibold text-lg text-black">Audio Submission:</h3>
              <p className="text-sm text-gray-500 italic">Audio path: {session.recording_url}</p>
              <p className="text-sm text-red-500 mt-1">
                (Note: Audio playback needs server-side configuration to generate a signed URL.)
              </p>
            </div>
          )}
          
          {session.typed_answers && (
            <div className="mb-4">
              <h3 className="font-semibold text-lg text-black">Written Answers:</h3>
              <div className="space-y-3 mt-2">
                {session.questions_asked?.map((q: { id: number, question_text: string }) => ( 
                <div key={q.id} className="p-3 bg-gray-50 rounded-md">
                <p className="font-medium text-gray-800">{q.question_text}</p>
                    <p className="text-gray-600 mt-2 pl-4 border-l-2 border-climby-500">
                      {session.typed_answers![q.id] || <i>No answer provided.</i>}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* --- 2. AI Feedback (Unchanged) --- */}
        {feedback ? (
          <div className="p-6 bg-white shadow-md rounded-lg space-y-4">
            <h2 className="text-2xl font-semibold mb-2">AI Analysis</h2>
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
        
        {/* --- 3. Peer Review Section --- */}
        <div className="p-6 bg-white shadow-md rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Peer Review</h2>
          
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