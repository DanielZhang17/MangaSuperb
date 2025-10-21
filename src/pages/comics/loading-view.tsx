import { useEffect, useState } from "react"
import { Progress } from "@/components/ui/progress"

interface LoadingViewProps {
  initialText: string;
  onCompletion: () => void;
  textChanges?: { progress: number; text: string }[];
}

export function LoadingView({ initialText, onCompletion, textChanges = [] }: LoadingViewProps) {
  const [progress, setProgress] = useState(0)
  const [text, setText] = useState(initialText)

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer)
          return 100
        }

        const newText = textChanges.find(change => prev > change.progress && prev < change.progress + 10)
        if (newText) {
          setText(newText.text)
        }

        return prev + 1
      })
    }, 50)

    return () => {
      clearInterval(timer)
    }
  }, [textChanges])

  useEffect(() => {
    if (progress >= 100) {
      setTimeout(() => {
        onCompletion()
      }, 500)
    }
  }, [progress, onCompletion])

  return (
    <div className="w-full h-[600px] flex flex-col items-center justify-center gap-8 mt-4">
        <div className="w-1/2 text-center">
            <h3 className="text-2xl font-semibold tracking-tight mb-4">{text}</h3>
            <Progress value={progress} />
            <p className="text-lg font-bold mt-4">{progress}%</p>
        </div>
    </div>
  )
}
