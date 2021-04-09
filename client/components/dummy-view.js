import React, { useState } from 'react'
import Head from './head'

const Dummy = () => {
  const [text, setText] = useState('')
  const [textFromServer, setTextFromServer] = useState('')
  console.log('You write: ', text)
  
  const click = () => {
    fetch('api/v1/testString', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input: text })
    })
      .then((res) => res.json())
      .then((data) => setTextFromServer(data.result))
  }

  return (
    <div>
      <Head title="Hello" />
      <div className="flex items-center justify-center h-screen">
        <div className="bg-indigo-800 text-white font-bold rounded-lg border shadow-lg p-10">
          <div>Enter your text</div>
            <div className="text-black">
              <input type="text" onChange={(event) => setText(event.target.value)} value={text}/>
            </div>
            <div>
              <button type="button" onClick={click}>Send!</button>
            </div>
            <div>
              {textFromServer}
            </div>
        </div>
      </div>
    </div>
  )
}

Dummy.propTypes = {}

export default React.memo(Dummy)
