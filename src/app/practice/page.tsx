'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

// Type for our 'public.users' table
type PublicUserProfile = {
  id: number // bigint
}

// Type for user skills
type UserSkill = {
  id: number
  skill_name: string
}

// Type for the 'mcqs' table
type MCQ = {
  id: number
  question_text: string
  options: { [key: string]: string }
  correct_answer: string
  explanation: string
}

type QuizState = 'setup' | 'loading' | 'quiz' | 'results'

export default function PracticePage() {
  const supabase = createClient()
  const router = useRouter()

  const [profile, setProfile] = useState<PublicUserProfile | null>(null)
  const [mySkills, setMySkills] = useState<UserSkill[]>([])
  
  // --- Quiz Setup State ---
  const [selectedSkill, setSelectedSkill] = useState<string>('')
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('medium')
  const [quizState, setQuizState] = useState<QuizState>('setup')
  
  // --- Active Quiz State ---
  const [questions, setQuestions] = useState<MCQ[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string>('')
  const [showExplanation, setShowExplanation] = useState(false)
  const [score, setScore] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Fetch the user's skills for the dropdown
  useEffect(() => {
    const fetchUserSkills = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/'); return
      }

      const { data: publicProfile, error: profileError } = await supabase
        .from('users').select('id').eq('auth_id', user.id).single()

      if (profileError || !publicProfile) {
        console.error('Error fetching public profile:', profileError)
        setQuizState('setup'); return
      }
      setProfile(publicProfile)
      
      const { data: skillsData, error: skillsError } = await supabase
        .from('user_skills').select('id, skill_name').eq('user_id', publicProfile.id)
      
      if (skillsError) {
        console.error('Error fetching user skills:', skillsError)
      } else if (skillsData) {
        setMySkills(skillsData)
        if (skillsData.length > 0) {
          setSelectedSkill(skillsData[0].skill_name) // Default to first skill
        }
      }
    }
    fetchUserSkills()
  }, [supabase, router])

  // Function to start the quiz
  const handleStartQuiz = async () => {
    if (!selectedSkill) return
    
    setQuizState('loading')
    setError(null)
    setQuestions([])

    try {
      const response = await fetch('/api/generate/mcqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillName: selectedSkill,
          difficulty: selectedDifficulty,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details || 'Failed to generate quiz')
      }
      
      if (data && data.length > 0) {
        setQuestions(data)
        setCurrentQuestionIndex(0)
        setSelectedAnswer('')
        setShowExplanation(false)
        setScore(0)
        setQuizState('quiz')
      } else {
        throw new Error('No questions were returned from the API.')
      }
    } catch (err) {
      console.error(err)
      setError((err as Error).message)
      setQuizState('setup')
    }
  }

  // Function when user selects an answer
  const handleAnswerSelect = (optionKey: string) => {
    if (showExplanation) return // Don't allow changing answer
    
    setSelectedAnswer(optionKey)
    setShowExplanation(true)
    
    const currentQuestion = questions[currentQuestionIndex]
    if (optionKey === currentQuestion.correct_answer) {
      setScore(score + 1)
    }
  }

  // Function to move to the next question
  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
      setSelectedAnswer('')
      setShowExplanation(false)
    } else {
      // End of quiz
      setQuizState('results')
    }
  }
  
  // Function to reset the quiz
  const resetQuiz = () => {
    setQuizState('setup')
    setQuestions([])
    setError(null)
  }

  // Helper to get button color
  const getButtonClass = (optionKey: string) => {
    if (!showExplanation) {
      return 'bg-white hover:bg-gray-100' // Default
    }
    const currentQuestion = questions[currentQuestionIndex]
    if (optionKey === currentQuestion.correct_answer) {
      return 'bg-green-200' // Correct
    }
    if (optionKey === selectedAnswer && optionKey !== currentQuestion.correct_answer) {
      return 'bg-red-200' // Incorrectly selected
    }
    return 'bg-white' // Not selected
  }

  const renderContent = () => {
    if (quizState === 'loading') {
      return (
        <div className="flex flex-col items-center">
          <p className="text-lg">Generating your quiz...</p>
        </div>
      )
    }

    if (quizState === 'results') {
      return (
        <div className="flex flex-col items-center">
          <h2 className="text-2xl font-bold">Quiz Complete!</h2>
          <p className="text-3xl font-semibold my-4">
            Your score: {score} / {questions.length}
          </p>
          <button
            onClick={resetQuiz}
            className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700"
          >
            Take Another Quiz
          </button>
        </div>
      )
    }

    if (quizState === 'quiz' && questions.length > 0) {
      const q = questions[currentQuestionIndex]
      return (
        <div>
          <p className="text-sm text-gray-500">Question {currentQuestionIndex + 1} of {questions.length}</p>
          <h2 className="text-2xl font-semibold my-4">{q.question_text}</h2>
          
          <div className="space-y-3">
            {Object.entries(q.options).map(([key, value]) => (
              <button
                key={key}
                onClick={() => handleAnswerSelect(key)}
                disabled={showExplanation}
                className={`w-full text-left p-4 rounded-md border text-black transition-colors ${getButtonClass(key)}`}
              >
                <span className="font-bold mr-2">{key.toUpperCase()}.</span> {value}
              </button>
            ))}
          </div>
          
          {showExplanation && (
            <div className="mt-6 p-4 bg-gray-100 rounded-md">
              <h3 className="font-bold text-lg text-black">Explanation:</h3>
              <p className="text-gray-700 mt-2">{q.explanation}</p>
              <button
                onClick={handleNextQuestion}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 mt-4"
              >
                {currentQuestionIndex < questions.length - 1 ? 'Next Question' : 'Finish Quiz'}
              </button>
            </div>
          )}
        </div>
      )
    }
    
    // Default: 'setup' state
    return (
      <div className="flex flex-col space-y-4">
        <h2 className="text-2xl font-bold">Start a New Quiz</h2>
        
        {error && (
          <p className="text-red-500 bg-red-100 p-3 rounded-md">{error}</p>
        )}
        
        <div>
          <label htmlFor="skill" className="block text-sm font-medium text-gray-700">Select a Skill:</label>
          <select
            id="skill"
            value={selectedSkill}
            onChange={(e) => setSelectedSkill(e.target.value)}
            className="w-full p-2 border rounded-md mt-1 text-black"
          >
            {mySkills.length > 0 ? (
              mySkills.map(skill => (
                <option key={skill.id} value={skill.skill_name}>
                  {skill.skill_name}
                </option>
              ))
            ) : (
              <option value="" disabled>Go to your profile to add skills</option>
            )}
          </select>
        </div>
        
        <div>
          <label htmlFor="difficulty" className="block text-sm font-medium text-gray-700">Select Difficulty:</label>
          <select
            id="difficulty"
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            className="w-full p-2 border rounded-md mt-1 text-black"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        
        <button
          onClick={handleStartQuiz}
          disabled={!selectedSkill || mySkills.length === 0}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
        >
          Start Quiz
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto bg-white p-6 shadow-md rounded-lg">
        {renderContent()}
      </div>
    </div>
  )
}