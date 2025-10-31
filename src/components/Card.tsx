import React from 'react'

// This component is a simple wrapper to make all our cards look consistent
export default function Card({ 
  children, 
  className = '' 
}: { 
  children: React.ReactNode, 
  className?: string 
}) {
  return (
    <div 
      className={`bg-white shadow-md rounded-lg p-6 ${className}`}
    >
      {children}
    </div>
  )
}