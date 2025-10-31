'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image' // <-- 1. NEW: Import Image

// Type for our profile
type PublicUserProfile = {
  id: number // bigint
  auth_id: string
}

// Type for an available peer
type AvailablePeer = {
  user_id: number
  users: {
    full_name: string | null
    email: string | null
    avatar_url: string | null // <-- 2. NEW: Add avatar_url
  } | null
}

export default function LiveHubPage() {
  const supabase = createClient()
  const router = useRouter()

  const [profile, setProfile] = useState<PublicUserProfile | null>(null)
  const [isAvailable, setIsAvailable] = useState(false)
  const [availablePeers, setAvailablePeers] = useState<AvailablePeer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [callingPeer, setCallingPeer] = useState<AvailablePeer | null>(null)
  const [callStatus, setCallStatus] = useState<string | null>(null)
  const [blockedPeers, setBlockedPeers] = useState<Record<number, number>>({});
  
  const callRequestChannelRef = useRef<any>(null)

  // --- 1. Function to fetch all available peers (UPDATED) ---
  // Inside src/app/live/page.tsx, around line 45

const fetchAvailablePeers = useCallback(async (myProfile: PublicUserProfile) => {
    if (!myProfile) return

    const { data, error } = await supabase
      .from('peer_availability')
      .select(`
        user_id,
        peer_profile:user_id ( full_name, email, avatar_url ) // <-- THE FIX IS HERE
      `) 
      .eq('is_available', true)
      .not('user_id', 'eq', myProfile.id)

    if (error) {
      console.error('Error fetching peers:', error)
      setError('Could not load available peers.')
    } else {
      // We must now cast the result to match the new name
      // The old 'users' property will now be 'peer_profile'
      const transformedData = data.map((item: any) => ({
        user_id: item.user_id,
        users: item.peer_profile, // Map the renamed property back to 'users'
      }));

      setAvailablePeers(transformedData as AvailablePeer[])
    }
  }, [supabase])

  // --- 2. useEffect to fetch initial data and subscribe (Unchanged) ---
  useEffect(() => {
    let myProfile: PublicUserProfile | null = null;
    
    const setupPage = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/'); return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('users').select('id, auth_id').eq('auth_id', user.id).single()
      
      if (profileError || !profileData) {
        setError('Could not load your user profile.'); setLoading(false); return
      }
      myProfile = profileData;
      setProfile(myProfile)

      const { data: availData } = await supabase
        .from('peer_availability')
        .select('is_available')
        .eq('user_id', myProfile.id)
        .single()
      
      if (availData) {
        setIsAvailable(availData.is_available)
      }

      await fetchAvailablePeers(myProfile)
      setLoading(false)
    }
    setupPage()

    const channel = supabase
      .channel('peer-availability-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'peer_availability' },
        (payload) => {
          console.log('Availability change received!', payload)
          if (myProfile) {
            fetchAvailablePeers(myProfile)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, router, fetchAvailablePeers])

  // --- 3. Function to toggle my availability (Unchanged) ---
  const toggleAvailability = async () => {
    if (!profile) return
    const newStatus = !isAvailable
    setIsAvailable(newStatus)

    const { error } = await supabase
      .from('peer_availability')
      .upsert({ 
        user_id: profile.id, 
        is_available: newStatus,
        last_seen_at: new Date().toISOString()
      })
    if (error) {
      console.error('Error updating status:', error)
      setError(error.message); setIsAvailable(!newStatus);
    }
  }

  // --- 4. Function to request a call (Unchanged) ---
  const handleRequestCall = async (peer: AvailablePeer) => {
    if (!profile) {
      setError('Your profile is not loaded.'); return
    }
    
    setCallingPeer(peer)
    setCallStatus('Calling...')
    setError(null)

    const { data: requestData, error: insertError } = await supabase
      .from('peer_call_requests')
      .insert({
        requester_id: profile.id,
        responder_id: peer.user_id,
        status: 'pending'
      })
      .select('id')
      .single()
      
    if (insertError || !requestData) {
      console.error('Error creating call request:', insertError)
      setError('Could not place the call.')
      setCallStatus(null); setCallingPeer(null);
      return
    }
    
    const callRequestId = requestData.id

    if (callRequestChannelRef.current) {
      supabase.removeChannel(callRequestChannelRef.current)
    }

    callRequestChannelRef.current = supabase
      .channel(`call-request-${callRequestId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'peer_call_requests',
          filter: `id=eq.${callRequestId}`
        },
        (payload) => {
          const newStatus = (payload.new as any).status
          if (newStatus === 'accepted') {
            router.push(`/live/${callRequestId}`)
          } else if (newStatus === 'rejected') {
            setCallStatus('Call Rejected')
            
            if (callingPeer) {
              const rejectedPeerId = callingPeer.user_id;
              const expiration = Date.now() + 120000; // 2 minutes
              setBlockedPeers(prev => ({ ...prev, [rejectedPeerId]: expiration }));
            }

            setTimeout(() => {
              setCallStatus(null); setCallingPeer(null);
            }, 3000)
          }
          supabase.removeChannel(callRequestChannelRef.current)
        }
      )
      .subscribe()
      
    setTimeout(() => {
      if (callStatus === 'Calling...') { 
        setCallStatus('No Answer')
        supabase.removeChannel(callRequestChannelRef.current)
        setTimeout(() => {
          setCallStatus(null); setCallingPeer(null);
        }, 3000)
      }
    }, 20000)
  }

  // --- 5. Render Logic (UPDATED) ---
  const renderContent = () => {
    if (loading) {
      return <div className="text-center p-8">Loading...</div>
    }
    if (availablePeers.length === 0) {
      return (
        <div className="text-center p-8 bg-gray-50 rounded-lg">
          <h2 className="text-xl font-medium text-gray-700">No Peers Available</h2>
          <p className="text-gray-500 mt-2">
            It's quiet in here. Set your status to "Available" to let others know you're around!
          </p>
        </div>
      )
    }
    
    return (
      <div className="space-y-4">
        {availablePeers.map((peer) => {
          const isCallingThisPeer = callingPeer?.user_id === peer.user_id;
          const blockExpires = blockedPeers[peer.user_id] || 0;
          const isBlocked = blockExpires > Date.now();
          
          return (
            <div 
              key={peer.user_id} 
              className="p-4 bg-white shadow-md rounded-lg flex justify-between items-center"
            >
              {/* --- 4. NEW: Added Image and container --- */}
              <div className="flex items-center space-x-3">
                <Image
                  src={peer.users?.avatar_url || '/default-avatar.png'}
                  alt={peer.users?.full_name || 'Profile picture'}
                  width={40}
                  height={40}
                  className="rounded-full"
                />
                <p className="text-lg font-semibold text-gray-800">
                  {peer.users?.full_name || peer.users?.email || 'Anonymous User'}
                </p>
              </div>
              
              <button 
                onClick={() => handleRequestCall(peer)}
                disabled={!!callingPeer || isBlocked}
                className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400"
              >
                {isCallingThisPeer 
                  ? callStatus 
                  : (isBlocked ? 'On Cooldown' : 'Request Call')}
              </button>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Live Hub</h1>
          <button
            onClick={toggleAvailability}
            className={`py-2 px-5 rounded-full font-medium transition-colors ${
              isAvailable 
                ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            }`}
          >
            {isAvailable ? '● Available' : '○ Offline'}
          </button>
        </div>
        
        {error && <p className="text-red-500 bg-red-100 p-3 rounded-md mb-4">{error}</p>}
        
        <p className="text-gray-600 mb-6">
          Set your status to "Available" to show up here. Click on a peer to start a call.
        </p>

        {renderContent()}
      </div>
    </div>
  )
}