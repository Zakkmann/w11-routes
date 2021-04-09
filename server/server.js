import express from 'express'
import path from 'path'
import cors from 'cors'
import bodyParser from 'body-parser'
import sockjs from 'sockjs'
import { renderToStaticNodeStream } from 'react-dom/server'
import React from 'react'
import axios from 'axios'
import cookieParser from 'cookie-parser'
import config from './config'
import Html from '../client/html'


const { writeFile, readFile, unlink } = require('fs').promises

require('colors')

let Root
try {
  // eslint-disable-next-line import/no-unresolved
  Root = require('../dist/assets/js/ssr/root.bundle').default
} catch {
  console.log('SSR not found. Please run "yarn run build:ssr"'.red)
}

let connections = []

const port = process.env.PORT || 8090
const server = express()

const setHeaders = (req, res, next) => {
  res.set('x-skillcrucial-user', 'a523cc26-69aa-4ca0-ba95-7bb54a86f9b0')
  res.set('Access-Control-Expose-Headers', 'X-SKILLCRUCIAL-USER')
  next()
}

const middleware = [
  cors(),
  express.static(path.resolve(__dirname, '../dist/assets')),
  bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }),
  bodyParser.json({ limit: '50mb', extended: true }),
  cookieParser(),
  setHeaders
]

middleware.forEach((it) => server.use(it))

// подготовка с Пепе:
// мой вариант:
server.get('/api/v1/test1', (req, res) => {
   axios('https://jsonplaceholder.typicode.com/users').then((usrs) => res.json(usrs.data))
})

// любопытная деструктуризация (Пепе говорит, что это лучший варик):
server.get('/api/v1/test2', async(req, res) => {
  const { data: users } = await axios('https://jsonplaceholder.typicode.com/users')
  res.json({ ...users })
})

// вариант Пепе с кэтчем, async/await и записью в файл:
server.get('/api/v1/test3', async (req, res) => {
  const url = 'https://jsonplaceholder.typicode.com/users'
  const result = await axios(url)
    .then((output) => output.data)
    .catch((error) => ({ epicFail : error }))

  writeFile(`${__dirname}/data/users.json`, JSON.stringify(result), { encoding: 'utf8'})

  const str = await readFile(`${__dirname}/data/users.json`, { encoding: 'utf8'})
    .then((text) => JSON.parse(text))

  console.log(str)

  res.json(result)
})

// TASK 01:
// get /api/v1/users - получает всех юзеров из файла users.json, если его нет - получает данные с сервиса
// https://jsonplaceholder.typicode.com/users, заполняет файл users.json полученными данными и возвращает эти данные пользователю.

// проверка файла на наличие и создание, если его нету
server.get('/api/v1/users', async (req, res) => {
  const users = await readFile(`${__dirname}/data/users.json`, { encoding: 'utf8'})
    .then((text) => {
      console.log('File is found! =)')
      return JSON.parse(text)
    })
    .catch(async () => {
      console.log('File is not found ;(')
      const output = await axios('https://jsonplaceholder.typicode.com/users')
        .then((result) => {
          writeFile(`${__dirname}/data/users.json`, JSON.stringify(result.data), { encoding: 'utf8'})
          return result.data
        })
        .catch((err) => err)
    return output
  })
  res.json(users)
})

// post /api/v1/users - добавляет юзера в файл users.json, с id равным id последнего элемента + 1 и возвращает { status: 'success', id: id }

// МОИ СТРАДАНИЯ:
// const fileSave = (info) => {
//   writeFile(`${__dirname}/data/users.json`, JSON.stringify(info), { encoding: 'utf8'})
// }

// server.post('/api/v1/users', async (req, res) => {
//   const users = await readFile(`${__dirname}/data/users.json`, { encoding: 'utf8'})
//     const newUser = req.body
//     newUser.id = users[users.length].id + 1
//     const usersUpd = [ ...users, newUser ]
//     fileSave(usersUpd)
//     res.json({ status: 'success', newUser })
// })

// Pepe КОД (адовый, с кэтчем отсутствия файла)
server.post('/api/v1/users', async (req, res) => {
  const newUser = req.body

  const result = await readFile(`${__dirname}/data/users.json`, { encoding: 'utf8'})
    .then((text) => {
      const users = JSON.parse(text)
      newUser.id = users[users.length - 1].id + 1
      const updUsers = [...users, newUser]
      writeFile(`${__dirname}/data/users.json`, JSON.stringify(updUsers), { encoding: 'utf8'})
      return { status: 'success', id: newUser.id }
    })
    .catch(async () => {
      const parsing = await axios('https://jsonplaceholder.typicode.com/users')
        .then(({ data: users }) => {
          newUser.id = users[users.length - 1].id + 1
          const updUsers = [...users, newUser]
          writeFile(`${__dirname}/data/users.json`, JSON.stringify(updUsers), { encoding: 'utf8'})
          return { status: 'success', id: newUser.id }
        })
        .catch((err) => err)
    return parsing
  })
  res.json(result)
})

