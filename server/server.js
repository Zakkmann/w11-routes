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

// подготовка

server.get('/api/v1/ok', (req, res) => {
  res.json({ status: 'OK' })
})

server.get('/api/v1/notok', (req, res) => {
  res.json({ status: 'Not Ok' })
})

server.get('/api/v1/test1', (req, res) => {
   axios('https://jsonplaceholder.typicode.com/users').then((usrs) => res.json(usrs.data))
})

// любопытная деструктуризация (Пепе говорит, что это лучший варик):
server.get('/api/v1/test2', async(req, res) => {
  const { data: users } = await axios('https://jsonplaceholder.typicode.com/users')
  res.json({ ...users })
})

// TASK 01:
// get /api/v1/users - получает всех юзеров из файла users.json, если его нет - получает данные с сервиса
// https://jsonplaceholder.typicode.com/users, заполняет файл users.json полученными данными и возвращает эти данные пользователю.

function getUsers() {
  return readFile(`${__dirname}/data/users.json`, { encoding: 'utf8' })
    .then((text) => {
      return JSON.parse(text)
    })
    .catch(async () => {
      const url = 'https://jsonplaceholder.typicode.com/users'
      const result = await axios(url)
        .then(({ data }) => {
          writeFile(`${__dirname}/data/users.json`, JSON.stringify(data), { encoding: 'utf8' })
          return data
        })
        .catch((err) => err)
      return result
    })
}

function addUser(userData, users = []) {
  let newId = 1
  if (users.length !== 0) {
    const lastUser = users[users.length - 1]
    newId = lastUser.id + 1
  }
  const newUser = { id: newId, ...userData }
  const usersUpdated = [...users, newUser]
  writeFile(`${__dirname}/data/users.json`, JSON.stringify(usersUpdated), { encoding: 'utf8' })
  return { status: 'success', id: newId }
}

server.get('/api/v1/users', async (req, res) => {
  const users = await getUsers()
  res.json(users)
})

// post /api/v1/users - добавляет юзера в файл users.json, с id равным id последнего элемента + 1 и возвращает { status: 'success', id: id }

server.post('/api/v1/users', async (req, res) => {
  const result = await readFile(`${__dirname}/data/users.json`, { encoding: 'utf8' })
    .then((text) => {
      const userList = JSON.parse(text)
      return addUser(req.body, userList)
    })
    .catch(async () => {
      return addUser(req.body)
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
  const newData = req.body
  const { userId } = req.params
  await readFile(`${__dirname}/data/users.json`, { encoding: 'utf8' })
    .then((text) => {
      const users = JSON.parse(text)
      const updatedUserList = users.map((user) => {
        if (user.id === +userId) {
          return { ...user, ...newData }
        }
        return user
      })
      writeFile(`${__dirname}/data/users.json`, JSON.stringify(updatedUserList), { encoding: 'utf8' })
    })
    .catch((err) => {
      console.log(err)
    })
  res.json({ status: 'success', id: userId })
})

// delete /api/v1/users/:userId - удаляет юзера в users.json, с id равным userId, и возвращает { status: 'success', id: userId }
// можно редьюсом: users.reduce((acc, rec) => (rec.id !== +userId) ? [...acc, rec] : acc, [])

server.delete('/api/v1/users/:userId', async (req, res) => {
  const { userId } = req.params
  await readFile(`${__dirname}/data/users.json`, { encoding: 'utf8' })
    .then((text) => {
      const users = JSON.parse(text)
      const updatedUserList = users.filter((user) => user.id !== +userId)
      writeFile(`${__dirname}/data/users.json`, JSON.stringify(updatedUserList), { encoding: 'utf8' })
    })
    .catch((err) => {
      console.log(err)
    })
  res.json({ status: 'success', id: userId })
})

// delete /api/v1/users - удаляет файл users.json

server.delete('/api/v1/users', (req, res) => {
  unlink(`${__dirname}/data/users.json`)
  res.json({ status: 'success' })
})

// Done!

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
