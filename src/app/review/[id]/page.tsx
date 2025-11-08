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
  users: { full_name: string | null; email: string | null; }[] | null; 
}

// NOTE: This type is simplified as the detailed nested data is fetched and accessed manually.
type ReviewRequest = {
  id: number; session_id: number;
  requester_profile: any; 
  mock_interview_sessions: any; 
  status: string;
}
// -------------

export default function ReviewDetailPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const { id } = params // CRITICAL: Gets the ID of the REVIEW REQUEST from the URL

  const [profile, setProfile] = useState<PublicUserProfile | null>(null)
  const [request, setRequest] = useState<ReviewRequest | null>(null)
  const [session, setSession] = useState<MockSession | null>(null) // Will hold the session detail
  const [feedback, setFeedback] = useState<AnalysisFeedback | null>(null)
  
  const [peerReviews, setPeerReviews] = useState<PeerFeedback[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setLoading(false); setError('No review request ID provided.'); return
    }

    const fetchRequestDetails = async () => {
      setLoading(true)
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: publicProfile } = await supabase
        .from('users').select('id, auth_id').eq('auth_id', user.id).single()

      if (!publicProfile) { setError('Could not load your user profile.'); setLoading(false); return }
      setProfile(publicProfile)
      
      // 1. Fetch the specific review request and nested data
      const { data: requestData, error: requestError } = await supabase
        .from('peer_review_requests')
        .select(`
          id, session_id, status,
          requester_profile:requester_id ( full_name, email ), 
          mock_interview_sessions:session_id ( * )
        `) // Select * gets ALL fields from mock_interview_sessions
        .eq('id', id)
        .single()
        
      if (requestError || !requestData) { 
          setError('Could not find this review request.'); 
          setLoading(false); 
          return; 
      }
      
      // Transform the array returns into single objects
      const sessionData = Array.isArray(requestData.mock_interview_sessions) 
          ? requestData.mock_interview_sessions[0] 
          : requestData.mock_interview_sessions;
      
      if (!sessionData) { 
          setError('Session data is missing from the request.'); 
          setLoading(false); 
          return;
      }

      setRequest(requestData as any) 
      setSession(sessionData as MockSession) 
      
      // 2. Try to parse the AI feedback
      if (sessionData.ai_feedback && sessionData.analysis_status === 'completed') {
        try {
          const parsedFeedback = JSON.parse(sessionData.ai_feedback)
          setFeedback(parsedFeedback)
        } catch (e) { console.error('Error parsing AI feedback JSON:', e) }
      }
      
      // 3. Fetch existing peer reviews 
      const { data: reviewData } = await supabase
        .from('mock_interview_feedback')
        .select(`
          id, peer_score, comments, created_at,
          users:reviewer_id ( full_name, email )
        `)
        .eq('session_id', requestData.session_id)
        
      if (reviewData) { 
          setPeerReviews(reviewData as PeerFeedback[]) 
      }
      
      setLoading(false)
    }

    fetchRequestDetails()
  }, [supabase, router, id])

  // --- Handle Submit Review ---
  const handleSubmitReview = async () => {
    if (!profile || !session || !request) {
      setError('Missing data to submit review.'); return
    }
    if (session.user_id === profile.id) {
        setError('You cannot review your own session.'); return
    }
    if (peerComments.trim().length < 10) {
      setError('Please provide at least 10 characters of feedback.'); return
    }
    
    setIsSubmitting(true); setError(null);
    
    try {
      // Step 1: Insert the new feedback
      await supabase
        .from('mock_interview_feedback')
        .insert({
          session_id: session.id,
          reviewer_id: profile.id, // The current user is the reviewer
          peer_score: peerScore,
          comments: peerComments
        })
      
      // Step 2: Update the request to 'completed'
      await supabase
        .from('peer_review_requests')
        .update({
          status: 'completed',
          assignee_id: profile.id // Assign it to the reviewer
        })
        .eq('id', request.id) // The request ID
      
      // Step 3: Success! Go back to the hub.
      router.push('/review')
      
    } catch (err) {
      console.error('Error submitting review:', err);
      setError('Error submitting review. See console for details.');
    } finally {
      setIsSubmitting(false);
    }
  }
  
  // --- Form State ---
  const [peerScore, setPeerScore] = useState(8) // Default score
  const [peerComments, setPeerComments] = useState('')
  
  // --- Render Logic ---
  const renderContent = () => {
    if (loading) { return <div className="flex justify-center items-center p-8">Loading session...</div> }
    if (error) { return <p className="text-red-500 bg-red-100 p-3 rounded-md">{error}</p> }
    if (!session || !request) { return <p>Session or Request not found.</p> }

    // Safely access data for rendering
    const requesterProfile = Array.isArray(request.requester_profile) 
        ? request.requester_profile[0] 
        : request.requester_profile;
        
    const requesterName = requesterProfile?.full_name || 'Anonymous User';
    const isOwner = session.user_id === profile?.id;

    return (
      <div className="space-y-6">
        {/* Back link */}
        <a href="/review" className="text-blue-600 hover:underline mb-4 block">&larr; Back to Review Hub</a>
        
        {/* --- 1. Session Content --- */}
        <div className="p-6 bg-white shadow-md rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">
            {isOwner ? 'Your Session' : `Reviewing Session for ${requesterName}`}
          </h2>
          
          {/* Show Audio Player */}
          {session.recording_url && (
            <div className="mb-4">
              <h3 className="font-semibold text-lg text-black">Audio Submission:</h3>
              <p className="text-sm text-gray-500 italic">Audio path: {session.recording_url}</p>
            </div>
          )}
          
          {/* Show Text Answers */}
          {session.typed_answers && (
            <div className="mb-4">
              <h3 className="font-semibold text-lg text-black">Written Answers:</h3>
              <div className="space-y-3 mt-2">
                {session.questions_asked?.map((q: any) => (
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
        
        {/* --- 2. Feedback Summary --- */}
        <div className="p-6 bg-white shadow-md rounded-lg">
           <h2 className="text-2xl font-semibold mb-4">Analysis Summary</h2>
           {feedback ? (
            <div>
              <div className="text-center p-4 bg-blue-50 rounded-lg mb-4">
                <p className="text-lg font-medium text-blue-800">AI Score</p>
                <p className="text-4xl font-bold text-blue-600">{feedback.overall_score}/10</p>
              </div>
              <p className="text-gray-700 mt-1">**AI Feedback:** {feedback.overall_feedback}</p>
            </div>
           ) : (
             <p className="text-gray-600">AI analysis not yet completed for this session.</p>
           )}
        </div>
        
        {/* --- 3. Submission Form (Only if I am NOT the owner and request is pending) --- */}
        {profile && session.user_id !== profile.id && request.status === 'pending' && (
            <div className="p-6 bg-white shadow-md rounded-lg">
                <h2 className="text-2xl font-semibold mb-4">Submit Your Peer Review</h2>
                
                <div className="space-y-4">
                    <div>
                        <label htmlFor="score" className="block text-sm font-medium text-gray-700">Score (1-10)</label>
                        <input
                            type="number"
                            id="score"
                            min="1"
                            max="10"
                            value={peerScore}
                            onChange={(e) => setPeerScore(parseInt(e.target.value))}
                            className="w-full p-2 border rounded-md mt-1 text-black"
                        />
                    </div>
                    <div>
                        <label htmlFor="comments" className="block text-sm font-medium text-gray-700">Comments</label>
                        <textarea
                            id="comments"
                            rows={5}
                            value={peerComments}
                            onChange={(e) => setPeerComments(e.target.value)}
                            className="w-full p-2 border rounded-md mt-1 text-black"
                            placeholder="Provide constructive feedback..."
                        />
                    </div>
                    <button
                        onClick={handleSubmitReview}
                        disabled={isSubmitting}
                        className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400 mt-4"
                    >
                        {isSubmitting ? 'Submitting Review...' : 'Submit Review'}
                    </button>
                </div>
            </div>
        )}
        
        {/* --- 4. Completed Reviews --- */}
        {peerReviews.length > 0 && (
             <div className="p-6 bg-white shadow-md rounded-lg">
                <h2 className="text-2xl font-semibold mb-4">Completed Peer Reviews</h2>
                {/* ... (Review rendering code) ... */}
                {peerReviews.map(review => (
                    <div key={review.id} className="p-4 bg-gray-50 rounded-lg border my-2">
                        <p className="font-bold text-green-700">{review.peer_score} / 10</p>
                        <p className="text-gray-700 mt-1">{review.comments}</p>
                    </div>
                ))}
            </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        {/* This link is for the requester viewing their own session */}
        <a href="/sessions" className="text-blue-600 hover:underline mb-4 block">&larr; Back to all sessions</a>
        {renderContent()}
      </div>
    </div>
  )
}