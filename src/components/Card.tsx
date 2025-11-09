import React from 'react'

export default function Card({ 
  children, 
  className = '' 
}: { 
  children: React.ReactNode, 
  className?: string 
}) {
  return (
    // Updated default styling for transitions and dark background
    <div 
      className={`bg-background-card shadow-md rounded-xl p-6 transition-all duration-300 ${className}`}
    >
      {children}
    </div>
  )
}