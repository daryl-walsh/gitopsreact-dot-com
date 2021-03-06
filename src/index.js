import '@babel/polyfill'
import fs from 'fs'
import express from 'express'
import bodyParser from 'body-parser'
//import { Client, ApiResponse, RequestParams } from '@elastic/elasticsearch'
import elasticsearch from 'elasticsearch'
import { getSalt } from 'bcryptjs'
import { sign } from 'jsonwebtoken'

import checkEmptyPayload from './middlewares/check-empty-payload'
import checkContentTypeIsSet from './middlewares/check-content-type-is-set'
import checkContentTypeIsJson from './middlewares/check-content-type-is-json'
import authenticate from './middlewares/authenticate'
import errorHandler from './middlewares/error-handler'

// Utilities
import injectHandlerDependencies from './utils/inject-handler-dependencies'
import generateFakeSalt from './utils/generate-fake-salt'
import ValidationError from './validators/errors/validation-error'

// Validators
import createUserValidator from './validators/users/create'
import searchUserValidator from './validators/users/search'
import replaceProfileValidator from './validators/profile/replace'
import updateProfileValidator from './validators/profile/update'
import loginValidator from './validators/auth/login'

// Handlers
import retrieveSaltHandler from './handlers/auth/salt/retrieve'
import createUserHandler from './handlers/users/create'
import retrieveUserHandler from './handlers/users/retrieve'
import deleteUserHandler from './handlers/users/delete'
import searchUserHandler from './handlers/users/search'
import replaceProfileHandler from './handlers/profile/replace'
import updateProfileHandler from './handlers/profile/update'
import loginHandler from './handlers/auth/login'

// Engines
import retrieveSaltEngine from './engines/auth/salt/retrieve'
import createUserEngine from './engines/users/create'
import retrieveUserEngine from './engines/users/retrieve'
import deleteUserEngine from './engines/users/delete'
import searchUserEngine from './engines/users/search'
import replaceProfileEngine from './engines/profile/replace'
import updateProfileEngine from './engines/profile/update'
import loginEngine from './engines/auth/login'

const handlerToEngineMap = new Map([
  [loginHandler, loginEngine],
  [retrieveSaltHandler, retrieveSaltEngine],
  [createUserHandler, createUserEngine],
  [retrieveUserHandler, retrieveUserEngine],
  [deleteUserHandler, deleteUserEngine],
  [searchUserHandler, searchUserEngine],
  [replaceProfileHandler, replaceProfileEngine],
  [updateProfileHandler, updateProfileEngine],
])

const handlerToValidatorMap = new Map([
  [loginHandler, loginValidator],
  [createUserHandler, createUserValidator],
  [searchUserHandler, searchUserValidator],
  [replaceProfileHandler, replaceProfileValidator],
  [updateProfileHandler, updateProfileValidator],
])

// const client = new elasticsearch.Client({
//   host: `${process.env.ELASTICSEARCH_PROTOCOL}://${process.env.ELASTICSEARCH_HOSTNAME}:${process.env.ELASTICSEARCH_PORT}`,
// })
// var client = new elasticsearch.Client({
//   host: `${process.env.ELASTICSEARCH_HOSTNAME}:${process.env.ELASTICSEARCH_PORT}`,
//   log: 'trace',
//   apiVersion: '7.4',
// })
// const client = new Client({
//   node: `${process.env.ELASTICSEARCH_PROTOCOL}://${process.env.ELASTICSEARCH_HOSTNAME}:${process.env.ELASTICSEARCH_PORT}`,
// })
var client = new elasticsearch.Client({
  // host: 'localhost:9200',
  host: `${process.env.ELASTICSEARCH_HOSTNAME}:${process.env.ELASTICSEARCH_PORT}`,
  log: 'trace',
  apiVersion: process.env.ELASTICSEARCH_VERSION,
})

const app = express()
app.use((req, res, next) => {
  const {
    SWAGGER_UI_PROTOCOL,
    SWAGGER_UI_HOSTNAME,
    SWAGGER_UI_PORT,
    CLIENT_PROTOCOL,
    CLIENT_HOSTNAME,
    CLIENT_PORT,
  } = process.env
  const allowedOrigins = [
    `${SWAGGER_UI_PROTOCOL}://${SWAGGER_UI_HOSTNAME}`,
    `${SWAGGER_UI_PROTOCOL}://${SWAGGER_UI_HOSTNAME}:${SWAGGER_UI_PORT}`,
    `${CLIENT_PROTOCOL}://${CLIENT_HOSTNAME}`,
    `${CLIENT_PROTOCOL}://${CLIENT_HOSTNAME}:${CLIENT_PORT}`,
  ]
  if (allowedOrigins.includes(req.headers.origin)) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  )
  next()
})
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  )
  next()
})
app.use(checkEmptyPayload)
app.use(checkContentTypeIsSet)
app.use(checkContentTypeIsJson)
app.use(authenticate)
app.use(bodyParser.json({ limit: 1e6 }))
app.post(
  '/login/',
  injectHandlerDependencies(
    loginHandler,
    client,
    handlerToEngineMap,
    handlerToValidatorMap,
    ValidationError,
    sign
  )
)
app.get('/openapi.yaml', (req, res, next) => {
  fs.readFile(`${__dirname}/openapi.yaml`, (err, file) => {
    if (err) {
      res.status(500)
      res.end()
      return next()
    }
    res.write(file)
    res.end()
    return next()
  })
})
app.get(
  '/salt/',
  injectHandlerDependencies(
    retrieveSaltHandler,
    client,
    handlerToEngineMap,
    handlerToValidatorMap,
    getSalt,
    generateFakeSalt
  )
)
app.post(
  '/users/',
  injectHandlerDependencies(
    createUserHandler,
    client,
    handlerToEngineMap,
    handlerToValidatorMap,
    ValidationError
  )
)
app.get(
  '/users/',
  injectHandlerDependencies(
    searchUserHandler,
    client,
    handlerToEngineMap,
    handlerToValidatorMap,
    ValidationError
  )
)
app.get(
  '/users/:userId',
  injectHandlerDependencies(
    retrieveUserHandler,
    client,
    handlerToEngineMap,
    handlerToValidatorMap,
    ValidationError
  )
)
app.delete(
  '/users/:userId',
  injectHandlerDependencies(
    deleteUserHandler,
    client,
    handlerToEngineMap,
    handlerToValidatorMap,
    ValidationError
  )
)
app.put(
  '/users/:userId/profile',
  injectHandlerDependencies(
    replaceProfileHandler,
    client,
    handlerToEngineMap,
    handlerToValidatorMap,
    ValidationError
  )
)
app.patch(
  '/users/:userId/profile',
  injectHandlerDependencies(
    updateProfileHandler,
    client,
    handlerToEngineMap,
    handlerToValidatorMap,
    ValidationError
  )
)

app.use(errorHandler)

const server = app.listen(process.env.SERVER_PORT, async () => {
  const indexParams = { index: process.env.ELASTICSEARCH_INDEX }
  console.log('check index')
  console.log(indexParams)
  const indexExists = await client.indices.exists(indexParams)
  console.log('check index exists')
  console.log(indexExists)
  if (!indexExists) {
    await client.indices.create(indexParams)
  }
  // eslint-disable-next-line no-console
  console.log(
    `GitOpsReact API server listening on port ${process.env.SERVER_PORT}!`
  )
})

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0)
  })
})