// patch /api/v1/users/:userId - получает новый объект, дополняет его полями юзера в users.json, с id равным userId, и возвращает { status: 'success', id: userId }

server.get('/api/v1/users/:id', (req, res) => {
  const { id } = req.params
  // const id = req.params.id - идентичная запись, но ESLint ругается и хочет деструктуризацию ;(
  console.log(req.params)
  res.json({ thisIs: id })
})


server.patch('/api/v1/users/:userId', async (req, res) => {
  const addData = req.body
  const { userId } = req.params
  await readFile(`${__dirname}/data/users.json`, { encoding: 'utf8'})
    .then((list) => {
      const users = JSON.parse(list)
      const updUsers = users.map((user) => {
        if (user.id === +userId) {
          return { ...user, ...addData }
        }
        return user
      }) 
      writeFile(`${__dirname}/data/users.json`, JSON.stringify(updUsers), { encoding: 'utf8'})
    })
    .catch((err) => console.log(err))
  res.json({ status: 'success', id: userId })
})

// delete /api/v1/users/:userId - удаляет юзера в users.json, с id равным userId, и возвращает { status: 'success', id: userId }
// можно редьюсом: users.reduce((acc, rec) => (rec.id !== +userId) ? [...acc, rec] : acc, [])

server.delete('/api/v1/users/:userId', async (req, res) => {
  const { userId } = req.params
  await readFile(`${__dirname}/data/users.json`, { encoding: 'utf8'})
    .then((list) => {
      const users = JSON.parse(list)
      const filteredUsers = users.filter((user) => user.id !== +userId)
      writeFile(`${__dirname}/data/users.json`, JSON.stringify(filteredUsers), { encoding: 'utf8'})
    })
  .catch((err) => console.log(err))
  res.json({ status: 'success', id: userId })
})

// delete /api/v1/users - удаляет файл users.json

server.delete('/api/v1/users', (req, res) => {
  unlink(`${__dirname}/data/users.json`)
  res.json({ status: 'success' })
})

// TEMP:

// const url01 = 'https://jsonplaceholder.typicode.com/users'

// const readTaskFunc = async () => {
//   await readFile(`${__dirname}/data/users.json`, { encoding: 'utf8'})
//     .then((text) => JSON.parse(text))
// }

// const writeTaskFunc = async () => {
//   await axios(url01)
//     .then((result) => {
//       writeFile(`${__dirname}/data/users.json`, JSON.stringify(result.data), { encoding: 'utf8'})
//       return result.data
//     })
// }

// server.get('/api/v1/users', async (req, res) => {
//   await readTaskFunc().then(x => res.json(x))
// })

// server.post('/api/v1/testString', (req, res) => {
//   const str = req.body.input.toUpperCase()
//   res.json({ result: str })
// })

// server.get('/api/v1/users', async (req, res) => {
//   const { data: users } = await axios('https://jsonplaceholder.typicode.com/users')
//   res.json(users)
// })

// server.get('/api/v1/users/take/:number', async (req, res) => {  
//   const { number } = req.params  
//   const { data: users } = await axios('https://jsonplaceholder.typicode.com/users')  
//   res.json(users.slice(0, +number))  
// })

// server.get('/api/v1/users/:name', (req, res) => {
//   const { name } = req.params
//   res.json({ name })
// })

server.use('/api/', (req, res) => {
  res.status(404)
  res.end()
})

const [htmlStart, htmlEnd] = Html({
  body: 'separator',
  title: 'Skillcrucial'
}).split('separator')

server.get('/', (req, res) => {
  const appStream = renderToStaticNodeStream(<Root location={req.url} context={{}} />)
  res.write(htmlStart)
  appStream.pipe(res, { end: false })
  appStream.on('end', () => {
    res.write(htmlEnd)
    res.end()
  })
})

server.get('/*', (req, res) => {
  const appStream = renderToStaticNodeStream(<Root location={req.url} context={{}} />)
  res.write(htmlStart)
  appStream.pipe(res, { end: false })
  appStream.on('end', () => {
    res.write(htmlEnd)
    res.end()
  })
})

const app = server.listen(port)

if (config.isSocketsEnabled) {
  const echo = sockjs.createServer()
  echo.on('connection', (conn) => {
    connections.push(conn)
    conn.on('data', async () => {})

    conn.on('close', () => {
      connections = connections.filter((c) => c.readyState !== 3)
    })
  })
  echo.installHandlers(app, { prefix: '/ws' })
}
console.log(`Serving at http://localhost:${port}`)
