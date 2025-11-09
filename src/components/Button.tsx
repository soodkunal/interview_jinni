import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  className?: string;
  loading?: boolean;
}

const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  className = '', 
  loading = false, 
  ...props 
}) => {
  
  // Base styling for all buttons
  const baseStyle = 'inline-flex items-center justify-center font-semibold rounded-lg px-4 py-2 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2'

  // Variant-specific styling with gradients and shadows
  const variantStyles = {
    primary: `
      bg-climby-600 text-white shadow-lg hover:bg-climby-700 
      focus:ring-climby-500 active:shadow-inner
    `,
    secondary: `
      bg-gray-200 text-gray-800 shadow-sm hover:bg-gray-300 
      focus:ring-gray-500
    `,
    danger: `
      bg-red-600 text-white shadow-md hover:bg-red-700 
      focus:ring-red-500 active:scale-[0.98]
    `,
    success: `
      bg-green-600 text-white shadow-md hover:bg-green-700 
      focus:ring-green-500
    `,
  }

  // Handle loading state (visual feedback)
  const loadingStyle = loading 
    ? 'cursor-not-allowed opacity-70' 
    : 'cursor-pointer'

  return (
    <button 
      className={`${baseStyle} ${variantStyles[variant]} ${loadingStyle} ${className}`}
      disabled={props.disabled || loading}
      {...props}
    >
      {loading ? 'Processing...' : children}
    </button>
  )
}

export default Button;