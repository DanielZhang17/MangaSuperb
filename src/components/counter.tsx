import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)

  return (
    <div>
      <h1>
        Count:
        {count}
      </h1>
      <button type="button" onClick={() => setCount(count + 1)}>+</button>
      <button type="button" onClick={() => setCount(count - 1)}>-</button>
    </div>
  )
}
