'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'

// Type for our profile
type PublicUserProfile = {
  id: number // bigint
  auth_id: string
}

// Type for an available peer (from peer_availability join)
type AvailablePeer = {
  user_id: number
  users: {
    full_name: string | null
    email: string | null
    avatar_url: string | null
  } | null
}

// Type for a directly searched user profile
type SearchedUser = {
  id: number
  full_name: string | null
  email: string | null
  avatar_url: string | null
  is_available: boolean; 
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
  
  const [searchId, setSearchId] = useState('')
  const [searchedUser, setSearchedUser] = useState<SearchedUser | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  
  const callRequestChannelRef = useRef<any>(null)

  // Function to fetch all available peers (Unchanged)
  const fetchAvailablePeers = useCallback(async (myProfile: PublicUserProfile) => {
    if (!myProfile) return

    const { data, error } = await supabase
      .from('peer_availability')
      .select(`
        user_id,
        users ( full_name, email, avatar_url )
      `)
      .eq('is_available', true)
      .not('user_id', 'eq', myProfile.id)

    if (error) {
      console.error('Error fetching peers:', error)
      setError('Could not load available peers.')
    } else {
      const transformedData = data.map((item: any) => ({
        user_id: item.user_id,
        users: item.users, 
      }));
      setAvailablePeers(transformedData as AvailablePeer[])
    }
  }, [supabase])

  // useEffect (Unchanged)
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

  // Function to toggle my availability (Unchanged)
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

  // Handle User ID Search (FINAL FIX)
  const handleSearch = async () => {
    setSearchedUser(null)
    setSearchError(null)
    
    const id = parseInt(searchId.trim())
    if (isNaN(id) || id <= 0) {
      setSearchError('Please enter a valid numeric User ID.')
      return
    }
    if (profile && id === profile.id) {
      setSearchError("You can't call yourself.")
      return
    }

    // 1. Check if the user exists AND if they are available
    // We use a clean select list to avoid the parser errors
    const { data, error } = await supabase
      .from('users')
      .select(`
        id, 
        full_name, 
        email, 
        avatar_url,
        peer_availability!inner(is_available)
      `)
      .eq('id', id)
      .eq('peer_availability.is_available', true) 
      .single()

    if (error || !data) {
      const { data: userCheck } = await supabase.from('users').select('id').eq('id', id).maybeSingle();
      
      if (!userCheck) {
         setSearchError(`User with ID ${id} not found.`);
      } else {
         setSearchError(`User is currently marked as Offline (ID: ${id}).`);
      }
      
    } else {
      // --- FIX IS HERE: Safely access the data array/object ---
      const availabilityData = data.peer_availability;
      let isAvailableStatus = false;
      
      if (Array.isArray(availabilityData) && availabilityData.length > 0) {
        // If it's an array (due to parser ambiguity), use the first element
        isAvailableStatus = availabilityData[0].is_available;
      } else if (availabilityData && typeof availabilityData === 'object' && 'is_available' in availabilityData) {
        // If it's a singular object (correct type), use it directly
        isAvailableStatus = (availabilityData as any).is_available;
      }
      // --- END FIX ---
      
      const result: SearchedUser = {
          id: data.id,
          full_name: data.full_name,
          email: data.email,
          avatar_url: data.avatar_url,
          is_available: isAvailableStatus
      }
      setSearchedUser(result);
    }
  }
  // --------------------------------------------------

  // Function to request a call (Unchanged Logic)
  const handleRequestCall = async (peer: AvailablePeer | SearchedUser) => {
    if (!profile) {
      setError('Your profile is not loaded.'); return
    }
    
    const responderId = 'user_id' in peer ? peer.user_id : peer.id;

    if ('is_available' in peer && !peer.is_available) {
        setError("Cannot call: user is currently offline.");
        return;
    }

    const peerName = 'users' in peer ? (peer.users?.full_name || peer.users?.email) : (peer.full_name || peer.email);
    
    const tempPeer: AvailablePeer = {
      user_id: responderId,
      users: {
        // FIX: Use ?? null to convert any potential 'undefined' to 'null'
        full_name: (peerName as string | null) ?? null, 
        email: (peerName as string | null) ?? null,
        // The ternary operator already handles null/undefined, but we use ?? null for safety
        avatar_url: ('users' in peer ? peer.users?.avatar_url : peer.avatar_url) ?? null, 
      }
    }
    
    setCallingPeer(tempPeer)
    setCallStatus('Calling...')
    setError(null)

    const { data: requestData, error: insertError } = await supabase
      .from('peer_call_requests')
      .insert({
        requester_id: profile.id,
        responder_id: responderId, 
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

  // Render Logic (UPDATED)
  const renderContent = () => {
    if (loading) {
      return <div className="text-center p-8">Loading...</div>
    }
    
    // Render Search Result (If applicable)
    const renderSearchResult = () => {
      if (searchError) {
        return <p className="text-red-500 mt-2">{searchError}</p>
      }
      if (searchedUser) {
        const isBlocked = blockedPeers[searchedUser.id] > Date.now();
        const callButtonText = isBlocked ? 'On Cooldown' : 'Request Call';
        
        const peerToCall: SearchedUser = {
          id: searchedUser.id,
          full_name: searchedUser.full_name,
          email: searchedUser.email,
          avatar_url: searchedUser.avatar_url,
          is_available: true
        }

        return (
          <div 
            key={searchedUser.id} 
            className="p-4 bg-white shadow-md rounded-lg flex justify-between items-center border border-climby-500"
          >
            <div className="flex items-center space-x-3">
              <Image
                src={searchedUser.avatar_url || '/default-avatar.png'}
                alt={searchedUser.full_name || 'Profile picture'}
                width={40}
                height={40}
                className="rounded-full"
              />
              <p className="text-lg font-semibold text-gray-800">
                {searchedUser.full_name || searchedUser.email}
              </p>
            </div>
            
            <button 
              onClick={() => handleRequestCall(peerToCall)}
              disabled={!!callingPeer || isBlocked}
              className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400"
            >
              {callingPeer && callingPeer.user_id === searchedUser.id ? callStatus : callButtonText}
            </button>
          </div>
        )
      }
      return null
    }

    return (
      <>
        {/* User ID Search Bar */}
        <div className="mb-8 p-4 bg-white shadow-md rounded-lg">
          <h2 className="text-xl font-heading font-semibold mb-2">Search by User ID</h2>
          <div className="flex space-x-2">
            <input
              type="text"
              placeholder="Enter User ID (e.g., 1001)"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              className="flex-grow p-2 border rounded-md text-black"
            />
            {/* Applied High Contrast Border Style */}
            <button
              onClick={handleSearch}
              className="bg-white text-climby-600 border border-climby-500 py-2 px-4 rounded-md hover:bg-climby-50"
            >
              Search
            </button>
            {/* ----------------------------------------------- */}
          </div>
          <div className="mt-2">
            {renderSearchResult()}
          </div>
        </div>

        <h2 className="text-xl font-heading font-semibold mb-4">Available Peers</h2>
        
        {availablePeers.length === 0 ? (
          <div className="text-center p-8 bg-gray-50 rounded-lg">
            <p className="text-gray-500 mt-2">
              No other users are currently available.
            </p>
          </div>
        ) : (
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
        )}
      </>
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
        
        {error && <p className="text-red-500 bg-red-100 p-3 rounded-md mb-4">{error}</p>
        }
        
        <p className="text-gray-600 mb-6">
          Set your status to "Available" to show up here, or search directly by User ID.
        </p>

        {renderContent()}
      </div>
    </div>
  )
}